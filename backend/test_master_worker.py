"""Test the real queue-worker boundary with isolated engine stubs."""
import asyncio
from contextvars import ContextVar
from pathlib import Path
import pytest
from master_queue import DurableMasterQueue
from cost_ledger import CostLedger
from master_worker import ApprovedMasterWorker
from project_rbac import ProjectRBAC, AccessDenied


class Engine:
    def __init__(self):
        self.tasks={
            1:{"id":1,"project":"p1","status":"pending","role":"design"},
            2:{"id":2,"project":"p2","status":"pending","role":"qa"},
            3:{"id":3,"project":"p1","status":"pending","role":"backend"},
        }
        self._WFS_BILLING_CONTEXT=ContextVar("fake-billing-context",default=None)
        self.REPO="legacy"
        self.approved={"p1","p2"}
        self.paused=False
        self.runs=[]
        self.leave_pending=False
        self.block=None

    def get_task(self,tid):
        t=self.tasks.get(int(tid))
        return dict(t) if t else None

    def is_paused(self):
        return self.paused

    def require_launch_approval(self,p):
        if p not in self.approved:
            raise PermissionError("launch approval revoked")

    async def run_task(self,tid):
        ctx=self._WFS_BILLING_CONTEXT.get()
        self.runs.append((tid,ctx["workspace"] if ctx else self.REPO))
        if self.block is not None:
            await self.block.wait()
        if not self.leave_pending:
            self.tasks[tid]["status"]="done"


@pytest.fixture
def ready(tmp_path):
    q=DurableMasterQueue(tmp_path/"jobs.db",max_per_project=1)
    ledger=CostLedger(tmp_path/"cost.db")
    for proj in ("p1","p2"):
        ledger.set_budget(proj,1_000_000,approved_by="owner")
    engine=Engine()
    acl=ProjectRBAC(tmp_path/"rbac.db")
    acl.bootstrap_owner("p1","owner")
    acl.bootstrap_owner("p2","owner")
    worker=ApprovedMasterWorker(q,engine,ledger,tmp_path/"projects",
                                 access_control=acl,principal="owner",
                                 worker_id="worker-1",heartbeat_seconds=.02,lease_seconds=10)
    return q,ledger,engine,worker


def test_requires_explicit_resume_and_launch_approval(ready):
    q,ledger,engine,worker=ready
    job=worker.enqueue_task("1")
    assert q.get(job)["status"]=="queued"
    assert asyncio.run(worker.run_once()) is None
    engine.approved.remove("p1")
    q.set_paused(False)
    result=asyncio.run(worker.run_once())
    assert result["queue_status"]=="failed"
    assert engine.runs==[]
    assert "approval" in result["error"]


def test_project_scoped_real_engine_success_is_not_visual_only(ready):
    q,ledger,engine,worker=ready
    job=worker.enqueue_task("1")
    q.set_paused(False)
    result=asyncio.run(worker.run_once())
    assert result["queue_status"]=="completed"
    assert q.get(job)["status"]=="completed"
    assert engine.runs[0][0]==1
    assert Path(engine.runs[0][1]).parent.parent.name=="p1"
    assert Path(engine.runs[0][1]).name=="attempt-1"
    assert engine.REPO=="legacy"
    assert [e["phase"] for e in q.events("p1")][:3]==["completed","executing","leased"]


def test_legacy_engine_cannot_fabricate_pass_without_done(ready):
    q,ledger,engine,worker=ready
    engine.leave_pending=True
    job=worker.enqueue_task("1")
    q.set_paused(False)
    outcome=asyncio.run(worker.run_once())
    assert outcome["engine_result"]=="failed"
    assert outcome["queue_status"]=="failed"
    assert q.get(job)["status"]=="failed"


def test_code_roles_rejected_until_sandbox_is_scoped(ready):
    q,ledger,engine,worker=ready
    with pytest.raises(PermissionError,match="project-scoped sandbox"):
        worker.enqueue_task("3")
    assert q.metrics()["queued"]==0


def test_cross_project_workspaces_do_not_overlap(ready):
    q,ledger,engine,worker=ready
    worker.enqueue_task("1")
    worker.enqueue_task("2")
    q.set_paused(False)
    assert asyncio.run(worker.run_once())["queue_status"]=="completed"
    assert asyncio.run(worker.run_once())["queue_status"]=="completed"
    assert len({workspace for _,workspace in engine.runs})==2


