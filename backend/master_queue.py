"""Durable admission/dispatch ledger for WFS Master Agent.

This module NEVER executes tasks or bypasses the existing launch approval gate.
An authorized worker must claim, check approval, execute in an isolated sandbox,
heartbeat, and acknowledge completion. SQLite transactions arbitrate leases
across processes and survive restarts; the consumer must enforce authorization.
"""
from contextlib import contextmanager
from pathlib import Path
import re
import sqlite3
import time
import uuid

_SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")
_STATES = frozenset(("queued", "leased", "completed", "failed", "cancelled"))
_PUBLIC = ("id", "project_id", "task_id", "role", "status", "priority", "attempt",
           "max_attempts", "available_at", "lease_until", "worker_id",
           "cancel_requested", "last_error", "created_at", "updated_at")


def _ident(value, label):
    if not isinstance(value, str) or not _SAFE.fullmatch(value):
        raise ValueError(f"{label} must be a safe identifier (1–128 characters)")
    return value


class DurableMasterQueue:
    """Atomic SQLite queue usable by independently started, approved workers.

    No dynamic SQL from user values. No credentials or LLM prompts are stored.
    job_id = stable per (project_id, task_id); reuse returns same record.
    """

    def __init__(self, db_path, *, max_running=4, max_per_project=2, clock=None):
        self.db_path = str(Path(db_path).resolve())
        for label, n in (("max_running", max_running), ("max_per_project", max_per_project)):
            if isinstance(n, bool) or not isinstance(n, int) or n < 1 or n > 128:
                raise ValueError(f"{label} must be 1–128")
        self.max_running = max_running
        self.max_per_project = max_per_project
        self.clock = clock or time.time
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = self._connect()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_master_jobs (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN
                        ('queued','leased','completed','failed','cancelled')),
                    priority INTEGER NOT NULL DEFAULT 0,
                    attempt INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 3,
                    available_at REAL NOT NULL,
                    lease_until REAL,
                    worker_id TEXT,
                    lease_token TEXT,
                    cancel_requested INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    UNIQUE (project_id, task_id)
                );
                CREATE INDEX IF NOT EXISTS wfs_master_jobs_ready
                  ON wfs_master_jobs(status, available_at, priority DESC, created_at);
                CREATE INDEX IF NOT EXISTS wfs_master_jobs_project
                  ON wfs_master_jobs(project_id, status);
                CREATE TABLE IF NOT EXISTS wfs_master_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL, project_id TEXT NOT NULL,
                    phase TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS wfs_master_events_project
                    ON wfs_master_events(project_id,id);
                CREATE TABLE IF NOT EXISTS wfs_master_control (
                    key TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                );
                INSERT OR IGNORE INTO wfs_master_control(key,value)
                    VALUES ('paused', 1);
            """)
            # Fail closed by default. The platform owner must explicitly
            # resume worker dispatch; submit never launches paid AI.
        finally:
            conn.close()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=20, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=20000")
        return conn

    @contextmanager
    def _transaction(self):
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def submit(self, project_id, task_id, role, *, priority=0, max_attempts=3):
        """Idempotent by (project_id, task_id); never starts a worker."""
        project_id = _ident(project_id, "project_id")
        task_id = _ident(task_id, "task_id")
        role = _ident(role, "role")
        if isinstance(priority, bool) or not isinstance(priority, int) or not -10 <= priority <= 10:
            raise ValueError("priority must be -10..10")
        if isinstance(max_attempts, bool) or not isinstance(max_attempts, int) or not 1 <= max_attempts <= 10:
            raise ValueError("max_attempts must be 1..10")
        now = float(self.clock())
        with self._transaction() as conn:
            old = conn.execute(
                "SELECT id, role FROM wfs_master_jobs WHERE project_id=? AND task_id=?",
                (project_id, task_id),
            ).fetchone()
            if old:
                if old["role"] != role:
                    raise ValueError("same task id already belongs to another role")
                return old["id"]
            jid = "job-" + uuid.uuid4().hex
            conn.execute("""INSERT INTO wfs_master_jobs
                (id,project_id,task_id,role,status,priority,max_attempts,available_at,created_at,updated_at)
                VALUES (?,?,?,?,'queued',?,?,?,?,?)""",
                (jid, project_id, task_id, role, priority, max_attempts, now, now, now))
            self._event(conn,jid,project_id,"queued","submitted",now)
            return jid

    @staticmethod
    def _event(conn, job_id, project_id, phase, detail, now):
        conn.execute("""INSERT INTO wfs_master_events
            (job_id,project_id,phase,detail,created_at) VALUES(?,?,?,?,?)""",
            (job_id,project_id,phase,str(detail)[:500],now))

    @staticmethod
    def _recover(conn, now, policy="requeue"):
        # A lease is not success; crashed workers cannot leave tasks stuck forever.
        if policy not in ("requeue", "quarantine"):
            raise ValueError("unknown recovery policy")
        expired = conn.execute(
            """SELECT id,project_id,attempt,max_attempts,cancel_requested
               FROM wfs_master_jobs WHERE status='leased' AND lease_until<=?""",
            (now,),
        ).fetchall()
        for item in expired:
            phase = ("cancelled" if item["cancel_requested"] else
                     "failed" if policy == "quarantine" or item["attempt"] >= item["max_attempts"]
                     else "queued")
            reason = "expired lease requires operator reconciliation" if phase == "failed" else ""
            conn.execute("""UPDATE wfs_master_jobs SET status=?,last_error=?,
                lease_until=NULL, worker_id=NULL, lease_token=NULL,
                available_at=?, updated_at=? WHERE id=?""",
                (phase, reason, now, now, item["id"]))
            DurableMasterQueue._event(conn,item["id"],item["project_id"],phase,
                                      reason or "lease expired",now)

    def recover_expired(self, *, policy="requeue"):
        now = float(self.clock())
        with self._transaction() as conn:
            n = conn.execute(
                "SELECT COUNT(*) FROM wfs_master_jobs WHERE status='leased' AND lease_until<=?",
                (now,),
            ).fetchone()[0]
            self._recover(conn, now, policy)
            return n

    def set_paused(self, paused):
        if not isinstance(paused, bool):
            raise ValueError("paused must be bool")
        with self._transaction() as conn:
            conn.execute("UPDATE wfs_master_control SET value=? WHERE key='paused'",
                         (int(paused),))

    def is_paused(self):
        with self._connect() as conn:
            return bool(conn.execute(
                "SELECT value FROM wfs_master_control WHERE key='paused'"
            ).fetchone()[0])

    def claim(self, worker_id, *, lease_seconds=120, recover_policy="requeue"):
        """Return private claim token; atomic across workers and projects.

        A worker MUST verify existing project_launch approval separately before
        invoking the real executor, and must not treat a lease as authorization.
        """
        worker_id = _ident(worker_id, "worker_id")
        if isinstance(lease_seconds, bool) or not isinstance(lease_seconds, int) or not 5 <= lease_seconds <= 3600:
            raise ValueError("lease_seconds must be 5..3600")
        now = float(self.clock())
        with self._transaction() as conn:
            self._recover(conn, now, recover_policy)
            if conn.execute(
                "SELECT value FROM wfs_master_control WHERE key='paused'"
            ).fetchone()[0]:
                return None
            active = conn.execute(
                "SELECT project_id, COUNT(*) FROM wfs_master_jobs WHERE status='leased' GROUP BY project_id"
            ).fetchall()
            counts = {r[0]: r[1] for r in active}
            if sum(counts.values()) >= self.max_running:
                return None
            rows = conn.execute(
                """SELECT id,project_id,task_id,role,attempt
                FROM wfs_master_jobs WHERE status='queued' AND available_at<=?
                ORDER BY priority DESC,created_at ASC,id ASC""", (now,),
            ).fetchall()
            for row in rows:
                if counts.get(row["project_id"], 0) >= self.max_per_project:
                    continue
                token = uuid.uuid4().hex
                until = now + lease_seconds
                conn.execute(
                    """UPDATE wfs_master_jobs SET status='leased',
                       attempt=attempt+1, lease_until=?, worker_id=?,
                       lease_token=?, updated_at=? WHERE id=? AND status='queued'""",
                    (until, worker_id, token, now, row["id"]),
                )
                self._event(conn,row["id"],row["project_id"],"leased",
                            "worker claimed task",now)
                return {"id": row["id"], "project_id": row["project_id"],
                        "task_id": row["task_id"], "role": row["role"],
                        "attempt": row["attempt"]+1, "worker_id": worker_id,
                        "lease_token": token, "lease_until": until}
            return None

    def _owns(self, conn, job_id, worker_id, lease_token, now):
        return conn.execute(
            """SELECT attempt,max_attempts,cancel_requested FROM wfs_master_jobs
               WHERE id=? AND status='leased' AND worker_id=?
                 AND lease_token=? AND lease_until>?""",
            (job_id, worker_id, lease_token, now),
        ).fetchone()

    def verify_lease(self, job_id, worker_id, lease_token):
        """Worker-side fencing. Old worker must stop before more side effects."""
        job_id,worker_id = _ident(job_id,"job_id"),_ident(worker_id,"worker_id")
        if not isinstance(lease_token,str) or len(lease_token)!=32:
            return False
        with self._connect() as conn:
            row=self._owns(conn,job_id,worker_id,lease_token,float(self.clock()))
            return bool(row and not row["cancel_requested"])

    def record_phase(self, job_id, worker_id, lease_token, phase, detail=""):
        """Authenticated lease holders may report real phases, not fake success."""
        if phase not in ("executing","reviewing"):
            raise ValueError("phase must be executing or reviewing")
        job_id,worker_id=_ident(job_id,"job_id"),_ident(worker_id,"worker_id")
        now=float(self.clock())
        with self._transaction() as conn:
            row=self._owns(conn,job_id,worker_id,lease_token,now)
            if not row or row["cancel_requested"]:
                return False
            proj=conn.execute("SELECT project_id FROM wfs_master_jobs WHERE id=?",
                              (job_id,)).fetchone()[0]
            self._event(conn,job_id,proj,phase,detail,now)
            return True

    def events(self, project_id, *, limit=100):
        p=_ident(project_id,"project_id")
        if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=500:
            raise ValueError("invalid limit")
        with self._connect() as conn:
            rows=conn.execute("""SELECT id,job_id,project_id,phase,detail,created_at
                FROM wfs_master_events WHERE project_id=?
                ORDER BY id DESC LIMIT ?""",(p,limit)).fetchall()
            return [dict(row) for row in rows]

    def heartbeat(self, job_id, worker_id, lease_token, *, lease_seconds=120):
        job_id, worker_id = _ident(job_id, "job_id"), _ident(worker_id, "worker_id")
        if not isinstance(lease_token, str) or len(lease_token) != 32:
            return False
        if isinstance(lease_seconds, bool) or not isinstance(lease_seconds, int) or not 5 <= lease_seconds <= 3600:
            raise ValueError("invalid lease_seconds")
        now = float(self.clock())
        with self._transaction() as conn:
            row = self._owns(conn, job_id, worker_id, lease_token, now)
            if not row or row["cancel_requested"]:
                return False
            conn.execute("UPDATE wfs_master_jobs SET lease_until=?,updated_at=? WHERE id=?",
                         (now + lease_seconds, now, job_id))
            return True

    def finish(self, job_id, worker_id, lease_token, *, success, error=""):
        if not isinstance(success, bool):
            raise ValueError("success must be bool")
        job_id, worker_id = _ident(job_id, "job_id"), _ident(worker_id, "worker_id")
        now = float(self.clock())
        with self._transaction() as conn:
            row = self._owns(conn, job_id, worker_id, lease_token, now)
            if not row:
                return None  # stale or stolen lease may not write an outcome
            if row["cancel_requested"]:
                status, available = "cancelled", now
            elif success:
                status, available = "completed", now
            elif row["attempt"] >= row["max_attempts"]:
                status, available = "failed", now
            else:
                status = "queued"
                available = now + min(3600, 5 * (2 ** (row["attempt"] - 1)))
            conn.execute("""UPDATE wfs_master_jobs SET status=?,available_at=?,
                lease_until=NULL,worker_id=NULL,lease_token=NULL,
                last_error=?,updated_at=? WHERE id=?""",
                (status, available, str(error)[:1000] if not success else None,
                 now, job_id))
            proj=conn.execute("SELECT project_id FROM wfs_master_jobs WHERE id=?",
                              (job_id,)).fetchone()[0]
            self._event(conn,job_id,proj,status,str(error)[:500] if not success else "",now)
            return status

    def cancel(self, job_id):
        """Persist cancellation intent; active worker must stop cooperatively."""
        job_id = _ident(job_id, "job_id")
        now = float(self.clock())
        with self._transaction() as conn:
            row = conn.execute("SELECT status FROM wfs_master_jobs WHERE id=?", (job_id,)).fetchone()
            if not row or row["status"] in ("completed", "failed", "cancelled"):
                return False
            if row["status"] == "leased":
                conn.execute("UPDATE wfs_master_jobs SET cancel_requested=1,updated_at=? WHERE id=?",
                             (now, job_id))
            else:
                conn.execute("UPDATE wfs_master_jobs SET status='cancelled',updated_at=? WHERE id=?",
                             (now, job_id))
            proj=conn.execute("SELECT project_id FROM wfs_master_jobs WHERE id=?",
                              (job_id,)).fetchone()[0]
            self._event(conn,job_id,proj,"cancel_requested" if row["status"]=="leased" else "cancelled","operator request",now)
            return True

    def cancel_requested(self, job_id, worker_id, lease_token):
        """Worker polls this to stop running task; cancelling is NOT a kill."""
        job_id, worker_id = _ident(job_id, "job_id"), _ident(worker_id, "worker_id")
        with self._connect() as conn:
            row = self._owns(conn, job_id, worker_id, lease_token, float(self.clock()))
            return None if row is None else bool(row["cancel_requested"])

    def get(self, job_id):
        job_id = _ident(job_id, "job_id")
        with self._connect() as conn:
            r = conn.execute(
                "SELECT " + ",".join(_PUBLIC) + " FROM wfs_master_jobs WHERE id=?", (job_id,),
            ).fetchone()
            return dict(r) if r else None

    def list(self, project_id=None, *, limit=100):
        if project_id is not None:
            _ident(project_id, "project_id")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError("invalid limit")
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT " + ",".join(_PUBLIC) + " FROM wfs_master_jobs"
                + (" WHERE project_id=?" if project_id is not None else "")
                + " ORDER BY created_at DESC,id DESC LIMIT ?",
                ((project_id, limit) if project_id is not None else (limit,)),
            ).fetchall()
            return [dict(r) for r in rows]

    def metrics(self):
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT status,COUNT(*) FROM wfs_master_jobs GROUP BY status"
            ).fetchall()
            return {status: next((int(r[1]) for r in rows if r[0] == status), 0)
                    for status in sorted(_STATES)}
