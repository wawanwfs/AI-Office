"""Docker CLI boundary tests, with no daemon required."""
from pathlib import Path
from types import SimpleNamespace
import subprocess
import pytest
from sandbox_runtime import SandboxRuntime, SandboxDenied


@pytest.fixture
def runtime(tmp_path):
    root=tmp_path/"work"
    path=root/"project-a"/"job-123"/"attempt-1"
    path.mkdir(parents=True)
    (path/"app.py").write_text("print('hi')")
    calls=[]
    def runner(argv,**kw):
        calls.append((argv,kw))
        return SimpleNamespace(returncode=0,stdout="ok",stderr="")
    return SandboxRuntime(root,"wfs-test-image:local",enabled=True,
                          runner=runner),calls,root


def test_denied_by_default(tmp_path):
    with pytest.raises(SandboxDenied):
        SandboxRuntime(tmp_path,"python:3.11-alpine")


def test_docker_command_least_privilege_and_no_shell(runtime):
    r,calls,root=runtime
    output=r.execute("project-a","job-123",1,["python","app.py"])
    assert output["status"]=="passed"
    argv=calls[0][0]
    assert argv[:2]==["docker","run"]
    for flag in ("--read-only","--network","--cap-drop","--security-opt",
                 "--pids-limit","--memory","--cpus","--mount","--user"):
        assert flag in argv
    assert argv[argv.index("--network")+1]=="none"
    assert argv[argv.index("--cap-drop")+1]=="ALL"
    assert argv[argv.index("--security-opt")+1]=="no-new-privileges"
    assert argv[argv.index("--user")+1]=="65534:65534"
    assert "readonly" in argv[argv.index("--mount")+1]
    assert "docker.sock" not in " ".join(argv)
    assert calls[-1][0][1:3]==["rm","-f"]


def test_foreign_project_absent_and_symlink_denied(runtime):
    r,calls,root=runtime
    with pytest.raises(SandboxDenied):
        r.execute("project-b","job-123",1,["python","app.py"])
    (root/"project-b").symlink_to(root/"project-a",target_is_directory=True)
    with pytest.raises(SandboxDenied):
        r.execute("project-b","job-123",1,["python","app.py"])
    assert calls==[]


def test_no_traversal_or_unbounded_timeout(runtime):
    r,calls,root=runtime
    for name in ("../secret","../../..","", "foo;rm -rf"):
        with pytest.raises(SandboxDenied):
            r.execute(name,"job-123",1,["python","app.py"])
    with pytest.raises(ValueError):
        r.execute("project-a","job-123",1,["python","app.py"],timeout_seconds=10000)
    assert calls==[]


def test_timeout_triggers_forced_cleanup(runtime):
    r,calls,root=runtime
    original=r.runner
    def runner(argv,**kw):
        if argv[1]=="run":
            calls.append((argv,kw))
            raise subprocess.TimeoutExpired(argv,2)
        return original(argv,**kw)
    r.runner=runner
    outcome=r.execute("project-a","job-123",1,["python","app.py"],timeout_seconds=2)
    assert outcome["status"]=="timeout"
    assert calls[-1][0][1:3]==["rm","-f"]


def test_multiline_python_code_is_a_single_safe_argv(runtime):
    r,calls,root=runtime
    assert r.execute("project-a","job-123",1,
                     ["python","-c","print('a')\nprint('b')"])["status"]=="passed"
    argv=calls[0][0]
    assert argv[-1]=="print('a')\nprint('b')"
