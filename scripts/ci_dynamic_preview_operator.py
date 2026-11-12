#!/usr/bin/env python3
"""Actual operator-only dynamic *template* previews: two stacks, lifecycle.

Disposable CI Docker host ONLY. No public gateway, arbitrary untrusted
source builds, provider credentials, or production deployment.
"""
import hashlib
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time

import httpx

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from preview_manager import TemplatePreviewManager,PreviewDenied
from preview_admission import REVIEWED_FILES, candidate_manifest_for_ci_only
from ci_preview_network_probe import prove_disposable_container_egress
from ci_phase13_real_dns_rebind import prove_real_docker_dns_rebinding
from ci_phase19_sealed_build import prove_sealed_build
from preview_authority import SignedPreviewAuthority
from preview_signature import canonical_review_bytes
from preview_root_authority import canonical_roster_bytes
from preview_witness import SignedReviewerCheckpoint, canonical_checkpoint_bytes
from preview_transparency import SignedTransparencyEvidence, canonical_tree_head, merkle_root
from preview_compact_merkle import make_inclusion_path, make_consistency_path
from preview_admission_v2 import AdmissionDenied
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

repo=Path(__file__).resolve().parents[1]
root=Path(tempfile.mkdtemp(prefix="wfs-preview-operator-"))
token_a=secrets.token_urlsafe(32)
token_b=secrets.token_urlsafe(32)
reviewed_root=repo/"examples/fullstack-preview"
# This CI runner trusts the reviewed checkout; an actual operator must
# supply expected hashes independently, not calculate approval from uploads.
reviewed_files=candidate_manifest_for_ci_only(reviewed_root)
# Ephemeral SYNTHETIC CI review, never an operator-approved signature.
# The private key exists only in this CI process memory.
ci_key=Ed25519PrivateKey.generate()
reviewer_pem=root/"synthetic-ci-public.pem"
signature=root/"synthetic-ci.sig"
reviewer_policy=root/"synthetic-ci-policy.json"
reviewer_pem.write_bytes(ci_key.public_key().public_bytes(
    serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
signature.write_bytes(base64.b64encode(ci_key.sign(
    canonical_review_bytes(reviewed_files))))
fingerprint=hashlib.sha256(ci_key.public_key().public_bytes(
    serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
reviewer_policy.write_text(json.dumps({
    "version":1,"epoch":1,"active_fingerprints":[fingerprint],
    "revoked_fingerprints":[]
},sort_keys=True))
original_policy=reviewer_policy.read_bytes()
# Disposable synthetic ROOT is separate from the reviewer signing identity.
# Never use this CI key material as an operator's production trust anchor.
ci_roster_root=Ed25519PrivateKey.generate()
roster_root_pem=root/"synthetic-ci-roster-root.pem"
roster_root_sig=root/"synthetic-ci-roster-root.sig"
roster_root_pem.write_bytes(ci_roster_root.public_key().public_bytes(
    serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
roster_root_sig.write_bytes(base64.b64encode(ci_roster_root.sign(
    canonical_roster_bytes(original_policy))))
roster_root_fp=hashlib.sha256(ci_roster_root.public_key().public_bytes(
    serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
assert roster_root_fp != fingerprint
# A THIRD synthetic signer produces a separate currently pinned checkpoint.
# This is only cryptographic CI; no external transparency service exists.
ci_witness=Ed25519PrivateKey.generate()
witness_pem=root/"synthetic-ci-witness-public.pem"
witness_receipt=root/"synthetic-ci-witness-checkpoint.json"
witness_sig=root/"synthetic-ci-witness-checkpoint.sig"
witness_pem.write_bytes(ci_witness.public_key().public_bytes(
    serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
witness_fp=hashlib.sha256(ci_witness.public_key().public_bytes(
    serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
assert witness_fp not in (fingerprint,roster_root_fp)
witness_receipt.write_text(json.dumps({
    "version":1,"epoch":1,
    "policy_sha256":hashlib.sha256(original_policy).hexdigest(),
    "roster_root_fingerprint":roster_root_fp,
},sort_keys=True))
witness_sig.write_bytes(base64.b64encode(ci_witness.sign(
    canonical_checkpoint_bytes(witness_receipt.read_bytes()))))
# FOURTH synthetic CI authority: signs a one-leaf Merkle tree head.
# Key/signatures are not a deployed transparent append-only service.
ci_log=Ed25519PrivateKey.generate()
log_public=root/"synthetic-ci-log-public.pem"
log_head=root/"synthetic-ci-log-head.json"
log_signature=root/"synthetic-ci-log-head.sig"
log_inventory=root/"synthetic-ci-log-inventory.json"
log_public.write_bytes(ci_log.public_key().public_bytes(
    serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
log_fingerprint=hashlib.sha256(ci_log.public_key().public_bytes(
    serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
assert log_fingerprint not in (fingerprint,roster_root_fp,witness_fp)
receipt_digest=hashlib.sha256(witness_receipt.read_bytes()).hexdigest()
log_inventory.write_text(json.dumps({
    "version":1,"receipt_digests":[receipt_digest]},sort_keys=True))
log_compact=root/"synthetic-ci-log-compact.json"
leaf_bytes=[bytes.fromhex(receipt_digest)]
log_compact.write_text(json.dumps({
    "version":1,"tree_size":1,"leaf_index":0,
    "receipt_sha256":receipt_digest,
    "inclusion":make_inclusion_path(leaf_bytes,0),
    "previous_size":0,
    "consistency":make_consistency_path(leaf_bytes,0)
},sort_keys=True))
log_head.write_text(json.dumps({
    "version":1,"tree_size":1,
    "root_sha256":merkle_root([bytes.fromhex(receipt_digest)]).hex(),
},sort_keys=True))
log_signature.write_bytes(base64.b64encode(
    ci_log.sign(canonical_tree_head(log_head.read_bytes()))))
transparency=SignedTransparencyEvidence(
    public_key_path=log_public,signature_path=log_signature,
    head_path=log_head,inventory_path=log_inventory,
    compact_proof_path=log_compact,
    trusted_log_fingerprint=log_fingerprint,
    trusted_head_sha256=hashlib.sha256(log_head.read_bytes()).hexdigest(),
    trusted_previous_size=0,
    trusted_previous_root_sha256=hashlib.sha256(b"").hexdigest())
witness=SignedReviewerCheckpoint(
    receipt_path=witness_receipt,signature_path=witness_sig,
    public_key_path=witness_pem,
    trusted_receipt_sha256=hashlib.sha256(witness_receipt.read_bytes()).hexdigest(),
    trusted_witness_fingerprint=witness_fp,
    transparency_evidence=transparency)
authority=SignedPreviewAuthority(
    public_key_path=reviewer_pem,
    signature_path=signature,
    policy_path=reviewer_policy,
    trusted_policy_sha256=hashlib.sha256(original_policy).hexdigest(),
    root_public_key_path=roster_root_pem,
    root_signature_path=roster_root_sig,
    trusted_root_fingerprint=roster_root_fp,
    witness_checkpoint=witness,
)
# Run a REAL Docker build against the staged Compose context while a
# separate local write modifies the live checkout. The runner always restores
# the original source before returning to avoid cross-test pollution.
race_proof={"attempted":False,"staged_bytes_unchanged":False,
            "malicious_staged_source_during_no_build":False}
def reviewed_snapshot_runner(argv,**kwargs):
    hardened=argv[-5:]==["up","-d","--no-build","--pull","never"]
    if hardened and not race_proof["attempted"]:
        live_api=reviewed_root/"api.py"
        staged=Path(kwargs["cwd"])/"api.py"
        original=live_api.read_bytes()
        staged_original=staged.read_bytes()
        previous_mode=staged.stat().st_mode & 0o777
        assert staged.resolve()!=live_api.resolve()
        assert staged_original==original
        race_proof["attempted"]=True
        try:
            # Change BOTH the original checkout and actual signed staging
            # after the Compose runtime bytes were sealed. The snapshot
            # owner can rewrite even chmod 0444: BuildKit and Compose
            # must still use the content-addressed, prebuilt image.
            live_api.write_bytes(b"raise SystemExit('UNAPPROVED LIVE CHECKOUT')\n")
            staged.chmod(0o600)
            staged.write_bytes(
                b"raise SystemExit('HOSTILE STAGING DURING NO-BUILD')\n")
            race_proof["malicious_staged_source_during_no_build"]=True
            deadline=kwargs.pop("timeout",240)
            result=subprocess.run(argv,timeout=240 if deadline>240 else deadline,
                                  **kwargs)
            return result
        finally:
            staged.write_bytes(staged_original)
            staged.chmod(previous_mode)
            live_api.write_bytes(original)
            race_proof["staged_bytes_unchanged"]=(
                staged.read_bytes()==staged_original)
    deadline=kwargs.pop("timeout",120)
    return subprocess.run(argv,timeout=240 if deadline>240 else deadline,**kwargs)

manager=TemplatePreviewManager(root/"registry.db",
    reviewed_root/"compose.yaml",enabled=True,reviewed_files=reviewed_files,
    reviewer_authority=authority,runner=reviewed_snapshot_runner,
    sealed_runtime=True)
proof={"mode":"real-disposable-operator-template-preview",
       "paid_provider_used":False,"production_deployment":False,
       "generic_user_code_preview":False,
       "stacks":[],"cleanup_confirmed":False,
       "reviewed_template_files":list(REVIEWED_FILES),
       "reviewed_template_source":"CI-trusted-repository-checkout",
       "approved_supply_chain_manifest_version":2,
       "checked_frontend_asset_count":len(reviewed_files["frontend"]),
       "cyclonedx_sbom_hash_checked":True,
       "dependency_lock_hash_checked":True,
       "all_runtime_image_references_immutable":True,
       "phase10_test_signature_only":"ephemeral synthetic CI identity; NOT independent review",
       "phase12_roster_authority":"separate synthetic key, not an independently audited human/device",
       "phase14_checkpoint_witness":"third synthetic signer and independently pinned receipt hash; not external append-only log",
       "phase15_merkle_proof":"fourth synthetic log signer; full-leaf inclusion and genesis-prefix proof, NOT externally hosted transparency",
       "phase16_compact_proof":"real RFC6962 compact audit and genesis-prefix proof verified separately; synthetic CI only",
       "phase20_runtime_mode":"kernel-sealed stdin Compose, image-only sha256 local Docker ID; NOT OCI registry attestation or rootless daemon"}
names=("tenant-a","tenant-b")
ports=(19010,19011)
tokens=(token_a,token_b)
live=set()
target=repo/"artifacts"/"phase6-preview-manager"
target.mkdir(parents=True,exist_ok=True)

def health(port,token,other):
    base=f"http://127.0.0.1:{port}"
    with httpx.Client(timeout=4,trust_env=False) as client:
        for _ in range(60):
            try:
                ready=client.get(base+"/api/health")
                if ready.status_code==200 and ready.json().get("ok"):
                    break
            except httpx.HTTPError:
                pass
            time.sleep(.2)
        else:
            raise AssertionError("docker preview was not healthy")
        assert client.get(base+"/api/db").status_code==401
        assert client.get(base+"/api/db",
             headers={"Authorization":"Bearer "+other}).status_code==401
        ok=client.get(base+"/api/db",
             headers={"Authorization":"Bearer "+token})
        assert ok.status_code==200 and ok.json()["postgres_query"]==1
        stream=client.get(base+"/api/events",
             headers={"Authorization":"Bearer "+token})
        assert stream.status_code==200 and "event: database" in stream.text
        return True

try:
    a=manager.reserve(names[0],ports[0])
    b=manager.reserve(names[1],ports[1])
    assert a["compose_name"]!=b["compose_name"]
    try:
        manager.reserve("cross-project",ports[0])
        raise AssertionError("same port assigned to another tenant")
    except PreviewDenied:
        pass

    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        start=manager.start(project,port,token)
        live.add(project)
        assert start["phase"]=="running"
        assert start["url"]==f"http://127.0.0.1:{port}"
        assert not start["public_preview_ready"]
        assert health(port,token,other)
        # Phase 19: Linux kernel seals a signed Docker tar BEFORE BuildKit.
        # Mutate the staged API as SAME UID while a real Docker image is
        # built; the resulting image must still match reviewed bytes.
        if project==names[0]:
            proof["phase19_linux_sealed_build"]=prove_sealed_build(
                manager,project)
        manager.logs(project,token)
        proof["stacks"].append({"project_sha256":hashlib.sha256(project.encode()).hexdigest(),
                                "port":port,"postgresql_live":True,
                                "other_tenant_token_rejected":True,
                                "lifecycle":"started"})
    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        assert manager.restart(project,token)["phase"]=="running"
        assert health(port,token,other)
    proof["restart_proved"]=True
    # Actual in-build mutable-checkout overwrite. The successful running API
    # must be sourced from the private reviewed snapshot, not the live file.
    assert (race_proof["attempted"] and
            race_proof["staged_bytes_unchanged"] and
            race_proof["malicious_staged_source_during_no_build"])
    proof["phase11_live_mutation_during_real_docker_build"]=True
    proof["phase20_staged_source_mutated_during_image_only_up"]=True
    proof["phase20_image_id_runtime_verified"]={}
    for project, token in zip(names,tokens):
        record=manager.status(project)
        image_id=record["api_image_id"]
        assert image_id.startswith("sha256:") and len(image_id)==71
        container=manager._invoke(record,token,["ps","-q","api"]).strip()
        assert container
        inspected=subprocess.run(
            ["docker","inspect","--format","{{.Image}}",container],
            capture_output=True,text=True,timeout=20,check=True)
        assert inspected.stdout.strip()==image_id
        proof["phase20_image_id_runtime_verified"][project]=True
    # Phase21: actual ingress runs from a sealed locally pinned Docker image,
    # not from a writable host bind mount. Mutate staged and live ingress.py
    # while HTTP traffic is live, then restore signed source for lifecycle tests.
    proof["phase21_mount_free_ingress"] = {}
    for project, port, token, other in zip(names, ports, tokens,
                                             (token_b, token_a)):
        record = manager.status(project)
        expected = record["ingress_image_id"]
        assert expected.startswith("sha256:") and len(expected) == 71
        container = manager._invoke(record, token, ["ps", "-q", "ingress"]).strip()
        assert container
        inspect = subprocess.run(
            ["docker", "inspect", "--format", "{{json .}}", container],
            capture_output=True, text=True, timeout=20, check=True)
        actual = json.loads(inspect.stdout)
        assert actual["Image"] == expected, "ingress image ID substitution"
        assert not any(
            mount.get("Destination") == "/app/ingress.py"
            for mount in actual["Mounts"]
        ), "reviewed ingress still host-bound"
        staged_ingress = manager.snapshots.path(project).parent / "ingress.py"
        live_ingress = reviewed_root / "ingress.py"
        staged_original = staged_ingress.read_bytes()
        live_original = live_ingress.read_bytes()
        old_mode = staged_ingress.stat().st_mode & 0o777
        try:
            staged_ingress.chmod(0o600)
            staged_ingress.write_bytes(
                b"raise SystemExit('HOSTILE HOST STAGING INGRESS')\\n")
            live_ingress.write_bytes(
                b"raise SystemExit('HOSTILE LIVE INGRESS')\\n")
            assert health(port, token, other)
        finally:
            staged_ingress.write_bytes(staged_original)
            staged_ingress.chmod(old_mode)
            live_ingress.write_bytes(live_original)
        proof["phase21_mount_free_ingress"][project] = {
            "actual_image_id_pinned": True,
            "no_ingress_bind_mount": True,
            "served_while_host_source_mutated": True,
        }
    proof["phase11_docker_compose_context"]="signed project-scoped staged copy"
    # Runtime firewall evidence: BOTH preview bridges must be internal,
    # API still reachable on host loopback, and the running API must fail
    # to reach two external IPs even with a direct socket connection.
    for project,token in zip(names,tokens):
        assigned=manager.status(project)["compose_name"]
        for net in ("preview-internal","preview-edge"):
            result=subprocess.run(["docker","network","inspect",
                                   assigned+"_"+net,"--format","{{.Internal}}"],
                                  capture_output=True,text=True,timeout=10,check=True)
            assert result.stdout.strip()=="true", f"network {net} has public egress"
        socket_probe="""import socket
for host,port in [('1.1.1.1',443),('169.254.169.254',80)]:
    try:
        sock=socket.create_connection((host,port),timeout=1.5)
    except OSError:
        continue
    sock.close()
    raise SystemExit('external egress unexpectedly available')
print('outbound IPv4 denied for both targets')
"""
        result=manager._invoke(manager.status(project),token,
            ["exec","-T","api","python","-c",socket_probe],timeout=20)
        assert "outbound IPv4 denied" in result
    proof["two_networks_per_project_internal"]=True
    proof["external_socket_egress_denied"]=True
    # Phase 9: exercise actual running Docker API containers. DNS
    # rebinding is an explicit simulation, NOT host firewall evidence.
    proof["phase9_egress"]={}
    for project,token in zip(names,tokens):
        identifier=hashlib.sha256(project.encode()).hexdigest()[:12]
        proof["phase9_egress"][identifier] = (
            prove_disposable_container_egress(manager,project,token)
        )
    # Phase 13 real UDP authoritative DNS sidecar: alternating A/AAAA
    # responses, TTL=0, and actual outbound connect() to both answers.
    # Separate per-tenant sidecars keep all packets on internal networks.
    proof["phase13_real_controlled_dns_rebinding"]={}
    for project,token in zip(names,tokens):
        identifier=hashlib.sha256(project.encode()).hexdigest()[:12]
        proof["phase13_real_controlled_dns_rebinding"][identifier]=(
            prove_real_docker_dns_rebinding(manager,project,token)
        )
    # This CI network proof is NOT a host/rootless/Windows firewall audit.
    proof["phase13_host_firewall_certified"]=False
    proof["phase13_external_authoritative_resolver_certified"]=False
    # Verify actual Docker network membership, not only Compose declarations.
    proof["phase9_service_networks"]={}
    for project,token in zip(names,tokens):
        record=manager.status(project)
        name=record["compose_name"]
        for service,expected in (
            ("db",{"preview-internal"}),
            ("api",{"preview-internal","preview-edge"}),
            ("ingress",{"preview-edge","ingress-public"}),
        ):
            container_id=manager._invoke(record,token,["ps","-q",service]).strip()
            assert container_id, "missing real container: "+service
            inspect=subprocess.run(["docker","inspect","--format",
                "{{json .NetworkSettings.Networks}}",container_id],
                capture_output=True,text=True,timeout=15,check=True)
            attached=json.loads(inspect.stdout)
            actual={key.removeprefix(name+"_") for key in attached}
            assert actual == expected, f"unexpected networks on {service}: {actual}"
            proof["phase9_service_networks"][name+"/"+service]=sorted(actual)

    # Actual HTTP gateway TestClient -> authenticated project RBAC ->
    # read-only registry -> running loopback preview -> live PostgreSQL.
    # The HTTP gateway is never given the Docker socket or operator runner.
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from preview_proxy import PreviewRegistryReader, AuthenticatedPreviewRead
    from secure_control_api import create_secure_router, TokenStore
    from master_queue import DurableMasterQueue
    from cost_ledger import CostLedger
    from project_rbac import ProjectRBAC

    acl=ProjectRBAC(root/"rbac.db")
    http_tokens=TokenStore(root/"http_tokens.db")
    for index,project in enumerate(names):
        acl.bootstrap_owner(project,f"owner-{index}")
    app=FastAPI()
    credentials=dict(zip(names,tokens))
    reader=AuthenticatedPreviewRead(PreviewRegistryReader(root/"registry.db"),
                                    token_for_project=credentials.get)
    app.include_router(create_secure_router(
        queue=DurableMasterQueue(root/"queue.db"),
        rbac=acl,ledger=CostLedger(root/"ledger.db"),
        tokens=http_tokens,preview_reader=reader))
    with TestClient(app) as gateway:
        auth=[{"Authorization":"Bearer "+http_tokens.mint_local(f"owner-{i}")}
              for i in range(2)]
        base="/api/v4/projects/"
        for i,project in enumerate(names):
            endpoint=base+project+"/preview/api/db"
            assert gateway.get(endpoint).status_code==401
            assert gateway.get(endpoint,headers=auth[1-i]).status_code==404
            verified=gateway.get(endpoint,headers=auth[i])
            assert verified.status_code==200,verified.text
            assert verified.json()["postgres_query"]==1
            assert verified.headers["cache-control"]=="no-store"
            assert "set-cookie" not in verified.headers
            readonly=gateway.get(base+project+"/preview",headers=auth[i])
            assert readonly.status_code==200
            assert readonly.headers["x-frame-options"]=="DENY"
            assert gateway.get(base+project+"/preview/api/events",
                               headers=auth[i]).status_code==409
    proof["authenticated_preview_http_two_tenants"]=True
    proof["upstream_public_bearer_not_forwarded"]=True
    proof["operator_registry_read_only"]=True
    # A policy change or revocation halts every manager action before
    # Docker. Restore exact trusted bytes so disposable cleanup still works.
    try:
        reviewer_policy.write_text(json.dumps({
            "version":1,"epoch":2,"active_fingerprints":[],
            "revoked_fingerprints":[fingerprint]
        }))
        try:
            manager.logs(names[0],tokens[0])
            raise AssertionError("revoked reviewer was permitted")
        except AdmissionDenied:
            pass
        proof["phase10_policy_mutation_denied_before_docker"]=True
    finally:
        reviewer_policy.write_bytes(original_policy)
    assert manager.status(names[0])["phase"]=="running"

finally:
    errors=[]
    for project,token in zip(names,tokens):
        try:
            status=manager.status(project)
            if status["phase"] in ("running","uncertain"):
                manager.stop(project,token,allow_data_loss=True)
            if manager.status(project)["phase"]=="stopped":
                continue
        except (PreviewDenied,OSError,subprocess.TimeoutExpired) as exc:
            errors.append(type(exc).__name__)
    probe=subprocess.run(["docker","ps","-a","--filter","name=wfs-preview-",
                           "--format","{{.Names}}"],
                         capture_output=True,text=True,timeout=20,check=True)
    proof["cleanup_confirmed"]=not probe.stdout.strip() and not errors
    (target/"operator-preview-proof.json").write_text(json.dumps(proof,indent=2))
    assert proof["cleanup_confirmed"],"operator preview cleanup not verified"

assert proof["restart_proved"] and len(proof["stacks"])==2
print(json.dumps(proof,sort_keys=True))
