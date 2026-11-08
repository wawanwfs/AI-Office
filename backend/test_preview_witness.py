"""Phase 14: separately signed witness checkpoint fixture and attack tests.

The signers in this test file are disposable and are NOT a production
organizational witness, anti-rollback service, or transparency log.
"""
import base64
import hashlib
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa

from preview_admission_v2 import AdmissionDenied
from preview_witness import SignedReviewerCheckpoint, canonical_checkpoint_bytes

def _pub(key):
    return key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)

def _fingerprint(key):
    return hashlib.sha256(key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()


@pytest.fixture
def proof(tmp_path):
    root = ed25519.Ed25519PrivateKey.generate()
    reviewer = ed25519.Ed25519PrivateKey.generate()
    witness = ed25519.Ed25519PrivateKey.generate()
    pem = tmp_path / "witness.pem"
    receipt = tmp_path / "witness.json"
    signature = tmp_path / "witness.sig"
    policy_sha = hashlib.sha256(b"operator-approved-policy").hexdigest()
    root_fp = _fingerprint(root)
    reviewer_fp = _fingerprint(reviewer)
    witness_fp = _fingerprint(witness)
    pem.write_bytes(_pub(witness))
    data = {"version": 1, "epoch": 4,
            "policy_sha256": policy_sha,
            "roster_root_fingerprint": root_fp}
    receipt.write_bytes(json.dumps(data,sort_keys=True).encode("ascii"))
    signature.write_bytes(base64.b64encode(
        witness.sign(canonical_checkpoint_bytes(receipt.read_bytes()))))

    def checkpoint(*, current_pin=None, key_path=None, sig_path=None,
                   receipt_path=None, witness_pin=None):
        return SignedReviewerCheckpoint(
            public_key_path=pem if key_path is None else key_path,
            receipt_path=receipt if receipt_path is None else receipt_path,
            signature_path=signature if sig_path is None else sig_path,
            trusted_witness_fingerprint=witness_fp if witness_pin is None else witness_pin,
            trusted_receipt_sha256=(
                hashlib.sha256(receipt.read_bytes()).hexdigest()
                if current_pin is None else current_pin))
    def check(instance=None, **overrides):
        return (checkpoint() if instance is None else instance).verify(
            policy_sha256=overrides.get("policy_sha256",policy_sha),
            epoch=overrides.get("epoch",4),
            roster_root_fingerprint=overrides.get("root_fp",root_fp),
            reviewer_fingerprint=overrides.get("reviewer_fp",reviewer_fp))
    return {
        "root":root,"reviewer":reviewer,"witness":witness,
        "pem":pem,"receipt":receipt,"signature":signature,
        "policy_sha":policy_sha,"root_fp":root_fp,"reviewer_fp":reviewer_fp,
        "witness_fp":witness_fp,"checkpoint":checkpoint,"check":check,
    }


def test_witness_signed_current_checkpoint(proof):
    result=proof["check"]()
    assert result["epoch"]==4
    assert result["witness_fingerprint"]==proof["witness_fp"]
    assert result["policy_sha256"]==proof["policy_sha"]


def test_witness_stale_after_external_pin_advance(proof):
    old_receipt=proof["receipt"].read_bytes()
    old_pin=hashlib.sha256(old_receipt).hexdigest()
    newest=json.loads(old_receipt)
    newest["epoch"]=5
    proof["receipt"].write_bytes(json.dumps(newest,sort_keys=True).encode())
    # The old signature and old trusted pin are valid only for the old bytes.
    with pytest.raises(AdmissionDenied,match="checkpoint changed"):
        proof["check"](instance=proof["checkpoint"](current_pin=old_pin))
    # Even a locally re-pinned receipt cannot pass without fresh witness sig.
    with pytest.raises(AdmissionDenied,match="signature mismatch"):
        proof["check"]()
    proof["receipt"].write_bytes(old_receipt)
    assert proof["check"]()["epoch"]==4


def test_witness_valid_old_receipt_rejected_against_current_policy(proof):
    # The old receipt is correctly signed, but it attests an older policy.
    for override in ({"epoch":5},{"epoch":3},
                     {"policy_sha256":"f"*64},{"root_fp":"a"*64}):
        with pytest.raises(AdmissionDenied,match="policy epoch/root mismatch"):
            proof["check"](**override)


def test_witness_wrong_key_and_forged_signature_denied(proof,tmp_path):
    fake=ed25519.Ed25519PrivateKey.generate()
    pub=tmp_path/"untrusted.pem"
    sig=tmp_path/"untrusted.sig"
    pub.write_bytes(_pub(fake))
    sig.write_bytes(base64.b64encode(
        fake.sign(canonical_checkpoint_bytes(proof["receipt"].read_bytes()))))
    with pytest.raises(AdmissionDenied,match="fingerprint mismatch"):
        proof["check"](instance=proof["checkpoint"](key_path=pub,sig_path=sig))
    with pytest.raises(AdmissionDenied,match="signature mismatch"):
        proof["check"](instance=proof["checkpoint"](sig_path=sig))


def test_witness_separation_from_roster_and_reviewer(proof):
    # The cryptographically VALID witness must not also be either signer.
    with pytest.raises(AdmissionDenied,match="independent of both signing"):
        proof["check"](root_fp=proof["witness_fp"])
    with pytest.raises(AdmissionDenied,match="independent of both signing"):
        proof["check"](reviewer_fp=proof["witness_fp"])


def test_witness_duplicate_field_boolean_epoch_and_oversized_denied(proof):
    original=proof["receipt"].read_bytes()
    candidates=(
        b'{"version":1,"version":1,"epoch":4}',
        b'{"version":1,"epoch":true,"policy_sha256":"f",'
            b'"roster_root_fingerprint":"a"}',
        b" " * 4100
    )
    for payload in candidates:
        proof["receipt"].write_bytes(payload)
        with pytest.raises(AdmissionDenied):
            proof["check"]()
    proof["receipt"].write_bytes(original)


def test_witness_rsa_and_symlinks_denied(proof,tmp_path):
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    rsa_pub=tmp_path/"rsa.pem"
    rsa_pub.write_bytes(_pub(key))
    with pytest.raises(AdmissionDenied,match="only Ed25519"):
        proof["check"](instance=proof["checkpoint"](key_path=rsa_pub))
    link=tmp_path/"receipt-link.json"
    try:
        link.symlink_to(proof["receipt"])
    except OSError:
        pytest.skip("OS does not support unprivileged symlinks")
    with pytest.raises(AdmissionDenied,match="unsafe"):
        proof["check"](instance=proof["checkpoint"](receipt_path=link))


def test_witness_domain_separation_and_bad_signature_encoding(proof,tmp_path):
    bad=tmp_path/"wrong-domain.sig"
    bad.write_bytes(base64.b64encode(proof["witness"].sign(
        proof["receipt"].read_bytes())))
    with pytest.raises(AdmissionDenied,match="signature mismatch"):
        proof["check"](instance=proof["checkpoint"](sig_path=bad))
    bad.write_bytes(b"%%%%")
    with pytest.raises(AdmissionDenied,match="encoding invalid"):
        proof["check"](instance=proof["checkpoint"](sig_path=bad))
    bad.write_bytes(base64.b64encode(b"short"))
    with pytest.raises(AdmissionDenied,match="length invalid"):
        proof["check"](instance=proof["checkpoint"](sig_path=bad))


def test_witness_requires_out_of_band_pins(proof):
    with pytest.raises(AdmissionDenied,match="checkpoint SHA256 pin required"):
        proof["checkpoint"](current_pin="")
    with pytest.raises(AdmissionDenied,match="witness fingerprint required"):
        proof["checkpoint"](witness_pin="")
