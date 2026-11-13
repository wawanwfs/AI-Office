"""Offline verifier for one BuildKit-exported WFS preview OCI image.

This narrow profile does not unpack or execute layers. It verifies exact
descriptor bytes, compressed layers and DiffIDs, then checks the reviewed
API and final COPY layer's frontend files without invoking Docker.
"""
from dataclasses import dataclass
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import tarfile

from preview_admission_v2 import AdmissionDenied, _safe_asset_name

PLATFORM = "linux/amd64"
_PREFIX = "application/vnd.oci.image."
_MANIFEST = _PREFIX + "manifest.v1+json"
_INDEX = _PREFIX + "index.v1+json"
_CONFIG = _PREFIX + "config.v1+json"
_LAYER = _PREFIX + "layer.v1.tar"
_SHA = re.compile(r"[a-f0-9]{64}\Z")
_DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")
_BLOB = re.compile(r"blobs/sha256/[a-f0-9]{64}\Z")
_JSON_LIMIT = 1024 * 1024
_BLOB_LIMIT = 128 * 1024 * 1024
_ARCHIVE_LIMIT = 384 * 1024 * 1024
_UNPACKED_LIMIT = 512 * 1024 * 1024
_CHUNK = 1024 * 1024


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def is_sha256(value):
    return isinstance(value, str) and _SHA.fullmatch(value) is not None


def is_digest(value):
    return isinstance(value, str) and _DIGEST.fullmatch(value) is not None


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(_):
    raise ValueError("non-finite JSON number")


def json_object(raw):
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique,
                           parse_constant=_invalid_constant)
    except (ValueError, RecursionError) as exc:
        raise AdmissionDenied("invalid OCI or release JSON") from exc
    if not isinstance(value, dict):
        raise AdmissionDenied("expected OCI or release JSON object")
    return value


def _schema(value, media_type):
    if (type(value.get("schemaVersion")) is not int or value["schemaVersion"] != 2
            or value.get("mediaType", media_type) != media_type):
        raise AdmissionDenied("OCI document schema or media type invalid")


def _member_name(member):
    name = member.name
    while name.startswith("./"):
        name = name[2:]
    if member.isdir() and name in ("", "."):
        return ""
    if (not name or name.startswith("/") or "\\" in name
            or any(part in ("", ".", "..") for part in name.split("/"))):
        raise AdmissionDenied("unsafe OCI tar member path")
    return name


class _Layout:
    def __init__(self, tar):
        self.tar = tar
        self.members = {}
        seen = set()
        for member in tar:
            name = _member_name(member)
            if name in seen or len(seen) >= 128:
                raise AdmissionDenied("duplicate or excessive OCI archive members")
            seen.add(name)
            if member.isdir() and name in ("", "blobs", "blobs/sha256"):
                continue
            if (not member.isfile() or member.issparse()
                    or name not in ("oci-layout", "index.json", "manifest.json")
                    and not _BLOB.fullmatch(name)):
                raise AdmissionDenied("unrecognized OCI archive member")
            self.members[name] = member

    def read(self, name, limit, size=None):
        member = self.members.get(name)
        if (member is None or not 1 <= member.size <= limit
                or size is not None and size != member.size):
            raise AdmissionDenied("OCI member missing or descriptor size mismatch")
        with self.tar.extractfile(member) as stream:
            data = stream.read(member.size)
        if len(data) != member.size:
            raise AdmissionDenied("OCI member truncated")
        return data

    def blob(self, descriptor, media_types, limit):
        if (not isinstance(descriptor, dict)
                or descriptor.get("mediaType") not in media_types
                or not is_digest(descriptor.get("digest"))
                or type(descriptor.get("size")) is not int
                or not 1 <= descriptor["size"] <= limit
                or "urls" in descriptor or "data" in descriptor):
            raise AdmissionDenied("invalid OCI descriptor")
        digest = descriptor["digest"]
        data = self.read("blobs/sha256/" + digest[7:], limit, descriptor["size"])
        if "sha256:" + sha256(data) != digest:
            raise AdmissionDenied("OCI blob digest mismatch")
        return digest, data


