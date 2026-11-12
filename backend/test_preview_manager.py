"""Template-only preview manager: local Docker authority never in HTTP gateway."""
from pathlib import Path
import hashlib
import base64
import json
import sqlite3
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from preview_signature import canonical_review_bytes
from preview_root_authority import canonical_roster_bytes
from preview_witness import SignedReviewerCheckpoint, canonical_checkpoint_bytes
from preview_transparency import (SignedTransparencyEvidence, canonical_tree_head, merkle_root)
from preview_compact_merkle import make_inclusion_path, make_consistency_path
from preview_authority import SignedPreviewAuthority
from types import SimpleNamespace
import pytest
from preview_manager import TemplatePreviewManager,PreviewDenied
from preview_admission import AdmissionDenied,REVIEWED_FILES,candidate_manifest_for_ci_only


_TEST_ROSTER_SIGNERS={}
_TEST_WITNESS_SIGNERS={}
_TEST_LOG_SIGNERS={}


def root_args(authority):
    return {
        "root_public_key_path":authority.root_public_key_path,
        "root_signature_path":authority.root_signature_path,
        "trusted_root_fingerprint":authority.trusted_root_fingerprint,
    }


def resign_roster_for_synthetic_test(authority):
    """In-memory test-only root signer; NOT permitted in operator production."""
    key=_TEST_ROSTER_SIGNERS[str(authority.root_public_key_path)]
    authority.root_signature_path.write_bytes(
        base64.b64encode(key.sign(canonical_roster_bytes(
            authority.policy_path.read_bytes()))))


