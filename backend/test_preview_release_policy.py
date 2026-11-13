"""Release-policy checks independent of Docker, local SQLite, and wall time."""
import base64
from dataclasses import replace
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest

from preview_admission_v2 import AdmissionDenied
from preview_oci_layout import sha256
from preview_release_policy import SignedReleasePolicy, checkpoint_message

NOW = 1_800_000_000
EXPECTED = {"manifest_digest": "sha256:" + "a" * 64, "approval_sha256": "b" * 64,
            "reviewer_fingerprint": "c" * 64, "release_witness_fingerprint": "d" * 64}


@pytest.fixture
def issue(tmp_path):
    key = Ed25519PrivateKey.generate()
    public = key.public_key()
    fingerprint = sha256(public.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw))
    public_path = tmp_path / "public.pem"
    public_path.write_bytes(public.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))

    def make(**changes):
        policy = {"version": 1, "decision": "allow", "sequence": 10,
                  "manifest_digest": EXPECTED["manifest_digest"],
                  "approval_sha256": EXPECTED["approval_sha256"], "platform": "linux/amd64",
                  "issued_at": NOW, "expires_at": NOW + 300, **changes}
        raw = json.dumps(policy).encode("utf-8")
        checkpoint = tmp_path / "checkpoint.json"
        signature = tmp_path / "checkpoint.sig"
        checkpoint.write_bytes(raw)
        signature.write_bytes(base64.b64encode(key.sign(checkpoint_message(raw))))
        return SignedReleasePolicy(checkpoint, signature, public_path,
                                   sha256(raw), fingerprint, 10)
    return make


def test_accepts_signed_policy_at_floor_and_bounded_clock_drift(issue):
    policy = issue()
    for now in (NOW - 30, NOW, NOW + 299):
        assert policy.verify(**EXPECTED, now=now) == 10


@pytest.mark.parametrize(("changes", "reason"), [
    ({"sequence": 9}, "sequence rollback"),
    ({"sequence": True}, "invalid release policy checkpoint"),
    ({"manifest_digest": "sha256:" + "0" * 64}, "does not match OCI"),
    ({"approval_sha256": "0" * 64}, "does not match OCI"),
    ({"decision": "revoke"}, "explicitly revoked"),
    ({"platform": "linux/arm64"}, "invalid release policy checkpoint"),
    ({"expires_at": NOW + 601}, "clock outside allowed window"),
    ({"expires_at": NOW}, "clock outside allowed window"),
])
def test_valid_signatures_do_not_override_checkpoint_rules(issue, changes, reason):
    with pytest.raises(AdmissionDenied, match=reason):
        issue(**changes).verify(**EXPECTED, now=NOW)


@pytest.mark.parametrize("clock", [NOW - 31, NOW + 300])
def test_denies_bad_clock_or_expired_checkpoint(issue, clock):
    with pytest.raises(AdmissionDenied, match="expired or clock"):
        issue().verify(**EXPECTED, now=clock)


def test_valid_old_head_rejected_under_new_head_even_if_floor_unchanged(issue):
    old = issue()
    saved_checkpoint = old.checkpoint_path.read_bytes()
    saved_signature = old.signature_path.read_bytes()
    current = issue(sequence=11)
    current.checkpoint_path.write_bytes(saved_checkpoint)
    current.signature_path.write_bytes(saved_signature)
    with pytest.raises(AdmissionDenied, match="externally pinned checkpoint"):
        current.verify(**EXPECTED, now=NOW)


def test_key_fingerprint_and_signature_both_checked(issue):
    policy = issue()
    with pytest.raises(AdmissionDenied, match="distinct"):
        policy.verify(**{**EXPECTED, "release_witness_fingerprint": policy.trusted_key_fingerprint},
                      now=NOW)
    with pytest.raises(AdmissionDenied, match="differs from pinned key"):
        replace(policy, trusted_key_fingerprint="0" * 64).verify(**EXPECTED, now=NOW)
    policy.signature_path.write_bytes(base64.b64encode(b"x" * 64))
    with pytest.raises(AdmissionDenied, match="signature mismatch"):
        policy.verify(**EXPECTED, now=NOW)


def test_missing_checkpoint_denied(issue):
    policy = issue()
    policy.checkpoint_path.unlink()
    with pytest.raises(AdmissionDenied):
        policy.verify(**EXPECTED, now=NOW)
