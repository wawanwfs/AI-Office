"""Phase 20: operator-only immutable local image-ID Compose runtime.

A trusted reviewer signed the fixed preview source. BuildKit receives a
kernel-sealed tar. The manager derives an image-only Compose document
from the reviewed bytes, freezes it in another sealed memfd and streams
it as stdin to docker compose -f -. The ordinary source build path is
not used in hardened operator mode.

This is a local image ID, NOT a signed OCI registry manifest digest or
independent builder/daemon principal. Windows fails closed.
"""
import hashlib
import hmac
import os
import re
import secrets
import subprocess

from preview_admission_v2 import AdmissionDenied
from preview_sealed_build import (
    _FULL_SEALS, _reviewed_bytes, fcntl, linux_sealing_supported,
    seal_reviewed_preview_context,
)

_LOCAL_ID = re.compile(r"sha256:[0-9a-f]{64}\Z")
_BUILD_STANZA = (
    "  api:\n"
    "    build:\n"
    "      context: .\n"
    "      dockerfile: Dockerfile.api\n"
)
_COMPOSE_LIMIT = 512 * 1024


def is_local_image_id(value):
    return isinstance(value, str) and _LOCAL_ID.fullmatch(value) is not None


def derive_image_only_compose(snapshots, project_id, image_id):
    """Exactly one transformation of signed and hashed Compose template."""
    if not is_local_image_id(image_id):
        raise AdmissionDenied("only a local content-addressed image ID is allowed")
    path = snapshots.verify(project_id)
    original = _reviewed_bytes(
        path, snapshots.reviewed["sources"]["compose.yaml"])
    try:
        text = original.decode("utf-8")
    except UnicodeError as exc:
        raise AdmissionDenied("reviewed Compose document is not UTF-8") from exc
    if text.count(_BUILD_STANZA) != 1:
        raise AdmissionDenied("reviewed Compose build stanza changed")
    derived = text.replace(
        _BUILD_STANZA,
        "  api:\n    image: " + image_id +
        "\n    pull_policy: never\n",
        1,
    )
    if re.search(r"(?m)^\s+build:\s*(?:$|#)", derived):
        raise AdmissionDenied("runtime Compose may not request source builds")
    return derived.encode("utf-8")


class SealedRuntimeCompose:
    """Verified image-only Compose bytes, sealed by the Linux kernel."""

    def __init__(self, raw):
        if not linux_sealing_supported():
            raise AdmissionDenied("sealed Compose requires Linux memfd kernel seals")
        if not isinstance(raw, bytes) or not 1 <= len(raw) <= _COMPOSE_LIMIT:
            raise AdmissionDenied("derived Compose bytes outside approved bound")
        self.sha256 = hashlib.sha256(raw).hexdigest()
        self.size = len(raw)
        self.fd = -1
        try:
            self.fd = os.memfd_create(
                "wfs-reviewed-compose-runtime",
                os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0))
            offset = 0
            while offset < len(raw):
                wrote = os.write(self.fd, raw[offset:])
                if wrote <= 0:
                    raise AdmissionDenied("kernel Compose memfd write incomplete")
                offset += wrote
            fcntl.fcntl(self.fd, fcntl.F_ADD_SEALS, _FULL_SEALS)
            self.verify()
        except BaseException:
            self.close()
            raise

    def verify(self):
        if self.fd < 0:
            raise AdmissionDenied("sealed Compose descriptor closed")
        if (fcntl.fcntl(self.fd, fcntl.F_GET_SEALS) & _FULL_SEALS) != _FULL_SEALS:
            raise AdmissionDenied("sealed Compose descriptor lacks kernel seals")
        if os.fstat(self.fd).st_size != self.size:
            raise AdmissionDenied("sealed Compose descriptor size changed")
        digest = hashlib.sha256()
        for offset in range(0, self.size, 65536):
            data = os.pread(self.fd, min(65536, self.size - offset), offset)
            if not data:
                raise AdmissionDenied("sealed Compose document truncated")
            digest.update(data)
        if not hmac.compare_digest(digest.hexdigest(), self.sha256):
            raise AdmissionDenied("sealed Compose digest changed")
        return True

    def open_reader(self):
        self.verify()
        os.lseek(self.fd, 0, os.SEEK_SET)
        return os.fdopen(os.dup(self.fd), "rb")

    def close(self):
        if self.fd >= 0:
            os.close(self.fd)
            self.fd = -1

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def _docker_env():
    return {k: v for k, v in os.environ.items() if k in (
        "PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG",
        "XDG_RUNTIME_DIR", "USER")}


def build_local_reviewed_image(snapshots, project_id):
    """Real BuildKit sealed input, inspect immutable local engine image ID."""
    if not linux_sealing_supported():
        raise AdmissionDenied("sealed preview build requires Linux kernel worker")
    tag = "wfs-phase19-ci-" + secrets.token_hex(8)
    with seal_reviewed_preview_context(snapshots, project_id) as sealed:
        built = sealed.build_disposable_image(tag, timeout=240)
        if not built.get("kernel_seals_checked"):
            raise AdmissionDenied("reviewed build input was not sealed")
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{.Id}}", tag],
            capture_output=True, text=True, env=_docker_env(),
            timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AdmissionDenied("cannot inspect local reviewed Docker image") from exc
    if result.returncode:
        raise AdmissionDenied("reviewed Docker image not found after sealed build")
    image_id = result.stdout.strip()
    if not is_local_image_id(image_id):
        raise AdmissionDenied("Docker returned invalid local image ID")
    return {"image_id": image_id, "tar_sha256": built["tar_sha256"],
            "reviewed_api_sha256": built["source_sha256"]}


def verify_local_image_exists(image_id):
    if not is_local_image_id(image_id):
        raise AdmissionDenied("reviewed image ID missing or malformed")
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", "--format", "{{.Id}}", image_id],
            capture_output=True, text=True, env=_docker_env(),
            timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AdmissionDenied("pinned image inspection unavailable") from exc
    if result.returncode or result.stdout.strip() != image_id:
        raise AdmissionDenied("pinned image has disappeared or changed")
    return True



def ensure_approved_runtime_images(snapshots):
    """Fetch ONLY immutable sha256 digest-pinned db/ingress references.

    This explicitly exposes the CI's remaining registry/network dependency;
    it is NOT a fully offline dependency cache or independent OCI signature.
    Pull never occurs during the operator's Compose up command itself.
    """
    approved = snapshots.reviewed["images"]
    for service in ("db", "ingress"):
        ref = approved[service]
        if not isinstance(ref, str) or "@sha256:" not in ref:
            raise AdmissionDenied("approved runtime image digest required")
        try:
            found = subprocess.run(
                ["docker", "image", "inspect", ref],
                capture_output=True, env=_docker_env(),
                timeout=20, check=False)
            if found.returncode:
                pulled = subprocess.run(
                    ["docker", "pull", ref],
                    capture_output=True, env=_docker_env(),
                    timeout=180, check=False)
                if pulled.returncode:
                    raise AdmissionDenied("approved immutable runtime image unavailable")
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise AdmissionDenied("approved runtime image fetch unavailable") from exc
