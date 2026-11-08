"""Opt-in authorized Master Queue worker wired to the existing task engine.

Runs separately from the HTTP gateway. No Docker daemon, no public routes.
Defaults to stopped, requiring explicit owner/operator action to start.
Only non-code roles are allowed until per-project QA sandboxes are verified.
"""
import argparse
import asyncio
import os
from pathlib import Path
import socket
import sys

try:
    from .master_queue import DurableMasterQueue
    from .cost_ledger import CostLedger
except ImportError:
    from master_queue import DurableMasterQueue
    from cost_ledger import CostLedger


_CODE_ROLES = frozenset(("backend","backend2","frontend","frontend2","devops"))
_RUNNABLE = frozenset(("pending","review","failed"))


class ApprovedMasterWorker:
    def __init__(self, queue, taskengine, ledger, workspace_root, *,
                 worker_id, heartbeat_seconds=10, lease_seconds=3600):
        if not 0 < heartbeat_seconds < lease_seconds:
            raise ValueError("heartbeat must be shorter than lease")
        self.queue = queue
        self.engine = taskengine
        self.ledger = ledger
        self.workspace_root = Path(workspace_root).resolve()
        self.worker_id = worker_id
        self.heartbeat_seconds = heartbeat_seconds
        self.lease_seconds = lease_seconds

    def _task(self, task_id):
        if not isinstance(task_id,str) or not task_id.isascii() or not task_id.isdecimal():
            raise ValueError("legacy engine task id must be numeric")
        t = self.engine.get_task(int(task_id))
        if t is None:
            raise LookupError("task not found")
        return t

    def _preflight(self, t):
        if not t.get("project"):
            raise PermissionError("project is mandatory for isolated execution")
        if str(t.get("status")) not in _RUNNABLE:
            raise PermissionError("task status is not runnable")
        if t.get("role") in _CODE_ROLES:
            raise PermissionError("code task needs project-scoped sandbox and objective QA")
        if self.engine.is_paused():
            raise PermissionError("legacy engine is paused")
        self.engine.require_launch_approval(t["project"])
        budget = self.ledger.summary(str(t["project"]))
        if not budget["approved"] or budget["remaining_microusd"] <= 0:
            raise PermissionError("approved budget with remaining funds required")

    def _workspace(self, project_id):
        project_id = str(project_id)
        if not project_id or not project_id.isascii() or not all(
                c.isalnum() or c in "-_." for c in project_id):
            raise PermissionError("invalid project workspace identifier")
        folder = (self.workspace_root / project_id).resolve()
        if folder == self.workspace_root or not folder.is_relative_to(self.workspace_root):
            raise PermissionError("workspace escape denied")
        folder.mkdir(parents=True, exist_ok=True)
        return str(folder)

    def enqueue_task(self, task_id):
        """Owner-authorized intake: validate actual task and approvals first."""
        t = self._task(str(task_id))
        self._preflight(t)
        return self.queue.submit(str(t["project"]),str(t["id"]),str(t["role"]),
                                 max_attempts=2)

    async def run_once(self):
        """Claim one job and await its real engine outcome, never a fabricated pass."""
        if self.queue.is_paused():
            return None
        claim = self.queue.claim(self.worker_id, lease_seconds=self.lease_seconds,
                                 recover_policy="quarantine")
        if claim is None:
            return None
        jid,token = claim["id"],claim["lease_token"]
        result = "failed"
        error = ""
        ctx_token = None
        previous_workspace = getattr(self.engine,"REPO",None)
        try:
            t = self._task(claim["task_id"])
            if (str(t["project"]) != claim["project_id"] or
                    str(t["role"]) != claim["role"]):
                raise PermissionError("job metadata does not match source-of-truth task")
            self._preflight(t)  # approval may have been revoked since intake
            self.engine.REPO = self._workspace(claim["project_id"])
            ctx_token = self.engine._WFS_BILLING_CONTEXT.set({
                "queue":self.queue,"claim":claim,"ledger":self.ledger,
                "project_id":claim["project_id"],"task_id":claim["task_id"]})
            if not self.queue.record_phase(jid,self.worker_id,token,"executing",
                                           "legacy taskengine.run_task"):
                raise PermissionError("lease lost before task dispatch")
            action = asyncio.create_task(self.engine.run_task(int(claim["task_id"])))
            try:
                while True:
                    done, _ = await asyncio.wait({action},timeout=self.heartbeat_seconds)
                    if done:
                        await action
                        break
                    if (self.queue.is_paused() or self.engine.is_paused() or
                            not self.queue.heartbeat(
                                jid,self.worker_id,token,lease_seconds=self.lease_seconds)):
                        action.cancel()
                        await asyncio.gather(action,return_exceptions=True)
                        raise PermissionError("worker paused, cancelled or lease lost")
            except asyncio.CancelledError:
                action.cancel()
                await asyncio.gather(action,return_exceptions=True)
                raise
            if not self.queue.verify_lease(jid,self.worker_id,token):
                raise PermissionError("lease expired after execution")
            finished = self._task(claim["task_id"])
            if finished["status"] == "review":
                self.queue.record_phase(jid,self.worker_id,token,"reviewing",
                                        "awaiting objective QA")
            if finished["status"] != "done":
                raise RuntimeError("engine outcome is " + str(finished["status"]))
            result = "completed"
        except asyncio.CancelledError:
            error = "worker cancelled"
            raise
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
        finally:
            if ctx_token is not None:
                self.engine._WFS_BILLING_CONTEXT.reset(ctx_token)
            if previous_workspace is not None:
                self.engine.REPO = previous_workspace
            # Only the still-valid lease holder can settle. Stale workers
            # cannot write completion; expired work is quarantined, not retried.
            settled = self.queue.finish(jid,self.worker_id,token,
                                        success=result=="completed",error=error)
        return {"job_id":jid,"engine_result":result,"queue_status":settled,
                "error":error}

    async def serve(self, *, polling_seconds=2):
        """Run forever with single in-process dispatch; spawn separate workers
        for cross-project parallelism. Queue controls global/per-project caps."""
        while True:
            outcome = await self.run_once()
            if outcome is None:
                await asyncio.sleep(polling_seconds)


