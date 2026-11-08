"""Phase 14: independently signed, externally pinned reviewer epoch checkpoint.

A witness signs an exact, domain-separated receipt binding policy SHA256,
reviewer roster-root fingerprint and epoch. The operator MUST provision the
latest receipt SHA256 out-of-band, outside the preview SQLite registry.
Even when an old registry is restored, a newer independently pinned witness
rejects older policy/epoch. An attacker who can also roll back the external
witness pin or compromise the witness signer can still replay history.

This is NOT a network transparency log, hardware monotonic counter, external
human approval or cryptographically enforced append-only storage.
"""
import base64
import binascii
import hashlib
import hmac
import json
import re

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied
from preview_signature import _read_trusted

_CONTEXT = b"WFS-AI-OFFICE:REVIEWER-CHECKPOINT:V1\n"
_SHA = re.compile(r"[a-f0-9]{64}\Z")
_FIELDS = frozenset(("version", "epoch", "policy_sha256", "roster_root_fingerprint"))


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate checkpoint key")
        result[key] = value
    return result


def canonical_checkpoint_bytes(raw):
    """Sign EXACT JSON bytes, never a reserialized attacker-controlled object."""
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 4096:
        raise AdmissionDenied("checkpoint evidence size invalid")
    return _CONTEXT + raw


class SignedReviewerCheckpoint:
    """One immutable operator-supplied witness receipt and independent anchor."""

    def __init__(self, *, receipt_path, signature_path, public_key_path,
                 trusted_receipt_sha256, trusted_witness_fingerprint):
        if (not isinstance(trusted_receipt_sha256, str)
                or not _SHA.fullmatch(trusted_receipt_sha256)):
            raise AdmissionDenied("independent checkpoint SHA256 pin required")
        if (not isinstance(trusted_witness_fingerprint, str)
                or not _SHA.fullmatch(trusted_witness_fingerprint)):
            raise AdmissionDenied("independent witness fingerprint required")
        self.receipt_path = receipt_path
        self.signature_path = signature_path
        self.public_key_path = public_key_path
        self.trusted_receipt_sha256 = trusted_receipt_sha256
        self.trusted_witness_fingerprint = trusted_witness_fingerprint

    def verify(self, *, policy_sha256, epoch, roster_root_fingerprint,
               reviewer_fingerprint):
        raw = _read_trusted(self.receipt_path, 4096)
        if not hmac.compare_digest(
                hashlib.sha256(raw).hexdigest(), self.trusted_receipt_sha256):
            raise AdmissionDenied("independent witness checkpoint changed")
        try:
            receipt = json.loads(raw, object_pairs_hook=_unique_pairs)
        except (UnicodeError, ValueError, TypeError) as exc:
            raise AdmissionDenied("invalid signed witness checkpoint JSON") from exc
        if (not isinstance(receipt, dict) or set(receipt) != _FIELDS
                or type(receipt["version"]) is not int or receipt["version"] != 1
                or type(receipt["epoch"]) is not int
                or not 1 <= receipt["epoch"] <= 4611686018427387904
                or not isinstance(receipt["policy_sha256"], str)
                or not _SHA.fullmatch(receipt["policy_sha256"])
                or not isinstance(receipt["roster_root_fingerprint"], str)
                or not _SHA.fullmatch(receipt["roster_root_fingerprint"])):
            raise AdmissionDenied("signed witness checkpoint schema invalid")

        try:
            witness = serialization.load_pem_public_key(
                _read_trusted(self.public_key_path, 4096))
        except (TypeError, ValueError) as exc:
            raise AdmissionDenied("witness public key invalid") from exc
        if not isinstance(witness, Ed25519PublicKey):
            raise AdmissionDenied("only Ed25519 witness roots accepted")
        fingerprint = hashlib.sha256(witness.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        ).hexdigest()
        if not hmac.compare_digest(fingerprint, self.trusted_witness_fingerprint):
            raise AdmissionDenied("witness public key fingerprint mismatch")
        if (fingerprint == reviewer_fingerprint
                or fingerprint == roster_root_fingerprint):
            raise AdmissionDenied("witness must be independent of both signing keys")

        try:
            signature = base64.b64decode(
                _read_trusted(self.signature_path, 1024).strip(), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise AdmissionDenied("witness signature encoding invalid") from exc
        if len(signature) != 64:
            raise AdmissionDenied("witness signature length invalid")
        try:
            witness.verify(signature, canonical_checkpoint_bytes(raw))
        except InvalidSignature as exc:
            raise AdmissionDenied("witness signature mismatch") from exc

        # A correctly signed but STALE receipt is not sufficient. Tie
        # epoch+policy+roster root to the current independent approval.
        if (receipt["epoch"] != epoch or
                not hmac.compare_digest(receipt["policy_sha256"], policy_sha256) or
                not hmac.compare_digest(receipt["roster_root_fingerprint"],
                                        roster_root_fingerprint)):
            raise AdmissionDenied("witness checkpoint policy epoch/root mismatch")
        return {"epoch": receipt["epoch"],
                "policy_sha256": receipt["policy_sha256"],
                "witness_fingerprint": fingerprint}
