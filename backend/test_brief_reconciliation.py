"""Phase 7/8 crash-safe brief intake recovery: never re-enqueue paid work."""
import sqlite3

import pytest

from brief_intake import BriefIntakeKeys, IntakeConflict
from master_queue import DurableMasterQueue
from secure_control_api import TokenStore


BRIEF={"title":"Inventory API","brief":"Write a Python inventory service with tests.","role":"backend"}
KEY="operator-existing-intake-00001"


class RecordedEngine:
    def __init__(self, tasks):
        self.tasks=tasks
        self.created_count=0

    def get_task(self, task_id):
        return self.tasks.get(task_id)

    def add_task(self, *args):
        self.created_count+=1
        raise AssertionError("recovery MUST NEVER create a task")


@pytest.fixture
def state(tmp_path):
    tokens=TokenStore(tmp_path/"tokens.db")
    keys=BriefIntakeKeys(tokens)
    q=DurableMasterQueue(tmp_path/"queue.db")
    q.set_paused(False)
    existing={"id":48,"project":"alpha","title":BRIEF["title"],
              "prompt":BRIEF["brief"],"role":BRIEF["role"],"status":"running"}
    engine=RecordedEngine({48:existing})
    keys.claim("alice","alpha",KEY,BRIEF)
    job=q.submit("alpha","48","backend",max_attempts=1)
    return keys,tokens,q,engine,job


def approve(state, *, principal="alice",project="alpha",key=KEY,
            payload=None,task_id=48,job_id=None,approved=True):
    keys,tokens,q,engine,existing_job=state
    return keys.reconcile_existing(
        principal,project,key,payload or BRIEF,task_id,
        existing_job if job_id is None else job_id,
        taskengine=engine,queue=q,approved=approved)


def test_crashed_paid_brief_attaches_exact_existing_job_without_reexecution(state):
    keys,tokens,q,engine,job=state
    with pytest.raises(IntakeConflict,match="approval"):
        approve(state,approved=False)
    assert keys.claim("alice","alpha",KEY,BRIEF)["state"]=="pending"
    before=len(q.list("alpha"))
    result=approve(state)
    assert result=={"recovered":True,"task_id":48,"job_id":job}
    assert approve(state)["recovered"] is False
    done=keys.claim("alice","alpha",KEY,BRIEF)
    assert done["state"]=="complete" and done["job_id"]==job
    assert engine.created_count==0 and len(q.list("alpha"))==before


@pytest.mark.parametrize("changes",[
    {"principal":"bob"},
    {"project":"bravo"},
    {"key":"different-random-intake-00001"},
    {"payload":{**BRIEF,"brief":"Different implementation and tests."}},
    {"payload":{**BRIEF,"role":"backend2"}},
    {"task_id":47},
    {"job_id":"job-wrong"},
])
def test_wrong_principal_scope_job_or_fingerprint_remains_pending(state,changes):
    keys,tokens,q,engine,job=state
    with pytest.raises((IntakeConflict,ValueError)):
        approve(state,**changes)
    assert keys.claim("alice","alpha",KEY,BRIEF)["state"]=="pending"
    assert engine.created_count==0 and len(q.list("alpha"))==1


def test_recovery_denies_tampered_engine_task_and_queue_role(state):
    keys,tokens,q,engine,job=state
    engine.tasks[48]["prompt"]="modified after the original brief"
    with pytest.raises(IntakeConflict,match="do not match"):
        approve(state)
    engine.tasks[48]["prompt"]=BRIEF["brief"]
    engine.tasks[48]["project"]="bravo"
    with pytest.raises(IntakeConflict,match="do not match"):
        approve(state)
    engine.tasks[48]["project"]="alpha"
    with q._connect() as db:
        db.execute("UPDATE wfs_master_jobs SET role='devops' WHERE id=?",(job,))
    with pytest.raises(IntakeConflict,match="do not match"):
        approve(state)
    assert keys.claim("alice","alpha",KEY,BRIEF)["state"]=="pending"


def test_recovery_cannot_create_receipt_if_key_was_never_submitted(state):
    keys,tokens,q,engine,job=state
    with pytest.raises(IntakeConflict,match="receipt not found"):
        approve(state,key="unseen-brief-submission-0001")
    with tokens._db() as db:
        count=db.execute("SELECT COUNT(*) FROM wfs_brief_receipts").fetchone()[0]
    assert count==1
    assert engine.created_count==0


def test_completed_receipt_cannot_be_rebound_to_another_job(state):
    keys,tokens,q,engine,job=state
    assert approve(state)["recovered"] is True
    second=q.submit("alpha","49","backend",max_attempts=1)
    engine.tasks[49]={**engine.tasks[48],"id":49}
    with pytest.raises(IntakeConflict,match="another job"):
        approve(state,task_id=49,job_id=second)
    assert keys.claim("alice","alpha",KEY,BRIEF)["job_id"]==job


def test_brief_recovery_never_stores_user_key_or_brief_plaintext(state):
    keys,tokens,q,engine,job=state
    approve(state)
    blob=(__import__("pathlib").Path(tokens.path)).read_bytes()
    assert KEY.encode() not in blob
    assert BRIEF["brief"].encode() not in blob
