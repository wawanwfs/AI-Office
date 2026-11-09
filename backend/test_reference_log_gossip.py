"""Phase18 real TLS certificate pinning and signed log gossip regressions.

Both TLS endpoints use real independent server certificates and distinct
process/journal paths on ONE CI machine. This is NOT a two-host deployment,
physical WORM, independent operator custody, or real external authority.
"""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
from http.client import HTTPSConnection
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import sys
import time

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from cryptography.x509.oid import NameOID
import pytest

from preview_admission_v2 import AdmissionDenied
from preview_transparency import merkle_root
from reference_log_gossip import PinnedHTTPSLogEndpoint, PinnedLogGossipMonitor

_TOKEN = "phase18-ci-synthetic-never-production-"+"Y"*32
_ROOT = Path(__file__).resolve().parent
_SCRIPT = _ROOT / "reference_transparency_log.py"
_EMPTY = hashlib.sha256(b"").hexdigest()


def _port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]


def _ed25519_pem(key):
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption())


def _key_fingerprint(key):
    return hashlib.sha256(key.public_key().public_bytes(
        serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()


def _tls_files(folder,label):
    private = generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    subject = x509.Name([x509.NameAttribute(
        NameOID.COMMON_NAME,"wfs-phase18-local-"+label)])
    cert = (x509.CertificateBuilder()
        .subject_name(subject).issuer_name(subject)
        .public_key(private.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now-timedelta(minutes=3))
        .not_valid_after(now+timedelta(days=2))
        .add_extension(x509.BasicConstraints(ca=True,path_length=None),
                       critical=True)
        .add_extension(x509.SubjectAlternativeName([
            x509.IPAddress(ipaddress.ip_address("127.0.0.1"))
        ]),critical=False)
        .sign(private,hashes.SHA256()))
    pem = folder/(label+"-tls-cert.pem")
    key = folder/(label+"-tls-private.pem")
    pem.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key.write_bytes(private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()))
    if os.name == "posix":
        key.chmod(0o600)
    cert_pin = hashlib.sha256(
        cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    return pem,key,cert_pin


def _get_https(port,cert,pth,body=None,token=_TOKEN):
    context=ssl.create_default_context(cafile=str(cert))
    conn=HTTPSConnection("127.0.0.1",port,context=context,timeout=3)
    try:
        if body is None:
            conn.request("GET",pth,headers={"Authorization":"Bearer "+token})
        else:
            conn.request("POST",pth,body=json.dumps(body).encode("ascii"),
                         headers={"Authorization":"Bearer "+token,
                                  "Content-Type":"application/json"})
        resp=conn.getresponse()
        return resp.status,json.loads(resp.read())
    finally:
        conn.close()


def _launch(node):
    env={**os.environ,"WFS_REF_LOG_TOKEN":_TOKEN}
    cmd=[sys.executable,str(_SCRIPT),"--journal",str(node["journal"]),
         "--private-key",str(node["signing_pem"]),
         "--tls-cert",str(node["cert"]),
         "--tls-key",str(node["tls_private"]),
         "--port",str(node["port"])]
    proc=subprocess.Popen(cmd, stdin=subprocess.DEVNULL,
                          stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,
                          env=env)
    for _ in range(90):
        if proc.poll() is not None:
            detail=proc.stderr.read().decode(errors="replace")
            proc.stderr.close()
            raise AssertionError("TLS reference server startup failed: "+detail[-1600:])
        try:
            if _get_https(node["port"],node["cert"],"/v1/head")[0]==200:
                node["proc"]=proc
                return
        except (OSError,TimeoutError,ssl.SSLError):
            time.sleep(.07)
    _stop({"proc":proc})
    raise AssertionError("TLS reference server not healthy")


def _stop(node):
    proc=node.get("proc")
    if proc is None:
        return
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=8)
    if not proc.stderr.closed:
        proc.stderr.close()
    node["proc"]=None


@pytest.fixture
def replicas(tmp_path):
    # ONE test signer is shared by the two replica logs; each endpoint
    # has a DIFFERENT TLS cert, journal and local OS process. No real
    # external signer/host separation is inferred from this fixture.
    key=Ed25519PrivateKey.generate()
    signer=tmp_path/"synthetic-log-signing.pem"
    public=tmp_path/"synthetic-log-public.pem"
    signer.write_bytes(_ed25519_pem(key))
    if os.name=="posix":
        signer.chmod(0o600)
    public.write_bytes(key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo))
    nodes=[]
    for label in ("alpha","bravo"):
        cert,tls_private,cert_pin=_tls_files(tmp_path,label)
        node={
            "name":label,"journal":tmp_path/(label+"-journal.jsonl"),
            "signing_pem":signer,"public_pem":public,
            "cert":cert,"tls_private":tls_private,
            "cert_pin":cert_pin,"port":_port(),
            "signer_fp":_key_fingerprint(key),
        }
        _launch(node)
        nodes.append(node)
    try:
        yield nodes
    finally:
        for node in nodes:
            _stop(node)