def synthetic_signed_log(root, receipt_path, label, previous=None):
    """Synthetic signed full-leaf log, NOT an external append-only authority."""
    if previous is None:
        key=Ed25519PrivateKey.generate()
        public=root/"test-log-key.pem"
        public.write_bytes(key.public_key().public_bytes(
            serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
        _TEST_LOG_SIGNERS[str(public)]=key
        old_leaves=[]
        previous_size=0
        previous_root=hashlib.sha256(b"").hexdigest()
    else:
        public=previous.public_key_path
        key=_TEST_LOG_SIGNERS[str(public)]
        old_leaves=json.loads(previous.inventory_path.read_text())["receipt_digests"]
        previous_size=len(old_leaves)
        previous_root=merkle_root(
            [bytes.fromhex(item) for item in old_leaves]).hex()
    newest=hashlib.sha256(receipt_path.read_bytes()).hexdigest()
    if newest in old_leaves:
        raise AssertionError("test-only transparency log cannot duplicate receipts")
    values=old_leaves+[newest]
    inventory=root/("test-log-leaves-"+label+".json")
    head=root/("test-log-head-"+label+".json")
    sig=root/("test-log-head-"+label+".sig")
    inventory.write_text(json.dumps({
        "version":1,"receipt_digests":values},sort_keys=True))
    digests=[bytes.fromhex(x) for x in values]
    compact=root/("test-log-compact-"+label+".json")
    compact.write_text(json.dumps({
        "version":1,"tree_size":len(values),
        "leaf_index":len(values)-1,"receipt_sha256":values[-1],
        "inclusion":make_inclusion_path(digests,len(values)-1),
        "previous_size":previous_size,
        "consistency":make_consistency_path(digests,previous_size)
    },sort_keys=True))
    head.write_text(json.dumps({
        "version":1,"tree_size":len(values),
        "root_sha256":merkle_root([bytes.fromhex(x) for x in values]).hex(),
    },sort_keys=True))
    sig.write_bytes(base64.b64encode(
        key.sign(canonical_tree_head(head.read_bytes()))))
    fingerprint=hashlib.sha256(key.public_key().public_bytes(
        serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
    return SignedTransparencyEvidence(
        public_key_path=public,head_path=head,signature_path=sig,
        inventory_path=inventory,compact_proof_path=compact,
        trusted_head_sha256=hashlib.sha256(head.read_bytes()).hexdigest(),
        trusted_log_fingerprint=fingerprint,
        trusted_previous_size=previous_size,
        trusted_previous_root_sha256=previous_root)


def issue_synthetic_test_checkpoint(authority, label):
    """Independent synthetic test receipt and new out-of-band fixture pin."""
    previous=authority.witness_checkpoint
    signer=_TEST_WITNESS_SIGNERS[str(previous.public_key_path)]
    policy=json.loads(authority.policy_path.read_bytes())
    state=authority.policy_path.parent
    receipt=state/("test-witness-"+label+".json")
    signature=state/("test-witness-"+label+".sig")
    payload={
        "version":1,"epoch":policy["epoch"],
        "policy_sha256":hashlib.sha256(authority.policy_path.read_bytes()).hexdigest(),
        "roster_root_fingerprint":authority.trusted_root_fingerprint,
    }
    receipt.write_text(json.dumps(payload,sort_keys=True))
    signature.write_bytes(base64.b64encode(
        signer.sign(canonical_checkpoint_bytes(receipt.read_bytes()))))
    return SignedReviewerCheckpoint(
        public_key_path=previous.public_key_path,
        signature_path=signature,receipt_path=receipt,
        trusted_witness_fingerprint=previous.trusted_witness_fingerprint,
        trusted_receipt_sha256=hashlib.sha256(receipt.read_bytes()).hexdigest(),
        transparency_evidence=synthetic_signed_log(
            state, receipt, label, previous=previous.transparency_evidence))


def hashes(directory):
    return candidate_manifest_for_ci_only(directory)


def ci_authority(root, reviewed):
    """SYNTHETIC one-time test signer, NOT an independent reviewer approval."""
    key=Ed25519PrivateKey.generate()
    pem=root/"test-reviewer.pem"
    sig=root/"test-review.sig"
    policy=root/"test-policy.json"
    pem.write_bytes(key.public_key().public_bytes(
        serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
    sig.write_bytes(base64.b64encode(key.sign(canonical_review_bytes(reviewed))))
    fingerprint=hashlib.sha256(key.public_key().public_bytes(
        serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
    document={"version":1,"epoch":1,"active_fingerprints":[fingerprint],
              "revoked_fingerprints":[]}
    policy.write_text(json.dumps(document,sort_keys=True))
    root_key=Ed25519PrivateKey.generate()
    root_pem=root/"test-roster-root.pem"
    root_signature=root/"test-roster-root.sig"
    root_pem.write_bytes(root_key.public_key().public_bytes(
        serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
    root_signature.write_bytes(
        base64.b64encode(root_key.sign(canonical_roster_bytes(policy.read_bytes()))))
    _TEST_ROSTER_SIGNERS[str(root_pem)]=root_key
    root_fp=hashlib.sha256(root_key.public_key().public_bytes(
        serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
    witness_key=Ed25519PrivateKey.generate()
    witness_public=root/"test-witness-public.pem"
    witness_receipt=root/"test-witness-initial.json"
    witness_sig=root/"test-witness-initial.sig"
    witness_public.write_bytes(witness_key.public_key().public_bytes(
        serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo))
    witness_fp=hashlib.sha256(witness_key.public_key().public_bytes(
        serialization.Encoding.Raw,serialization.PublicFormat.Raw)).hexdigest()
    assert witness_fp not in (fingerprint,root_fp)
    witness_receipt.write_text(json.dumps({
        "version":1,"epoch":1,
        "policy_sha256":hashlib.sha256(policy.read_bytes()).hexdigest(),
        "roster_root_fingerprint":root_fp,
    },sort_keys=True))
    witness_sig.write_bytes(base64.b64encode(
        witness_key.sign(canonical_checkpoint_bytes(witness_receipt.read_bytes()))))
    _TEST_WITNESS_SIGNERS[str(witness_public)]=witness_key
    synthetic_log=synthetic_signed_log(root,witness_receipt,"initial")
    assert synthetic_log.trusted_log_fingerprint not in (fingerprint,root_fp,witness_fp)
    witness=SignedReviewerCheckpoint(
        public_key_path=witness_public,receipt_path=witness_receipt,
        signature_path=witness_sig,
        trusted_witness_fingerprint=witness_fp,
        trusted_receipt_sha256=hashlib.sha256(witness_receipt.read_bytes()).hexdigest(),
        transparency_evidence=synthetic_log)
    return SignedPreviewAuthority(
        public_key_path=pem,signature_path=sig,policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        root_public_key_path=root_pem,root_signature_path=root_signature,
        trusted_root_fingerprint=root_fp,
        witness_checkpoint=witness
    )


@pytest.fixture
def preview(tmp_path):
    folder=tmp_path/"examples"/"fullstack-preview"
    folder.mkdir(parents=True)
    compose=folder/"compose.yaml"
    compose.write_text("services:\\n  api:\\n    image: example\\n")
    for name in REVIEWED_FILES:
        if name!="compose.yaml":
            (folder/name).write_text("reviewed disposable fixture: "+name)
    compose.write_text(
        "services:\n  db:\n    image: postgres:16-alpine@sha256:"
        "721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea\n"
        "  ingress:\n    image: python:3.11-alpine@sha256:"
        "bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa\n"
    )
    (folder/"Dockerfile.api").write_text(
        "FROM python:3.11-alpine@sha256:"
        "bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa\n"
    )
    (tmp_path/"package-lock.json").write_text('{"lockfileVersion":3}')
    out=tmp_path/"artifacts"/"fullstack-preview"
    (out/"dist"/"assets").mkdir(parents=True)
    (out/"dist"/"index.html").write_text("<html><body>trusted</body></html>")
    (out/"dist"/"assets"/"app.js").write_text("console.log('trusted')")
    (out/"sbom.cdx.json").write_text(
        '{"bomFormat":"CycloneDX","components":[{"name":"fixture","version":"1"}]}'
    )
    calls=[]
    def runner(argv,**kwargs):
        calls.append((argv,kwargs))
        return SimpleNamespace(returncode=0,stdout="ok",stderr="")
    approved=hashes(folder)
    manager=TemplatePreviewManager(tmp_path/"registry.db",compose,
        enabled=True,runner=runner,reviewed_files=approved,
        reviewer_authority=ci_authority(tmp_path,approved))
    return manager,calls


def test_deny_default_and_unreviewed_template(tmp_path):
    root=tmp_path/"examples"/"fullstack-preview"
    root.mkdir(parents=True)
    path=root/"compose.yaml"
    path.write_text("services: {}")
    with pytest.raises(PreviewDenied,match="approval"):
        TemplatePreviewManager(tmp_path/"registry.db",path)
    link=root/"alias-compose.yaml"
    link.symlink_to(path)
    with pytest.raises(PreviewDenied,match="template"):
        TemplatePreviewManager(tmp_path/"registry.db",link,enabled=True,
            reviewed_files={})
    with pytest.raises(AdmissionDenied,match="signed reviewer authority"):
        TemplatePreviewManager(tmp_path/"registry.db",path,enabled=True,
            reviewed_files=None)


def test_distinct_project_names_ports_and_cross_project_port_collision(preview):
    m,calls=preview
    a=m.reserve("alpha",19010)
    b=m.reserve("bravo",19011)
    assert a["compose_name"]!=b["compose_name"]
    assert m.status("alpha")["url"]=="http://127.0.0.1:19010"
    assert m.status("bravo")["url"]=="http://127.0.0.1:19011"
    with pytest.raises(PreviewDenied,match="allocated"):
        m.reserve("charlie",19010)
    with pytest.raises(PreviewDenied,match="immutable"):
        m.reserve("alpha",19011)
    assert calls==[]


def test_start_logs_restart_and_explicit_disposable_stop(preview):
    m,calls=preview
    secret="X"*43
    started=m.start("alpha",19010,secret)
    assert started["phase"]=="running" and not started["public_preview_ready"]
    args,kw=calls[0]
    assert args[:3]==["docker","compose","-f"]
    assert args[-3:]==["up","-d","--build"]
    assert kw["env"]["WFS_PREVIEW_HOST_PORT"]=="19010"
    assert kw["env"]["WFS_PREVIEW_TEST_TOKEN"]==secret
    assert secret not in " ".join(args) and "shell" not in kw
    assert m.logs("alpha",secret)=="ok"
    assert m.restart("alpha",secret)["phase"]=="running"
    with pytest.raises(PreviewDenied,match="deletion"):
        m.stop("alpha",secret)
    assert m.stop("alpha",secret,allow_data_loss=True)["phase"]=="stopped"
    assert calls[-1][0][-3:]==["down","--volumes","--remove-orphans"]


def test_failures_are_uncertain_and_not_retried(preview):
    m,calls=preview
    def failing(argv,**kw):
        calls.append((argv,kw))
        return SimpleNamespace(returncode=1,stdout="",stderr="secret diagnostic")
    m.runner=failing
    with pytest.raises(PreviewDenied,match="reconciliation"):
        m.start("alpha",19013,"X"*43)
    assert m.status("alpha")["phase"]=="uncertain"
    with pytest.raises(PreviewDenied,match="uncertain"):
        m.start("alpha",19013,"X"*43)
    assert len(calls)==1


def test_unsafe_project_names_and_ports_are_denied(preview):
    m,calls=preview
    for project in ("../alpha","", ".","alpha;docker ps"):
        with pytest.raises((PreviewDenied,ValueError)):
            m.reserve(project,19010)
    for port in (True,80,18765,22001,"19010"):
        with pytest.raises(PreviewDenied):
            m.reserve("alpha",port)
    assert calls==[]


def test_concurrent_start_has_one_exclusive_docker_mutation(preview):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    m,calls=preview
    begun=threading.Event()
    finish=threading.Event()
    def slow(argv,**kw):
        calls.append((argv,kw))
        begun.set()
        assert finish.wait(timeout=2)
        return SimpleNamespace(returncode=0,stdout="ok",stderr="")
    m.runner=slow
    def start(_):
        try:
            return m.start("alpha",19010,"X"*43)["phase"]
        except PreviewDenied:
            return "denied"
    with ThreadPoolExecutor(max_workers=2) as pool:
        first=pool.submit(start,1)
        assert begun.wait(timeout=2)
        second=pool.submit(start,2)
        assert second.result(timeout=2)=="denied"
        finish.set()
        assert first.result(timeout=2)=="running"
    assert len(calls)==1
    assert m.status("alpha")["phase"]=="running"


def test_stopped_teardown_idempotent_and_uncertain_can_be_cleaned(preview):
    m,calls=preview
    token="X"*43
    m.reserve("alpha",19010)
    assert m.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"
    before=len(calls)
    assert m.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"
    assert len(calls)==before
    m.start("alpha",19010,token)
    m._phase("alpha","uncertain")
    assert m.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"
    assert calls[-1][0][-3:]==["down","--volumes","--remove-orphans"]



def test_reviewed_runtime_file_mutation_denied_before_docker(preview):
    manager,calls=preview
    folder=manager.template.parent
    # A successful build may later be modified by an accidental deploy or
    # a malicious local writer. Every Docker mutation must check hashes.
    manager.reserve("alpha",19010)
    (folder/"Dockerfile.api").write_text("unapproved privileged container")
    with pytest.raises(AdmissionDenied,match="changed"):
        manager.start("alpha",19010,"X"*43)
    assert calls==[]
    with sqlite3.connect(manager.registry) as db:
        assert db.execute("SELECT phase FROM wfs_preview_instances WHERE project_id='alpha'").fetchone()[0]=="reserved"


def test_reviewed_template_rejects_digest_mismatch_before_construction(preview):
    manager,calls=preview
    folder=manager.template.parent
    approved=hashes(folder)
    approved["sources"]["api.py"]="0"*64
    with pytest.raises(AdmissionDenied,match="signature does not match"):
        TemplatePreviewManager(folder/"other-registry.db",manager.template,
            enabled=True,reviewed_files=approved,
            reviewer_authority=manager.authority)
    assert calls==[]


def test_reviewed_runtime_symlink_denied_before_docker(preview):
    manager,calls=preview
    folder=manager.template.parent
    good=folder/"api.py"
    good.unlink()
    try:
        good.symlink_to(folder/"ingress.py")
    except OSError:
        pytest.skip("host cannot create symlinks without elevated permission")
    with pytest.raises(AdmissionDenied,match="unsafe"):
        manager.start("alpha",19010,"X"*43)
    assert calls==[]


def test_phase8_frontend_mutation_is_rejected_before_docker(preview):
    manager,calls=preview
    manager.reserve("alpha",19010)
    dist=manager.template.parent.parent.parent/"artifacts"/"fullstack-preview"/"dist"
    (dist/"assets"/"app.js").write_text("injected bundle")
    with pytest.raises(AdmissionDenied,match="frontend content changed"):
        manager.start("alpha",19010,"X"*43)
    assert calls==[]
    with sqlite3.connect(manager.registry) as db:
        assert db.execute("SELECT phase FROM wfs_preview_instances WHERE project_id='alpha'").fetchone()[0]=="reserved"


def test_phase8_unlisted_new_frontend_asset_denied(preview):
    manager,calls=preview
    dist=manager.template.parent.parent.parent/"artifacts"/"fullstack-preview"/"dist"
    (dist/"assets"/"extra.js").write_text("unreviewed")
    with pytest.raises(AdmissionDenied,match="inventory changed"):
        manager.start("alpha",19010,"X"*43)
    assert calls==[]


def test_phase8_lock_and_sbom_mutations_denied(preview):
    manager,calls=preview
    repo=manager.template.parent.parent.parent
    for path in (repo/"package-lock.json",
                 repo/"artifacts"/"fullstack-preview"/"sbom.cdx.json"):
        previous=path.read_bytes()
        path.write_bytes(b"tampered")
        with pytest.raises(AdmissionDenied,match="lock changed|SBOM changed"):
            manager.admission.verify()
        path.write_bytes(previous)
    assert calls==[]


def test_phase8_symlinked_asset_denied(preview):
    manager,calls=preview
    dist=manager.template.parent.parent.parent/"artifacts"/"fullstack-preview"/"dist"
    (dist/"assets"/"app.js").unlink()
    try:
        (dist/"assets"/"app.js").symlink_to(dist/"index.html")
    except OSError:
        pytest.skip("host cannot create symlinks")
    with pytest.raises(AdmissionDenied,match="symlink"):
        manager.admission.verify()
    assert calls==[]


def test_phase8_old_unversioned_or_unpinned_manifests_denied(preview):
    manager,calls=preview
    folder=manager.template.parent
    repo=folder.parent.parent
    manifest=hashes(folder)
    with pytest.raises(AdmissionDenied,match="v2"):
        TemplatePreviewManager(folder/"legacy.db",manager.template,enabled=True,
            reviewed_files=manifest["sources"],
            reviewer_authority=manager.authority)
    manifest["images"]["db"]="postgres:16-alpine"
    with pytest.raises(AdmissionDenied,match="manifest fields"):
        TemplatePreviewManager(folder/"mutable.db",manager.template,enabled=True,
            reviewed_files=manifest,reviewer_authority=ci_authority(repo,manifest))
    assert calls==[]


def test_phase8_broken_cyclonedx_is_denied_even_if_checksum_reapproved(preview):
    manager,calls=preview
    repo=manager.template.parent.parent.parent
    sbom=repo/"artifacts"/"fullstack-preview"/"sbom.cdx.json"
    sbom.write_text('{"bomFormat":"CycloneDX","components":[]}')
    manifest=hashes(manager.template.parent)
    with pytest.raises(AdmissionDenied,match="CycloneDX"):
        TemplatePreviewManager(repo/"bad-bom.db",manager.template,enabled=True,
            reviewed_files=manifest,reviewer_authority=ci_authority(repo,manifest))
    assert calls==[]


def test_phase9_operator_does_not_inherit_proxies_or_provider_keys(preview,monkeypatch):
    manager,calls=preview
    monkeypatch.setenv("HTTP_PROXY","http://169.254.169.254:8888")
    monkeypatch.setenv("HTTPS_PROXY","http://1.1.1.1:8888")
    monkeypatch.setenv("ALL_PROXY","socks5://8.8.8.8:1080")
    monkeypatch.setenv("OPENAI_API_KEY","not-a-real-provider-token")
    manager.start("alpha",19010,"X"*43)
    environment=calls[-1][1]["env"]
    for variable in ("HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","OPENAI_API_KEY"):
        assert variable not in environment
    assert environment["WFS_PREVIEW_HOST_PORT"]=="19010"


def test_phase10_manager_rejects_unsigned_hashes_even_in_programmatic_api(preview,tmp_path):
    manager,calls=preview
    with pytest.raises(AdmissionDenied,match="signed reviewer authority"):
        TemplatePreviewManager(tmp_path/"bypass.db",manager.template,
            enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest)
    assert calls==[]


def test_phase10_policy_changes_and_revocation_fail_closed(preview):
    manager,calls=preview
    policy=manager.authority.policy_path
    original=policy.read_bytes()
    original_info=json.loads(original)
    fingerprint=original_info["active_fingerprints"][0]
    manager.reserve("alpha",19010)
    try:
        # Existing manager has an out-of-band PIN: any edit is denied.
        policy.write_text(json.dumps({
            "version":1,"epoch":2,"active_fingerprints":[fingerprint],
            "revoked_fingerprints":[fingerprint]
        }))
        with pytest.raises(AdmissionDenied,match="policy changed"):
            manager.start("alpha",19010,"X"*43)
        with pytest.raises(AdmissionDenied,match="policy changed"):
            manager.status("alpha")
        # Even if an operator separately pins this new policy, the explicitly
        # revoked key MUST NOT become trusted again.
        authority=SignedPreviewAuthority(
            public_key_path=manager.authority.public_key_path,
            signature_path=manager.authority.signature_path,
            policy_path=policy,
            trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
            **root_args(manager.authority),
            witness_checkpoint=manager.authority.witness_checkpoint)
        with pytest.raises(AdmissionDenied,match="revoked"):
            TemplatePreviewManager(manager.registry.parent/"revoked.db",
                manager.template,enabled=True,runner=manager.runner,
                reviewed_files=manager.reviewed_manifest,
                reviewer_authority=authority)
    finally:
        policy.write_bytes(original)
    assert manager.status("alpha")["phase"]=="reserved"
    assert calls==[]


def test_phase10_signature_swap_after_start_blocks_manager_and_docker(preview):
    manager,calls=preview
    token="X"*43
    manager.start("alpha",19010,token)
    count=len(calls)
    signature=manager.authority.signature_path
    prior=signature.read_bytes()
    try:
        signature.write_bytes(b"corrupt-not-signed")
        with pytest.raises(AdmissionDenied):
            manager.restart("alpha",token)
        with pytest.raises(AdmissionDenied):
            manager.logs("alpha",token)
    finally:
        signature.write_bytes(prior)
    assert len(calls)==count
    assert manager.status("alpha")["phase"]=="running"


def test_phase10_key_rotation_requires_new_pin_and_new_manager(preview):
    manager,calls=preview
    manifest=manager.reviewed_manifest
    original_policy=manager.authority.policy_path.read_bytes()
    # Test helper overwrites synthetic signer/public key/policy with a fresh
    # independent TEST identity. No production secret ever exists here.
    new_authority=ci_authority(manager.registry.parent,manifest)
    with pytest.raises(AdmissionDenied,match="policy changed"):
        manager.reserve("alpha",19010)
    replacement=TemplatePreviewManager(
        manager.registry.parent/"rotated-registry.db",manager.template,
        enabled=True,runner=manager.runner,reviewed_files=manifest,
        reviewer_authority=new_authority)
    assert replacement.reserve("bravo",19011)["phase"]=="reserved"
    assert calls==[]
    assert original_policy != new_authority.policy_path.read_bytes()


def test_phase10_bad_policy_structure_and_duplicate_keys_rejected(preview):
    manager,calls=preview
    policy=manager.authority.policy_path
    original=policy.read_bytes()
    for payload in (
        b'{"version":1,"version":1,"epoch":1,"active_fingerprints":[],"revoked_fingerprints":[]}',
        b'{"version":1,"epoch":1,"active_fingerprints":[],"revoked_fingerprints":[]}',
        b'{"version":1,"epoch":true,"active_fingerprints":["a"],"revoked_fingerprints":[]}',
    ):
        policy.write_bytes(payload)
        authority=SignedPreviewAuthority(
            public_key_path=manager.authority.public_key_path,
            signature_path=manager.authority.signature_path,
            policy_path=policy,
            trusted_policy_sha256=hashlib.sha256(payload).hexdigest(),
            **root_args(manager.authority),
            witness_checkpoint=manager.authority.witness_checkpoint)
        with pytest.raises(AdmissionDenied,match="policy"):
            authority.verify(manager.reviewed_manifest)
    policy.write_bytes(original)
    assert calls==[]



def test_phase11_docker_reads_signed_staged_tree_not_mutable_source(preview):
    manager,calls=preview
    live_api=manager.template.parent/"api.py"
    original=live_api.read_bytes()
    observed=[]
    def adversarial_runner(argv,**kwargs):
        staged_compose=Path(argv[3])
        staged_api=staged_compose.parent/"api.py"
        assert staged_compose != manager.template
        assert staged_api.read_bytes()==original
        # A local actor changes live source DURING the Docker call.
        try:
            live_api.write_bytes(b"malicious API replaced while Docker runs")
            assert staged_api.read_bytes()==original
            observed.append(str(staged_compose))
        finally:
            live_api.write_bytes(original)
        calls.append((argv,kwargs))
        return SimpleNamespace(returncode=0,stdout="ok",stderr="")
    manager.runner=adversarial_runner
    assert manager.start("alpha",19010,"X"*43)["phase"]=="running"
    assert len(observed)==1
    staged=Path(observed[0])
    assert staged.exists()
    assert "preview-snapshots" in staged.as_posix()
    assert (staged.parent.parent.parent/"artifacts/fullstack-preview/dist/index.html").is_file()
    # Subsequent Docker commands use the exact same reviewed context.
    manager.runner=lambda argv,**kw: (
        calls.append((argv,kw)) or
        SimpleNamespace(returncode=0,stdout="ok",stderr=""))
    manager.logs("alpha","X"*43)
    assert calls[-1][0][3]==str(staged)
    assert manager.stop("alpha","X"*43,allow_data_loss=True)["phase"]=="stopped"
    assert not staged.exists()


def test_phase11_snapshot_disallows_unapproved_copy_and_symlink(preview):
    manager,calls=preview
    source=manager.template.parent/"api.py"
    before=source.read_bytes()
    source.write_bytes(b"bad injected bytes")
    try:
        with pytest.raises(AdmissionDenied,match="changed"):
            manager.start("alpha",19010,"X"*43)
    finally:
        source.write_bytes(before)
    assert calls==[]
    # A new attempt is allowed only because no transition occurred yet.
    assert manager.start("alpha",19010,"X"*43)["phase"]=="running"
    stage=manager.snapshots.path("alpha")
    assert stage.exists()
    (stage.parent/"api.py").unlink()
    try:
        (stage.parent/"api.py").symlink_to(source)
    except OSError:
        pytest.skip("host cannot create symlinks")
    with pytest.raises(AdmissionDenied,match="unsafe"):
        manager.logs("alpha","X"*43)
    assert len(calls)==1


def test_phase11_local_reviewer_epoch_rollback_denied_across_manager_restart(preview):
    manager,calls=preview
    policy=manager.authority.policy_path
    old=policy.read_bytes()
    previous=json.loads(old)
    upgraded={**previous,"epoch":2}
    policy.write_text(json.dumps(upgraded,sort_keys=True))
    resign_roster_for_synthetic_test(manager.authority)
    newer_witness=issue_synthetic_test_checkpoint(manager.authority,"phase11-upgrade")
    authority=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
            **root_args(manager.authority),
            witness_checkpoint=newer_witness)
    replacement=TemplatePreviewManager(manager.registry,manager.template,
        enabled=True,runner=manager.runner,
        reviewed_files=manager.reviewed_manifest,reviewer_authority=authority)
    assert replacement.reserve("alpha",19010)["phase"]=="reserved"
    with sqlite3.connect(manager.registry) as db:
        assert db.execute(
            "SELECT epoch FROM wfs_preview_reviewer_epoch WHERE singleton=1"
        ).fetchone()[0]==2
    # Restore perfectly valid old, signed policy and the original pin.
    # Version 1 cannot be replayed against the operator-owned registry.
    policy.write_bytes(old)
    resign_roster_for_synthetic_test(manager.authority)
    with pytest.raises(AdmissionDenied,match="epoch rollback"):
        TemplatePreviewManager(manager.registry,manager.template,
            enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest,
            reviewer_authority=manager.authority)
    with pytest.raises(AdmissionDenied,match="epoch rollback"):
        manager.reserve("bravo",19011)
    assert calls==[]


def test_phase11_equal_epoch_policy_swap_denied(preview):
    manager,calls=preview
    policy=manager.authority.policy_path
    original=policy.read_bytes()
    approved=json.loads(original)
    other=hashlib.sha256(b"revoked-unrelated-test-key").hexdigest()
    policy.write_text(json.dumps({
        **approved,"revoked_fingerprints":[other]
    },sort_keys=True))
    resign_roster_for_synthetic_test(manager.authority)
    newer_witness=issue_synthetic_test_checkpoint(manager.authority,"phase11-equal")
    independent=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
            **root_args(manager.authority),
            witness_checkpoint=newer_witness)
    with pytest.raises(AdmissionDenied,match="same epoch"):
        TemplatePreviewManager(manager.registry,manager.template,
            enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest,
            reviewer_authority=independent)
    policy.write_bytes(original)
    resign_roster_for_synthetic_test(manager.authority)
    assert manager.reserve("alpha",19010)["phase"]=="reserved"
    assert calls==[]



def test_phase11_copy_time_source_substitution_never_publishes_snapshot(
        preview,monkeypatch):
    import preview_snapshot
    manager,calls=preview
    source=manager.template.parent/"api.py"
    old=source.read_bytes()
    real_copy=preview_snapshot._copy_verified
    copied=[0]

    def attack_on_copy(*args,**kwargs):
        result=real_copy(*args,**kwargs)
        copied[0]+=1
        if copied[0]==1:
            source.write_bytes(b"malicious bytes injected mid snapshot copy")
        return result

    monkeypatch.setattr(preview_snapshot,"_copy_verified",attack_on_copy)
    try:
        with pytest.raises(AdmissionDenied,match="snapshot input does not match"):
            manager.snapshots.stage("alpha")
    finally:
        source.write_bytes(old)
    assert copied[0]>=2
    assert not manager.snapshots.path("alpha").exists()
    assert calls==[]



def test_phase12_roster_signature_required_even_with_new_hash_pin(preview):
    manager,calls=preview
    roster=manager.authority.policy_path
    original=roster.read_bytes()
    updated=json.loads(original)
    updated["epoch"]+=1
    roster.write_text(json.dumps(updated,sort_keys=True))
    # An attacker can recalculate this SHA but CANNOT forge the separately
    # pinned offline root Ed25519 signature.
    attacker_authority=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=roster,
        trusted_policy_sha256=hashlib.sha256(roster.read_bytes()).hexdigest(),
        **root_args(manager.authority),
            witness_checkpoint=manager.authority.witness_checkpoint)
    try:
        with pytest.raises(AdmissionDenied,match="roster signature mismatch"):
            TemplatePreviewManager(manager.registry,manager.template,
                enabled=True,runner=manager.runner,
                reviewed_files=manager.reviewed_manifest,
                reviewer_authority=attacker_authority)
    finally:
        roster.write_bytes(original)
    assert manager.reserve("alpha",19010)["phase"]=="reserved"
    assert calls==[]


def test_phase12_root_signature_rotation_requires_separate_root_trust(preview):
    manager,calls=preview
    signed_root=manager.authority.root_signature_path
    original=signed_root.read_bytes()
    try:
        signed_root.write_bytes(b"not-a-signature")
        with pytest.raises(AdmissionDenied,match="roster signature"):
            manager.reserve("alpha",19010)
        with pytest.raises(AdmissionDenied,match="roster signature"):
            manager.status("alpha")
    finally:
        signed_root.write_bytes(original)
    assert manager.reserve("alpha",19010)["phase"]=="reserved"
    assert calls==[]


def test_phase12_reviewer_cannot_self_sign_authority(preview):
    manager,calls=preview
    reviewer_fp=json.loads(manager.authority.policy_path.read_bytes())[
        "active_fingerprints"][0]
    swapped=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=manager.authority.policy_path,
        trusted_policy_sha256=manager.authority.trusted_policy_sha256,
        root_public_key_path=manager.authority.public_key_path,
        root_signature_path=manager.authority.root_signature_path,
        trusted_root_fingerprint=reviewer_fp,
        witness_checkpoint=manager.authority.witness_checkpoint)
    with pytest.raises(AdmissionDenied,match="distinct key"):
        TemplatePreviewManager(manager.registry.parent/"same-root.db",
            manager.template,enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest,
            reviewer_authority=swapped)
    assert calls==[]



def test_phase14_witness_still_blocks_old_policy_after_local_sqlite_restore(preview):
    manager,calls=preview
    registry=manager.registry
    backup=registry.parent/"saved-before-epoch-rotation.db"
    policy=manager.authority.policy_path
    original=policy.read_bytes()
    # A coherent SQLite backup is made BEFORE the newer approval is issued.
    with sqlite3.connect(registry) as current, sqlite3.connect(backup) as old:
        current.backup(old)
    assert sqlite3.connect(backup).execute(
        "SELECT epoch FROM wfs_preview_reviewer_epoch").fetchone()[0]==1

    updated={**json.loads(original),"epoch":2}
    policy.write_text(json.dumps(updated,sort_keys=True))
    resign_roster_for_synthetic_test(manager.authority)
    latest=issue_synthetic_test_checkpoint(manager.authority,"phase14-current")
    newer=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        **root_args(manager.authority), witness_checkpoint=latest)
    accepted=TemplatePreviewManager(
        registry,manager.template,enabled=True,runner=manager.runner,
        reviewed_files=manager.reviewed_manifest,reviewer_authority=newer)
    assert accepted.reserve("alpha",19010)["phase"]=="reserved"
    with sqlite3.connect(registry) as db:
        assert db.execute(
            "SELECT epoch FROM wfs_preview_reviewer_epoch").fetchone()[0]==2

    # Restore the older SQLite database with its old local epoch floor.
    # The separately kept current signed witness/pin does NOT roll back.
    with sqlite3.connect(backup) as source, sqlite3.connect(registry) as restored:
        source.backup(restored)
    with sqlite3.connect(registry) as db:
        assert db.execute(
            "SELECT epoch FROM wfs_preview_reviewer_epoch").fetchone()[0]==1
    policy.write_bytes(original)
    resign_roster_for_synthetic_test(manager.authority)
    # Old policy and old roster signature are VALID, but checkpoint
    # epoch=2 is independently pinned and detects the replay.
    replay=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        **root_args(manager.authority), witness_checkpoint=latest)
    with pytest.raises(AdmissionDenied,match="witness checkpoint policy epoch/root mismatch"):
        TemplatePreviewManager(
            registry,manager.template,enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest,reviewer_authority=replay)
    with pytest.raises(AdmissionDenied,match="witness checkpoint policy epoch/root mismatch"):
        replay.verify(manager.reviewed_manifest)
    assert calls==[]


def test_phase14_tampered_witness_signature_blocks_all_docker_lifecycle(preview):
    manager,calls=preview
    token="X"*43
    assert manager.start("alpha",19010,token)["phase"]=="running"
    count=len(calls)
    witness_sig=manager.authority.witness_checkpoint.signature_path
    original=witness_sig.read_bytes()
    witness_sig.write_bytes(base64.b64encode(b"corrupt-signature-bytes"))
    try:
        with pytest.raises(AdmissionDenied,match="witness signature length"):
            manager.logs("alpha",token)
        with pytest.raises(AdmissionDenied,match="witness signature length"):
            manager.restart("alpha",token)
        with pytest.raises(AdmissionDenied,match="witness signature length"):
            manager.stop("alpha",token,allow_data_loss=True)
        assert len(calls)==count
    finally:
        witness_sig.write_bytes(original)
    assert manager.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"


def test_phase14_absent_or_swapped_witness_is_not_valid_authority(preview,tmp_path):
    manager,calls=preview
    witness=manager.authority.witness_checkpoint
    from preview_witness import SignedReviewerCheckpoint
    wrong=SignedReviewerCheckpoint(
        public_key_path=manager.authority.root_public_key_path,
        signature_path=witness.signature_path,
        receipt_path=witness.receipt_path,
        trusted_receipt_sha256=witness.trusted_receipt_sha256,
        trusted_witness_fingerprint=manager.authority.trusted_root_fingerprint,
        transparency_evidence=witness.transparency_evidence)
    new=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=manager.authority.policy_path,
        trusted_policy_sha256=manager.authority.trusted_policy_sha256,
        **root_args(manager.authority),witness_checkpoint=wrong)
    with pytest.raises(AdmissionDenied,match="independent of both signing keys"):
        TemplatePreviewManager(tmp_path/"swapped.db",manager.template,
            enabled=True,runner=manager.runner,
            reviewed_files=manager.reviewed_manifest,reviewer_authority=new)
    with pytest.raises(AdmissionDenied,match="signed witness checkpoint required"):
        SignedPreviewAuthority(
            public_key_path=manager.authority.public_key_path,
            signature_path=manager.authority.signature_path,
            policy_path=manager.authority.policy_path,
            trusted_policy_sha256=manager.authority.trusted_policy_sha256,
            **root_args(manager.authority),witness_checkpoint=None)
    assert calls==[]



def test_phase15_log_rejects_old_signed_witness_even_after_sqlite_restore(preview):
    manager,calls=preview
    policy=manager.authority.policy_path
    original_policy=policy.read_bytes()
    original_witness=manager.authority.witness_checkpoint
    registry_backup=manager.registry.parent/"pre-log-upgrade.db"

    with sqlite3.connect(manager.registry) as source, sqlite3.connect(
            registry_backup) as saved:
        source.backup(saved)

    policy.write_text(json.dumps({
        **json.loads(original_policy),"epoch":2},sort_keys=True))
    resign_roster_for_synthetic_test(manager.authority)
    current=issue_synthetic_test_checkpoint(manager.authority,"phase15-current")
    assert current.transparency_evidence.trusted_previous_size==1
    assert current.verify(
        epoch=2,
        policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        reviewer_fingerprint=json.loads(policy.read_bytes())[
            "active_fingerprints"][0],
        roster_root_fingerprint=manager.authority.trusted_root_fingerprint,
    )["transparency_tree_size"]==2

    newer=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        **root_args(manager.authority),witness_checkpoint=current)
    upgraded=TemplatePreviewManager(
        manager.registry,manager.template,enabled=True,runner=manager.runner,
        reviewed_files=manager.reviewed_manifest,reviewer_authority=newer)
    upgraded.reserve("alpha",19010)
    with sqlite3.connect(registry_backup) as saved, sqlite3.connect(
            manager.registry) as target:
        saved.backup(target)
    # Replaying the old fully signed policy and a former signed witness
    # cannot use the NEW independently pinned Merkle tree head.
    policy.write_bytes(original_policy)
    resign_roster_for_synthetic_test(manager.authority)
    replay_witness=SignedReviewerCheckpoint(
        public_key_path=original_witness.public_key_path,
        receipt_path=original_witness.receipt_path,
        signature_path=original_witness.signature_path,
        trusted_receipt_sha256=original_witness.trusted_receipt_sha256,
        trusted_witness_fingerprint=original_witness.trusted_witness_fingerprint,
        transparency_evidence=current.transparency_evidence)
    replay=SignedPreviewAuthority(
        public_key_path=manager.authority.public_key_path,
        signature_path=manager.authority.signature_path,
        policy_path=policy,
        trusted_policy_sha256=hashlib.sha256(policy.read_bytes()).hexdigest(),
        **root_args(manager.authority),witness_checkpoint=replay_witness)
    with pytest.raises(AdmissionDenied,match="not last transparency leaf"):
        TemplatePreviewManager(
            manager.registry,manager.template,enabled=True,
            runner=manager.runner,reviewed_files=manager.reviewed_manifest,
            reviewer_authority=replay)
    assert calls==[]


def test_phase15_tampering_signed_log_blocks_docker_commands(preview):
    manager,calls=preview
    token="X"*43
    assert manager.start("alpha",19010,token)["phase"]=="running"
    log=manager.authority.witness_checkpoint.transparency_evidence
    before=len(calls)
    original=log.inventory_path.read_bytes()
    forged=json.loads(original)
    forged["receipt_digests"][0]="f"*64
    log.inventory_path.write_text(json.dumps(forged,sort_keys=True))
    try:
        with pytest.raises(AdmissionDenied,match="not last transparency leaf"):
            manager.logs("alpha",token)
        with pytest.raises(AdmissionDenied,match="not last transparency leaf"):
            manager.restart("alpha",token)
        with pytest.raises(AdmissionDenied,match="not last transparency leaf"):
            manager.stop("alpha",token,allow_data_loss=True)
        assert len(calls)==before
    finally:
        log.inventory_path.write_bytes(original)
    assert manager.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"



def test_phase16_compact_merkle_evidence_is_required_before_docker_calls(preview):
    manager,calls=preview
    token="X"*43
    assert manager.start("alpha",19010,token)["phase"]=="running"
    proof=manager.authority.witness_checkpoint.transparency_evidence
    compact=proof.compact_proof_path
    original=compact.read_bytes()
    before=len(calls)
    forged=json.loads(original)
    forged["inclusion"]=["f"*64]
    compact.write_text(json.dumps(forged,sort_keys=True))
    try:
        for operation in (
                lambda:manager.logs("alpha",token),
                lambda:manager.restart("alpha",token),
                lambda:manager.stop("alpha",token,allow_data_loss=True)):
            with pytest.raises(AdmissionDenied,match="compact inclusion has extra siblings"):
                operation()
        assert len(calls)==before
    finally:
        compact.write_bytes(original)
    assert manager.stop("alpha",token,allow_data_loss=True)["phase"]=="stopped"


def test_phase16_compact_proof_symlink_is_rejected_even_with_valid_inventory(preview):
    manager,calls=preview
    proof=manager.authority.witness_checkpoint.transparency_evidence
    compact=proof.compact_proof_path
    link=compact.parent/"malicious-compact-link.json"
    try:
        link.symlink_to(compact)
    except OSError:
        pytest.skip("host does not permit symlinks")
    old=proof.compact_proof_path
    proof.compact_proof_path=link
    try:
        with pytest.raises(AdmissionDenied,match="unsafe"):
            manager.reserve("alpha",19010)
        assert calls==[]
    finally:
        proof.compact_proof_path=old



def test_phase20_real_operator_cannot_select_legacy_source_build(preview):
    manager,calls=preview
    with pytest.raises(AdmissionDenied,match="cannot disable sealed runtime"):
        TemplatePreviewManager(
            manager.registry,manager.template,enabled=True,
            reviewed_files=manager.reviewed_manifest,
            reviewer_authority=manager.authority,
            sealed_runtime=False)
    assert calls == []


def test_phase20_fixture_runner_does_not_claim_production_sealing(preview):
    manager,calls=preview
    # Previous Phase 1-19 synthetic unit runner still tests the historical
    # lifecycle contract. Real operator CLI (runner=None) is mandatory
    # sealed, and Phase 20 Docker CI opts into sealed_runtime=True.
    assert manager.sealed_runtime is False
    manager.start("alpha",19010,"X"*43)
    assert calls[0][0][-3:] == ["up","-d","--build"]
    assert manager.status("alpha")["api_image_id"] is None
