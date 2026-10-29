#!/usr/bin/env python3
"""Test endpoint dashboard/stats live gateway (siklus 152).

Jalan dengan venv gateway (fastapi+httpx tersedia):
  /home/agentuser/wfs-office/.venv/bin/python backend_live/test_wfs_dashboard_stats.py
atau pytest bila tersedia. DB uji = tmp SQLite di-seed — TIDAK menyentuh
tasks.db produksi. Fallback agents_count diverifikasi tanpa modul 'server'.
"""
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wfs_dashboard_stats as m  # noqa: E402

NOW = time.time()


def _seed(tmp: str) -> Path:
    p = Path(tmp) / "tasks.db"
    c = sqlite3.connect(p)
    c.executescript("""
        CREATE TABLE tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT,
            title TEXT, role TEXT, agent_id TEXT, status TEXT DEFAULT 'pending',
            prompt TEXT, result TEXT, review TEXT, files TEXT, created REAL, updated REAL);
        CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT,
            brief TEXT, status TEXT DEFAULT 'planning', created REAL);
    """)
    c.execute("INSERT INTO projects(name,brief,status,created) VALUES('P1','b','running',?)", (NOW,))
    c.execute("INSERT INTO projects(name,brief,status,created) VALUES('P2','b','backlog',?)", (NOW,))
    for i, (title, status, agent) in enumerate([
            ("t1", "done", "be1"), ("t2", "done", "fe1"), ("t3", "running", "sec1"),
            ("t4", "pending", "qa1"), ("t5", "pending", None)]):
        # t5 paling baru → harus nomor 1 di logs (urutan terbaru dulu)
        ts = NOW + i
        c.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
                  " VALUES('proj-demo',?,'backend',?,?,'',?,?)", (title, agent, status, ts, ts))
    c.commit()
    c.close()
    return p


def test_counts_from_real_rows():
    tmp = tempfile.mkdtemp()
    os.environ["WFS_TASKS_DB"] = str(_seed(tmp))
    s = m.build_stats()
    assert s["projects_total"] == 2 and s["projects_running"] == 1
    assert s["tasks_total"] == 5 and s["tasks_running"] == 1 and s["tasks_completed"] == 2
    assert s["agents_count"] == 4  # fallback: distinct agent_id (be1,fe1,sec1,qa1)
    assert s["software_house"] == "WFS PROJECT"
    assert len(s["logs"]) == 5
    row = s["logs"][0]
    assert {"id", "timestamp", "message"} <= set(row)
    assert row["id"] == 5 and "t5" in row["message"]  # terbaru dulu
    assert all(s["logs"][i]["timestamp"] >= s["logs"][i + 1]["timestamp"] for i in range(4))


def test_endpoint_via_testclient():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    tmp = tempfile.mkdtemp()
    os.environ["WFS_TASKS_DB"] = str(_seed(tmp))
    app = FastAPI()
    app.include_router(m.router)
    cl = TestClient(app)
    r = cl.get("/api/dashboard/stats")
    assert r.status_code == 200
    s = r.json()
    assert s["tasks_total"] == 5 and s["agents_count"] == 4
    assert cl.get("/api/dashboard/other").status_code == 404  # path lain tetap 404


def test_missing_db_fails_loud():
    os.environ["WFS_TASKS_DB"] = "/tmp/wfs-no-such-db-siklus152.db"
    try:
        m.build_stats()
        raise AssertionError("harusnya gagal loud")
    except FileNotFoundError:
        pass


if __name__ == "__main__":
    fails = 0
    for fn in (test_counts_from_real_rows, test_endpoint_via_testclient, test_missing_db_fails_loud):
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as e:  # noqa: BLE001
            fails += 1
            print("FAIL", fn.__name__, repr(e))
    sys.exit(1 if fails else 0)
