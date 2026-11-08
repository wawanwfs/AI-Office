"""QA acceptance: Docker work is scoped to claim, objective, fenced and sealed."""
from pathlib import Path
from types import SimpleNamespace
import hashlib
import json
import pytest
from code_qa import PythonCodeQA, CodeQAFailed
from sandbox_runtime import SandboxDenied

IMAGE="python:3.11-alpine@sha256:"+("a"*64)


@pytest.fixture
def ready(tmp_path):
    root=tmp_path/"work"
    wd=root/"p1"/"job-test"/"attempt-1"
    wd.mkdir(parents=True)
    (wd/"app.py").write_text("def add(a,b): return a+b\n")
    (wd/"test_app.py").write_text("import unittest\nfrom app import add\nclass TestAdd(unittest.TestCase):\n def test_add(self): self.assertEqual(add(2,3),5)\n")
    calls=[]
    class FakeRuntime:
        def _workspace(self, project,job,attempt):
            return root/project/job/f"attempt-{attempt}"
        def execute(self,*args,**kwargs):
            calls.append((args,kwargs))
            return {"status":"passed","stdout":"","stderr":"Ran 1 test in 0.01s\n\nOK\n","container":"fake-docker"}
    qa=PythonCodeQA(root,IMAGE,enabled=True,runtime=FakeRuntime())
    claim={"id":"job-test","attempt":1}
    return qa,claim,wd,calls


def test_fail_closed_require_digest_and_explicit_enable(tmp_path):
    with pytest.raises(SandboxDenied):
        PythonCodeQA(tmp_path,IMAGE)
    with pytest.raises(SandboxDenied):
        PythonCodeQA(tmp_path,"python:3.11-alpine",enabled=True)


def test_verified_unit_test_creates_content_addressed_manifest(ready):
    qa,claim,wd,calls=ready
    paths=["app.py","test_app.py"]
    result=qa.verify("p1",claim,wd,paths,lambda:None)
    assert result["tests_passed"]==1
    assert result["files"]["app.py"]==hashlib.sha256((wd/"app.py").read_bytes()).hexdigest()
    assert json.loads((wd/".wfs-qa-attestation.json").read_text())==result
    assert calls[0][0][:3]==("p1","job-test",1)
    assert calls[0][0][3]==["python","-B","-m","unittest","discover","-s","/workspace","-p","test_*.py","-v"]
    with pytest.raises(CodeQAFailed,match="already present"):
        qa.verify("p1",claim,wd,paths,lambda:None)


def test_fenced_off_before_test_does_not_dispatch(ready):
    qa,claim,wd,calls=ready
    with pytest.raises(PermissionError):
        qa.verify("p1",claim,wd,["app.py","test_app.py"],
                  lambda:(_ for _ in ()).throw(PermissionError("revoked")))
    assert calls==[]
    assert not (wd/".wfs-qa-attestation.json").exists()


@pytest.mark.parametrize("paths",[
    ["../app.py","test_app.py"],["app.py","app.py"],["app.py"],
    ["app.py","missing.py"],["app.py","test_app.py","/etc/passwd"],
])
def test_untrusted_or_missing_output_never_dispatches(ready,paths):
    qa,claim,wd,calls=ready
    with pytest.raises(CodeQAFailed):
        qa.verify("p1",claim,wd,paths,lambda:None)
    assert calls==[]


def test_symlink_file_and_cross_project_path_denied(ready):
    qa,claim,wd,calls=ready
    (wd/"spoof.py").symlink_to(wd/"app.py")
    with pytest.raises(CodeQAFailed,match="symlink"):
        qa.verify("p1",claim,wd,["app.py","test_app.py","spoof.py"],lambda:None)
    with pytest.raises(CodeQAFailed,match="workspace"):
        qa.verify("p2",claim,wd,["app.py","test_app.py"],lambda:None)
    assert calls==[]


def test_failed_tests_and_zero_tests_not_publishable(ready):
    qa,claim,wd,calls=ready
    def failed(*a,**k):
        return {"status":"failed","stdout":"","stderr":"FAIL","container":"fake"}
    qa.runtime.execute=failed
    with pytest.raises(CodeQAFailed,match="failed"):
        qa.verify("p1",claim,wd,["app.py","test_app.py"],lambda:None)
    assert not (wd/".wfs-qa-attestation.json").exists()
    qa.runtime.execute=lambda *a,**k:{"status":"passed","stdout":"","stderr":"Ran 0 tests in 0.0s\nOK","container":"fake"}
    with pytest.raises(CodeQAFailed,match="at least one"):
        qa.verify("p1",claim,wd,["app.py","test_app.py"],lambda:None)


def test_revoke_permission_after_docker_succeeds_blocks_promotion(ready):
    qa,claim,wd,calls=ready
    valid=[True]
    def fence():
        if not valid[0]:
            raise PermissionError("lease revoked")
    def executor(*a,**k):
        valid[0]=False
        return {"status":"passed","stdout":"","stderr":"Ran 1 test in 0.01s\nOK","container":"fake"}
    qa.runtime.execute=executor
    with pytest.raises(PermissionError,match="revoked"):
        qa.verify("p1",claim,wd,["app.py","test_app.py"],fence)
    assert not (wd/".wfs-qa-attestation.json").exists()


def test_changed_files_during_qa_blocks_manifest(ready):
    qa,claim,wd,calls=ready
    def tamper(*a,**k):
        (wd/"app.py").write_text("def add(a,b): return 0\n")
        return {"status":"passed","stdout":"","stderr":"Ran 1 test in 0.01s\nOK","container":"fake"}
    qa.runtime.execute=tamper
    with pytest.raises(CodeQAFailed,match="changed"):
        qa.verify("p1",claim,wd,["app.py","test_app.py"],lambda:None)
    assert not (wd/".wfs-qa-attestation.json").exists()
