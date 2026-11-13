#!/usr/bin/env python3
"""Actual operator-only dynamic *template* previews: two stacks, lifecycle.

Disposable CI Docker host ONLY. No public gateway, arbitrary untrusted
source builds, provider credentials, or production deployment.
"""
from dataclasses import replace
import hashlib
import sqlite3
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from contextlib import ExitStack, closing, contextmanager

import httpx

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from preview_manager import TemplatePreviewManager,PreviewDenied
from preview_admission import REVIEWED_FILES, candidate_manifest_for_ci_only
from ci_preview_network_probe import prove_disposable_container_egress
from ci_phase13_real_dns_rebind import prove_real_docker_dns_rebinding
from ci_phase19_sealed_build import prove_sealed_build
from ci_phase23_oci_release import prepare_oci_release
from ci_phase25_release_policy import DisposableReleasePolicySigner
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

def open_manager(oci_release=None, release_policy=None):
    return TemplatePreviewManager(root/"registry.db",
        reviewed_root/"compose.yaml",enabled=True,reviewed_files=reviewed_files,
        reviewer_authority=authority,runner=reviewed_snapshot_runner,
        sealed_runtime=True,oci_release=oci_release,release_policy=release_policy)


manager = open_manager()
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

def verify_frontend_http(port, expected):
    """Verify response bodies against signed hashes outside the daemon."""
    with httpx.Client(base_url=f"http://127.0.0.1:{port}",
                      timeout=5, trust_env=False) as client:
        for name, digest in sorted(expected.items()):
            response = client.get("/" + name)
            assert response.status_code == 200, f"frontend asset unavailable: {name}"
            assert hashlib.sha256(response.content).hexdigest() == digest, (
                f"served frontend differs from signed asset: {name}")
        index = client.get("/")
        assert index.status_code == 200
        assert hashlib.sha256(index.content).hexdigest() == expected["index.html"]


@contextmanager
def temporarily_change_assets(dist, names):
    """Modify disposable host fixtures and restore their bytes/modes on exit."""
    originals = {}
    try:
        for name in names:
            asset = dist / name
            originals[asset] = (asset.read_bytes(), asset.stat().st_mode & 0o777)
            asset.chmod(0o600)
            asset.write_bytes(b"Disposable CI fixture change (not the reviewed asset)\n")
            assert asset.read_bytes() != originals[asset][0]
        yield
    finally:
        for asset, (data, mode) in originals.items():
            asset.write_bytes(data)
            asset.chmod(mode)


def prove_frontend_runtime():
    expected = reviewed_files["frontend"]
    assert "index.html" in expected and any(name.endswith(".js") for name in expected)
    observed = {}
    # Check both tenants' actual containers before changing verified staging.
    for project, port, token in zip(names, ports, tokens):
        record = manager.status(project)
        image_id = record["api_image_id"]
        assert record["api_frontend_sealed"] == 1
        container = manager._invoke(record, token, ["ps", "-q", "api"]).strip()
        assert container
        result = subprocess.run(
            ["docker", "inspect", "--format", "{{json .}}", container],
            capture_output=True, text=True, timeout=20, check=True)
        actual = json.loads(result.stdout)
        assert actual["Image"] == image_id, "running API differs from BuildKit image ID"
        assert not any(mount.get("Type") in ("bind", "volume")
                       for mount in actual["Mounts"]), "API unexpectedly host-mounted"
        assert actual["HostConfig"]["ReadonlyRootfs"], "API rootfs unexpectedly writable"
        # The actual in-container inventory catches omitted or unexpected
        # files. The separate HTTP check below does not rely on docker exec.
        command = (
            "import hashlib,json; from pathlib import Path; "
            "root=Path('/app/dist'); "
            "print(json.dumps({p.relative_to(root).as_posix(): "
            "hashlib.sha256(p.read_bytes()).hexdigest() "
            "for p in root.rglob('*') if p.is_file()}))"
        )
        inventory = subprocess.run(
            ["docker", "exec", container, "python", "-c", command],
            capture_output=True, text=True, timeout=20, check=True)
        assert json.loads(inventory.stdout) == expected
        verify_frontend_http(port, expected)
        observed[project] = {
            "local_image_id": image_id,
            "api_read_only_rootfs": True,
            "api_no_bind_or_volume_mount": True,
            "in_image_inventory_matches_signed_assets": True,
        }
    # Keep the live checkout and BOTH staged dist trees changed for all
    # requests. Probe index, JS and all remaining assets by content hash.
    with ExitStack() as changes:
        changes.enter_context(temporarily_change_assets(
            repo / "artifacts/fullstack-preview/dist", expected))
        for project in names:
            staged_dist = (manager.snapshots.path(project).parents[2] /
                           "artifacts/fullstack-preview/dist")
            changes.enter_context(temporarily_change_assets(staged_dist, expected))
        for project, port, token, other in zip(names, ports, tokens, (token_b, token_a)):
            verify_frontend_http(port, expected)
            assert health(port, token, other)
            observed[project]["http_assets_match_during_host_changes"] = len(expected)
    for project in names:
        manager.snapshots.verify(project)
    return observed


