"""Run operator receipt repair as a separate process, no worker/network use."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

from brief_intake import BriefIntakeKeys
from master_queue import DurableMasterQueue
from secure_control_api import TokenStore


def test_operator_cli_exact_reconciliation_and_no_duplicate(tmp_path):
    auth=tmp_path/"auth.db"
    taskdb=tmp_path/"tasks.db"
    queuedb=tmp_path/"queue.db"
    token=TokenStore(auth)
    receipts=BriefIntakeKeys(token)
    original={"title":"Inventory API",
              "brief":"Write Python inventory API with at least three unit tests.",
              "role":"backend"}
    key="operator-repair-receipt-0001"
    receipts.claim("alice","alpha",key,original)
    with sqlite3.connect(taskdb) as db:
        db.execute("""CREATE TABLE tasks(
            id INTEGER PRIMARY KEY,project TEXT,title TEXT,role TEXT,prompt TEXT)""")
        db.execute("INSERT INTO tasks VALUES(?,?,?,?,?)",
                   (34,"alpha",original["title"],original["role"],original["brief"]))
    queue=DurableMasterQueue(queuedb)
    queue.set_paused(True)
    job=queue.submit("alpha","34","backend",max_attempts=1)
    record={**original,"principal":"alice","project_id":"alpha",
            "idempotency_key":key,"task_id":34,"job_id":job}
    request=tmp_path/"private-request.json"
    request.write_text(json.dumps(record))
    tool=Path(__file__).resolve().parents[1]/"scripts"/"wfs_reconcile_brief.py"
    cmd=[sys.executable,str(tool),"--auth-db",str(auth),"--task-db",str(taskdb),
         "--queue-db",str(queuedb),"--request-file",str(request)]
    no=subprocess.run(cmd,capture_output=True,text=True)
    assert no.returncode!=0 and "--writers-stopped" in no.stderr
    allowed=cmd+["--approved","--writers-stopped"]
    first=subprocess.run(allowed,capture_output=True,text=True)
    assert first.returncode==0,first.stderr
    assert json.loads(first.stdout)["receipt_recovered"] is True
    again=subprocess.run(allowed,capture_output=True,text=True)
    assert again.returncode==0,again.stderr
    assert json.loads(again.stdout)["receipt_recovered"] is False
    assert len(queue.list("alpha"))==1
    assert receipts.claim("alice","alpha",key,original)["state"]=="complete"
    queue.set_paused(False)
    blocked=subprocess.run(allowed,capture_output=True,text=True)
    assert blocked.returncode!=0 and "PAUSED" not in blocked.stdout


def test_operator_cli_mismatched_task_cannot_repair_receipt(tmp_path):
    auth=tmp_path/"a.db"
    taskdb=tmp_path/"t.db"
    queuedb=tmp_path/"q.db"
    token=TokenStore(auth)
    receipts=BriefIntakeKeys(token)
    original={"title":"Stock API","brief":"A task for verified Python stock API with tests.",
              "role":"backend"}
    key="operator-mismatch-brief-0001"
    receipts.claim("alice","alpha",key,original)
    with sqlite3.connect(taskdb) as db:
        db.execute("CREATE TABLE tasks(id INTEGER,project TEXT,title TEXT,role TEXT,prompt TEXT)")
        db.execute("INSERT INTO tasks VALUES(4,'bravo','Stock API','backend',?)",
                   (original["brief"],))
    queue=DurableMasterQueue(queuedb)
    job=queue.submit("alpha","4","backend",max_attempts=1)
    request=tmp_path/"private.json"
    request.write_text(json.dumps({**original,"principal":"alice",
        "project_id":"alpha","idempotency_key":key,"task_id":4,"job_id":job}))
    tool=Path(__file__).resolve().parents[1]/"scripts"/"wfs_reconcile_brief.py"
    outcome=subprocess.run([sys.executable,str(tool),
        "--auth-db",str(auth),"--task-db",str(taskdb),
        "--queue-db",str(queuedb),"--request-file",str(request),
        "--approved","--writers-stopped"],capture_output=True,text=True)
    assert outcome.returncode!=0
    assert receipts.claim("alice","alpha",key,original)["state"]=="pending"