def main(argv=None):
    parser=argparse.ArgumentParser(description="WFS isolated Master Queue worker")
    action=parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--enqueue-task",type=int)
    action.add_argument("--once",action="store_true")
    action.add_argument("--serve",action="store_true")
    action.add_argument("--resume",action="store_true")
    action.add_argument("--pause",action="store_true")
    args=parser.parse_args(argv)
    if os.environ.get("WFS_MASTER_WORKER_ENABLED") != "YES":
        parser.error("worker disabled; set WFS_MASTER_WORKER_ENABLED=YES locally")
    vars=("WFS_MASTER_QUEUE_DB","WFS_TASKS_DB","WFS_APPROVALS_DB",
          "WFS_COST_DB","WFS_WORKSPACE_ROOT")
    missing=[v for v in vars if not os.environ.get(v)]
    if missing:
        parser.error("missing required configuration: "+", ".join(missing))
    if args.serve or args.once or args.resume:
        if not os.environ.get("WFS_AI_ALLOWED_HOSTS"):
            parser.error("WFS_AI_ALLOWED_HOSTS HTTPS destination allowlist is required")
    backend=Path(__file__).resolve().parent
    live=backend.parent/"backend_live"
    sys.path.insert(0,str(backend))
    sys.path.insert(0,str(live))
    # Explicit database paths and a unique workspace are configured before
    # importing the old engine; no writes to saas-dibantuin are required.
    os.environ["WFS_TASK_WORKSPACE"]=str(Path(os.environ["WFS_WORKSPACE_ROOT"]).resolve()/"_bootstrap")
    import database
    database.DB_PATH=str(Path(os.environ["WFS_APPROVALS_DB"]).resolve())
    database.DB_DIR=str(Path(database.DB_PATH).parent)
    import wfs_tasks
    q=DurableMasterQueue(os.environ["WFS_MASTER_QUEUE_DB"],max_per_project=1)
    ledger=CostLedger(os.environ["WFS_COST_DB"])
    worker=ApprovedMasterWorker(q,wfs_tasks,ledger,
         os.environ["WFS_WORKSPACE_ROOT"],
         worker_id=f"worker-{socket.gethostname()[:30]}-{os.getpid()}")
    if args.pause:
        q.set_paused(True)
        print("Master Queue paused")
    elif args.resume:
        if os.environ.get("WFS_OPERATOR_APPROVAL") != "YES":
            parser.error("resume requires WFS_OPERATOR_APPROVAL=YES")
        q.set_paused(False)
        print("Master Queue resumed (paid calls still require approved budgets)")
    elif args.enqueue_task is not None:
        print(worker.enqueue_task(str(args.enqueue_task)))
    elif args.once:
        print(asyncio.run(worker.run_once()))
    else:
        asyncio.run(worker.serve())


if __name__=="__main__":
    main()