try:
    a=manager.reserve(names[0],ports[0])
    b=manager.reserve(names[1],ports[1])
    assert a["compose_name"]!=b["compose_name"]
    try:
        manager.reserve("cross-project",ports[0])
        raise AssertionError("same port assigned to another tenant")
    except PreviewDenied:
        pass

    # Prove missing approval is rejected before any local runtime setup.
    try:
        manager.start(names[0], ports[0], tokens[0])
        raise AssertionError("missing release approval was accepted")
    except AdmissionDenied as exc:
        assert "current pinned OCI release approval required" in str(exc)
    assert not manager.snapshots.path(names[0]).exists()
    manager.snapshots.stage(names[0])
    release_root = root / "oci-release"
    release_root.mkdir(mode=0o700)
    release, proof["phase23_oci_release"] = prepare_oci_release(
        manager.snapshots, names[0], fingerprint, release_root)
    try:
        open_manager(release).start(names[0], ports[0], tokens[0])
        raise AssertionError("missing release policy accepted")
    except AdmissionDenied as exc:
        assert "current signed release policy checkpoint required" in str(exc)
    signer = DisposableReleasePolicySigner(
        root / "release-policy", proof["phase23_oci_release"]["manifest_digest"],
        release.approval_sha256)
    policy = signer.issue(1)
    manager = open_manager(release, policy)
    release_proof = {"manifest_digest": proof["phase23_oci_release"]["manifest_digest"],
                     "config_digest": proof["phase23_oci_release"]["config_digest"],
                     "missing_approval_denied": True, "tenants": {}}

    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        start=manager.start(project,port,token)
        assert start["oci_manifest_digest"] == release_proof["manifest_digest"]
        assert start["oci_config_digest"] == release_proof["config_digest"]
        assert start["api_image_id"] in (release_proof["config_digest"], release_proof["manifest_digest"])
        assert start["api_container_id"]
        release_proof["tenants"][project] = {"api_container_id": start["api_container_id"],
                                             "engine_image_id": start["api_image_id"]}
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
    # Reopen the operator state as a fresh CLI invocation would.
    manager = open_manager(release, policy)
    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        restarted = manager.restart(project, token)
        assert restarted["phase"] == "running"
        assert restarted["api_container_id"] == release_proof["tenants"][project]["api_container_id"]
        assert health(port,token,other)
        release_proof["tenants"][project]["restart_after_registry_reopen"] = True
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
    proof["phase22_mount_free_frontend"] = prove_frontend_runtime()
    proof["phase24_oci_runtime"] = release_proof
    for project in names:
        release_proof["tenants"][project]["signed_http_asset_count"] = (
            proof["phase22_mount_free_frontend"][project]["http_assets_match_during_host_changes"])
    # Cleanup remains possible without release material, then a fresh
    # operator must re-verify and re-promote before recreating the tenant.
    project, port, token = names[1], ports[1], tokens[1]
    old_id = release_proof["tenants"][project]["api_container_id"]
    # Save a real older operator registry, then advance the separately
    # pinned policy to revoke this release. A registry restore cannot
    # change the current policy inputs that the operator receives.
    backup = root / "operator-before-policy-change.db"
    registry = root / "registry.db"
    with closing(sqlite3.connect(registry)) as db, closing(sqlite3.connect(backup)) as saved:
        db.backup(saved)
        db.execute("UPDATE wfs_preview_instances SET oci_approval_sha256=NULL WHERE project_id=?",
                   (project,))
        db.commit()
    revoked = signer.issue(2, decision="revoke")
    assert manager.status(project)["oci_approval_sha256"] is None
    with closing(sqlite3.connect(backup)) as saved, closing(sqlite3.connect(registry)) as db:
        saved.backup(db)
    current = open_manager(release, revoked)
    assert current.status(project)["oci_approval_sha256"] == release.approval_sha256
    for candidate, reason in (
        (replace(revoked, checkpoint_path=policy.checkpoint_path, signature_path=policy.signature_path),
         "differs from externally pinned"),
        (replace(policy, minimum_sequence=revoked.minimum_sequence), "sequence rollback"),
        (revoked, "explicitly revoked"),
    ):
        try:
            open_manager(release, candidate).restart(project, token)
            raise AssertionError("release policy denial did not prevent restart")
        except AdmissionDenied as exc:
            assert reason in str(exc), str(exc)
        assert current.status(project)["phase"] == "running"
    # Cleanup is deliberate and available under revocation. The next allow
    # decision is synthetic and explicitly signed at a higher sequence.
    try:
        current.stop(project, token)
        raise AssertionError("revocation authorized data loss")
    except PreviewDenied as exc:
        assert "explicit disposable volume deletion approval required" in str(exc)
    assert current.stop(project, token, allow_data_loss=True)["phase"] == "stopped"
    try:
        current.start(project, port, token)
        raise AssertionError("revoked OCI release accepted after cleanup")
    except AdmissionDenied as exc:
        assert "explicitly revoked" in str(exc)
    # Also exercise cleanup without loading policy or release material.
    assert open_manager().stop(project, token, allow_data_loss=True)["phase"] == "stopped"
    policy = signer.issue(3)
    manager = open_manager(release, policy)
    recovered = manager.start(project, port, token)
    proof["phase25_release_policy"] = {
        "missing_policy_denied": True,
        "sqlite_backup_and_restore_exercised": True,
        "older_signed_head_denied": True, "sequence_rollback_denied": True,
        "revoked_restart_and_start_denied": True,
        "authorized_cleanup_with_revocation": True,
        "higher_sequence_reauthorization_proved": True,
        "synthetic_signer_same_runner": True, "continuous_enforcement": False,
        "restored_registry_does_not_provision_pins": True,
    }
    assert recovered["api_container_id"] != old_id
    assert recovered["oci_config_digest"] == release_proof["config_digest"]
    assert recovered["api_image_id"] == release_proof["tenants"][project]["engine_image_id"]
    assert recovered["oci_manifest_digest"] == release_proof["manifest_digest"]
    assert health(port, token, tokens[0])
    verify_frontend_http(port, reviewed_files["frontend"])
    release_proof["tenants"][project]["recreated_api_container_id"] = recovered["api_container_id"]
    release_proof["cleanup_without_release_then_repromotion"] = True
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