class _LayerStream:
    def __init__(self, file, budget):
        self.file = file
        self.digest = hashlib.sha256()
        self.budget = budget

    def read(self, count):
        data = self.file.read(min(count, self.budget[0] + 1))
        self.budget[0] -= len(data)
        if self.budget[0] < 0:
            raise AdmissionDenied("OCI uncompressed layer budget exceeded")
        self.digest.update(data)
        return data


def _scan_layer(data, media_type, expected_diff, budget):
    assets = {}
    api_digest = None
    entries = 0
    app_paths = set()
    with io.BytesIO(data) as raw:
        file = gzip.GzipFile(fileobj=raw) if media_type == _LAYER + "+gzip" else raw
        with file:
            checked = _LayerStream(file, budget)
            with tarfile.open(fileobj=checked, mode="r|") as archive:
                for member in archive:
                    entries += 1
                    if entries > 100_000:
                        raise AdmissionDenied("too many OCI layer entries")
                    name = _member_name(member)
                    # The fixed image must not replace /app or hide reviewed
                    # files via whiteouts/opaque directories or link entries.
                    if name in (".wh.app", ".wh..wh..opq", "app/.wh.dist",
                                "app/.wh.api.py", "app/.wh..wh..opq"):
                        raise AdmissionDenied("whiteout affects reviewed OCI files")
                    if name == "app" or name.startswith("app/"):
                        if name in app_paths:
                            raise AdmissionDenied("duplicate path under OCI app directory")
                        app_paths.add(name)
                    if name in ("app", "app/dist"):
                        if not member.isdir():
                            raise AdmissionDenied("reviewed OCI directory is not a directory")
                        continue
                    if name != "app/api.py" and not name.startswith("app/dist/"):
                        continue
                    if name.startswith("app/dist/"):
                        asset = name.removeprefix("app/dist/")
                        if not _safe_asset_name(asset):
                            raise AdmissionDenied("unsafe reviewed OCI asset path")
                        if member.isdir():
                            continue
                        if asset in assets or len(assets) >= 1024:
                            raise AdmissionDenied("duplicate or excessive OCI assets")
                    elif api_digest is not None:
                        raise AdmissionDenied("duplicate OCI API source")
                    if (not member.isfile() or member.issparse()
                            or not 1 <= member.size <= 32 * 1024 * 1024):
                        raise AdmissionDenied("reviewed OCI file type or size invalid")
                    with archive.extractfile(member) as source:
                        payload = source.read(member.size)
                    if len(payload) != member.size:
                        raise AdmissionDenied("reviewed OCI file truncated")
                    if name == "app/api.py":
                        api_digest = sha256(payload)
                    else:
                        assets[asset] = sha256(payload)
            # The DiffID covers the entire decompressed blob, including
            # end-of-archive blocks and padding not visited by tarfile.
            while checked.read(_CHUNK):
                pass
            if "sha256:" + checked.digest.hexdigest() != expected_diff:
                raise AdmissionDenied("OCI rootfs DiffID mismatch")
    for asset in assets:
        parents = Path(asset).parents
        if any(parent.as_posix() in assets for parent in parents):
            raise AdmissionDenied("OCI frontend file collides with directory")
    return api_digest, assets


@dataclass(frozen=True)
class VerifiedLayout:
    manifest_digest: str
    config_digest: str
    platform: str
    layer_count: int
    asset_count: int


