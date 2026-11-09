"""Phase 19 Linux-only, kernel-sealed Docker build-context evidence.

Only the previously signed/reviewed disposable API template is supported.
This is a reference BUILD PROOF, NOT the default Compose build and NOT an
independently privileged worker: rootful Docker and a compromised daemon
can still act as host root. No arbitrary model-generated Dockerfile or
user-controlled build arguments are accepted.

Linux memfd F_SEAL_WRITE|GROW|SHRINK|SEAL freezes the complete tar bytes
BEFORE Docker reads stdin. A same-UID actor may replace original staged
files but cannot rewrite the sealed tar once built. Windows is explicitly
unsupported rather than silently downgrading to writable files.
"""
from dataclasses import dataclass
import hashlib
import hmac
import io
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile

from preview_admission_v2 import AdmissionDenied

try:
    import fcntl
except ImportError:  # Windows is intentionally unsupported
    fcntl = None

_ONLY_FILES = ("Dockerfile.api", "api.py")
_LIMIT = 512 * 1024
_MAX_TAR = 2 * 1024 * 1024
_FULL_SEALS = (
    getattr(fcntl, "F_SEAL_WRITE", 0) |
    getattr(fcntl, "F_SEAL_SHRINK", 0) |
    getattr(fcntl, "F_SEAL_GROW", 0) |
    getattr(fcntl, "F_SEAL_SEAL", 0)
) if fcntl is not None else 0


def linux_sealing_supported():
    return bool(sys.platform.startswith("linux") and fcntl is not None
                and hasattr(os, "memfd_create")
                and hasattr(os, "MFD_ALLOW_SEALING")
                and hasattr(fcntl, "F_ADD_SEALS")
                and hasattr(fcntl, "F_GET_SEALS")
                and _FULL_SEALS)


def _reviewed_bytes(path, expected_sha):
    path = Path(path).absolute()
    if (not isinstance(expected_sha, str) or len(expected_sha) != 64 or
            any(ch not in "0123456789abcdef" for ch in expected_sha)):
        raise AdmissionDenied("independently reviewed source SHA256 required")
    if path.is_symlink() or path.parent.is_symlink():
        raise AdmissionDenied("sealed context source symlink denied")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
        try:
            meta = os.fstat(fd)
            if not stat.S_ISREG(meta.st_mode) or not 1 <= meta.st_size <= _LIMIT:
                raise AdmissionDenied("sealed source type or size invalid")
            data = os.read(fd, _LIMIT + 1)
            if len(data) != meta.st_size:
                raise AdmissionDenied("sealed source changed while reading")
            if not hmac.compare_digest(
                    hashlib.sha256(data).hexdigest(), expected_sha):
                raise AdmissionDenied("sealed source differs from reviewed digest")
            return data
        finally:
            os.close(fd)
    except AdmissionDenied:
        # AdmissionDenied derives from PermissionError/OSError; keep
        # explicit manifest-hash and source-type denials distinguishable.
        raise
    except OSError as exc:
        raise AdmissionDenied("sealed context source read unavailable") from exc


@dataclass
class SealedPreviewBuild:
    fd: int
    tar_sha256: str
    size: int
    reviewed_api_sha256: str

    def verify(self):
        if not linux_sealing_supported() or self.fd < 0:
            raise AdmissionDenied("Linux kernel-sealed build descriptor required")
        if (fcntl.fcntl(self.fd, fcntl.F_GET_SEALS) & _FULL_SEALS) != _FULL_SEALS:
            raise AdmissionDenied("Docker input lacks mandatory kernel seals")
        if os.fstat(self.fd).st_size != self.size:
            raise AdmissionDenied("sealed Docker input size changed")
        digest = hashlib.sha256()
        index = 0
        while index < self.size:
            data = os.pread(self.fd, min(65536, self.size - index), index)
            if not data:
                raise AdmissionDenied("sealed Docker input truncated")
            digest.update(data)
            index += len(data)
        if not hmac.compare_digest(digest.hexdigest(), self.tar_sha256):
            raise AdmissionDenied("sealed Docker input hash mismatch")
        return True

    def close(self):
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def build_disposable_image(self, image_tag, *, timeout=240):
        """Real BuildKit reads ONLY sealed tar stdin; no writable context dir."""
        self.verify()
        if (not isinstance(image_tag, str) or
                not image_tag.startswith("wfs-phase19-ci-") or
                len(image_tag) > 80 or
                any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-:"
                    for c in image_tag)):
            raise AdmissionDenied("sealed build image tag outside CI namespace")
        # No client-supplied Docker flags, context paths, or Dockerfiles.
        args = ["docker", "build", "--pull=false",
                "--progress=plain", "--file", "Dockerfile.api",
                "--tag", image_tag, "-"]
        allowed_env = {
            k: v for k, v in os.environ.items()
            if k in ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG",
                     "XDG_RUNTIME_DIR", "USER")
        }
        allowed_env["DOCKER_BUILDKIT"] = "1"
        # Opening a dup shares the seek offset. Rewind once immediately
        # before the subprocess; sealed bytes cannot be modified by races.
        os.lseek(self.fd, 0, os.SEEK_SET)
        with os.fdopen(os.dup(self.fd), "rb") as stream:
            try:
                result = subprocess.run(
                    args, stdin=stream, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, env=allowed_env,
                    timeout=timeout, check=False)
            except (subprocess.TimeoutExpired, OSError) as exc:
                raise AdmissionDenied("sealed Docker build uncertain") from exc
        if result.returncode != 0:
            raise AdmissionDenied("sealed Docker image build failed")
        self.verify()
        return {"image_tag": image_tag, "tar_sha256": self.tar_sha256,
                "source_sha256": self.reviewed_api_sha256,
                "kernel_seals_checked": True}


def seal_reviewed_preview_context(snapshots, project_id):
    """Use only the existing REVIEWED signed operator snapshot.

    The caller must already have passed SignedPreviewAuthority and
    source admission; the snapshot's verify() checks every admitted
    file against its manifest. Recheck Dockerfile/api bytes AGAIN from
    securely opened fds as an additional last-mile TOCTOU guard.
    """
    if not linux_sealing_supported():
        raise AdmissionDenied("kernel memfd seals unavailable; fail closed")
    compose_path = snapshots.verify(project_id)
    expected = snapshots.reviewed.get("sources")
    if not isinstance(expected, dict):
        raise AdmissionDenied("reviewed manifest sources required")
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for name in _ONLY_FILES:
            data = _reviewed_bytes(compose_path.parent / name, expected.get(name))
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o444
            info.uid = 65534
            info.gid = 65534
            info.uname = ""
            info.gname = ""
            info.mtime = 0
            tar.addfile(info, io.BytesIO(data))
    tar_bytes = stream.getvalue()
    if not 1 <= len(tar_bytes) <= _MAX_TAR:
        raise AdmissionDenied("sealed Docker tar size outside reviewed bounds")
    flags = os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0)
    fd = -1
    try:
        fd = os.memfd_create("wfs-reviewed-api-build", flags)
        view = memoryview(tar_bytes)
        offset = 0
        while offset < len(view):
            offset += os.write(fd, view[offset:])
        if os.fstat(fd).st_size != len(tar_bytes):
            raise AdmissionDenied("kernel memfd write truncated")
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, _FULL_SEALS)
        result = SealedPreviewBuild(
            fd=fd, tar_sha256=hashlib.sha256(tar_bytes).hexdigest(),
            size=len(tar_bytes), reviewed_api_sha256=expected["api.py"])
        result.verify()
        return result
    except BaseException:
        if fd >= 0:
            os.close(fd)
        raise
