#!/usr/bin/env python3
"""Operator-only reconcile of an ambiguous brief against EXISTING task+queue.

No HTTP service, AI call, paid retry, task enqueue, Docker access or preview.
All DB writers and workers must be stopped or paused independently first.
"""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"backend"))

from brief_intake import BriefIntakeKeys
from master_queue import DurableMasterQueue
from secure_control_api import TokenStore


def ordinary_existing(path):
    p=Path(path).absolute()
    if not p.is_file() or p.is_symlink() or p.resolve()!=p:
        raise ValueError("only existing regular local input files are permitted")
    return p


class ReadOnlyTaskEngine:
    def __init__(self, path):
        self.uri=ordinary_existing(path).as_uri()+"?mode=ro"

    def get_task(self, task_id):
        with closing(sqlite3.connect(self.uri,uri=True,timeout=10)) as db:
            row=db.execute(
                "SELECT id,project,title,role,prompt FROM tasks WHERE id=?",
                (task_id,)).fetchone()
        if row is None:
            return None
        return dict(zip(("id","project","title","role","prompt"),row))


def main(argv=None):
    parser=argparse.ArgumentParser(
        description="Reconcile an already-created brief and durable queued task")
    parser.add_argument("--auth-db",required=True,help="existing token/receipt database")
    parser.add_argument("--task-db",required=True,help="existing legacy task database")
    parser.add_argument("--queue-db",required=True,help="existing master queue database")
    parser.add_argument("--request-file",required=True,
                        help="local private JSON with the ORIGINAL exact brief and IDs")
    parser.add_argument("--approved",action="store_true")
    parser.add_argument("--writers-stopped",action="store_true",
                        help="operator confirms all engine and gateway writers stopped")
    args=parser.parse_args(argv)
    if not (args.approved and args.writers_stopped):
        parser.error("--approved and --writers-stopped are both required")
    try:
        authdb=ordinary_existing(args.auth_db)
        taskdb=ordinary_existing(args.task_db)
        queuedb=ordinary_existing(args.queue_db)
        document=ordinary_existing(args.request_file)
        if document.stat().st_size>65536:
            parser.error("operator request document exceeds 64KiB")
        source=json.loads(document.read_text(encoding="utf-8"))
        if not isinstance(source,dict) or set(source)!={
            "principal","project_id","idempotency_key","title","brief","role",
            "task_id","job_id",
        }:
            parser.error("expected eight exact fields in request document")
        engine=ReadOnlyTaskEngine(taskdb)
        queue=DurableMasterQueue(queuedb)
        if not queue.is_paused():
            parser.error("queue must be PAUSED before reconciliation")
        keys=BriefIntakeKeys(TokenStore(authdb))
        result=keys.reconcile_existing(
            source["principal"],source["project_id"],source["idempotency_key"],
            {"title":source["title"],"brief":source["brief"],"role":source["role"]},
            source["task_id"],source["job_id"],
            taskengine=engine,queue=queue,approved=True)
    except (ValueError,TypeError,PermissionError,sqlite3.DatabaseError,
            json.JSONDecodeError,OSError) as exc:
        parser.error("reconciliation denied: "+type(exc).__name__)
    print(json.dumps({
        "existing_job_confirmed":True,
        "receipt_recovered":result["recovered"],
        "task_id":result["task_id"],
        "job_id":result["job_id"],
        "task_executed":False,
        "new_job_created":False,
        "provider_charged":False,
    }))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
