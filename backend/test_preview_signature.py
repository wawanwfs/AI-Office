"""Phase 9: offline reviewer trust boundary; never commit a private key."""
import base64
import hashlib
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa

from preview_admission import AdmissionDenied
from preview_signature import canonical_review_bytes, verify_review_signature


@pytest.fixture
def review(tmp_path):
    private = ed25519.Ed25519PrivateKey.generate()
    pem = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    pub = tmp_path / "operator-trusted-reviewer.pem"
    sig = tmp_path / "review.sig"
    pub.write_bytes(pem)
    manifest = {"version": 2, "sources": {"api.py": "a" * 64},
                "images": {"db": "postgres@sha256:" + "b" * 64}}
    sig.write_bytes(base64.b64encode(private.sign(canonical_review_bytes(manifest))) + b"\n")
    fingerprint = hashlib.sha256(private.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()

    def verify(candidate=None, *, expected=None, key_file=None, signature=None):
        return verify_review_signature(
            manifest if candidate is None else candidate,
            public_key_path=pub if key_file is None else key_file,
            signature_path=sig if signature is None else signature,
            trusted_fingerprint=fingerprint if expected is None else expected)
    return manifest, pub, sig, fingerprint, verify


def test_signed_manifest_requires_independent_fingerprint(review):
    manifest, pub, sig, fingerprint, verify = review
    assert verify() == fingerprint
    with pytest.raises(AdmissionDenied, match="fingerprint required"):
        verify(expected="")
    with pytest.raises(AdmissionDenied, match="fingerprint mismatch"):
        verify(expected="0" * 64)


def test_signed_manifest_blocks_content_replacement_and_reordered_keys(review):
    manifest, pub, sig, fingerprint, verify = review
    # Canonical key order does NOT change the signature.
    assert verify(dict(reversed(list(manifest.items())))) == fingerprint
    replaced = {**manifest, "sources": {"api.py": "c" * 64}}
    with pytest.raises(AdmissionDenied, match="signature does not match"):
        verify(replaced)
    with pytest.raises(AdmissionDenied, match="signature does not match"):
        verify({**manifest, "extra": 1})


def test_signed_manifest_blocks_different_signer_and_bad_encoding(review, tmp_path):
    manifest, pub, sig, fingerprint, verify = review
    other_key = ed25519.Ed25519PrivateKey.generate().public_key()
    other_pub = tmp_path / "attacker.pem"
    other_pub.write_bytes(other_key.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    with pytest.raises(AdmissionDenied, match="fingerprint mismatch"):
        verify(key_file=other_pub)
    broken = tmp_path / "bad.sig"
    broken.write_text("%%%%not base64")
    with pytest.raises(AdmissionDenied, match="encoding invalid"):
        verify(signature=broken)
    broken.write_bytes(base64.b64encode(b"short"))
    with pytest.raises(AdmissionDenied, match="length invalid"):
        verify(signature=broken)


def test_signed_manifest_denies_rsa_and_symlinks(review, tmp_path):
    manifest, pub, sig, fingerprint, verify = review
    rsa_file = tmp_path / "rsa.pem"
    rsa_file.write_bytes(rsa.generate_private_key(
        public_exponent=65537, key_size=2048).public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo))
    with pytest.raises(AdmissionDenied, match="only Ed25519"):
        verify(key_file=rsa_file, expected=fingerprint)
    link = tmp_path / "linked.sig"
    try:
        link.symlink_to(sig)
    except OSError:
        pytest.skip("OS cannot create symlinks")
    with pytest.raises(AdmissionDenied, match="unsafe signature"):
        verify(signature=link)


def test_signature_not_accepted_as_a_v1_manifest(review):
    manifest, pub, sig, fingerprint, verify = review
    with pytest.raises(AdmissionDenied, match="v2"):
        verify({**manifest, "version": 1})
