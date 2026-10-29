#!/usr/bin/env python3
"""Test SSE /api/events gateway (siklus 154).

Jalan dengan venv gateway (fastapi+httpx tersedia):
  /home/agentuser/wfs-office/.venv/bin/python backend_live/test_wfs_events.py

DB uji = tmp SQLite di-seed — TIDAK menyentuh tasks.db produksi. Kontrak wire
diverifikasi via TestClient (format `data: {...}\\n\\n`), perilaku stream
(connected → hanya event BARU, tanpa backlog) via generator langsung.
"""
import asyncio
import json
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wfs_events as m  # noqa: E402

NOW = time.time()
SSE_CT = "text/event-stream"


def _seed(rows: int = 2) -> Path:
    tmp = tempfile.mkdtemp()
    p = Path(tmp) / "tasks.db"
    c = sqlite3.connect(p)
    c.executescript("""
        CREATE TABLE tasks(id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT,
            title TEXT, role TEXT, agent_id TEXT, status TEXT DEFAULT 'pending',
            prompt TEXT, result TEXT, review TEXT, files TEXT, created REAL, updated REAL);
        CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT,
            brief TEXT, status TEXT DEFAULT 'planning', created REAL);
    """)
    for i in range(rows):
        ts = NOW + i
        c.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
                  " VALUES('proj-demo',?,'backend',?,?,'',?,?)",
                  (f"seed{i}", f"ag{i}", "done", ts, ts))
    c.commit()
    c.close()
    return p


def _parse(frame: str) -> dict:
    assert frame.startswith("data: ") and frame.endswith("\n\n"), f"frame SSE rusak: {frame!r}"
    return json.loads(frame[6:])


def test_stream_connected_then_new_rows_only():
    """Kontrak wire + TANPA backlog: MAX(id) saat connect, hanya id > itu dialirkan."""
    m.POLL_INTERVAL = 0.01  # percepat poll uji (global dibaca saat iterasi)
    db = _seed(2)           # id 1,2 → last_id awal = 2

    async def run():
        gen = m._stream_gen(str(db))
        ev1 = _parse(await gen.__anext__())          # connected segera
        # insert BARU setelah connect → harus muncul sebagai event log
        c = sqlite3.connect(db)
        c.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
                  " VALUES('proj-demo','build api','backend','be1','running','',?,?)",
                  (NOW + 9, NOW + 9))
        c.execute("INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
                  " VALUES('proj-demo','review pr','qa','qa1','pending','',?,?)",
                  (NOW + 10, NOW + 10))
        c.commit()
        c.close()
        ev2 = _parse(await asyncio.wait_for(gen.__anext__(), timeout=5))
        ev3 = _parse(await asyncio.wait_for(gen.__anext__(), timeout=5))
        await gen.aclose()
        return ev1, ev2, ev3

    ev1, ev2, ev3 = asyncio.run(run())
    assert ev1["type"] == "connected" and ev1["software_house"] == "WFS PROJECT"
    assert ev1.get("derived") is True  # jujur: sumber tasks, bukan execution_logs
    # event BARU pertama = id 3 (urut ASC), paritas pesan recent_logs 153
    assert ev2["type"] == "log" and ev2["data"]["id"] == 3
    assert ev2["data"]["message"] == "Task #3 'build api' -> running"
    assert ev2["data"]["source"] == "be1" and ev2["data"]["level"] == "info"
    assert ev3["data"]["id"] == 4 and "qa1" in ev3["data"]["source"]
    assert {"id", "message", "level", "source", "project_id", "created_at"} == set(ev2["data"])