def test_cooperative_cancel_and_pause(ready):
    q,ledger,engine,worker=ready
    job=worker.enqueue_task("1")
    engine.block=asyncio.Event()
    q.set_paused(False)
    async def scenario():
        run=asyncio.create_task(worker.run_once())
        for _ in range(100):
            if engine.runs:
                break
            await asyncio.sleep(.002)
        assert engine.runs
        assert q.cancel(job)
        return await asyncio.wait_for(run,timeout=1)
    result=asyncio.run(scenario())
    assert result["queue_status"]=="cancelled"
    assert q.get(job)["status"]=="cancelled"
    assert engine.tasks[1]["status"]=="pending"


def test_worker_rejects_cross_project_principal_even_if_approved(ready):
    q,ledger,engine,worker=ready
    worker.access_control.set_role("owner","p1","limited","worker")
    worker.principal="limited"
    with pytest.raises(AccessDenied):
        worker.enqueue_task("2")
    with pytest.raises(AccessDenied):
        worker.enqueue_task("1")  # worker role may run but not enqueue
    assert q.metrics()["queued"]==0


def test_revoke_permission_after_enqueue_prevents_paid_execution(ready):
    q,ledger,engine,worker=ready
    job=worker.enqueue_task("1")
    worker.principal="unauthorized"
    q.set_paused(False)
    outcome=asyncio.run(worker.run_once())
    assert outcome["engine_result"]=="failed"
    assert not engine.runs
    assert q.get(job)["status"]=="failed"


def test_project_workspace_symlink_alias_rejected(ready,tmp_path):
    q,ledger,engine,worker=ready
    root=worker.workspace_root
    root.mkdir(parents=True,exist_ok=True)
    (root/"p2").mkdir()
    (root/"p1").symlink_to(root/"p2",target_is_directory=True)
    worker.enqueue_task("1")
    q.set_paused(False)
    result=asyncio.run(worker.run_once())
    assert result["queue_status"]=="failed"
    assert result["engine_result"]=="failed"
    assert "symlinked" in result["error"]
    assert engine.runs==[]


def test_concurrent_workers_use_contextvar_not_shared_repo(ready):
    q,ledger,engine,first=ready
    engine.tasks[2]["status"]="pending"
    first.enqueue_task("1")
    first.enqueue_task("2")
    q.set_paused(False)
    second=ApprovedMasterWorker(q,engine,ledger,first.workspace_root,
        access_control=first.access_control,principal="owner",
        worker_id="worker-2",heartbeat_seconds=.02,lease_seconds=10)
    async def scenario():
        a,b=await asyncio.gather(first.run_once(),second.run_once())
        assert a["queue_status"]=="completed"
        assert b["queue_status"]=="completed"
    asyncio.run(scenario())
    assert len(engine.runs)==2
    paths={tid:Path(root) for tid,root in engine.runs}
    assert paths[1].parents[1].name=="p1"
    assert paths[2].parents[1].name=="p2"
    assert paths[1]!=paths[2]
    assert engine.REPO=="legacy"



def test_bounded_serve_runs_two_projects_in_parallel(ready):
    q,ledger,engine,worker=ready
    worker.enqueue_task("1")
    worker.enqueue_task("2")
    q.set_paused(False)
    engine.block=asyncio.Event()
    async def scenario():
        service=asyncio.create_task(worker.serve(polling_seconds=.002,concurrency=2))
        try:
            for _ in range(150):
                if len(engine.runs)==2:
                    break
                await asyncio.sleep(.004)
            assert len(engine.runs)==2
            assert len({p for _,p in engine.runs})==2
            engine.block.set()
            for _ in range(150):
                if q.metrics()["completed"]==2:
                    break
                await asyncio.sleep(.004)
            assert q.metrics()["completed"]==2
        finally:
            service.cancel()
            await asyncio.gather(service,return_exceptions=True)
    asyncio.run(asyncio.wait_for(scenario(),2))


@pytest.mark.parametrize("concurrency",[0,9,True])
def test_parallel_worker_slot_count_is_bounded(ready,concurrency):
    q,ledger,engine,worker=ready
    with pytest.raises(ValueError,match="concurrency"):
        asyncio.run(worker.serve(concurrency=concurrency))


def test_code_task_requires_opt_in_qa_and_restricts_to_python_roles(ready):
    q,ledger,engine,worker=ready
    with pytest.raises(PermissionError,match="Docker QA"):
        worker.enqueue_task("3")
    approved=ApprovedMasterWorker(q,engine,ledger,worker.workspace_root,
        access_control=worker.access_control,principal="owner",worker_id="qa-owner",
        code_qa=object())
    job=approved.enqueue_task("3")
    assert q.get(job)["status"]=="queued"
    engine.tasks[4]={"id":4,"project":"p1","role":"frontend","status":"pending"}
    with pytest.raises(PermissionError,match="role-specific"):
        approved.enqueue_task("4")