def verify_layout(path, *, frontend, api_sha256, approved_manifest=None):
    """Check the single-platform archive and the fixed reviewed file layout."""
    if (not isinstance(frontend, dict) or not 1 <= len(frontend) <= 1024
            or "index.html" not in frontend or not is_sha256(api_sha256)
            or approved_manifest is not None and not is_digest(approved_manifest)
            or any(not _safe_asset_name(k) or not is_sha256(v)
                   for k, v in frontend.items())):
        raise AdmissionDenied("reviewed API and frontend inventory required")
    flags = (os.O_RDONLY | getattr(os, "O_BINARY", 0)
             | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0))
    try:
        path = Path(path).absolute()
        if path.is_symlink() or path.resolve() != path:
            raise AdmissionDenied("unsafe OCI archive path")
        with os.fdopen(os.open(path, flags), "rb") as source:
            meta = os.fstat(source.fileno())
            if not stat.S_ISREG(meta.st_mode) or not 1 <= meta.st_size <= _ARCHIVE_LIMIT:
                raise AdmissionDenied("OCI archive type or size invalid")
            with tarfile.open(fileobj=source, mode="r:") as tar:
                return _verify(_Layout(tar), frontend, api_sha256, approved_manifest)
    except AdmissionDenied:
        raise
    except (OSError, EOFError, tarfile.TarError, ValueError, RuntimeError) as exc:
        raise AdmissionDenied("unreadable or invalid OCI archive") from exc


def _verify(layout, frontend, api_sha256, approved_manifest):
    if json_object(layout.read("oci-layout", _JSON_LIMIT)) != {"imageLayoutVersion": "1.0.0"}:
        raise AdmissionDenied("unsupported OCI layout version")
    index = json_object(layout.read("index.json", _JSON_LIMIT))
    _schema(index, _INDEX)
    manifests = index.get("manifests")
    if not isinstance(manifests, list) or len(manifests) != 1:
        raise AdmissionDenied("exactly one OCI image manifest required")
    descriptor = manifests[0]
    manifest_digest, raw = layout.blob(descriptor, (_MANIFEST,), _JSON_LIMIT)
    if approved_manifest is not None and manifest_digest != approved_manifest:
        raise AdmissionDenied("OCI manifest digest differs from signed approval")
    # OCI permits a single-image descriptor without optional platform
    # metadata. The mandatory, hashed config establishes the platform.
    if ("platform" in descriptor
            and descriptor["platform"] != {"os": "linux", "architecture": "amd64"}):
        raise AdmissionDenied("OCI index platform mismatch")
    manifest = json_object(raw)
    _schema(manifest, _MANIFEST)
    if "subject" in manifest or "artifactType" in manifest:
        raise AdmissionDenied("OCI image must not be an artifact or referrer")
    config_digest, raw = layout.blob(manifest.get("config"), (_CONFIG,), _JSON_LIMIT)
    config = json_object(raw)
    if (config.get("os") != "linux" or config.get("architecture") != "amd64"
            or config.get("variant") not in (None, "")):
        raise AdmissionDenied("OCI config platform mismatch")
    layers = manifest.get("layers")
    rootfs = config.get("rootfs")
    if (not isinstance(layers, list) or not 1 <= len(layers) <= 32
            or not isinstance(rootfs, dict) or rootfs.get("type") != "layers"
            or not isinstance(rootfs.get("diff_ids"), list)
            or len(rootfs["diff_ids"]) != len(layers)
            or not all(is_digest(d) for d in rootfs["diff_ids"])):
        raise AdmissionDenied("OCI image layers or rootfs DiffIDs invalid")
    budget = [_UNPACKED_LIMIT]
    api_seen = None
    for i, (layer, diff) in enumerate(zip(layers, rootfs["diff_ids"])):
        _, data = layout.blob(layer, (_LAYER, _LAYER + "+gzip"), _BLOB_LIMIT)
        api, assets = _scan_layer(data, layer["mediaType"], diff, budget)
        if api is not None:
            if api_seen is not None:
                raise AdmissionDenied("OCI API source appears in multiple layers")
            api_seen = api
        if assets != (frontend if i == len(layers) - 1 else {}):
            raise AdmissionDenied("OCI frontend differs from reviewed final COPY inventory")
    if api_seen != api_sha256:
        raise AdmissionDenied("OCI API source differs from reviewed digest")
    return VerifiedLayout(manifest_digest, config_digest, PLATFORM, len(layers), len(frontend))