def test_endpoint_wire_format_and_no_backlog():
    """GET /api/events (uvicorn NYATA + socket TCP): 200, text/event-stream,
    event pertama = connected saja — task pra-connect TIDAK diulang (tanpa
    backlog), lalu koneksi diputus → server membersihkan generator.
    (TestClient stream tak bisa menutup response tak berujung — pakai server asli.)"""
    import socket as _s
    import threading
    import uvicorn
    from fastapi import FastAPI
    m.POLL_INTERVAL = 1.0  # reset global — test lain mungkin mempercepat
    m.PING_EVERY = 15
    db = _seed(2)
    os.environ["WFS_TASKS_DB"] = str(db)
    app = FastAPI()
    app.include_router(m.router)
    cfg = uvicorn.Config(app, host="127.0.0.1", port=8954, log_level="error")
    srv = uvicorn.Server(cfg)
    th = threading.Thread(target=srv.run, daemon=True)
    th.start()
    for _ in range(50):  # tunggu siap
        try:
            _s.create_connection(("127.0.0.1", 8954), timeout=0.5).close()
            break
        except OSError:
            time.sleep(0.1)
    try:
        import http.client
        conn = http.client.HTTPConnection("127.0.0.1", 8954, timeout=5)
        conn.request("GET", "/api/events", headers={"Accept": "text/event-stream"})
        r = conn.getresponse()
        assert r.status == 200, r.status
        assert (r.getheader("Content-Type") or "").startswith("text/event-stream")
        # frame pertama: event connected — SATU-SATUNYA data sebelum keepalive
        # (http.client men-decode chunked otomatis; readline = satu baris frame)
        line = r.readline().decode()
        assert line.startswith("data: "), f"frame pertama bukan data: {line[:80]!r}"
        first = json.loads(line[len("data: "):])
        assert first["type"] == "connected" and first.get("derived") is True
        line2 = r.readline().decode()  # baris kosong penutup frame
        assert line2.strip() == "", repr(line2)
        # 3 dtk tanpa event log → seed pra-connect TIDAK diulang (tanpa backlog)
        deadline = time.time() + 3
        got = ""
        while time.time() < deadline:
            try:
                got += r.readline().decode()
            except TimeoutError:
                break
        assert "Task #1" not in got and "Task #2" not in got, got[:200]
        conn.close()  # putus → task server harus membersihkan generator
    finally:
        srv.should_exit = True
        th.join(timeout=5)


def test_missing_or_corrupt_db_fails_loud_in_stream():
    """DB absen/korup → event level 'error' di DALAM stream (loud), stream tetap hidup."""
    m.POLL_INTERVAL = 0.01

    async def run(path):
        gen = m._stream_gen(path)
        ev = _parse(await gen.__anext__())
        await gen.aclose()
        return ev

    ev = asyncio.run(run("/tmp/wfs-no-such-db-siklus154.db"))
    assert ev["type"] == "log" and ev["data"]["level"] == "error"
    assert "tidak ditemukan" in ev["data"]["message"]
    # korup: file ada tapi bukan SQLite
    p = Path(tempfile.mkdtemp()) / "tasks.db"
    p.write_text("ini bukan database sqlite")
    ev2 = asyncio.run(run(str(p)))
    assert ev2["data"]["level"] == "error" and "tidak terbaca" in ev2["data"]["message"]


def test_sse_line_and_keepalive_ping():
    """sse_line satu-baris + keepalive ': ping' setelah PING_EVERY poll tanpa aktivitas."""
    m.POLL_INTERVAL = 0.01
    m.PING_EVERY = 2
    db = _seed(1)

    async def run():
        gen = m._stream_gen(str(db))
        out = [await gen.__anext__()]          # connected
        for _ in range(3):                      # poll tanpa aktivitas → ping di iterasi ke-2
            out.append(await asyncio.wait_for(gen.__anext__(), timeout=5))
        await gen.aclose()
        return out

    out = asyncio.run(run())
    assert out[0].startswith("data: ") and out[0].endswith("\n\n")
    pings = [f for f in out if f.startswith(": ping")]
    assert len(pings) >= 1, f"keepalive tidak muncul: {out!r}"


if __name__ == "__main__":
    fails = 0
    for fn in (test_stream_connected_then_new_rows_only,
               test_endpoint_wire_format_and_no_backlog,
               test_missing_or_corrupt_db_fails_loud_in_stream,
               test_sse_line_and_keepalive_ping):
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as e:  # noqa: BLE001
            fails += 1
            import traceback
            print(f"FAIL {fn.__name__}: {e}")
            traceback.print_exc()
    print(f"{4 - fails}/4 PASS")
    sys.exit(1 if fails else 0)
