"""Promote only approved OCI content to the disposable Linux Docker operator."""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tarfile

from preview_admission_v2 import AdmissionDenied
from preview_oci_approval import verify_release
from preview_oci_layout import (
    _ARCHIVE_LIMIT, _BLOB_LIMIT, _INDEX, _JSON_LIMIT, _MANIFEST, _Layout,
    is_digest, sha256,
)
from preview_sealed_build import _FULL_SEALS, fcntl, linux_sealing_supported
from preview_sealed_runtime import _docker_env
from preview_signature import canonical_review_bytes

_CHUNK = 1024 * 1024
_CONTAINER_ID = re.compile(r"[a-f0-9]{12,64}\Z")


@contextmanager
def _memfd(label):
    if not linux_sealing_supported():
        raise AdmissionDenied("OCI runtime promotion requires Linux memfd seals")
    try:
        flags = os.MFD_ALLOW_SEALING | getattr(os, "MFD_CLOEXEC", 0)
        with os.fdopen(os.memfd_create(label, flags), "w+b") as stream:
            yield stream
    except AdmissionDenied:
        raise
    except (OSError, tarfile.TarError, RuntimeError) as exc:
        raise AdmissionDenied("sealed OCI archive or transport unavailable") from exc


def _seal(stream):
    stream.flush()
    fd = stream.fileno()
    fcntl.fcntl(fd, fcntl.F_ADD_SEALS, _FULL_SEALS)
    if fcntl.fcntl(fd, fcntl.F_GET_SEALS) & _FULL_SEALS != _FULL_SEALS:
        raise AdmissionDenied("OCI descriptor lacks mandatory kernel seals")
    stream.seek(0)


def _copy_archive(path, target):
    path = Path(path).absolute()
    if path.is_symlink() or path.resolve() != path:
        raise AdmissionDenied("unsafe OCI release archive path")
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    hasher = hashlib.sha256()
    with os.fdopen(os.open(path, flags), "rb") as source:
        meta = os.fstat(source.fileno())
        if not stat.S_ISREG(meta.st_mode) or not 1 <= meta.st_size <= _ARCHIVE_LIMIT:
            raise AdmissionDenied("OCI release archive type or size invalid")
        remaining = meta.st_size
        while remaining:
            data = source.read(min(_CHUNK, remaining))
            if not data:
                raise AdmissionDenied("OCI release archive truncated")
            target.write(data)
            hasher.update(data)
            remaining -= len(data)
        if source.read(1):
            raise AdmissionDenied("OCI release archive grew during copy")
    _seal(target)
    return hasher.hexdigest()


def _add(tar, name, data):
    member = tarfile.TarInfo(name)
    member.mode = 0o444
    member.size = len(data)
    tar.addfile(member, io.BytesIO(data))


def _write_load_transport(verified_archive, checked, target):
    """Regenerate loader metadata without forwarding tags or unrelated blobs.

    Containerd uses the OCI index and original manifest, while Docker's
    classic image store uses manifest.json and the same config/layer bytes.
    """
    verified_archive.seek(0)
    paths = ["blobs/sha256/" + d[7:] for d in (
        checked.config_digest, *checked.layer_digests)]
    with tarfile.open(fileobj=verified_archive, mode="r:") as archive:
        layout = _Layout(archive)
        with tarfile.open(fileobj=target, mode="w", format=tarfile.USTAR_FORMAT) as tar:
            manifest_name = "blobs/sha256/" + checked.manifest_digest[7:]
            manifest = layout.read(manifest_name, _JSON_LIMIT)
            if "sha256:" + sha256(manifest) != checked.manifest_digest:
                raise AdmissionDenied("verified OCI manifest differs in load transport")
            _add(tar, "oci-layout", b'{"imageLayoutVersion":"1.0.0"}')
            _add(tar, "index.json", json.dumps({
                "schemaVersion": 2, "mediaType": _INDEX,
                "manifests": [{"mediaType": _MANIFEST, "digest": checked.manifest_digest,
                               "size": len(manifest),
                               "platform": {"os": "linux", "architecture": "amd64"}}],
            }, separators=(",", ":")).encode("ascii"))
            _add(tar, manifest_name, manifest)
            _add(tar, "manifest.json", json.dumps([{
                "Config": paths[0], "RepoTags": [], "Layers": paths[1:],
            }], separators=(",", ":")).encode("ascii"))
            emitted = {manifest_name}
            for i, (name, digest) in enumerate(zip(
                    paths, (checked.config_digest, *checked.layer_digests))):
                if name in emitted:
                    continue
                data = layout.read(name, _JSON_LIMIT if i == 0 else _BLOB_LIMIT)
                if not hmac.compare_digest("sha256:" + sha256(data), digest):
                    raise AdmissionDenied("verified OCI blob differs in load transport")
                _add(tar, name, data)
                emitted.add(name)
    _seal(target)


