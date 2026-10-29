#!/usr/bin/env python3
"""Test endpoint konsol Software House (siklus 153).

Jalan dengan venv gateway (fastapi+httpx tersedia):
  /home/agentuser/wfs-office/.venv/bin/python backend_live/test_wfs_sh_console.py
DB uji = tmp SQLite di-seed — TIDAK menyentuh tasks.db produksi. Fallback
agent_by_status diverifikasi tanpa modul 'server'; paritas AGENTS_META
diverifikasi dgn modul palsu yang disuntikkan ke sys.modules.
"""
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wfs_sh_console as m  # noqa: E402

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
        # t5 paling baru → harus nomor 1 di recent_logs (urutan terbaru dulu)
        ts = NOW + i
        c.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
                  " VALUES('proj-demo',?,'backend',?,?,'',?,?)", (title, agent, status, ts, ts))
    c.commit()
    c.close()
    return p


def test_overview_from_real_rows():
    tmp = tempfile.mkdtemp()
    os.environ["WFS_TASKS_DB"] = str(_seed(tmp))
    # tanpa modul 'server' → fallback distinct agent_id = 4 (be1,fe1,sec1,qa1)
    o = m.build_overview()
    assert o["projects"] == 2 and o["tasks"] == 5
    assert o["task_by_status"] == {"done": 2, "running": 1, "pending": 2}
    assert o["agents"] == 4 and o["agent_by_status"] == {"idle": 4}  # fallback
    assert o["running_subtasks"] == 1 and o["total_logs"] == 5
    assert o["derived"] is True and o["software_house"] == "WFS PROJECT"
    assert len(o["recent_logs"]) == 5
    row = o["recent_logs"][0]
    assert {"message", "source", "level"} <= set(row)
    assert row["id"] == 5 and "t5" in row["message"] and row["source"] == "system"
    assert all(o["recent_logs"][i]["source"] in ("system", "be1", "fe1", "sec1", "qa1")
               for i in range(5))


def test_overview_agents_parity_with_status():
    # Paritas /api/status: modul 'server' palsu dengan AGENTS_META 15 + 1 cfg kustom
    fake = type(sys)("fake_server_siklus153")
    fake.AGENTS_META = {f"a{i}": {"name": str(i)} for i in range(15)}
    fake.load_cfg = lambda: {f"a{i}": {} for i in range(15)} | {"custom1": {"key": "x"}}
    old = {k: sys.modules.get(k) for k in ("server", "__main__")}
    sys.modules["server"] = fake
    try:
        tmp = tempfile.mkdtemp()
        os.environ["WFS_TASKS_DB"] = str(_seed(tmp))
        o = m.build_overview()
        assert o["agents"] == 16 and o["agent_by_status"] == {"idle": 16}
    finally:
        for k, v in old.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


def test_approvals_honest_empty_and_workspace_501():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    tmp = tempfile.mkdtemp()
    os.environ["WFS_TASKS_DB"] = str(_seed(tmp))
    app = FastAPI()
    app.include_router(m.router)
    cl = TestClient(app)
    r = cl.get("/api/sh/overview")
    assert r.status_code == 200 and r.json()["tasks"] == 5
    r = cl.get("/api/approvals")
    assert r.status_code == 200
    d = r.json()
    assert d["approvals"] == [] and d["available"] is False  # jujur kosong, bukan mengarang
    # Workspace: 501 + pesan jujur (bukan 404 generik)
    r = cl.get("/api/projects/1/files")
    assert r.status_code == 501 and "generasi" in r.json()["detail"]
    for path in ("/api/projects/1/logs", "/api/projects/1/git"):
        assert cl.get(path).status_code == 501
    # path lain tetap 404 (tidak menutup endpoint milik server induk)
    assert cl.get("/api/projects/1/exec").status_code in (404, 405)
    assert cl.get("/api/sh/other").status_code == 404


def test_missing_db_fails_loud():
    os.environ["WFS_TASKS_DB"] = "/tmp/wfs-no-such-db-siklus153.db"
    try:
        m.build_overview()
        raise AssertionError("harusnya gagal loud")
    except FileNotFoundError:
        pass


if __name__ == "__main__":
    fails = 0
    for fn in (test_overview_from_real_rows, test_overview_agents_parity_with_status,
               test_approvals_honest_empty_and_workspace_501, test_missing_db_fails_loud):
        try:
            fn()
            print("PASS", fn.__name__)
        except Exception as e:  # noqa: BLE001
            fails += 1
            print("FAIL", fn.__name__, repr(e))
    sys.exit(1 if fails else 0)
