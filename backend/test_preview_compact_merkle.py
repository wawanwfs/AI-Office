"""Phase16: independent RFC6962 compact proof verification.

The verifier MUST not trust the inventory, proof generation, CLI-provided
roots, or a synthetic CI key as proof of an external log's independence.
"""
import hashlib
import json
import pytest

from preview_admission_v2 import AdmissionDenied
from preview_transparency import merkle_root
from preview_compact_merkle import (
    make_inclusion_path, make_consistency_path, verify_compact_proof,
)


def _vectors(n, previous):
    digests=[hashlib.sha256(("signed-witness-%d" % i).encode()).digest()
             for i in range(n)]
    new=merkle_root(digests).hex()
    old=merkle_root(digests[:previous]).hex()
    proof={
        "version":1,"tree_size":n,"leaf_index":n-1,
        "receipt_sha256":digests[-1].hex(),
        "inclusion":make_inclusion_path(digests,n-1),
        "previous_size":previous,
        "consistency":make_consistency_path(digests,previous),
    }
    return proof,{"receipt_sha256":digests[-1].hex(),
                  "tree_size":n,"signed_root_sha256":new,
                  "previous_size":previous,
                  "trusted_previous_root_sha256":old}


def _verify(proof, expected):
    return verify_compact_proof(
        json.dumps(proof,sort_keys=True).encode("ascii"), **expected)


@pytest.mark.parametrize("size", [1,2,3,4,5,6,7,8,9,15,16,17,31,32,33,63,64,65,127,128,129,255,256])
def test_all_prefixes_of_each_compact_tree_size(size):
    # All earlier prefixes include 0 (genesis), 1, powers of two,
    # odd/unbalanced trees, and same-size proof.
    for old in range(size+1):
        proof,pins=_vectors(size,old)
        result=_verify(proof,pins)
        assert result["tree_size"]==size
        assert result["previous_size"]==old
        assert result["leaf_index"]==size-1
        assert result["proof_format"]=="rfc6962-compact"


def test_compact_inclusion_altered_sibling_denied():
    proof,pins=_vectors(7,3)
    assert proof["inclusion"]
    proof["inclusion"][0]="f"*64
    with pytest.raises(AdmissionDenied,match="inclusion root mismatch"):
        _verify(proof,pins)


def test_compact_consistency_fork_denied():
    proof,pins=_vectors(11,7)
    assert proof["consistency"]
    proof["consistency"][-1]="e"*64
    with pytest.raises(AdmissionDenied,match="prefix consistency mismatch"):
        _verify(proof,pins)


def test_compact_wrong_trusted_prefix_denied_despite_valid_signed_new_root():
    proof,pins=_vectors(9,5)
    pins["trusted_previous_root_sha256"]="d"*64
    with pytest.raises(AdmissionDenied,match="prefix consistency mismatch"):
        _verify(proof,pins)


def test_compact_old_receipt_and_wrong_last_index_denied():
    proof,pins=_vectors(9,5)
    proof["receipt_sha256"]="a"*64
    with pytest.raises(AdmissionDenied,match="current witness leaf mismatch"):
        _verify(proof,pins)
    proof,pins=_vectors(9,5)
    proof["leaf_index"]=7
    with pytest.raises(AdmissionDenied,match="schema or trusted tree sizes"):
        _verify(proof,pins)


def test_compact_replayed_tree_size_and_prior_size_denied():
    proof,pins=_vectors(8,4)
    proof["tree_size"]=7
    with pytest.raises(AdmissionDenied,match="schema or trusted tree sizes"):
        _verify(proof,pins)
    proof,pins=_vectors(8,4)
    proof["previous_size"]=3
    with pytest.raises(AdmissionDenied,match="schema or trusted tree sizes"):
        _verify(proof,pins)


def test_compact_missing_and_extra_paths_denied():
    proof,pins=_vectors(7,3)
    proof["inclusion"]=[]
    with pytest.raises(AdmissionDenied,match="inclusion root mismatch"):
        _verify(proof,pins)
    proof,pins=_vectors(8,4)
    proof["consistency"].append("a"*64)
    with pytest.raises(AdmissionDenied,match="prefix consistency|extra siblings"):
        _verify(proof,pins)
    proof,pins=_vectors(3,0)
    proof["consistency"]=["e"*64]
    with pytest.raises(AdmissionDenied,match="genesis proof invalid"):
        _verify(proof,pins)
    proof,pins=_vectors(4,4)
    proof["consistency"]=["e"*64]
    with pytest.raises(AdmissionDenied,match="same-size consistency invalid"):
        _verify(proof,pins)


def test_compact_boolean_fields_duplicate_json_and_oversized_denied():
    proof,pins=_vectors(3,2)
    for key in ("version","tree_size","leaf_index","previous_size"):
        altered={**proof,key:True}
        with pytest.raises(AdmissionDenied,match="schema"):
            _verify(altered,pins)
    raw=json.dumps(proof).encode()
    duplicate=raw[:-1]+b',"version":1}'
    with pytest.raises(AdmissionDenied,match="JSON invalid"):
        verify_compact_proof(duplicate,**pins)
    with pytest.raises(AdmissionDenied,match="bytes size"):
        verify_compact_proof(b" " * 9000,**pins)
    altered={**proof,"unexpected":1}
    with pytest.raises(AdmissionDenied,match="schema"):
        _verify(altered,pins)


def test_compact_invalid_sibling_shapes_and_bound_denied():
    proof,pins=_vectors(5,3)
    for invalid in (["G"*64],[12],["a"*63],["a"*64]*33):
        with pytest.raises(AdmissionDenied,match="path hashes invalid"):
            _verify({**proof,"inclusion":invalid},pins)
    for invalid in (["G"*64],[12],["a"*63],["a"*64]*33):
        with pytest.raises(AdmissionDenied,match="path hashes invalid"):
            _verify({**proof,"consistency":invalid},pins)
    with pytest.raises(AdmissionDenied,match="test inclusion bounds"):
        make_inclusion_path([],0)
    with pytest.raises(AdmissionDenied,match="test consistency bounds"):
        make_consistency_path([b"a"*32],2)


def test_independent_compact_proof_verifies_without_inventory():
    proof,pins=_vectors(17,9)
    # Nothing here opens, constructs, or trusts a full-leaf inventory.
    assert _verify(proof,pins)["tree_size"]==17
    assert "inventory" not in proof
    # The current manager still requires BOTH full inventory and compact
    # evidence until an independently hosted log service is accepted.
