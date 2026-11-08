"""Phase 15: cryptographic full-inventory Merkle inclusion/consistency tests.

Every test key is ephemeral. An independently operated public transparency
service and external non-equivocation are NOT supplied by this fixture.
"""
import base64
import hashlib
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from preview_admission_v2 import AdmissionDenied
from preview_transparency import (
    SignedTransparencyEvidence, canonical_tree_head, merkle_root,
)


def _public(key):
    return key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)


def _fingerprint(key):
    return hashlib.sha256(key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)).hexdigest()


@pytest.fixture
def log(tmp_path):
    signing_key = Ed25519PrivateKey.generate()
    root_key = Ed25519PrivateKey.generate()
    reviewer_key = Ed25519PrivateKey.generate()
    witness_key = Ed25519PrivateKey.generate()
    leaf = [hashlib.sha256(("receipt-%d" % i).encode()).hexdigest()
            for i in range(4)]
    public = tmp_path / "log-key.pem"
    signature = tmp_path / "log-head.sig"
    head = tmp_path / "log-head.json"
    inventory = tmp_path / "log-leaves.json"
    public.write_bytes(_public(signing_key))

    def sign_head(items=None, signature_key=None, head_root=None):
        values = leaf if items is None else items
        inventory.write_text(json.dumps({
            "version": 1, "receipt_digests": values}, sort_keys=True))
        tree_root = merkle_root([bytes.fromhex(x) for x in values]).hex()
        head.write_text(json.dumps({
            "version": 1, "tree_size": len(values),
            "root_sha256": tree_root if head_root is None else head_root,
        }, sort_keys=True))
        signature.write_bytes(base64.b64encode(
            (signing_key if signature_key is None else signature_key).sign(
                canonical_tree_head(head.read_bytes()))))
        return hashlib.sha256(head.read_bytes()).hexdigest()

    pin = sign_head()
    previous = merkle_root([bytes.fromhex(x) for x in leaf[:2]]).hex()

    def verifier(*, latest_pin=None, log_pem=None, log_sig=None,
                 earlier_size=2, earlier_root=None, log_hash=None,
                 inventory_file=None, head_file=None):
        return SignedTransparencyEvidence(
            head_path=head if head_file is None else head_file,
            signature_path=signature if log_sig is None else log_sig,
            public_key_path=public if log_pem is None else log_pem,
            inventory_path=inventory if inventory_file is None else inventory_file,
            trusted_head_sha256=pin if latest_pin is None else latest_pin,
            trusted_log_fingerprint=(
                _fingerprint(signing_key) if log_hash is None else log_hash),
            trusted_previous_size=earlier_size,
            trusted_previous_root_sha256=(
                previous if earlier_root is None else earlier_root),
        )

    def check(trust=None, current=None, reviewer=None, root=None, witness=None):
        return (verifier() if trust is None else trust).verify(
            receipt_sha256=leaf[-1] if current is None else current,
            reviewer_fingerprint=(
                _fingerprint(reviewer_key) if reviewer is None else reviewer),
            roster_root_fingerprint=(
                _fingerprint(root_key) if root is None else root),
            witness_fingerprint=(
                _fingerprint(witness_key) if witness is None else witness),
        )

    return {"key":signing_key, "leaf":leaf,
            "public":public, "head":head, "signature":signature,
            "inventory":inventory, "pin":pin, "prev":previous,
            "sign_head":sign_head, "verifier":verifier, "check":check,
            "witness":_fingerprint(witness_key)}


def test_merkle_rfc6962_domain_and_unbalanced_split():
    a = hashlib.sha256(b"a").digest()
    b = hashlib.sha256(b"b").digest()
    c = hashlib.sha256(b"c").digest()
    d = hashlib.sha256(b"d").digest()
    sha = hashlib.sha256
    la,lb,lc,ld = [sha(b"\x00"+x).digest() for x in (a,b,c,d)]
    assert merkle_root([]) == sha(b"").digest()
    assert merkle_root([a]) == la
    assert merkle_root([a,b]) == sha(b"\x01"+la+lb).digest()
    first_pair = sha(b"\x01"+la+lb).digest()
    assert merkle_root([a,b,c]) == sha(b"\x01"+first_pair+lc).digest()
    second_pair = sha(b"\x01"+lc+ld).digest()
    assert merkle_root([a,b,c,d]) == sha(
        b"\x01"+first_pair+second_pair).digest()


def test_signed_tree_verifies_current_inclusion_and_trusted_prior_prefix(log):
    response = log["check"]()
    assert response["tree_size"] == 4
    assert response["previous_size"] == 2
    assert response["latest_receipt_sha256"] == log["leaf"][-1]
    assert response["tree_root_sha256"] == merkle_root(
        [bytes.fromhex(x) for x in log["leaf"]]).hex()


def test_tree_rejects_prefix_fork_even_if_current_head_is_valid(log):
    wrong_prev = merkle_root([
        bytes.fromhex(log["leaf"][0]),
        bytes.fromhex(log["leaf"][2]),
    ]).hex()
    with pytest.raises(AdmissionDenied,match="prefix consistency mismatch"):
        log["check"](trust=log["verifier"](earlier_root=wrong_prev))


