"""Phase 16: RFC6962 compact inclusion + consistency proofs for digest leaves.

A leaf is the 32-byte SHA256 digest of the EXACT witness-receipt JSON;
the existing Phase 15 Merkle commitment is SHA256(0x00 || digest).
The log head is independently signed/pinned by Phase 15. This module
only verifies compact evidence against that independently trusted head
and archived prior size/root; it does NOT operate a remote append-only
log, distribute trust anchors, timestamp heads or prevent equivocation.
"""
import hashlib
import hmac
import json
import re

from preview_admission_v2 import AdmissionDenied

_HASH = re.compile(r"[a-f0-9]{64}\Z")
_EMPTY = hashlib.sha256(b"").digest()
_MAX_SIZE = 256
_MAX_PATH = 32
_FIELDS = frozenset(("version", "tree_size", "leaf_index",
                     "receipt_sha256", "inclusion", "previous_size",
                     "consistency"))


def _node(left, right):
    return hashlib.sha256(b"\x01" + left + right).digest()


def _leaf(digest):
    return hashlib.sha256(b"\x00" + digest).digest()


def _root(values):
    """Tree hashing also used by test-only proof generation."""
    if not values:
        return _EMPTY
    if len(values) == 1:
        return _leaf(values[0])
    split = 1 << ((len(values) - 1).bit_length() - 1)
    return _node(_root(values[:split]), _root(values[split:]))


def make_inclusion_path(digests, index):
    """TEST FIXTURE utility: produce bottom-up RFC6962 audit path."""
    if not 1 <= len(digests) <= _MAX_SIZE or not 0 <= index < len(digests):
        raise AdmissionDenied("test inclusion bounds invalid")
    if any(type(x) is not bytes or len(x) != 32 for x in digests):
        raise AdmissionDenied("test leaf digest invalid")
    def path(items, idx):
        if len(items) == 1:
            return []
        split = 1 << ((len(items) - 1).bit_length() - 1)
        if idx < split:
            return path(items[:split], idx) + [_root(items[split:])]
        return path(items[split:], idx-split) + [_root(items[:split])]
    return [item.hex() for item in path(digests, index)]


def make_consistency_path(digests, old_size):
    """TEST FIXTURE utility: generate RFC6962 SUBPROOF(m, D[n], true)."""
    n = len(digests)
    if not 1 <= n <= _MAX_SIZE or type(old_size) is not int or not 0 <= old_size <= n:
        raise AdmissionDenied("test consistency bounds invalid")
    if any(type(x) is not bytes or len(x) != 32 for x in digests):
        raise AdmissionDenied("test leaf digest invalid")
    if old_size == 0:
        return []
    def subproof(items, m, complete):
        if m == len(items):
            return [] if complete else [_root(items)]
        split = 1 << ((len(items) - 1).bit_length() - 1)
        if m <= split:
            return subproof(items[:split], m, complete) + [_root(items[split:])]
        return subproof(items[split:], m-split, False) + [_root(items[:split])]
    return [item.hex() for item in subproof(digests, old_size, True)]


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate compact proof field")
        result[key] = value
    return result


def _parse_hashes(value):
    if (not isinstance(value, list) or len(value) > _MAX_PATH or
            any(not isinstance(x, str) or _HASH.fullmatch(x) is None
                for x in value)):
        raise AdmissionDenied("compact proof path hashes invalid")
    return [bytes.fromhex(item) for item in value]


def _verify_inclusion(leaf_digest, index, size, siblings, signed_root):
    fn, sn = index, size-1
    result = _leaf(leaf_digest)
    for sibling in siblings:
        if sn == 0:
            raise AdmissionDenied("compact inclusion has extra siblings")
        if fn & 1 or fn == sn:
            result = _node(sibling, result)
            while fn & 1 == 0 and fn != 0:
                fn >>= 1
                sn >>= 1
        else:
            result = _node(result, sibling)
        fn >>= 1
        sn >>= 1
    if sn != 0 or not hmac.compare_digest(result, signed_root):
        raise AdmissionDenied("compact inclusion root mismatch")


