"""Template-only preview manager: local Docker authority never in HTTP gateway."""
from pathlib import Path
import hashlib
from types import SimpleNamespace
import pytest
from preview_manager import TemplatePreviewManager,PreviewDenied
from preview_admission import AdmissionDenied,REVIEWED_FILES


def hashes(directory):
    return {name:hashlib.sha256((directory/name).read_bytes()).hexdigest()
            for name in REVIEWED_FILES}


@pytest.fixture
def preview(tmp_path):
    folder=tmp_path/"examples"/"fullstack-preview"
    folder.mkdir(parents=True)
    compose=folder/"compose.yaml"
    compose.write_text("services:\\n  api:\\n    image: example\\n")
    for name in REVIEWED_FILES:
        if name!="compose.yaml":
            (folder/name).write_text("reviewed disposable fixture: "+name)
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
    approved["api.py"]="0"*64
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