def _endpoint(node, **overrides):
    settings={
        "url":"https://127.0.0.1:"+str(node["port"]),
        "bearer":_TOKEN,
        "ca_cert_path":node["cert"],
        "trusted_cert_sha256":node["cert_pin"],
        "log_public_key_path":node["public_pem"],
        "trusted_signer_fingerprint":node["signer_fp"],
    }
    settings.update(overrides)
    return PinnedHTTPSLogEndpoint(**settings)


def _monitor(replicas):
    return PinnedLogGossipMonitor(
        _endpoint(replicas[0]),_endpoint(replicas[1]))


def _append(node,digest):
    status,before=_get_https(node["port"],node["cert"],"/v1/head")
    assert status==200
    head=before["head"]
    request={"receipt_sha256":digest,
             "expected_size":head["tree_size"],
             "expected_root_sha256":head["root_sha256"]}
    status,result=_get_https(
        node["port"],node["cert"],"/v1/append",body=request)
    assert status==201,result
    return result


def _receipt(i):
    return hashlib.sha256(
        ("phase18-synthetic-signed-witness-%d" % i).encode()).hexdigest()


def _append_both(nodes,i):
    receipt=_receipt(i)
    for node in nodes:
        _append(node,receipt)
    return receipt


def _root(digests):
    return merkle_root([bytes.fromhex(x) for x in digests]).hex()


def test_real_pinned_https_signed_head_and_gossip_progression(replicas):
    first=_append_both(replicas,1)
    monitor=_monitor(replicas)
    genesis=monitor.check(
        trusted_previous_size=0,trusted_previous_root_sha256=_EMPTY)
    assert genesis["tree_size"]==1
    assert genesis["https_pins_verified"] is True
    assert genesis["observations"]==2
    assert genesis["tree_root_sha256"]==_root([first])
    second=_append_both(replicas,2)
    result=monitor.check(
        trusted_previous_size=1,trusted_previous_root_sha256=_root([first]))
    assert result["tree_size"]==2
    assert result["tree_root_sha256"]==_root([first,second])
    with pytest.raises(AdmissionDenied,match="signed log rollback|fork"):
        monitor.check(
            trusted_previous_size=2,
            trusted_previous_root_sha256="e"*64)


def test_divergent_same_signer_sized_trees_trigger_gossip_alarm(replicas):
    first=_append_both(replicas,1)
    _append(replicas[0],_receipt(2))
    _append(replicas[1],_receipt(3))
    with pytest.raises(AdmissionDenied,match="same-size signed fork"):
        _monitor(replicas).check(
            trusted_previous_size=1,trusted_previous_root_sha256=_root([first]))


def test_prefix_consistent_but_lagging_replica_is_not_silent_success(replicas):
    first=_append_both(replicas,1)
    _append(replicas[0],_receipt(2))
    with pytest.raises(AdmissionDenied,match="replicas lagging"):
        _monitor(replicas).check(
            trusted_previous_size=1,trusted_previous_root_sha256=_root([first]))
    _append(replicas[1],_receipt(2))
    assert _monitor(replicas).check(
        trusted_previous_size=1,trusted_previous_root_sha256=_root([first])
    )["tree_size"]==2


def test_signed_head_rollback_after_real_tls_process_restart_denied(replicas):
    first=_append_both(replicas,1)
    second=_append_both(replicas,2)
    node=replicas[1]
    _stop(node)
    # Simulate old disk snapshot being restored despite a valid Ed25519 key.
    rows=node["journal"].read_bytes().splitlines(keepends=True)
    node["journal"].write_bytes(rows[0])
    _launch(node)
    with pytest.raises(AdmissionDenied,match="rollback below pinned size"):
        _monitor(replicas).check(
            trusted_previous_size=2,
            trusted_previous_root_sha256=_root([first,second]))


def test_pinned_tls_cert_and_signer_key_cannot_be_self_substituted(replicas,tmp_path):
    node=replicas[0]
    with pytest.raises(AdmissionDenied,match="TLS peer certificate pin mismatch"):
        _endpoint(node,trusted_cert_sha256="f"*64).signed_head()
    fake=Ed25519PrivateKey.generate()
    pub=tmp_path/"wrong-signing.pem"
    pub.write_bytes(fake.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo))
    with pytest.raises(AdmissionDenied,match="fingerprint changed"):
        _endpoint(node,log_public_key_path=pub)
    with pytest.raises(AdmissionDenied,match="HTTPS origin"):
        _endpoint(node,url="http://127.0.0.1:"+str(node["port"]))
    with pytest.raises(AdmissionDenied,match="HTTPS origin"):
        _endpoint(node,url="https://username:password@127.0.0.1:"+str(node["port"]))
    with pytest.raises(AdmissionDenied,match="HTTPS origin"):
        _endpoint(node,url="https://127.0.0.1:"+str(node["port"])+"/redirect")


def test_untrusted_tls_certificate_and_wrong_bearer_fail_closed(replicas):
    first,second=replicas
    with pytest.raises(AdmissionDenied,match="pinned HTTPS log unavailable"):
        _endpoint(first,ca_cert_path=second["cert"]).signed_head()
    with pytest.raises(AdmissionDenied,match="non-200"):
        _endpoint(first,bearer="incorrect-"+_TOKEN).signed_head()


