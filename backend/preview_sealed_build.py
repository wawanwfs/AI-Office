"""Linux-only, kernel-sealed build context for the reviewed preview API.

Only the previously signed/reviewed disposable API template is supported.
This is the hardened operator input, NOT the standalone Compose build
and NOT an independently privileged worker: rootful Docker and a compromised daemon
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

from preview_admission_v2 import AdmissionDenied, _frontend_inventory

try:
    import fcntl
except ImportError:  # Windows is intentionally unsupported
    fcntl = None

_LIMIT = 512 * 1024
_MAX_ASSET = 32 * 1024 * 1024
_MAX_ASSETS_TOTAL = 64 * 1024 * 1024
_MAX_TAR = _MAX_ASSETS_TOTAL + 4 * 1024 * 1024  # source and tar header allowance
_COPY_API = b"COPY api.py /app/api.py\n"
_COPY_DIST = b"COPY dist/ /app/dist/\n"
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


def _reviewed_bytes(path, expected_sha, maximum=_LIMIT):
    path = Path(path).absolute()
    if (not isinstance(expected_sha, str) or len(expected_sha) != 64 or
            any(ch not in "0123456789abcdef" for ch in expected_sha)):
        raise AdmissionDenied("independently reviewed source SHA256 required")
    # Open in binary mode and never block on a substituted FIFO.
    flags = (os.O_RDONLY | getattr(os, "O_BINARY", 0) |
             getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    try:
        if path.is_symlink() or path.resolve() != path:
            raise AdmissionDenied("sealed context source symlink denied")
        with os.fdopen(os.open(path, flags), "rb") as source:
            meta = os.fstat(source.fileno())
            if not stat.S_ISREG(meta.st_mode) or not 1 <= meta.st_size <= maximum:
                raise AdmissionDenied("sealed source type or size invalid")
            data = source.read(meta.st_size + 1)
            if len(data) != meta.st_size:
                raise AdmissionDenied("sealed source changed while reading")
            if not hmac.compare_digest(
                    hashlib.sha256(data).hexdigest(), expected_sha):
                raise AdmissionDenied("sealed source differs from reviewed digest")
            return data
    except AdmissionDenied:
        # AdmissionDenied derives from PermissionError/OSError; keep
        # explicit manifest-hash and source-type denials distinguishable.
        raise
    except (OSError, RuntimeError) as exc:
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
        if not hmac.compare_digest(
                _descriptor_sha256(self.fd, self.size), self.tar_sha256):
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
        args = ["docker", "build", "--pull=false", "--quiet",
                "--file", "Dockerfile.api",
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
        return {"image_tag": image_tag,
                "image_id": result.stdout.decode("ascii", errors="replace").strip(),
                "tar_sha256": self.tar_sha256,
                "source_sha256": self.reviewed_api_sha256,
                "kernel_seals_checked": True}


def _add_tar_file(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o444
    info.uid = info.gid = 65534
    info.mtime = 0
    tar.addfile(info, io.BytesIO(data))


def _descriptor_sha256(fd, size):
    digest = hashlib.sha256()
    for offset in range(0, size, 65536):
        block = os.pread(fd, min(65536, size - offset), offset)
        if not block:
            raise AdmissionDenied("sealed Docker input truncated")
        digest.update(block)
    return digest.hexdigest()


def seal_reviewed_preview_context(snapshots, project_id):
    """Seal the signed API and every signed frontend asset before Docker reads.

    Check the original Dockerfile bytes, then add a single operator-owned
    COPY instruction. The signed template stays unchanged for standalone CI.
    BuildKit sees neither mutable staging paths nor unreviewed extra files.
    """
    if not linux_sealing_supported():
        raise AdmissionDenied("kernel memfd seals unavailable; fail closed")
    compose_path = snapshots.verify(project_id)
    expected = snapshots.reviewed.get("sources")
    frontend = snapshots.reviewed.get("frontend")
    if not isinstance(expected, dict) or not isinstance(frontend, dict):
        raise AdmissionDenied("reviewed source and frontend hashes required")
    dist = compose_path.parents[2] / "artifacts/fullstack-preview/dist"
    assets = _frontend_inventory(dist)
    if assets.keys() != frontend.keys():
        raise AdmissionDenied("sealed frontend inventory differs from reviewed assets")

    dockerfile = _reviewed_bytes(compose_path.parent / "Dockerfile.api",
                                 expected.get("Dockerfile.api"))
    # Preserve the original signed byte check before normalizing Windows
    # checkout newlines for the deterministic operator transformation.
    dockerfile = dockerfile.replace(b"\r\n", b"\n")
    lines = dockerfile.splitlines(keepends=True)
    if b"\r" in dockerfile or lines.count(_COPY_API) != 1 or _COPY_DIST in lines:
        raise AdmissionDenied("reviewed Dockerfile API COPY stanza changed")
    lines.insert(lines.index(_COPY_API) + 1, _COPY_DIST)
    dockerfile = b"".join(lines)
    api = _reviewed_bytes(compose_path.parent / "api.py",
                          expected.get("api.py"))

    flags = os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0)
    fd = os.memfd_create("wfs-reviewed-api-build", flags)
    try:
        # Stream to memfd with a fixed ordering and timestamps. PAX supports
        # nested/long names admitted by the existing signed asset schema.
        with os.fdopen(os.dup(fd), "wb") as output:
            with tarfile.open(fileobj=output, mode="w", format=tarfile.PAX_FORMAT) as tar:
                _add_tar_file(tar, "Dockerfile.api", dockerfile)
                _add_tar_file(tar, "api.py", api)
                total = 0
                for name in sorted(frontend):
                    # Recheck the hash of the exact FD bytes being archived,
                    # even when snapshot verification ran a moment earlier.
                    data = _reviewed_bytes(assets[name], frontend[name], _MAX_ASSET)
                    total += len(data)
                    if total > _MAX_ASSETS_TOTAL:
                        raise AdmissionDenied("sealed frontend exceeds total size limit")
                    _add_tar_file(tar, "dist/" + name, data)
        size = os.fstat(fd).st_size
        if not 1 <= size <= _MAX_TAR:
            raise AdmissionDenied("sealed Docker tar size outside reviewed bounds")
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, _FULL_SEALS)
        result = SealedPreviewBuild(
            fd=fd, tar_sha256=_descriptor_sha256(fd, size),
            size=size, reviewed_api_sha256=expected["api.py"])
        result.verify()
        return result
    except BaseException:
        os.close(fd)
        raise
