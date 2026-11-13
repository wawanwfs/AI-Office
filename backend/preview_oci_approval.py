"""Detached OCI release-witness approval. No signing or Docker in the verifier."""
from dataclasses import asdict
import argparse
import base64
import binascii
from datetime import datetime, timezone
import hmac
import json

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import PLATFORM, is_digest, is_sha256, json_object, sha256, verify_layout
from preview_signature import _read_trusted, canonical_review_bytes

_CONTEXT = b"WFS-AI-OFFICE:OCI-RELEASE-APPROVAL:V1\n"
_FIELDS = {"version", "manifest_digest", "platform", "review_sha256",
           "frontend_sha256", "issued_at", "expires_at"}
_MAX_LIFETIME = 24 * 60 * 60


def approval_message(raw):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 4096:
        raise AdmissionDenied("OCI approval size invalid")
    return _CONTEXT + raw


def frontend_sha256(frontend):
    return sha256(json.dumps(frontend, sort_keys=True, ensure_ascii=True,
                             separators=(",", ":"), allow_nan=False).encode("ascii"))


def verify_release(archive, *, review_path, approval_path, signature_path,
                   witness_key_path, trusted_approval_sha256,
                   trusted_witness_fingerprint, trusted_reviewer_fingerprint,
                   trusted_review_sha256, now=None):
    """Require operator-provisioned pins and a current, distinct witness."""
    pins = (trusted_approval_sha256, trusted_witness_fingerprint,
            trusted_reviewer_fingerprint, trusted_review_sha256)
    if not all(is_sha256(pin) for pin in pins):
        raise AdmissionDenied("independently provisioned OCI approval and review pins required")
    if hmac.compare_digest(trusted_witness_fingerprint, trusted_reviewer_fingerprint):
        raise AdmissionDenied("OCI release witness must be distinct from source reviewer")

    raw = _read_trusted(approval_path, 4096)
    if not hmac.compare_digest(sha256(raw), trusted_approval_sha256):
        raise AdmissionDenied("OCI approval differs from independently pinned current approval")
    approval = json_object(raw)
    if (set(approval) != _FIELDS or type(approval["version"]) is not int
            or approval["version"] != 1 or approval["platform"] != PLATFORM
            or not is_digest(approval["manifest_digest"])
            or not is_sha256(approval["review_sha256"])
            or not is_sha256(approval["frontend_sha256"])):
        raise AdmissionDenied("invalid OCI approval fields or platform")
    issued, expires = approval["issued_at"], approval["expires_at"]
    if now is None:
        now = int(datetime.now(timezone.utc).timestamp())
    if (type(now) is not int or type(issued) is not int or type(expires) is not int
            or not 0 < issued <= now < expires or not 0 < expires - issued <= _MAX_LIFETIME):
        raise AdmissionDenied("OCI approval stale, premature, or outside validity bound")
    try:
        witness = serialization.load_pem_public_key(_read_trusted(witness_key_path, 4096))
        signature = base64.b64decode(_read_trusted(signature_path, 1024).strip(), validate=True)
    except (TypeError, ValueError, binascii.Error) as exc:
        raise AdmissionDenied("invalid OCI release witness key or signature encoding") from exc
    if not isinstance(witness, Ed25519PublicKey):
        raise AdmissionDenied("only Ed25519 release witness keys accepted")
    fingerprint = sha256(witness.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    if not hmac.compare_digest(fingerprint, trusted_witness_fingerprint):
        raise AdmissionDenied("OCI release witness fingerprint mismatch")
    try:
        witness.verify(signature, approval_message(raw))
    except InvalidSignature as exc:
        raise AdmissionDenied("OCI release witness signature mismatch") from exc

    review = json_object(_read_trusted(review_path, 132 * 1024))
    canonical_sha = sha256(canonical_review_bytes(review))
    if not (hmac.compare_digest(canonical_sha, trusted_review_sha256)
            and hmac.compare_digest(canonical_sha, approval["review_sha256"])):
        raise AdmissionDenied("OCI approval does not match current reviewed source manifest")
    frontend = review.get("frontend")
    sources = review.get("sources")
    if (not isinstance(frontend, dict) or not isinstance(sources, dict)
            or not hmac.compare_digest(frontend_sha256(frontend), approval["frontend_sha256"])):
        raise AdmissionDenied("OCI approval does not match reviewed frontend inventory")
    return verify_layout(archive, frontend=frontend, api_sha256=sources.get("api.py"),
                         approved_manifest=approval["manifest_digest"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    # No clock override is accepted by the CLI.
    for name in ("review-path", "approval-path", "signature-path", "witness-key-path",
                 "trusted-approval-sha256", "trusted-witness-fingerprint",
                 "trusted-reviewer-fingerprint", "trusted-review-sha256"):
        parser.add_argument("--" + name, required=True)
    options = vars(parser.parse_args())
    try:
        report = verify_release(**options)
    except AdmissionDenied as exc:
        parser.exit(1, f"OCI release denied: {exc}\n")
    print(json.dumps(asdict(report), sort_keys=True))


if __name__ == "__main__":
    main()
