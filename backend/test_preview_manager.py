"""Template-only preview manager: local Docker authority never in HTTP gateway."""
from pathlib import Path
from types import SimpleNamespace
import pytest
from preview_manager import TemplatePreviewManager,PreviewDenied


@pytest.fixture
def preview(tmp_path):
    folder=tmp_path/"examples"/"fullstack-preview"
    folder.mkdir(parents=True)
    compose=folder/"compose.yaml"
    compose.write_text("services:\\n  api:\\n    image: example\\n")
    calls=[]
    def runner(argv,**kwargs):
        calls.append((argv,kwargs))
        return SimpleNamespace(returncode=0,stdout="ok",stderr="")
    manager=TemplatePreviewManager(tmp_path/"registry.db",compose,
                                   enabled=True,runner=runner)
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
        TemplatePreviewManager(tmp_path/"registry.db",link,enabled=True)


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
