#!/usr/bin/env python3
"""Phase 6 REAL engine-to-Docker workflow acceptance with NO paid AI provider.

Two project briefs -> actual wfs_tasks source writes -> real Docker unittest
-> fenced queue completion -> digest-checked, cross-tenant artifact read.
The deterministic model fixture is explicit: no provider use is implied.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time

BASE=Path(tempfile.mkdtemp(prefix="wfs-p6-engine-")).resolve()
BASE.chmod(0o755)
os.environ["WFS_TASKS_DB"]=str(BASE/"tasks.db")
os.environ["WFS_TASK_WORKSPACE"]=str(BASE/"_bootstrap")

import database
import wfs_tasks
from artifact_store import VerifiedArtifacts,ArtifactNotReady
from code_qa import PythonCodeQA
from cost_ledger import CostLedger
from master_queue import DurableMasterQueue
from master_worker import ApprovedMasterWorker
from project_rbac import ProjectRBAC

IMAGE="python:3.11-alpine@sha256:bb1d70c1df30d8ee1e05214dbe82d6cdfd29833c1f47ce917f20991aca93acaa"
database.DB_PATH=str(BASE/"approvals.db")
database.DB_DIR=str(BASE)
database.init_db()

SOURCE="""\
\"\"\"Safe synthetic inventory service used in isolated QA evidence.\"\"\"
from dataclasses import dataclass

@dataclass(frozen=True)
class InventoryItem:
    name: str
    quantity: int

def add_inventory(left: int, right: int) -> int:
    if isinstance(left, bool) or isinstance(right, bool):
        raise ValueError("boolean quantity not allowed")
    if not isinstance(left, int) or not isinstance(right, int):
        raise ValueError("quantity must be integer")
    if left < 0 or right < 0:
        raise ValueError("quantity cannot be negative")
    return left + right
"""
TESTS="""\
import unittest
from app.mathlib import add_inventory

class TestInventory(unittest.TestCase):
    def test_sum(self):
        self.assertEqual(add_inventory(2,3),5)

    def test_invalid_negative(self):
        with self.assertRaises(ValueError):
            add_inventory(-1,2)

    def test_invalid_bool(self):
        with self.assertRaises(ValueError):
            add_inventory(True,1)
"""
INIT="""\
\"\"\"Offline synthetic project package, tested on an actual Docker daemon.

