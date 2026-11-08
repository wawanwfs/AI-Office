"""Phase 15: bounded full-leaf Merkle inclusion and prefix consistency verifier.

This is a VERIFIER of operator-provisioned signed tree heads, complete
leaf inventories AND Phase 16 compact audit/consistency proof paths,
not a hosted transparency service or an append-only log.
It cannot prove global non-equivocation, online freshness, independent human
custody, or prevent rollback of ALL independently pinned trust anchors.

Merkle tree follows RFC 6962 tree hashing: SHA256(0x00 || leaf-data) and
SHA256(0x01 || left-root || right-root), split at the greatest power of
two strictly smaller than n. A complete ordered inventory verifies both
inclusion and exact prefix consistency without compact audit proofs.
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
from preview_compact_merkle import verify_compact_proof

_SHA = re.compile(r"[a-f0-9]{64}\Z")
_CONTEXT = b"WFS-AI-OFFICE:TRANSPARENCY-TREE-HEAD:V1\n"
_EMPTY = hashlib.sha256(b"").digest()
_MAX_LEAVES = 256


def _unique(pairs):
    data = {}
    for key, value in pairs:
        if key in data:
            raise ValueError("duplicate transparency JSON field")
        data[key] = value
    return data


def _decode(raw, title):
    try:
        value = json.loads(raw, object_pairs_hook=_unique)
    except (ValueError, TypeError, UnicodeError) as exc:
        raise AdmissionDenied("malformed transparency " + title) from exc
    if not isinstance(value, dict):
        raise AdmissionDenied("transparency " + title + " must be a JSON object")
    return value


def _valid_hash(value):
    return isinstance(value, str) and _SHA.fullmatch(value) is not None


def merkle_root(receipts):
    """RFC6962 Merkle root from a bounded ordered list of 32-byte digests."""
    if not isinstance(receipts, (list, tuple)) or len(receipts) > _MAX_LEAVES:
        raise AdmissionDenied("transparency inventory size not allowed")
    if any(type(value) is not bytes or len(value) != 32 for value in receipts):
        raise AdmissionDenied("transparency leaf digest invalid")
    def hash_span(items):
        if not items:
            return _EMPTY
        if len(items) == 1:
            return hashlib.sha256(b"\x00" + items[0]).digest()
        split = 1 << ((len(items) - 1).bit_length() - 1)
        return hashlib.sha256(
            b"\x01" + hash_span(items[:split]) + hash_span(items[split:])
        ).digest()
    return hash_span(receipts)


def canonical_tree_head(raw):
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 4096:
        raise AdmissionDenied("transparency tree head size invalid")
    return _CONTEXT + raw


class SignedTransparencyEvidence:
    """Sign a latest Merkle head, pin it externally, and check full leaf proof.

    previous_size + previous_root_sha256 must come from an older
    independently archived trusted head (or the fixed empty-tree genesis).
    The latest head hash and log signer fingerprint must also be supplied
    independently and MUST NOT be copied from the untrusted inventory.
    """

    def __init__(self, *, head_path, signature_path, public_key_path,
                 inventory_path, compact_proof_path, trusted_head_sha256,
                 trusted_log_fingerprint, trusted_previous_size,
                 trusted_previous_root_sha256):
        if not _valid_hash(trusted_head_sha256):
            raise AdmissionDenied("independently pinned latest tree head required")
        if not _valid_hash(trusted_log_fingerprint):
            raise AdmissionDenied("independently pinned log signer required")
        if (type(trusted_previous_size) is not int
                or not 0 <= trusted_previous_size <= _MAX_LEAVES):
            raise AdmissionDenied("independent previous log size required")
        if not _valid_hash(trusted_previous_root_sha256):
            raise AdmissionDenied("independent previous Merkle root required")
        if (trusted_previous_size == 0 and
                trusted_previous_root_sha256 != _EMPTY.hex()):
            raise AdmissionDenied("genesis root must be the RFC6962 empty root")
        self.head_path = head_path
        self.signature_path = signature_path
        self.public_key_path = public_key_path
        self.inventory_path = inventory_path
        if compact_proof_path is None:
            raise AdmissionDenied("mandatory compact Merkle proof path missing")
        self.compact_proof_path = compact_proof_path
        self.trusted_head_sha256 = trusted_head_sha256
        self.trusted_log_fingerprint = trusted_log_fingerprint
        self.trusted_previous_size = trusted_previous_size
        self.trusted_previous_root_sha256 = trusted_previous_root_sha256

    def verify(self, *, receipt_sha256, witness_fingerprint,
               roster_root_fingerprint, reviewer_fingerprint):
        if not _valid_hash(receipt_sha256):
            raise AdmissionDenied("current receipt SHA256 invalid")
        raw = _read_trusted(self.head_path, 4096)
        if not hmac.compare_digest(hashlib.sha256(raw).hexdigest(),
                                   self.trusted_head_sha256):
            raise AdmissionDenied("latest transparency tree head changed")
        head = _decode(raw, "tree head")
        if (set(head) != {"version", "tree_size", "root_sha256"}
                or type(head["version"]) is not int or head["version"] != 1
                or type(head["tree_size"]) is not int
                or not 1 <= head["tree_size"] <= _MAX_LEAVES
                or not _valid_hash(head["root_sha256"])):
            raise AdmissionDenied("transparency tree head schema invalid")
        if self.trusted_previous_size > head["tree_size"]:
            raise AdmissionDenied("transparency tree size rollback denied")

        try:
            signer = serialization.load_pem_public_key(
                _read_trusted(self.public_key_path, 4096))
        except (TypeError, ValueError) as exc:
            raise AdmissionDenied("transparency log key malformed") from exc
        if not isinstance(signer, Ed25519PublicKey):
            raise AdmissionDenied("transparency log signer must use Ed25519")
        observed = hashlib.sha256(signer.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )).hexdigest()
        if not hmac.compare_digest(observed, self.trusted_log_fingerprint):
            raise AdmissionDenied("transparency log key fingerprint mismatch")
        if observed in (witness_fingerprint, roster_root_fingerprint,
                        reviewer_fingerprint):
            raise AdmissionDenied("transparency log signing key not independent")
        try:
            signature = base64.b64decode(
                _read_trusted(self.signature_path, 1024).strip(), validate=True)
        except (ValueError, binascii.Error) as exc:
            raise AdmissionDenied("transparency head signature encoding invalid") from exc
        if len(signature) != 64:
            raise AdmissionDenied("transparency head signature length invalid")
        try:
            signer.verify(signature, canonical_tree_head(raw))
        except InvalidSignature as exc:
            raise AdmissionDenied("transparency tree head signature mismatch") from exc

        inventory = _decode(_read_trusted(self.inventory_path, 20000),
                            "leaf inventory")
        if (set(inventory) != {"version", "receipt_digests"}
                or type(inventory["version"]) is not int
                or inventory["version"] != 1
                or not isinstance(inventory["receipt_digests"], list)):
            raise AdmissionDenied("transparency leaf inventory schema invalid")
        hashes = inventory["receipt_digests"]
        if (len(hashes) != head["tree_size"]
                or len(set(x for x in hashes if isinstance(x, str))) != len(hashes)
                or any(not _valid_hash(x) for x in hashes)):
            raise AdmissionDenied("transparency inventory tree size/digest invalid")
        if not hmac.compare_digest(hashes[-1], receipt_sha256):
            raise AdmissionDenied("current witness receipt not last transparency leaf")
        leaves = [bytes.fromhex(value) for value in hashes]
        current_root = merkle_root(leaves).hex()
        if not hmac.compare_digest(current_root, head["root_sha256"]):
            raise AdmissionDenied("transparency inclusion root mismatch")
        previous_root = merkle_root(
            leaves[:self.trusted_previous_size]).hex()
        if not hmac.compare_digest(previous_root,
                                   self.trusted_previous_root_sha256):
            raise AdmissionDenied("transparency prefix consistency mismatch")
        # Phase 16: separately verify compact RFC6962 audit + prefix paths
        # from signed head and previous root, independent of the inventory
        # bytes. Keep Phase 15 full-inventory proof as a second check.
        verify_compact_proof(
            _read_trusted(self.compact_proof_path, 8192),
            receipt_sha256=receipt_sha256,
            tree_size=head["tree_size"],
            signed_root_sha256=head["root_sha256"],
            previous_size=self.trusted_previous_size,
            trusted_previous_root_sha256=self.trusted_previous_root_sha256,
        )
        return {"tree_size": head["tree_size"],
                "tree_root_sha256": current_root,
                "previous_size": self.trusted_previous_size,
                "latest_receipt_sha256": receipt_sha256,
                "log_fingerprint": observed}