def _verify_consistency(old_size, size, old_root, signed_root, siblings):
    if old_size == 0:
        if siblings or not hmac.compare_digest(old_root, _EMPTY):
            raise AdmissionDenied("compact genesis proof invalid")
        return
    if old_size == size:
        if siblings or not hmac.compare_digest(old_root, signed_root):
            raise AdmissionDenied("compact same-size consistency invalid")
        return
    fn, sn = old_size - 1, size - 1
    while fn & 1:
        fn >>= 1
        sn >>= 1
    if fn == 0:
        old, current = old_root, old_root
        nodes = siblings
    else:
        if not siblings:
            raise AdmissionDenied("compact consistency seed missing")
        old = current = siblings[0]
        nodes = siblings[1:]
    for sibling in nodes:
        if sn == 0:
            raise AdmissionDenied("compact consistency has extra siblings")
        if fn & 1 or fn == sn:
            old = _node(sibling, old)
            current = _node(sibling, current)
            while fn & 1 == 0 and fn != 0:
                fn >>= 1
                sn >>= 1
        else:
            current = _node(current, sibling)
        fn >>= 1
        sn >>= 1
    if (sn != 0 or not hmac.compare_digest(old, old_root) or
            not hmac.compare_digest(current, signed_root)):
        raise AdmissionDenied("compact prefix consistency mismatch")


def verify_compact_proof(raw, *, receipt_sha256, tree_size,
                         signed_root_sha256, previous_size,
                         trusted_previous_root_sha256):
    """Verify only compact paths, independent of any full leaf inventory.

    All expected values are provided by Phase 15's cryptographically
    validated current tree head or externally pinned previous root. The
    proof JSON itself is NOT a trust anchor; recomputing a proof does not
    grant authority to change any expected hash or signer identity.
    """
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 8192:
        raise AdmissionDenied("compact proof bytes size invalid")
    try:
        value = json.loads(raw, object_pairs_hook=_unique)
    except (ValueError, UnicodeError, TypeError) as exc:
        raise AdmissionDenied("compact proof JSON invalid") from exc
    if (not isinstance(value, dict) or set(value) != _FIELDS or
            type(value["version"]) is not int or value["version"] != 1 or
            type(value["tree_size"]) is not int or
            type(value["leaf_index"]) is not int or
            type(value["previous_size"]) is not int or
            not 1 <= tree_size <= _MAX_SIZE or
            not 0 <= previous_size <= tree_size or
            value["tree_size"] != tree_size or
            value["leaf_index"] != tree_size - 1 or
            value["previous_size"] != previous_size or
            not isinstance(value["receipt_sha256"], str) or
            _HASH.fullmatch(value["receipt_sha256"]) is None):
        raise AdmissionDenied("compact proof schema or trusted tree sizes mismatch")
    for expected in (receipt_sha256, signed_root_sha256,
                     trusted_previous_root_sha256):
        if not isinstance(expected, str) or _HASH.fullmatch(expected) is None:
            raise AdmissionDenied("compact proof expected hash invalid")
    if not hmac.compare_digest(value["receipt_sha256"], receipt_sha256):
        raise AdmissionDenied("compact current witness leaf mismatch")
    inclusion = _parse_hashes(value["inclusion"])
    consistency = _parse_hashes(value["consistency"])
    _verify_inclusion(bytes.fromhex(receipt_sha256), tree_size-1,
                      tree_size, inclusion, bytes.fromhex(signed_root_sha256))
    _verify_consistency(previous_size, tree_size,
                        bytes.fromhex(trusted_previous_root_sha256),
                        bytes.fromhex(signed_root_sha256), consistency)
    return {"tree_size": tree_size, "leaf_index": tree_size-1,
            "previous_size": previous_size, "proof_format": "rfc6962-compact"}