def test_forged_smaller_history_and_outage_denied(replicas):
    _append_both(replicas,1)
    one,two=replicas
    _stop(two)
    with pytest.raises(AdmissionDenied,match="pinned HTTPS log unavailable"):
        _monitor(replicas).check(
            trusted_previous_size=0,trusted_previous_root_sha256=_EMPTY)
    _launch(two)
    assert _monitor(replicas).check(
        trusted_previous_size=0,trusted_previous_root_sha256=_EMPTY
    )["tree_size"]==1


def test_monitor_rejects_duplicate_endpoints_and_same_cert(replicas):
    a,b=replicas
    with pytest.raises(AdmissionDenied,match="distinct HTTPS endpoints"):
        PinnedLogGossipMonitor(_endpoint(a),_endpoint(a))
    with pytest.raises(AdmissionDenied,match="distinct TLS identities"):
        PinnedLogGossipMonitor(_endpoint(a),_endpoint(
            b,trusted_cert_sha256=a["cert_pin"]))


def test_tls_server_requires_cert_and_key_as_a_pair(replicas):
    from reference_transparency_log import serve_reference
    n=replicas[0]
    with pytest.raises(AdmissionDenied,match="must be paired"):
        serve_reference(journal_path=n["journal"],
            private_pem_path=n["signing_pem"],token=_TOKEN,port=0,
            tls_cert_path=n["cert"],tls_key_path=None)


def test_gossip_previous_anchor_is_not_discovered_from_untrusted_peer(replicas):
    _append_both(replicas,1)
    monitor=_monitor(replicas)
    with pytest.raises(AdmissionDenied,match="prior approved root"):
        monitor.check(
            trusted_previous_size=0,trusted_previous_root_sha256="")
    with pytest.raises(AdmissionDenied,match="genesis root invalid"):
        monitor.check(
            trusted_previous_size=0,trusted_previous_root_sha256="a"*64)
    with pytest.raises(AdmissionDenied,match="prior approved tree size"):
        monitor.check(
            trusted_previous_size=True,trusted_previous_root_sha256=_EMPTY)



def _operator_cli(replicas,previous_size,previous_root):
    a,b=replicas
    cli=_ROOT.parent/"scripts"/"wfs_phase18_gossip_check.py"
    args=[
        sys.executable,str(cli),
        "--primary-url","https://127.0.0.1:"+str(a["port"]),
        "--primary-ca",str(a["cert"]),
        "--primary-tls-pin",a["cert_pin"],
        "--mirror-url","https://127.0.0.1:"+str(b["port"]),
        "--mirror-ca",str(b["cert"]),
        "--mirror-tls-pin",b["cert_pin"],
        "--log-public-key",str(a["public_pem"]),
        "--log-key-pin",a["signer_fp"],
        "--previous-size",str(previous_size),
        "--previous-root",previous_root,
    ]
    env={**os.environ,
         "WFS_LOG_PRIMARY_BEARER":_TOKEN,
         "WFS_LOG_MIRROR_BEARER":_TOKEN}
    return subprocess.run(args,capture_output=True,text=True,
                          timeout=15,check=False,env=env)


def test_owner_cli_real_two_tls_endpoints_green_and_fork_fails(replicas):
    first=_append_both(replicas,1)
    result=_operator_cli(replicas,0,_EMPTY)
    assert result.returncode==0,result.stderr
    assert json.loads(result.stdout)["tree_size"]==1
    assert _TOKEN not in result.stdout
    _append(replicas[0],_receipt(2))
    _append(replicas[1],_receipt(3))
    refused=_operator_cli(replicas,1,_root([first]))
    assert refused.returncode==2
    assert "DENIED" in refused.stderr
    assert _TOKEN not in refused.stderr
    assert not refused.stdout.strip()


def test_owner_cli_rejects_missing_environment_bearer(replicas):
    cli=_ROOT.parent/"scripts"/"wfs_phase18_gossip_check.py"
    run=subprocess.run(
        [sys.executable,str(cli),
         "--primary-url","https://127.0.0.1:18000",
         "--primary-ca",str(replicas[0]["cert"]),
         "--primary-tls-pin",replicas[0]["cert_pin"],
         "--mirror-url","https://127.0.0.1:18001",
         "--mirror-ca",str(replicas[1]["cert"]),
         "--mirror-tls-pin",replicas[1]["cert_pin"],
         "--log-public-key",str(replicas[0]["public_pem"]),
         "--log-key-pin",replicas[0]["signer_fp"],
         "--previous-size","0","--previous-root",_EMPTY],
        env={k:v for k,v in os.environ.items()
             if k not in ("WFS_LOG_PRIMARY_BEARER","WFS_LOG_MIRROR_BEARER")},
        capture_output=True,text=True,timeout=10,check=False)
    assert run.returncode==2
    assert "DENIED" in run.stderr
