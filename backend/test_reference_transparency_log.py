"""Phase 17 disposable reference log: real loopback HTTP and process tests.

All signing keys and bearer tokens are synthetic. Two independently launched
verifier processes share one CI host; this DOES NOT prove two external hosts,
independent organizational authority, TLS or physical append-only media.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from preview_admission_v2 import AdmissionDenied
from preview_compact_merkle import verify_compact_proof
from preview_transparency import (
    SignedTransparencyEvidence, canonical_tree_head, merkle_root,
)
from reference_transparency_log import ReferenceLog


TOKEN = "reference-only-disposable-no-production-" + "X" * 32
_NO_PROXY = build_opener(ProxyHandler({}))
ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "reference_transparency_log.py"


def _json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("ascii")


def _key_bytes(key):
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption())


def _public_bytes(key):
    return key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo)


def _fingerprint(key):
    raw = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return hashlib.sha256(raw).hexdigest()


def _request(port, path, *, data=None, token=TOKEN):
    method = "POST" if data is not None else "GET"
    payload = None if data is None else _json_bytes(data)
    req = Request("http://127.0.0.1:%d%s" % (port, path), data=payload,
                  headers={"Authorization":"Bearer " + token,
                           "Content-Type":"application/json"},
                  method=method)
    try:
        with _NO_PROXY.open(req, timeout=3) as response:
            return response.status, json.loads(response.read())
    except HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _launch(journal, pem, port):
    env = {**os.environ, "WFS_REF_LOG_TOKEN":TOKEN}
    proc = subprocess.Popen(
        [sys.executable, str(SCRIPT), "--journal", str(journal),
         "--private-key", str(pem), "--port", str(port)],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE, env=env)
    for _ in range(75):
        if proc.poll() is not None:
            raise AssertionError("reference log failed at startup: " +
                                 proc.stderr.read().decode()[-1600:])
        try:
            if _request(port, "/v1/head")[0] == 200:
                return proc
        except (OSError, URLError, TimeoutError):
            time.sleep(.06)
    proc.terminate()
    proc.wait(timeout=8)
    raise AssertionError("reference log never listened on loopback")


def _terminate(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=8)
    proc.stderr.close()


@pytest.fixture
def service(tmp_path):
    key = Ed25519PrivateKey.generate()
    pem = tmp_path / "reference-key.pem"
    pem.write_bytes(_key_bytes(key))
    if os.name == "posix":
        pem.chmod(0o600)
    journal = tmp_path / "reference-journal.jsonl"
    port = _port()
    proc = _launch(journal, pem, port)
    try:
        yield {"key":key, "pem":pem, "journal":journal,
               "port":port, "proc":proc}
    finally:
        _terminate(proc)


def _append(port, digest):
    status, head = _request(port, "/v1/head")
    assert status == 200
    post = {"receipt_sha256":digest, "expected_size":head["head"]["tree_size"],
            "expected_root_sha256":head["head"]["root_sha256"]}
    return _request(port, "/v1/append", data=post)


def _add(port, number):
    digest = hashlib.sha256(("synthetic-signed-witness-%d" % number).encode()
                            ).hexdigest()
    status, result = _append(port, digest)
    assert status == 201, result
    return digest, result


def _check_signed_head(head, key):
    raw = base64.b64decode(head["head_bytes_base64"], validate=True)
    signature = base64.b64decode(head["head_signature_base64"], validate=True)
    assert json.loads(raw) == head["head"]
    key.public_key().verify(signature, canonical_tree_head(raw))
    return hashlib.sha256(raw).hexdigest()


def test_real_http_append_requires_authentication_and_compare_swap(service):
    port = service["port"]
    assert _request(port, "/v1/head", token="forged")[0] == 401
    assert _request(port, "/v1/append", data={
        "receipt_sha256":"a"*64,"expected_size":0,
        "expected_root_sha256":hashlib.sha256(b"").hexdigest()},
        token="forged")[0] == 401
    digest, head = _add(port, 1)
    assert head["head"]["tree_size"] == 1
    _check_signed_head(head, service["key"])
    assert _request(port, "/v1/append", data={
        "receipt_sha256":hashlib.sha256(b"other").hexdigest(),
        "expected_size":0,
        "expected_root_sha256":hashlib.sha256(b"").hexdigest()})[0] == 409
    assert _append(port, digest)[0] == 409
    assert _request(port, "/v1/unknown")[0] == 404
    assert _request(port, "/v1/proof?previous_size=bad")[0] == 400
    assert _request(port, "/v1/proof?previous_size=9")[0] == 409


def test_ref_log_signs_actual_compact_inclusion_and_consistency(service, tmp_path):
    port = service["port"]
    hashes = [_add(port, n)[0] for n in range(4)]
    prior_root = merkle_root([bytes.fromhex(x) for x in hashes[:2]]).hex()
    status, bundle = _request(port, "/v1/proof?previous_size=2")
    assert status == 200
    _check_signed_head(bundle, service["key"])
    proof = bundle["proof"]
    assert proof["tree_size"] == 4
    assert proof["previous_size"] == 2
    assert proof["receipt_sha256"] == hashes[-1]
    result = verify_compact_proof(
        _json_bytes(proof), receipt_sha256=hashes[-1],
        tree_size=4, signed_root_sha256=bundle["head"]["root_sha256"],
        previous_size=2, trusted_previous_root_sha256=prior_root)
    assert result["proof_format"] == "rfc6962-compact"

    status, inventory = _request(port, "/v1/inventory")
    assert status == 200
    assert inventory["inventory"]["receipt_digests"] == hashes
    assert inventory["head"] == bundle["head"]
    head_p, sig_p, inventory_p, compact_p, pub_p = (
        tmp_path / x for x in
        ("verified-head.json", "verified-head.sig", "verified-leaves.json",
         "verified-compact.json", "approved-public.pem"))
    head_p.write_bytes(base64.b64decode(bundle["head_bytes_base64"]))
    sig_p.write_bytes(bundle["head_signature_base64"].encode())
    inventory_p.write_bytes(_json_bytes(inventory["inventory"]))
    compact_p.write_bytes(_json_bytes(bundle["proof"]))
    pub_p.write_bytes(_public_bytes(service["key"]))
    # Compatibility: same signed-head/inventory/compact evidence accepted
    # by existing Phase15/16 template-only admission verifier.
    evidence = SignedTransparencyEvidence(
        head_path=head_p, signature_path=sig_p,
        public_key_path=pub_p, inventory_path=inventory_p,
        compact_proof_path=compact_p,
        trusted_head_sha256=hashlib.sha256(head_p.read_bytes()).hexdigest(),
        trusted_log_fingerprint=_fingerprint(service["key"]),
        trusted_previous_size=2,
        trusted_previous_root_sha256=prior_root)
    others = [Ed25519PrivateKey.generate() for _ in range(3)]
    checked = evidence.verify(
        receipt_sha256=hashes[-1],
        witness_fingerprint=_fingerprint(others[0]),
        roster_root_fingerprint=_fingerprint(others[1]),
        reviewer_fingerprint=_fingerprint(others[2]))
    assert checked["tree_size"] == 4


# An entirely separate Python interpreter verifies every signature and
# compact path against independently given trusted root/head values.
_VERIFY_CLIENT = r'''
import base64
import hashlib
import json
import sys
import urllib.request
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from preview_compact_merkle import verify_compact_proof
from preview_transparency import canonical_tree_head

port, token, pem, trusted_sha, trusted_key, old_root = sys.argv[1:]
req=urllib.request.Request(
    "http://127.0.0.1:%s/v1/proof?previous_size=1" % port,
    headers={"Authorization":"Bearer "+token})
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(req,timeout=4) as response:
    bundle=json.load(response)
public=serialization.load_pem_public_key(open(pem,"rb").read())
assert isinstance(public,Ed25519PublicKey)
observed=hashlib.sha256(public.public_bytes_raw()).hexdigest()
assert observed==trusted_key
head=base64.b64decode(bundle["head_bytes_base64"],validate=True)
signature=base64.b64decode(bundle["head_signature_base64"],validate=True)
assert hashlib.sha256(head).hexdigest()==trusted_sha
assert json.loads(head)==bundle["head"]
public.verify(signature,canonical_tree_head(head))
proof=bundle["proof"]
verified=verify_compact_proof(
    json.dumps(proof,sort_keys=True).encode(),
    receipt_sha256=proof["receipt_sha256"],
    tree_size=bundle["head"]["tree_size"],
    signed_root_sha256=bundle["head"]["root_sha256"],
    previous_size=1, trusted_previous_root_sha256=old_root)
print(json.dumps({"head_sha256":trusted_sha,"root":bundle["head"]["root_sha256"],
                  "size":verified["tree_size"]}))
'''


def _client(port, pem, trusted_sha, trusted_fp, old_root):
    env = {**os.environ, "PYTHONPATH":str(ROOT)}
    run = subprocess.run(
        [sys.executable, "-c", _VERIFY_CLIENT, str(port), TOKEN,
         str(pem), trusted_sha, trusted_fp, old_root],
        capture_output=True, text=True, timeout=15, check=False, env=env)
    if run.returncode:
        raise AssertionError("independent verifier failed: " + run.stderr[-1800:])
    return json.loads(run.stdout)


def test_two_independent_client_processes_observe_same_signed_head(service,tmp_path):
    port = service["port"]
    digests = [_add(port,n)[0] for n in range(3)]
    signed = _request(port,"/v1/head")[1]
    pin = _check_signed_head(signed,service["key"])
    old = merkle_root([bytes.fromhex(digests[0])]).hex()
    public = tmp_path/"independently-pinned-log-public.pem"
    public.write_bytes(_public_bytes(service["key"]))
    fp = _fingerprint(service["key"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(_client,port,public,pin,fp,old)
        b = pool.submit(_client,port,public,pin,fp,old)
        results = [a.result(),b.result()]
    assert results[0] == results[1]
    assert results[0]["size"] == 3
    assert results[0]["head_sha256"] == pin
    # An old VALID signed head is stale against an independently approved pin.
    replay = hashlib.sha256(_json_bytes({
        "version":1, "tree_size":1,
        "root_sha256":old})).hexdigest()
    assert replay != pin
    with pytest.raises(AssertionError, match="independent verifier failed"):
        _client(port,public,replay,fp,old)


def test_journal_survives_actual_process_restart_and_rejects_bad_replay(service):
    port=service["port"]
    journal=service["journal"]
    pem=service["pem"]
    root_key=service["key"]
    for idx in range(4):
        _add(port,idx)
    head=_request(port,"/v1/head")[1]
    pinned=_check_signed_head(head,root_key)
    _terminate(service["proc"])
    service["proc"]=_launch(journal,pem,port)
    after=_request(port,"/v1/head")[1]
    assert _check_signed_head(after,root_key)==pinned
    assert len(journal.read_bytes().splitlines())==4
    # Deny unauthorized duplicate or stale expected root after recovery.
    assert _append(port,hashlib.sha256(b"synthetic-signed-witness-0").hexdigest())[0] == 409
    _add(port,4)


def test_tampered_or_torn_journal_fails_closed_on_recovery(service,tmp_path):
    port=service["port"]
    _add(port,1)
    _add(port,2)
    original=service["journal"].read_bytes()
    _terminate(service["proc"])
    for raw in (original[:-3], original.replace(b'"root_sha256":"', b'"root_sha256":"f', 1)):
        service["journal"].write_bytes(raw)
        with pytest.raises(AdmissionDenied, match="truncated|root conflict|record invalid|malformed"):
            ReferenceLog(service["journal"],service["key"])
    service["journal"].write_bytes(original)
    assert ReferenceLog(service["journal"],service["key"]).tree_head()["tree_size"]==2
    service["proc"]=_launch(service["journal"],service["pem"],port)


def test_simulated_network_outage_and_resume_without_new_writes(service):
    _add(service["port"],1)
    before=service["journal"].read_bytes()
    _terminate(service["proc"])
    with pytest.raises((URLError, OSError, TimeoutError)):
        _request(service["port"],"/v1/head")
    assert service["journal"].read_bytes()==before
    service["proc"]=_launch(service["journal"],service["pem"],service["port"])
    assert _request(service["port"],"/v1/head")[1]["head"]["tree_size"]==1


def test_reject_bogus_payload_and_symlink_journal(service,tmp_path):
    port=service["port"]
    initial=_request(port,"/v1/head")[1]["head"]
    for payload in (
        {"receipt_sha256":"a"*64,"expected_size":True,
         "expected_root_sha256":initial["root_sha256"]},
        {"receipt_sha256":"not-sha","expected_size":0,
         "expected_root_sha256":initial["root_sha256"]},
        {"receipt_sha256":"a"*64,"expected_size":0,
         "expected_root_sha256":"bad"},
        {"receipt_sha256":"a"*64, "expected_size":0}):
        assert _request(port,"/v1/append",data=payload)[0]==409
    _terminate(service["proc"])
    link=tmp_path/"journal-symlink.jsonl"
    try:
        link.symlink_to(service["journal"])
    except OSError:
        pytest.skip("host forbids symlinks")
    with pytest.raises(AdmissionDenied,match="unsafe"):
        ReferenceLog(link,service["key"])
    service["proc"]=_launch(service["journal"],service["pem"],port)