def test_tree_rejects_old_checkpoint_after_new_leaf(log):
    with pytest.raises(AdmissionDenied,match="current witness receipt not last"):
        log["check"](current=log["leaf"][1])


def test_tree_inventory_edit_or_reorder_fails_against_signed_root(log):
    original=log["inventory"].read_bytes()
    for altered in (list(reversed(log["leaf"])),
                    log["leaf"][:3]+[log["leaf"][1]],
                    log["leaf"][:3]):
        log["inventory"].write_text(json.dumps({
            "version":1,"receipt_digests":altered}))
        with pytest.raises(AdmissionDenied,match="inventory|root|last"):
            log["check"]()
    log["inventory"].write_bytes(original)


def test_tree_current_signed_head_repinned_but_old_signature_denied(log):
    original=log["head"].read_bytes()
    changed=json.loads(original)
    changed["tree_size"]=1
    log["head"].write_text(json.dumps(changed,sort_keys=True))
    try:
        with pytest.raises(AdmissionDenied,match="tree head changed"):
            log["check"]()
        with pytest.raises(AdmissionDenied,match="tree head signature mismatch"):
            log["check"](trust=log["verifier"](
                latest_pin=hashlib.sha256(log["head"].read_bytes()).hexdigest()))
    finally:
        log["head"].write_bytes(original)


def test_tree_signed_smaller_head_rejected_by_independent_previous_size(log):
    original_head=log["head"].read_bytes()
    original_signature=log["signature"].read_bytes()
    original_inventory=log["inventory"].read_bytes()
    try:
        short=log["leaf"][:1]
        pin=log["sign_head"](items=short)
        with pytest.raises(AdmissionDenied,match="tree size rollback denied"):
            log["check"](trust=log["verifier"](latest_pin=pin))
    finally:
        log["head"].write_bytes(original_head)
        log["signature"].write_bytes(original_signature)
        log["inventory"].write_bytes(original_inventory)


def test_tree_log_identity_independent_and_pinned(log, tmp_path):
    fake=Ed25519PrivateKey.generate()
    wrong_key=tmp_path/"fake-log.pem"
    wrong_key.write_bytes(_public(fake))
    with pytest.raises(AdmissionDenied,match="fingerprint mismatch"):
        log["check"](trust=log["verifier"](log_pem=wrong_key))
    with pytest.raises(AdmissionDenied,match="signing key not independent"):
        log["check"](witness=_fingerprint(log["key"]))
    with pytest.raises(AdmissionDenied,match="latest tree head"):
        log["verifier"](latest_pin="")


def test_tree_bad_domain_base64_and_symlink_denied(log, tmp_path):
    original=log["signature"].read_bytes()
    try:
        log["signature"].write_bytes(base64.b64encode(
            log["key"].sign(log["head"].read_bytes())))
        with pytest.raises(AdmissionDenied,match="signature mismatch"):
            log["check"]()
        log["signature"].write_bytes(b"%%%%")
        with pytest.raises(AdmissionDenied,match="encoding invalid"):
            log["check"]()
        log["signature"].write_bytes(base64.b64encode(b"short"))
        with pytest.raises(AdmissionDenied,match="length invalid"):
            log["check"]()
    finally:
        log["signature"].write_bytes(original)
    alias=tmp_path/"head-link.json"
    try:
        alias.symlink_to(log["head"])
    except OSError:
        pytest.skip("symlinks unavailable")
    with pytest.raises(AdmissionDenied,match="unsafe"):
        log["check"](trust=log["verifier"](head_file=alias))


def test_tree_duplicate_head_fields_and_boolean_size_denied(log):
    old=log["head"].read_bytes()
    try:
        for raw in (b'{"version":1,"version":1}',
                    b'{"version":1,"tree_size":true,"root_sha256":"'
                    +b"a"*64+b'"}'):
            log["head"].write_bytes(raw)
            new_pin=hashlib.sha256(raw).hexdigest()
            with pytest.raises(AdmissionDenied,match="malformed|schema"):
                log["check"](trust=log["verifier"](latest_pin=new_pin))
    finally:
        log["head"].write_bytes(old)


def test_tree_untrusted_prefix_and_genesis_cannot_self_pin(log):
    with pytest.raises(AdmissionDenied,match="independent previous Merkle root"):
        log["verifier"](earlier_root="")
    with pytest.raises(AdmissionDenied,match="genesis root"):
        log["verifier"](earlier_size=0,earlier_root=log["prev"])
    with pytest.raises(AdmissionDenied,match="independent previous log size"):
        log["verifier"](earlier_size=True)


def test_tree_proof_is_not_network_transparency_evidence(log):
    # Only signed full-leaf data is proved. There is no honest third-party
    # service, checkpoint delivery, gossip, proof of freshness or SLA here.
    result=log["check"]()
    assert result["tree_size"]==4
    assert "transparency_service_url" not in result
    assert "global_non_equivocation_proven" not in result
