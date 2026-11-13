"""Linux durable observed journal tip, separate from the preview SQLite registry."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import stat
import tempfile

from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import is_sha256, json_object


class DurableReleaseAnchor:
    """A private pre-provisioned directory; no silent recreation of lost state."""

    def __init__(self, path, max_sequence):
        self.path = Path(path).absolute()
        self.max_sequence = max_sequence

    @contextmanager
    def locked(self, fingerprint):
        try:
            import fcntl
        except ImportError as exc:
            raise AdmissionDenied("durable release anchor requires Linux file locks") from exc
        try:
            parent = self.path.parent
            info = parent.stat()
            if (parent.resolve() != parent or not stat.S_ISDIR(info.st_mode)
                    or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700):
                raise AdmissionDenied("release anchor requires an operator-owned 0700 directory")
            flags = os.O_NOFOLLOW | os.O_NONBLOCK
            lock_path = self.path.with_name(self.path.name + ".lock")
            with os.fdopen(os.open(lock_path, os.O_RDWR | os.O_CREAT | flags, 0o600), "rb") as lock:
                self._check_file(lock)
                fcntl.flock(lock, fcntl.LOCK_EX)
                with os.fdopen(os.open(self.path, os.O_RDONLY | flags), "rb") as current:
                    self._check_file(current)
                    raw = current.read(513)
                if len(raw) > 512:
                    raise AdmissionDenied("durable release anchor exceeds size limit")
                state = json_object(raw)
                if (set(state) != {"version", "key_fingerprint", "sequence", "sha256"}
                        or type(state["version"]) is not int or state["version"] != 1
                        or state["key_fingerprint"] != fingerprint
                        or type(state["sequence"]) is not int
                        or not 1 <= state["sequence"] <= self.max_sequence
                        or not is_sha256(state["sha256"])):
                    raise AdmissionDenied("invalid durable release anchor")

                def commit(sequence, digest):
                    if sequence < state["sequence"] or (
                            sequence == state["sequence"] and digest != state["sha256"]):
                        raise AdmissionDenied("cannot roll back durable release anchor")
                    if sequence == state["sequence"]:
                        return
                    self._replace({**state, "sequence": sequence, "sha256": digest})

                yield (state["sequence"], state["sha256"]), commit
        except AdmissionDenied:
            raise
        except (OSError, RuntimeError) as exc:
            raise AdmissionDenied("durable release anchor unavailable") from exc

    @staticmethod
    def _check_file(handle):
        info = os.fstat(handle.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise AdmissionDenied("release anchor requires an operator-owned 0600 regular file")

    def _replace(self, state):
        fd, filename = tempfile.mkstemp(prefix=".anchor-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as out:
                out.write(json.dumps(state, sort_keys=True))
                out.flush()
                os.fsync(out.fileno())
            os.replace(filename, self.path)
            directory = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            Path(filename).unlink(missing_ok=True)
