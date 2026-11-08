"""Separate offline Ed25519 authority for reviewer-roster policy bytes.

The roster signer is NOT the manifest reviewer. Its private key must remain
on a separately controlled signing device. CI generates disposable fake
keys solely to exercise fail-closed security assertions.
"""
import base64
import binascii
import hashlib
import hmac
import re

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied
from preview_signature import _read_trusted

_ROSTER_CONTEXT = b"WFS-AI-OFFICE:REVIEWER-ROSTER:V1\n"
_SHA = re.compile(r"[a-f0-9]{64}\Z")


def canonical_roster_bytes(raw_policy):
    """The exact independently reviewed bytes, domain-separated.

    Do not reserialize arbitrary JSON here: duplicate keys / alternate JSON
    representations must not acquire equivalent signing authority.
    """
    if not isinstance(raw_policy, bytes) or not 1 <= len(raw_policy) <= 8192:
        raise AdmissionDenied("signed reviewer roster bytes invalid")
    return _ROSTER_CONTEXT + raw_policy


def verify_roster_signature(raw_policy, *, root_public_key_path,
                            root_signature_path, trusted_root_fingerprint,
                            reviewer_fingerprint):
    """Verify separate root identity, signature, and disjoint signing keys."""
    if not isinstance(trusted_root_fingerprint, str) or not _SHA.fullmatch(
            trusted_root_fingerprint):
        raise AdmissionDenied("independently pinned roster root fingerprint required")
    try:
        root = serialization.load_pem_public_key(
            _read_trusted(root_public_key_path, 4096))
    except (TypeError, ValueError) as exc:
        raise AdmissionDenied("reviewer roster root key malformed") from exc
    if not isinstance(root, Ed25519PublicKey):
        raise AdmissionDenied("reviewer roster root must use Ed25519")
    observed = hashlib.sha256(root.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()
    if not hmac.compare_digest(observed, trusted_root_fingerprint):
        raise AdmissionDenied("reviewer roster root fingerprint mismatch")
    if observed == reviewer_fingerprint:
        raise AdmissionDenied("reviewer roster authority must be a distinct key")
    try:
        sig = base64.b64decode(
            _read_trusted(root_signature_path, 1024).strip(), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AdmissionDenied("reviewer roster signature encoding invalid") from exc
    if len(sig) != 64:
        raise AdmissionDenied("reviewer roster signature length invalid")
    try:
        root.verify(sig, canonical_roster_bytes(raw_policy))
    except InvalidSignature as exc:
        raise AdmissionDenied("reviewer roster signature mismatch") from exc
    return observed
