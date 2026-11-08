#!/usr/bin/env python3
"""Real project coding QA acceptance on an authorized disposable CI Docker daemon.

No provider keys, production credentials or host workspace contents. Shows
positive, negative and lease-revocation cases using pinned Docker image.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import tempfile
import threading
import time
import subprocess

from code_qa import PythonCodeQA, CodeQAFailed
from sandbox_runtime import SandboxRuntime

IMAGE="python:3.11-alpine@sha256:bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa"
root=Path(tempfile.mkdtemp(prefix="wfs-real-code-qa-")).resolve()
root.chmod(0o755)
qa=PythonCodeQA(root,IMAGE,enabled=True)

def make_project(p,broken=False):
    wd=root/p/"job-probe"/"attempt-1"
    wd.mkdir(parents=True)
    (wd/"mathlib.py").write_text("def double(x): return x*2\n" if not broken else
                                   "def double(x): return 10\n")
    (wd/"test_mathlib.py").write_text(
        "import unittest\nfrom mathlib import double\n"
        "class TestCode(unittest.TestCase):\n"
        " def test_double(self): self.assertEqual(double(3),6)\n")
    return wd

paths=["mathlib.py","test_mathlib.py"]
w1=make_project("alpha")
w2=make_project("bravo")
with ThreadPoolExecutor(max_workers=2) as pool:
    a=pool.submit(qa.verify,"alpha",{"id":"job-probe","attempt":1},w1,paths,lambda:None)
    b=pool.submit(qa.verify,"bravo",{"id":"job-probe","attempt":1},w2,paths,lambda:None)
    outputs=[a.result(timeout=50),b.result(timeout=50)]

assert all(result["tests_passed"]>=1 for result in outputs)
assert outputs[0]["files"]["mathlib.py"]==outputs[1]["files"]["mathlib.py"]
assert (w1/".wfs-qa-attestation.json").is_file()
assert (w2/".wfs-qa-attestation.json").is_file()
assert outputs[0]["project_id"]!=outputs[1]["project_id"]

bad=make_project("failure",broken=True)
try:
    qa.verify("failure",{"id":"job-probe","attempt":1},bad,paths,lambda:None)
    raise SystemExit("broken code incorrectly passed QA")
except CodeQAFailed:
    assert not (bad/".wfs-qa-attestation.json").exists()

stop=threading.Event()
check_called=threading.Event()
def fence():
    check_called.set()
    if stop.is_set():
        raise PermissionError("lease revoked during Docker task")

cancel_workspace=make_project("cancel")
def cancellable():
    return qa.runtime.execute_fenced("cancel","job-probe",1,
        ["python","-c","import time;time.sleep(20)"],
        fence=fence,timeout_seconds=25)
began=time.monotonic()
with ThreadPoolExecutor(max_workers=1) as pool:
    future=pool.submit(cancellable)
    assert check_called.wait(timeout=10)
    time.sleep(0.8)
    stop.set()
    try:
        future.result(timeout=9)
        raise SystemExit("lease revocation failed to terminate running container")
    except PermissionError:
        pass
assert time.monotonic()-began<12, "container termination after revocation too slow"

listout=subprocess.run(["docker","ps","-a","--filter","name=wfs-sbx-",
                         "--format","{{.Names}}"],
                        capture_output=True,text=True,check=True,timeout=10)
assert not listout.stdout.strip(), "test worker leaked Docker containers"

report={
    "mode":"real-authorized-disposable-Docker",
    "image":IMAGE,
    "independent_projects":2,
    "python_unit_tests_per_project":[r["tests_passed"] for r in outputs],
    "content_hash_artifacts":True,
    "bad_code_rejected":True,
    "revoked_lease_terminates_container":True,
    "container_cleanup":True,
    "production_deployed":False,
}
target=Path("artifacts/code-qa")
target.mkdir(parents=True,exist_ok=True)
(target/"real-code-qa.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report))
