"""Durable request deduplication for approved paid-task intake.

An uncertain crash between task creation and durable receipt remains PENDING
until manual operator reconciliation. NEVER replay a possibly billable submit.
Only SHA-256 of the token, principal, project and canonical brief are stored.
"""
from contextlib import closing
import hashlib
import json
import re
import sqlite3

from project_rbac import ident

_IDEMP=re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{15,127}\\Z")


class IntakeConflict(RuntimeError):
    pass


class BriefIntakeKeys:
    def __init__(self,tokens):
        self.tokens=tokens
        with closing(tokens._db()) as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS wfs_brief_receipts(
              digest TEXT PRIMARY KEY,
              principal TEXT NOT NULL,
              project_id TEXT NOT NULL,
              request_sha256 TEXT NOT NULL,
              state TEXT NOT NULL CHECK(state IN ('pending','complete')),
              task_id TEXT,
              job_id TEXT,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS wfs_brief_project
              ON wfs_brief_receipts(project_id,principal);
            """)

    @staticmethod
    def _digest(principal,project,key):
        principal,project=ident(principal),ident(project)
        if not isinstance(key,str) or not _IDEMP.fullmatch(key):
            raise ValueError("Idempotency-Key must have 16..128 safe characters")
        return hashlib.sha256(
            ("wfs-intake-v1\\0"+principal+"\\0"+project+"\\0"+key).encode()).hexdigest()

    def claim(self,principal,project,key,payload):
        digest=self._digest(principal,project,key)
        fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True,
                      separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
        db=self.tokens._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            old=db.execute("""SELECT request_sha256,state,task_id,job_id
                 FROM wfs_brief_receipts WHERE digest=?""",(digest,)).fetchone()
            if old:
                if old["request_sha256"]!=fingerprint:
                    raise IntakeConflict("Idempotency-Key reused with different brief")
                receipt={"state":old["state"],"task_id":old["task_id"],
                         "job_id":old["job_id"],"digest":digest}
            else:
                now=float(self.tokens.clock())
                db.execute("""INSERT INTO wfs_brief_receipts
                  (digest,principal,project_id,request_sha256,state,created_at,updated_at)
                  VALUES(?,?,?,?,'pending',?,?)""",
                  (digest,principal,project,fingerprint,now,now))
                receipt={"state":"fresh","task_id":None,"job_id":None,"digest":digest}
            db.commit()
            return receipt
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def complete(self,digest,task_id,job_id):
        if not isinstance(task_id,int) or task_id<1:
            raise ValueError("invalid task id")
        job_id=ident(job_id)
        with closing(self.tokens._db()) as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                r=db.execute("""UPDATE wfs_brief_receipts
                    SET state='complete',task_id=?,job_id=?,updated_at=?
                    WHERE digest=? AND state='pending'""",
                    (str(task_id),job_id,float(self.tokens.clock()),digest))
                if r.rowcount!=1:
                    raise IntakeConflict("pending intake no longer owned")
                db.commit()
            except BaseException:
                db.rollback()
                raise
