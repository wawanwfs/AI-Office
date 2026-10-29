#!/usr/bin/env python3
"""WFS gateway produksi (:8787) — SSE /api/events (additive, read-only). Siklus 154.

Backlog siklus 153: drawer ShConsole membuka EventSource('/wfs-api/events')
dan menghidupkan daftar "log live" dari event {type:'log', data:{...}} — tapi
generasi gateway deployed tidak punya /api/events (backend repo punya, via
execution_logs). Setengah bug ada di proxy :9503 (buffered penuh), setengah
di gateway ini (endpoint absen).

Router ini menghadirkan endpoint SSE tanpa mengganti generasi server.py:

- Sumber data JUJUR: tasks.db (SQLite, URI mode=ro) TIDAK punya tabel
  execution_logs → event log DITURUNKAN dari tabel tasks dgn format pesan yang
  SAMA persis dgn /api/sh/overview (siklus 153): "Task #N 'judul' -> status".
  Tidak ada log yang mengarang; flag `derived:true` di event connected.
- Kontrak wire = backend/server.py _event_stream() repo:
  `data: {"type":"log","data":{id,message,level,source,project_id,created_at}}`
  (frontend ShConsole.jsx: JSON.parse(ev.data) → j.type==='log' && j.data).
- Perilaku stream = backend/server.py repo: event `connected` segera, TANPA
  backlog historis (last_id = MAX(id) saat connect — hanya perubahan BARU yang
  dialirkan), poll 1 dtk, keepalive komentar `: ping` tiap ~15 dtk agar proxy
  idle-aware tidak memutus stream.
- DB absen/korup → event level 'error' di dalam stream (loud, bukan diam) +
  retry berkala; stream tidak pernah mati karena DB sementara tak terbaca.
- Import: dipasang oleh scripts/apply_events.py (marker + include_router).
  Tidak ada operasi tulis; task engine tidak disentuh.
"""
import asyncio
import json
import os
import sqlite3
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

POLL_INTERVAL = 1.0   # detik antar-poll tasks.db (paritas backend/server.py repo)
PING_EVERY = 15       # poll tanpa aktivitas sebelum komentar keepalive dikirim


def _db_path() -> str:
    """DB tasks milik gateway (folder modul di produksi); env override utk test."""
    return os.environ.get("WFS_TASKS_DB") or str(Path(__file__).resolve().parent / "tasks.db")


def _initial_last_id(db_path: str) -> int:
    """Paritas backend/server.py repo: tanpa backlog — MAX(id) saat connect."""
    if not Path(db_path).exists():
        raise FileNotFoundError(f"tasks.db tidak ditemukan: {db_path}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
    try:
        return int(conn.execute("SELECT COALESCE(MAX(id),0) FROM tasks").fetchone()[0] or 0)
    finally:
        conn.close()


def _fetch_new_rows(db_path: str, last_id: int, limit: int = 20):
    """Baris tasks dgn id > last_id (ASC) — bentuk paritas recent_logs 153."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5)
    try:
        return conn.execute(
            "SELECT id, title, status, agent_id, project, COALESCE(updated, created) AS ts"
            " FROM tasks WHERE id > ? ORDER BY id ASC LIMIT ?",
            (last_id, limit),
        ).fetchall()
    finally:
        conn.close()


def task_event(row) -> dict:
    """Baris tasks → payload event (kontrak frontend ShConsole)."""
    rid, title, status, agent, project, ts = row
    return {
        "id": rid,
        "message": f"Task #{rid} '{title}' -> {status}",
        "level": "info",
        "source": agent or "system",
        "project_id": project,  # TEXT di generasi deployed (repo: int) — frontend tak membacanya
        "created_at": ts,
    }


def sse_line(evt: dict) -> str:
    """Satu frame SSE — JSON satu baris (escape bawaan json), diakhiri blank line."""
    return "data: " + json.dumps(evt) + "\n\n"


def error_event(msg: str) -> dict:
    return {"type": "log", "data": {"id": -1, "message": msg, "level": "error",
                                    "source": "system", "project_id": None, "created_at": None}}


async def _stream_gen(db_path: str):
    """Generator SSE — dipakai langsung oleh endpoint & unit test.

    Loop tanpa akhir: berhenti via pembatalan task (disconnect klien) atau
    gen.close() (GeneratorExit tidak ditangkap blok except di bawah).
    """
    ping = 0
    try:
        last_id = _initial_last_id(db_path)
    except FileNotFoundError as e:
        last_id = 0
        yield sse_line(error_event(str(e)))
    except sqlite3.Error as e:
        last_id = 0
        yield sse_line(error_event(f"tasks.db tidak terbaca: {e}"))
    else:
        yield sse_line({"type": "connected", "software_house": "WFS PROJECT",
                        "derived": True})
    while True:
        try:
            rows = _fetch_new_rows(db_path, last_id)
        except FileNotFoundError as e:
            yield sse_line(error_event(str(e)))
            await asyncio.sleep(5.0)
            continue
        except sqlite3.Error as e:
            yield sse_line(error_event(f"tasks.db tidak terbaca: {e}"))
            await asyncio.sleep(POLL_INTERVAL)
            continue
        for r in rows:
            last_id = r[0]
            yield sse_line({"type": "log", "data": task_event(r)})
        ping += 1
        if ping >= PING_EVERY:  # keepalive utk proxy/CDN idle-aware
            ping = 0
            yield ": ping\n\n"
        await asyncio.sleep(POLL_INTERVAL)


@router.get("/api/events")
async def events():
    """SSE log live konsol — sumber asli server (turunan tasks.db read-only)."""
    return StreamingResponse(
        _stream_gen(_db_path()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive",
                 "X-Accel-Buffering": "no"},  # nginx-style proxy: jangan buffer
    )
