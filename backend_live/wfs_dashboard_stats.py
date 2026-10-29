#!/usr/bin/env python3
"""WFS gateway produksi (:8787) — GET /api/dashboard/stats (additive, READ-ONLY).

Siklus 152 (ai-office-main): gateway deployed :8787 adalah generasi file lain
(472 baris) dari backend/server.py repo (972 baris) — tanpa endpoint
dashboard/stats → proxy :9503/wfs-api/dashboard/stats 404 permanen → grid
Dashboard produksi tak pernah muncul (fallback frontend siklus 151 menurunkan
angka dari tasks/projects/status). Endpoint ini menghadirkan SUMBER ASLI di
server tanpa mengganti generasi server.py.

- Sumber data: tasks.db (SQLite) lewat URI mode=ro → mustahil menulis/mengunci
  DB produksi; TIDAK menyentuh task engine.
- Kontrak field = backend/api_service.py: software_house, projects_total,
  projects_running, tasks_total, tasks_running, tasks_completed, agents_count,
  logs[{id, timestamp, message}]. Superset aman di row log: source, level.
- agents_count: paritas dgn /api/status (AGENTS_META + cfg kustom) bila modul
  server induk tersedia; fallback: distinct agent_id di tasks (unit-testable).
- Import: dipasang oleh scripts/apply_dashboard_stats.py (marker + include_router).
"""
import os
import sqlite3
import sys
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

LOG_LIMIT = 15


def _db_path() -> str:
    """DB tasks milik gateway (folder modul di produksi); env override utk test."""
    return os.environ.get("WFS_TASKS_DB") or str(Path(__file__).resolve().parent / "tasks.db")


def _agents_count(cur) -> int:
    """Jumlah agen terdaftar — paritas /api/status; fallback deterministic."""
    # Produksi: server.py jalan sebagai __main__ (uvicorn), bukan modul "server".
    for name in ("server", "__main__"):
        srv = sys.modules.get(name)
        meta = None
        try:
            meta = getattr(srv, "AGENTS_META", None)
        except Exception:
            meta = None
        if meta:
            extra = 0
            try:
                load_cfg = getattr(srv, "load_cfg", None)
                if load_cfg:
                    extra = len([k for k in (load_cfg() or {}) if k not in meta])
            except Exception:
                extra = 0
            return int(len(meta) + extra)
    try:
        return int(cur.execute(
            "SELECT COUNT(DISTINCT agent_id) FROM tasks"
            " WHERE agent_id IS NOT NULL AND agent_id != ''"
        ).fetchone()[0])
    except Exception:
        return 0


def build_stats(db_path: str | None = None) -> dict:
    """Angka nyata dari SQLite (read-only) — gagal LOUD bila DB absen/korup."""
    path = db_path or _db_path()
    if not Path(path).exists():
        raise FileNotFoundError(f"tasks.db tidak ditemukan: {path}")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    try:
        cur = conn.cursor()

        def one(sql: str) -> int:
            return int(cur.execute(sql).fetchone()[0])

        logs = []
        try:
            rows = cur.execute(
                "SELECT id, title, status, agent_id, COALESCE(updated, created) AS ts"
                " FROM tasks ORDER BY COALESCE(updated, created) DESC, id DESC LIMIT ?",
                (LOG_LIMIT,),
            ).fetchall()
            for rid, title, status, agent, ts in rows:
                logs.append({
                    "id": rid,
                    "timestamp": ts,
                    "message": f"Task #{rid} '{title}' -> {status}",
                    "source": agent or "system",
                    "level": "info",
                })
        except Exception:
            logs = []  # log adalah pelengkap — hitungan inti tetap dikembalikan

        return {
            "software_house": "WFS PROJECT",
            "projects_total": one("SELECT COUNT(*) FROM projects"),
            "projects_running": one("SELECT COUNT(*) FROM projects WHERE status = 'running'"),
            "tasks_total": one("SELECT COUNT(*) FROM tasks"),
            "tasks_running": one("SELECT COUNT(*) FROM tasks WHERE status = 'running'"),
            "tasks_completed": one(
                "SELECT COUNT(*) FROM tasks WHERE status IN ('done','completed')"),
            "agents_count": _agents_count(cur),
            "logs": logs,
        }
    finally:
        conn.close()


@router.get("/api/dashboard/stats")
def dashboard_stats():
    return build_stats()
