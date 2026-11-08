"""Versioned, fail-closed supply-chain admission for the disposable preview.

The manifest MUST come from an operator's independent review, never from a
public API, submitted AI source or a build's self-declared checksums.
This checks local bytes and immutable image *references*, not signatures,
registry authenticity, SBOM completeness or network/Docker isolation.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import stat

REVIEWED_FILES = ("compose.yaml", "Dockerfile.api", "api.py", "ingress.py")
_SHA = re.compile(r"[a-f0-9]{64}\Z")
_IMAGE = re.compile(r"[a-z0-9][a-z0-9._/-]*:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}\Z")
_ASSET = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,200}\Z")
_IMAGE_KEYS = {"db", "api_base", "ingress"}


class AdmissionDenied(PermissionError):
    pass


def _sha(path, maximum):
    """Read regular files without following the final symlink (when supported)."""
    if path.is_symlink() or not path.is_file() or path.resolve() != path:
        raise AdmissionDenied("reviewed file is unsafe or missing")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= maximum:
                raise AdmissionDenied("reviewed file size/type denied")
            hasher = hashlib.sha256()
            for block in iter(lambda: source.read(1_048_576), b""):
                hasher.update(block)
            if source.tell() != info.st_size:
                raise AdmissionDenied("reviewed file size changed during read")
            return hasher.hexdigest()
    except OSError as exc:
        raise AdmissionDenied("reviewed file could not be read securely") from exc


def _safe_asset_name(name):
    return (
        isinstance(name, str) and _ASSET.fullmatch(name) is not None
        and all(part not in ("", ".", "..") and not part.startswith(".")
                for part in name.split("/"))
    )


def _frontend_inventory(dist):
    if dist.is_symlink() or not dist.is_dir() or dist.resolve() != dist:
        raise AdmissionDenied("reviewed frontend dist missing or symlinked")
    actual = {}
    total = 0
    # Reject symlinked *directories* as well as files, including dangling links.
    for path in dist.rglob("*"):
        if path.is_symlink() or path.resolve() != path:
            raise AdmissionDenied("reviewed frontend contains symlink")
        if path.is_dir():
            continue
        if not path.is_file():
            raise AdmissionDenied("reviewed frontend contains non-file")
        name = path.relative_to(dist).as_posix()
        if not _safe_asset_name(name):
            raise AdmissionDenied("unsafe frontend asset name")
        total += path.stat().st_size
        if total > 64 * 1024 * 1024 or len(actual) >= 1024:
            raise AdmissionDenied("frontend exceeds approved bounds")
        actual[name] = path
    if "index.html" not in actual:
        raise AdmissionDenied("frontend index.html missing")
    return actual


def candidate_manifest_for_ci_only(directory):
    """Generate CI evidence, NEVER operator approval, from a trusted checkout."""
    root = Path(directory).absolute()
    repo = root.parent.parent
    dist = repo / "artifacts/fullstack-preview/dist"
    compose = (root / "compose.yaml").read_text(encoding="utf-8")
    dockerfile = (root / "Dockerfile.api").read_text(encoding="utf-8")
    compose_images = re.findall(r"^\s*image:\s*(\S+)\s*$", compose, re.M)
    base_images = re.findall(r"^\s*FROM\s+(\S+)", dockerfile, re.M | re.I)
    if len(compose_images) != 2 or len(base_images) != 1:
        raise AdmissionDenied("unexpected approved image count")
    return {
        "version": 2,
        "sources": {name: _sha(root / name, 512 * 1024) for name in REVIEWED_FILES},
        "frontend": {
            name: _sha(path, 32 * 1024 * 1024)
            for name, path in _frontend_inventory(dist).items()
        },
        "package_lock": _sha(repo / "package-lock.json", 8 * 1024 * 1024),
        "sbom": _sha(repo / "artifacts/fullstack-preview/sbom.cdx.json", 16 * 1024 * 1024),
        "images": {
            "db": compose_images[0],
            "ingress": compose_images[1],
            "api_base": base_images[0],
        },
    }


class ReviewedPreviewAdmission:
    """A v2 operator-reviewed manifest is required before EVERY Docker command."""

    def __init__(self, directory, reviewed_files):
        root = Path(directory).absolute()
        if root.is_symlink() or not root.is_dir() or root.resolve() != root:
            raise AdmissionDenied("reviewed preview directory missing or unsafe")
        if (not isinstance(reviewed_files, dict)
                or set(reviewed_files) !=
                {"version", "sources", "frontend", "package_lock", "sbom", "images"}
                or type(reviewed_files["version"]) is not int
                or reviewed_files["version"] != 2):
            raise AdmissionDenied("operator approved version 2 supply-chain manifest required")
        sources = reviewed_files["sources"]
        frontend = reviewed_files["frontend"]
        images = reviewed_files["images"]
        if (not isinstance(sources, dict) or set(sources) != set(REVIEWED_FILES)
                or not isinstance(frontend, dict) or not 1 <= len(frontend) <= 1024
                or not all(_safe_asset_name(n) for n in frontend)
                or not isinstance(images, dict) or set(images) != _IMAGE_KEYS
                or not all(isinstance(v, str) and _SHA.fullmatch(v)
                           for v in [*sources.values(), *frontend.values(),
                                     reviewed_files["package_lock"], reviewed_files["sbom"]])
                or not all(isinstance(value, str) and _IMAGE.fullmatch(value)
                           for value in images.values())):
            raise AdmissionDenied("operator approved manifest fields or digests invalid")
        self.root = root
        self.reviewed = reviewed_files
        self.verify()

    def verify(self):
        root = self.root
        repo = root.parent.parent
        reviewed = self.reviewed
        for filename in REVIEWED_FILES:
            actual = _sha(root / filename, 512 * 1024)
            if not hmac.compare_digest(actual, reviewed["sources"][filename]):
                raise AdmissionDenied("reviewed runtime content changed since approval")

        actual_assets = _frontend_inventory(repo / "artifacts/fullstack-preview/dist")
        if set(actual_assets) != set(reviewed["frontend"]):
            raise AdmissionDenied("reviewed frontend asset inventory changed")
        for name, path in actual_assets.items():
            if not hmac.compare_digest(
                    _sha(path, 32 * 1024 * 1024), reviewed["frontend"][name]):
                raise AdmissionDenied("reviewed frontend content changed")

        if not hmac.compare_digest(
                _sha(repo / "package-lock.json", 8 * 1024 * 1024),
                reviewed["package_lock"]):
            raise AdmissionDenied("reviewed dependency lock changed")
        sbom = repo / "artifacts/fullstack-preview/sbom.cdx.json"
        if not hmac.compare_digest(_sha(sbom, 16 * 1024 * 1024), reviewed["sbom"]):
            raise AdmissionDenied("reviewed SBOM changed")
        try:
            info = json.loads(sbom.read_text(encoding="utf-8"))
            if (not isinstance(info, dict) or info.get("bomFormat") != "CycloneDX"
                    or not isinstance(info.get("components"), list)
                    or not info["components"]):
                raise ValueError("invalid CycloneDX components")
        except (OSError, ValueError) as exc:
            raise AdmissionDenied("invalid reviewed CycloneDX SBOM") from exc

        compose = (root / "compose.yaml").read_text(encoding="utf-8")
        dockerfile = (root / "Dockerfile.api").read_text(encoding="utf-8")
        compose_images = re.findall(r"^\s*image:\s*(\S+)\s*$", compose, re.M)
        from_images = re.findall(r"^\s*FROM\s+(\S+)", dockerfile, re.M | re.I)
        if (compose_images != [reviewed["images"]["db"], reviewed["images"]["ingress"]]
                or from_images != [reviewed["images"]["api_base"]]):
            raise AdmissionDenied("approved immutable Docker image references changed")
        return True
