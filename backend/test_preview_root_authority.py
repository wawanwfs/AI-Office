"""Phase 12: distinct offline roster authority signature verification.

All signing keys here are ephemeral disposable test keys; never production.
"""
import base64
import hashlib
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa

from preview_admission_v2 import AdmissionDenied
from preview_root_authority import canonical_roster_bytes, verify_roster_signature


@pytest.fixture
def signed_roster(tmp_path):
    root = ed25519.Ed25519PrivateKey.generate()
    reviewer = ed25519.Ed25519PrivateKey.generate()
    root_pem = tmp_path / "root.pem"
    root_sig = tmp_path / "roster.sig"
    root_pem.write_bytes(root.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    reviewer_fingerprint = hashlib.sha256(
        reviewer.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()
    root_fingerprint = hashlib.sha256(
        root.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()
    raw = (b'{"active_fingerprints":["' + reviewer_fingerprint.encode() +
           b'"],"epoch":1,"revoked_fingerprints":[],"version":1}')
    root_sig.write_bytes(base64.b64encode(root.sign(canonical_roster_bytes(raw))))

    def verify(payload=None, key=None, sig=None, fingerprint=None, reviewer_fp=None):
        return verify_roster_signature(
            raw if payload is None else payload,
            root_public_key_path=root_pem if key is None else key,
            root_signature_path=root_sig if sig is None else sig,
            trusted_root_fingerprint=(
                root_fingerprint if fingerprint is None else fingerprint),
            reviewer_fingerprint=(
                reviewer_fingerprint if reviewer_fp is None else reviewer_fp))
    return root, root_pem, root_sig, root_fingerprint, reviewer_fingerprint, raw, verify


def test_signed_roster_uses_separate_root_and_exact_bytes(signed_roster):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    assert root_fp != reviewer_fp
    assert verify() == root_fp
    for altered in (raw + b"\n", raw.replace(b'"epoch":1', b'"epoch":2'),
                    raw.replace(b'"version":1', b'"version":2')):
        with pytest.raises(AdmissionDenied, match="signature mismatch"):
            verify(payload=altered)


def test_roster_rejects_self_signed_untrusted_repin(signed_roster, tmp_path):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    attacker = ed25519.Ed25519PrivateKey.generate()
    alternate_pub = tmp_path / "attacker.pem"
    alternate_sig = tmp_path / "attacker.sig"
    alternate_pub.write_bytes(attacker.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    alternate_sig.write_bytes(
        base64.b64encode(attacker.sign(canonical_roster_bytes(raw))))
    with pytest.raises(AdmissionDenied, match="fingerprint mismatch"):
        verify(key=alternate_pub, sig=alternate_sig)
    with pytest.raises(AdmissionDenied, match="root fingerprint required"):
        verify(fingerprint="")
    # A pinned root key must reject a different signer's signature.
    with pytest.raises(AdmissionDenied, match="signature mismatch"):
        verify(sig=alternate_sig)


def test_roster_rejects_same_signing_identity(signed_roster):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    with pytest.raises(AdmissionDenied, match="distinct key"):
        verify(reviewer_fp=root_fp)


def test_roster_rejects_symlink_and_malformed_signature(signed_roster, tmp_path):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    broken = tmp_path / "broken.sig"
    broken.write_bytes(b"bad%%base64")
    with pytest.raises(AdmissionDenied, match="encoding invalid"):
        verify(sig=broken)
    broken.write_bytes(base64.b64encode(b"short"))
    with pytest.raises(AdmissionDenied, match="length invalid"):
        verify(sig=broken)
    link = tmp_path / "roster-link.sig"
    try:
        link.symlink_to(sig)
    except OSError:
        pytest.skip("host forbids symlinks")
    with pytest.raises(AdmissionDenied, match="unsafe signature"):
        verify(sig=link)


def test_roster_rejects_rsa_root(signed_roster, tmp_path):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    bad = tmp_path / "rsa-root.pem"
    bad.write_bytes(rsa.generate_private_key(
        public_exponent=65537, key_size=2048).public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    with pytest.raises(AdmissionDenied, match="root must use Ed25519"):
        verify(key=bad)


def test_domain_separated_roster_never_matches_manifest_signature(signed_roster, tmp_path):
    root, pub, sig, root_fp, reviewer_fp, raw, verify = signed_roster
    from preview_signature import canonical_review_bytes
    wrong = tmp_path / "wrong-domain.sig"
    wrong.write_bytes(base64.b64encode(root.sign(
        canonical_review_bytes({"version": 2, "sources": {}}))))
    with pytest.raises(AdmissionDenied, match="signature mismatch"):
        verify(sig=wrong)
