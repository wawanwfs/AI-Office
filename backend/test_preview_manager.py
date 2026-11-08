"""Template-only preview manager: local Docker authority never in HTTP gateway."""
from pathlib import Path
import hashlib
from types import SimpleNamespace
import pytest
from preview_manager import TemplatePreviewManager,PreviewDenied
from preview_admission import AdmissionDenied,REVIEWED_FILES,candidate_manifest_for_ci_only


def hashes(directory):
    return candidate_manifest_for_ci_only(directory)


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
    manager=TemplatePreviewManager(tmp_path/"registry.db",compose,
                                   enabled=True,runner=runner,reviewed_files=hashes(folder))
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
    with pytest.raises(AdmissionDenied,match="approved"):
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
    assert manager.status("alpha")["phase"]=="uncertain"


def test_reviewed_template_rejects_digest_mismatch_before_construction(preview):
    manager,calls=preview
    folder=manager.template.parent
    approved=hashes(folder)
    approved["sources"]["api.py"]="0"*64
    with pytest.raises(AdmissionDenied,match="changed"):
        TemplatePreviewManager(folder/"other-registry.db",manager.template,
            enabled=True,reviewed_files=approved)
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
    assert manager.status("alpha")["phase"]=="uncertain"


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
    manifest=hashes(folder)
    with pytest.raises(AdmissionDenied,match="version 2"):
        TemplatePreviewManager(folder/"legacy.db",manager.template,enabled=True,
                               reviewed_files=manifest["sources"])
    manifest["images"]["db"]="postgres:16-alpine"
    with pytest.raises(AdmissionDenied,match="manifest fields"):
        TemplatePreviewManager(folder/"mutable.db",manager.template,enabled=True,
                               reviewed_files=manifest)
    assert calls==[]


def test_phase8_broken_cyclonedx_is_denied_even_if_checksum_reapproved(preview):
    manager,calls=preview
    repo=manager.template.parent.parent.parent
    sbom=repo/"artifacts"/"fullstack-preview"/"sbom.cdx.json"
    sbom.write_text('{"bomFormat":"CycloneDX","components":[]}')
    manifest=hashes(manager.template.parent)
    with pytest.raises(AdmissionDenied,match="CycloneDX"):
        TemplatePreviewManager(repo/"bad-bom.db",manager.template,enabled=True,
                               reviewed_files=manifest)
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
