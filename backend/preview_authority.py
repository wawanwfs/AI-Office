"""Phase 10: independently pinned, rechecked reviewer trust for ALL preview manager paths.

Operator-owned policy and trust-anchor SHA256 are provisioned outside GitHub,
uploads and AI code. A signed candidate is NOT independent review. CI uses
synthetic, ephemeral signers solely to prove fail-closed behavior.
"""
import hashlib
import hmac
import json
import re

from preview_admission_v2 import AdmissionDenied
from preview_signature import _read_trusted, canonical_review_bytes, verify_review_signature

_SHA256 = re.compile(r"[a-f0-9]{64}\Z")


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate reviewer policy key")
        result[key] = value
    return result


class SignedPreviewAuthority:
    """Reverify signature, pinned policy and revocation before EACH manager entry.

    Policy edits invalidate the independent pin and DENY. Key rotation/revocation
    requires authorized out-of-band policy replacement, a NEW pinned SHA256,
    and fresh manager initialization. Never derive the pin from the policy file.
    """

    def __init__(self, *, public_key_path, signature_path, policy_path,
                 trusted_policy_sha256):
        if (not isinstance(trusted_policy_sha256, str) or
                not _SHA256.fullmatch(trusted_policy_sha256)):
            raise AdmissionDenied("independent reviewer policy SHA-256 pin required")
        self.public_key_path = public_key_path
        self.signature_path = signature_path
        self.policy_path = policy_path
        self.trusted_policy_sha256 = trusted_policy_sha256

    def verify(self, reviewed_manifest):
        # Snapshot the externally pinned authority policy, not supplied by
        # the manifest or the candidate build. Never accept a new policy hash
        # merely because the caller can read its current bytes.
        raw = _read_trusted(self.policy_path, 8192)
        if not hmac.compare_digest(
                hashlib.sha256(raw).hexdigest(), self.trusted_policy_sha256):
            raise AdmissionDenied("reviewer policy changed since independent approval")
        try:
            policy = json.loads(raw, object_pairs_hook=_unique_pairs)
        except (UnicodeError, ValueError, TypeError) as exc:
            raise AdmissionDenied("invalid reviewer authority policy") from exc
        if not isinstance(policy, dict) or set(policy) != {
                "version", "epoch", "active_fingerprints", "revoked_fingerprints"}:
            raise AdmissionDenied("reviewer authority policy schema invalid")
        active = policy["active_fingerprints"]
        revoked = policy["revoked_fingerprints"]
        if (type(policy["version"]) is not int or policy["version"] != 1
                or type(policy["epoch"]) is not int or policy["epoch"] < 1
                or not isinstance(active, list) or not 1 <= len(active) <= 32
                or not isinstance(revoked, list) or len(revoked) > 32
                or not all(isinstance(x, str) and _SHA256.fullmatch(x)
                           for x in active + revoked)
                or len(set(active)) != len(active)
                or len(set(revoked)) != len(revoked)):
            raise AdmissionDenied("reviewer authority policy values invalid")

        # The key is checked cryptographically against the independently
        # pinned policy instead of using a fingerprint from the manifest.
        # A second filesystem read between these checks is fail-closed for
        # ordinary mutation, but atomic snapshot / TOCTOU defense remains P0.
        fingerprint = verify_review_signature(
            reviewed_manifest,
            public_key_path=self.public_key_path,
            signature_path=self.signature_path,
            trusted_fingerprint=self._public_fingerprint(active, revoked),
        )
        if fingerprint in revoked or fingerprint not in active:
            raise AdmissionDenied("reviewer key revoked or not active")
        return {"fingerprint": fingerprint, "epoch": policy["epoch"]}

    def _public_fingerprint(self, active, revoked):
        """Identify the actual public key before signature verification.

        A revoked key must never be resurrected by its presence in active.
        """
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        key = serialization.load_pem_public_key(_read_trusted(self.public_key_path, 4096))
        if not isinstance(key, Ed25519PublicKey):
            raise AdmissionDenied("only Ed25519 reviewer keys accepted")
        raw = key.public_bytes(serialization.Encoding.Raw,
                               serialization.PublicFormat.Raw)
        fingerprint = hashlib.sha256(raw).hexdigest()
        if fingerprint in revoked or fingerprint not in active:
            raise AdmissionDenied("reviewer key revoked or not active")
        return fingerprint
