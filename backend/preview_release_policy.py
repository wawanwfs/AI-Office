"""Operator-side signed release decision with external head and sequence pins."""
import base64
import binascii
from dataclasses import dataclass
import hmac
from pathlib import Path
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import PLATFORM, is_digest, is_sha256, json_object, sha256
from preview_signature import _read_trusted

_CONTEXT = b"WFS-AI-OFFICE:OCI-RELEASE-POLICY-CHECKPOINT:V1\n"
_FIELDS = {"version", "sequence", "manifest_digest", "approval_sha256",
           "platform", "decision", "issued_at", "expires_at"}
_MAX_SEQUENCE = (1 << 63) - 1
_MAX_LIFETIME = 600
_MAX_FUTURE_SKEW = 30


def checkpoint_message(raw, *, chained=False, rotation=False):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 4096:
        raise AdmissionDenied("release policy checkpoint size invalid")
    version = b":V3" if rotation else b":V2" if chained else b":V1"
    context = _CONTEXT.replace(b":V1", version)
    return context + raw


@dataclass(frozen=True)
class SignedReleasePolicy:
    """Pins and sequence floor are provisioned independently of preview state.

    This verifier has no signing key and does not read or advance a local
    rollback floor. Replaying the external head and floor together is outside
    its trust boundary.
    """

    checkpoint_path: Path
    signature_path: Path
    public_key_path: Path
    trusted_head_sha256: str
    trusted_key_fingerprint: str
    minimum_sequence: int

    def verify(self, *, manifest_digest, approval_sha256, reviewer_fingerprint,
               release_witness_fingerprint, now=None):
        raw = _read_trusted(self.checkpoint_path, 4096)
        if not is_sha256(self.trusted_head_sha256) or not hmac.compare_digest(
                sha256(raw), self.trusted_head_sha256):
            raise AdmissionDenied("release policy head differs from externally pinned checkpoint")
        policy = verify_signed_checkpoint(
            raw, _read_trusted(self.signature_path, 1024),
            _read_trusted(self.public_key_path, 4096), self.trusted_key_fingerprint)
        return check_release_decision(
            policy, manifest_digest=manifest_digest, approval_sha256=approval_sha256,
            reviewer_fingerprint=reviewer_fingerprint,
            release_witness_fingerprint=release_witness_fingerprint,
            policy_key_fingerprint=self.trusted_key_fingerprint,
            minimum_sequence=self.minimum_sequence, now=now)


def verify_signed_checkpoint(raw, signature, public_key, fingerprint, *, chained=False,
                             rotation=False):
    """Authenticate a checkpoint without treating historical records as current."""
    policy = json_object(raw)
    fields = _FIELDS | {"previous_sha256"} if chained else _FIELDS
    version = 3 if rotation else 2 if chained else 1
    if (set(policy) != fields or type(policy["version"]) is not int
            or policy["version"] != version or policy["platform"] != PLATFORM
            or policy["decision"] not in ("allow", "revoke")
            or not is_digest(policy["manifest_digest"])
            or not is_sha256(policy["approval_sha256"])
            or type(policy["sequence"]) is not int
            or not 1 <= policy["sequence"] <= _MAX_SEQUENCE
            or chained and not is_sha256(policy["previous_sha256"])):
        raise AdmissionDenied("invalid release policy checkpoint fields")
    try:
        key = serialization.load_pem_public_key(public_key)
        signature = base64.b64decode(signature.strip(), validate=True)
    except (ValueError, TypeError, binascii.Error) as exc:
        raise AdmissionDenied("invalid release policy key or signature encoding") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise AdmissionDenied("release policy key must be Ed25519")
    actual = sha256(key.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    if not is_sha256(fingerprint) or not hmac.compare_digest(actual, fingerprint):
        raise AdmissionDenied("release policy signing key differs from pinned key")
    try:
        key.verify(signature, checkpoint_message(raw, chained=chained, rotation=rotation))
    except InvalidSignature as exc:
        raise AdmissionDenied("release policy signature mismatch") from exc
    return policy


def check_release_decision(policy, *, manifest_digest, approval_sha256, reviewer_fingerprint,
                           release_witness_fingerprint, policy_key_fingerprint,
                           minimum_sequence, now=None):
    if (not all(is_sha256(pin) for pin in (
                policy_key_fingerprint, approval_sha256, reviewer_fingerprint,
            release_witness_fingerprint)) or not is_digest(manifest_digest)
            or type(minimum_sequence) is not int
            or not 1 <= minimum_sequence <= _MAX_SEQUENCE):
        raise AdmissionDenied("independent release policy pins and sequence floor required")
    if policy_key_fingerprint in (reviewer_fingerprint, release_witness_fingerprint):
        raise AdmissionDenied("release policy key must be distinct from reviewer and release witness")
    if policy["sequence"] < minimum_sequence:
        raise AdmissionDenied("release policy sequence rollback")
    if not (hmac.compare_digest(policy["manifest_digest"], manifest_digest)
            and hmac.compare_digest(policy["approval_sha256"], approval_sha256)):
        raise AdmissionDenied("release policy does not match OCI manifest and approval")
    if policy["decision"] == "revoke":
        raise AdmissionDenied("OCI release explicitly revoked")

    issued, expires = policy["issued_at"], policy["expires_at"]
    if now is None:
        now = int(time.time())
    if (type(now) is not int or type(issued) is not int or type(expires) is not int
            or not 0 < issued < expires or expires - issued > _MAX_LIFETIME
            or issued > now + _MAX_FUTURE_SKEW or now >= expires):
        raise AdmissionDenied("release policy expired or clock outside allowed window")
    return policy["sequence"]
