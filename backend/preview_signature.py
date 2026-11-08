"""Offline Ed25519 signature verification for a v2 reviewed preview manifest.

A signature proves possession of a reviewer private key, not reviewer
independence, reproducible dependencies, image provenance or production safety.
The trusted public-key fingerprint must be provisioned OUT OF BAND.
Never sign candidate hashes or introduce private keys on a build/worker host.
"""
import base64
import binascii
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied

_CONTEXT = b"WFS-AI-OFFICE:REVIEWED-PREVIEW:V2\n"
_FINGERPRINT = re.compile(r"[a-f0-9]{64}\Z")


def _read_trusted(path, max_bytes):
    path = Path(path).absolute()
    if path.is_symlink() or not path.is_file() or path.resolve() != path:
        raise AdmissionDenied("unsafe signature or reviewer public-key path")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
        with os.fdopen(fd, "rb") as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= max_bytes:
                raise AdmissionDenied("signature or reviewer public-key size invalid")
            data = handle.read(max_bytes + 1)
            if len(data) != info.st_size:
                raise AdmissionDenied("reviewer evidence changed while reading")
            return data
    except OSError as exc:
        raise AdmissionDenied("reviewer evidence unavailable") from exc


def canonical_review_bytes(reviewed_manifest):
    if not isinstance(reviewed_manifest, dict) or reviewed_manifest.get("version") != 2:
        raise AdmissionDenied("signed approval requires a v2 reviewed manifest")
    try:
        message = json.dumps(reviewed_manifest, sort_keys=True, ensure_ascii=True,
                             separators=(",", ":"), allow_nan=False).encode("ascii")
    except (TypeError, ValueError, UnicodeError) as exc:
        raise AdmissionDenied("invalid canonical reviewed manifest") from exc
    if len(message) > 128 * 1024:
        raise AdmissionDenied("reviewed manifest exceeds canonical message limit")
    return _CONTEXT + message


def verify_review_signature(reviewed_manifest, *, public_key_path, signature_path,
                            trusted_fingerprint):
    """Verify a distinct trusted key and a detached Ed25519 signature.

    The caller must independently provision the expected key fingerprint,
    rather than derive it from the supplied public-key file.
    """
    if not isinstance(trusted_fingerprint, str) or not _FINGERPRINT.fullmatch(trusted_fingerprint):
        raise AdmissionDenied("independently pinned reviewer key fingerprint required")
    try:
        key = serialization.load_pem_public_key(_read_trusted(public_key_path, 4096))
    except (TypeError, ValueError) as exc:
        raise AdmissionDenied("reviewer public key invalid") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise AdmissionDenied("only Ed25519 reviewer signatures accepted")
    actual = hashlib.sha256(
        key.public_bytes(serialization.Encoding.Raw,
                         serialization.PublicFormat.Raw)
    ).hexdigest()
    if actual != trusted_fingerprint:
        raise AdmissionDenied("reviewer public-key fingerprint mismatch")
    try:
        signature = base64.b64decode(_read_trusted(signature_path, 1024).strip(),
                                      validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AdmissionDenied("review signature encoding invalid") from exc
    if len(signature) != 64:
        raise AdmissionDenied("review signature length invalid")
    try:
        key.verify(signature, canonical_review_bytes(reviewed_manifest))
    except InvalidSignature as exc:
        raise AdmissionDenied("reviewer signature does not match manifest") from exc
    return actual