@dataclass(frozen=True)
class ApprovedOCIRelease:
    archive_path: Path
    approval_path: Path
    signature_path: Path
    witness_key_path: Path
    approval_sha256: str
    witness_fingerprint: str

    @contextmanager
    def open_verified(self, review, reviewer_fingerprint):
        """Take one sealed snapshot and use it for both verification and load."""
        with _memfd("wfs-verified-oci") as snapshot:
            archive_sha256 = _copy_archive(self.archive_path, snapshot)
            # Pass a descriptor reader, not the original mutable path.
            with os.fdopen(os.dup(snapshot.fileno()), "rb") as reader:
                checked = verify_release(
                    reader, review_manifest=review, approval_path=self.approval_path,
                    signature_path=self.signature_path, witness_key_path=self.witness_key_path,
                    trusted_approval_sha256=self.approval_sha256,
                    trusted_witness_fingerprint=self.witness_fingerprint,
                    trusted_reviewer_fingerprint=reviewer_fingerprint,
                    trusted_review_sha256=sha256(canonical_review_bytes(review)),
                )
            yield snapshot, checked, archive_sha256


def _docker(docker, args, *, stdin=None, timeout=25):
    try:
        return subprocess.run([docker, *args], stdin=stdin, capture_output=True,
                              env=_docker_env(), timeout=timeout, check=True)
    except (OSError, subprocess.SubprocessError) as exc:
        raise AdmissionDenied(f"OCI Docker {args[0]} operation failed") from exc


def _inspect(docker, kind, value):
    result = _docker(docker, [kind, "inspect", "--format", "{{json .}}", value])
    try:
        data = json.loads(result.stdout)
    except ValueError as exc:
        raise AdmissionDenied("invalid Docker inspect response") from exc
    if not isinstance(data, dict):
        raise AdmissionDenied("invalid Docker inspect object")
    return data


def verify_engine_image(docker, checked, image_id):
    # Containerd reports the OCI manifest ID; classic Docker uses the config ID.
    if not is_digest(image_id) or image_id not in (
            checked.config_digest, checked.manifest_digest):
        raise AdmissionDenied("unapproved Docker image ID")
    details = _inspect(docker, "image", image_id)
    rootfs = details.get("RootFS")
    descriptor = details.get("Descriptor")
    if (details.get("Id") != image_id or details.get("Os") != "linux"
            or details.get("Architecture") != "amd64" or not isinstance(rootfs, dict)
            or rootfs.get("Type") != "layers"
            or rootfs.get("Layers") != list(checked.diff_ids)):
        raise AdmissionDenied("Docker image does not match approved OCI platform and DiffIDs")
    if image_id == checked.manifest_digest and (
            not isinstance(descriptor, dict) or descriptor.get("digest") != image_id
            or descriptor.get("mediaType") != _MANIFEST):
        raise AdmissionDenied("Docker OCI image descriptor differs from approved manifest")
    return image_id


def load_verified_image(docker, snapshot, checked):
    with _memfd("wfs-oci-docker-load") as load:
        _write_load_transport(snapshot, checked, load)
        result = _docker(docker, ["image", "load", "--quiet"], stdin=load, timeout=180)
    # The tagless transport should produce exactly one content-addressed ID.
    # Never resolve a tag or trust the output without checking the image store.
    match = re.fullmatch(rb"Loaded image ID: (sha256:[a-f0-9]{64})\s*", result.stdout)
    if not match:
        raise AdmissionDenied("Docker load did not return exactly one content-addressed ID")
    return verify_engine_image(docker, checked, match.group(1).decode("ascii"))


def verify_api_container(docker, container, project, image_id):
    if not _CONTAINER_ID.fullmatch(container):
        raise AdmissionDenied("exactly one valid preview API container required")
    details = _inspect(docker, "container", container)
    config, host, state = (details.get(key) for key in ("Config", "HostConfig", "State"))
    if not all(isinstance(value, dict) for value in (config, host, state)):
        raise AdmissionDenied("invalid Docker container inspection")
    labels = config.get("Labels")
    mounts = details.get("Mounts")
    runtime_id = details.get("Id")
    if (not isinstance(runtime_id, str) or len(runtime_id) != 64
            or not _CONTAINER_ID.fullmatch(runtime_id)
            or not runtime_id.startswith(container)
            or details.get("Image") != image_id
            or not isinstance(labels, dict)
            or labels.get("com.docker.compose.project") != project
            or labels.get("com.docker.compose.service") != "api"
            or host.get("ReadonlyRootfs") is not True or state.get("Running") is not True
            or not isinstance(mounts, list)
            or any(not isinstance(m, dict) or m.get("Type") != "tmpfs" for m in mounts)):
        raise AdmissionDenied("running preview API does not match approved OCI release")
    return runtime_id