This module intentionally provides no credentials, host network access,
production APIs, remote provider calls, or filesystem side effects.
Every task under this package is a deterministic demonstration only.
\"\"\"
"""
CODES={"app/mathlib.py":SOURCE,"app/test_mathlib.py":TESTS,"app/__init__.py":INIT}
assert all(len(code)>200 for code in CODES.values())

q=DurableMasterQueue(BASE/"queue.db",max_running=2,max_per_project=1)
ledger=CostLedger(BASE/"cost.db")
rbac=ProjectRBAC(BASE/"rbac.db")
for project in ("alpha","bravo"):
    rbac.bootstrap_owner(project,"ci-operator")
    ledger.set_budget(project,1_000_000,approved_by="ci-operator")
    with database.get_db() as conn:
        now=time.time()
        conn.execute("""INSERT INTO approvals(id,project_id,action_type,description,
                        status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)""",
                    ("approval-"+project,project,"project_launch",
                     "CI disposable fixture only","approved",now,now))
ledger.set_price("fixture.example","offline-code-fixture",
                 input_microusd_per_million=1000,
                 output_microusd_per_million=2000)
qa=PythonCodeQA(BASE,IMAGE,enabled=True)
calls=[]

async def trusted_offline_fixture(agent_id,sys_prompt,user_prompt):
    """Only a CI stub: intentionally no real model API or model credentials."""
    context=wfs_tasks._WFS_BILLING_CONTEXT.get()
    assert context is not None and context["project_id"] in ("alpha","bravo")
    claim=context["claim"]
    assert context["queue"].verify_lease(claim["id"],claim["worker_id"],claim["lease_token"])
    reservation=context["ledger"].reserve(context["project_id"],context["task_id"],
        agent_id,"fixture.example","offline-code-fixture",
        prompt_tokens=150,max_completion_tokens=1000)
    try:
        if agent_id=="qa1":
            result="VERDICT: pass — unit tests are passing and code is synthetic."
        elif '"paths"' in sys_prompt:
            result=json.dumps({"paths":list(CODES)})
        else:
            match=next((p for p in CODES if '"path":"'+p+'"' in sys_prompt),None)
            if match is None:
                raise RuntimeError("fixture was asked for an unexpected file")
            result=json.dumps({"path":match,"code":CODES[match]})
        # Usage below is fabricated by this clearly named offline fixture;
        # only live providers can report genuine billable token usage.
        context["ledger"].settle(reservation,{"prompt_tokens":25,"completion_tokens":45})
        calls.append({"project":context["project_id"],"agent":agent_id})
        return result
    except BaseException:
        context["ledger"].mark_uncertain(reservation,"offline fixture failed")
        raise

wfs_tasks._execution_llm=trusted_offline_fixture
tasks={}
for project in ("alpha","bravo"):
    tid=wfs_tasks.add_task(project,"Inventory API with real unit QA",
        "backend","Implement Python inventory arithmetic, explicit input validation, and unittest tests.")
    tasks[project]=tid
jobs={}
workers=[]
for project in ("alpha","bravo"):
    worker=ApprovedMasterWorker(q,wfs_tasks,ledger,BASE,
        worker_id="ci-"+project,access_control=rbac,principal="ci-operator",
        code_qa=qa,heartbeat_seconds=0.3,lease_seconds=60)
    workers.append(worker)
    jobs[project]=worker.enqueue_task(str(tasks[project]))
q.set_paused(False)
async def run_workers():
    return await asyncio.gather(*(w.run_once() for w in workers))
outcomes=asyncio.run(run_workers())
if len(outcomes)!=2 or not all(o["queue_status"]=="completed" for o in outcomes):
    # Disposable fixture only; print engine failure reasons, not prompts or
    # tokens from user-facing systems. Required for actionable CI triage.
    detail={project:{"status":wfs_tasks.get_task(tid)["status"],
                     "error":wfs_tasks.get_task(tid)["result"]}
            for project,tid in tasks.items()}
    raise AssertionError(json.dumps({"queue":outcomes,"engine":detail}))
store=VerifiedArtifacts(BASE)
files={}
for project in ("alpha","bravo"):
    job=q.get(jobs[project])
    assert job["status"]=="completed" and job["project_id"]==project
    generated=wfs_tasks.get_task(tasks[project])
    assert generated["status"]=="done" and len(generated["files"])==3
    listing=store.listing(project,job)
    assert listing["tests_passed"]>=3 and len(listing["files"])==3
    saved=store.read(project,job,"app/mathlib.py")
    assert saved==SOURCE.encode()
    files[project]={"task_id":tasks[project],"job_id":job["id"],
        "source_sha256":hashlib.sha256(saved).hexdigest(),
        "unit_tests_passed":listing["tests_passed"]}
    other="bravo" if project=="alpha" else "alpha"
    try:
        store.read(other,job,"app/mathlib.py")
        raise AssertionError("cross-project artifact download succeeded")
    except ArtifactNotReady:
        pass
assert len(calls)==10,len(calls)
assert all(len(ledger.history(project))==5 for project in ("alpha","bravo"))

containers=__import__("subprocess").run(
    ["docker","ps","-a","--filter","name=wfs-sbx-","--format","{{.Names}}"],
    capture_output=True,text=True,check=True,timeout=15)
assert not containers.stdout.strip(),"Docker containers leaked"

proof={"engine":"actual backend_live/wfs_tasks.py",
       "worker":"ApprovedMasterWorker",
       "queue":"DurableMasterQueue",
       "qa":"actual Docker python -m unittest",
       "projects":files,"model_source":"deterministic-offline-fixture",
       "paid_provider_used":False,"provider_usage_genuine":False,
       "test_cost_reservations":len(calls),
       "sha256_download":True,"cross_project_download_blocked":True,
       "containers_cleaned":True,"preview_published":False,
       "production_deployed":False}
output=Path("artifacts/e2e-worker")
output.mkdir(parents=True,exist_ok=True)
(output/"engine-proof.json").write_text(json.dumps(proof,indent=2),encoding="utf-8")
print(json.dumps(proof,sort_keys=True))
shutil.rmtree(BASE)
