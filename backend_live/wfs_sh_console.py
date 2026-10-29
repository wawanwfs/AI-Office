#!/usr/bin/env python3
"""WFS gateway produksi (:8787) — endpoint konsol Software House (additive, read-only).

Siklus 153 (ai-office-main): audit menyeluruh endpoint API yang dipanggil
frontend vs yang dilayani gateway deployed menemukan KELAS bug yang sama dgn
siklus 151/152 — drawer ShConsole mengonsumsi 3 endpoint JSON yang 404 permanen:

- /api/sh/overview  → tab "Overview" tidak pernah tampil ("Memuat statistik…"
  selamanya + banner err setelah tiap poll).
- /api/approvals    → tab "Approvals" tidak pernah tampil ("Memuat approval…").
- /api/projects/{pid}/files|file|logs|git, POST exec|sandbox/{action}|
  git/commit → tab "Workspace" hanya bisa diisi lewat endpoint ini; generasi
  gateway ini tidak mengelola workspace container per project.

Endpoint ini menghadirkan SUMBER ASLI server untuk dua yang pertama, tanpa
mengganti generasi server.py dan tanpa menulis ke tasks.db:

- Sumber data: tasks.db (SQLite) lewat URI mode=ro → mustahil menulis/mengunci
  DB produksi; task engine tidak disentuh.
- Kontrak field /api/sh/overview = backend/database.py get_overview() repo:
  projects, tasks, task_by_status, agents, agent_by_status, running_subtasks,
  total_logs, recent_logs[{message, source, level}]. Angka turunan dari data
  nyata tasks.db (flag `derived` di response); agents/agent_by_status =
  paritas /api/status (AGENTS_META + cfg kustom, pola siklus 152), fallback
  distinct agent_id tasks (unit-testable).
- Kontrak field /api/approvals = backend/server.py: {approvals: [...]};
  generasi ini tidak melacak approval → {approvals: [], available: false}
  (JUJUR kosong, bukan mengarang baris) — tab menampilkan "Tidak ada approval
  pending", bukan banner error.
- /api/projects/{pid}/files|logs|git → 501 + pesan jujur "tidak tersedia di
  gateway generasi ini" (bukan 404 generik): tab Workspace menampilkan pesan
  yang bisa dipahami, alih-alih error samar.
- Import: dipasang oleh scripts/apply_sh_console.py (marker + include_router).
"""
import os
import sqlite3
import sys
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()

LOG_LIMIT = 8  # frontend Overview menampilkan recent_logs ringkas


def _db_path() -> str:
    """DB tasks milik gateway (folder modul di produksi); env override utk test."""
    return os.environ.get("WFS_TASKS_DB") or str(Path(__file__).resolve().parent / "tasks.db")


def _agents_by_status():
    """Paritas /api/status deployed: AGENTS_META semua 'idle' + cfg kustom.

    Deployed /api/status melaporkan `agents: len(AGENTS_META)` + custom_cfg;
    generasi ini tidak menyimpan status agen di DB — nilai status yang jujur
    adalah 'idle' (gateway tidak menjalankan agen di task engine ini).
    Fallback deterministic: distinct agent_id di tasks (unit-testable).
    """
    for name in ("server", "__main__"):
        srv = sys.modules.get(name)
        try:
            meta = getattr(srv, "AGENTS_META", None)
        except Exception:
            meta = None
        if meta:
            by = {"idle": int(len(meta))}
            try:
                load_cfg = getattr(srv, "load_cfg", None)
                if load_cfg:
                    extra = [k for k in (load_cfg() or {}) if k not in meta]
                    if extra:
                        by["idle"] += len(extra)
            except Exception:
                pass
            return by
    return None  # pemanggil fallback ke distinct agent_id


def build_overview(db_path: str | None = None) -> dict:
    """Ringkasan konsol dari SQLite (read-only) — gagal LOUD bila DB absen/korup."""
    path = db_path or _db_path()
    if not Path(path).exists():
        raise FileNotFoundError(f"tasks.db tidak ditemukan: {path}")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
    try:
        cur = conn.cursor()

        def one(sql: str) -> int:
            return int(cur.execute(sql).fetchone()[0])

        task_by = {r[0]: int(r[1]) for r in cur.execute(
            "SELECT status, COUNT(*) FROM tasks GROUP BY status")}
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
                    "message": f"Task #{rid} '{title}' -> {status}",
                    "source": agent or "system",
                    "level": "info",
                })
        except Exception:
            logs = []  # log pelengkap — hitungan inti tetap dikembalikan

        agents_by = _agents_by_status()
        if agents_by is None:
            try:
                agents_by = {"idle": int(cur.execute(
                    "SELECT COUNT(DISTINCT agent_id) FROM tasks"
                    " WHERE agent_id IS NOT NULL AND agent_id != ''"
                ).fetchone()[0])}
            except Exception:
                agents_by = {}
        return {
            "software_house": "WFS PROJECT",
            "projects": one("SELECT COUNT(*) FROM projects"),
            "tasks": sum(task_by.values()),
            "task_by_status": task_by,
            "agents": sum(agents_by.values()),
            "agent_by_status": agents_by,
            "running_subtasks": one(
                "SELECT COUNT(*) FROM tasks WHERE status = 'running'"),
            "total_logs": one("SELECT COUNT(*) FROM tasks"),
            "derived": True,  # angka diturunkan dari tasks.db read-only
            "recent_logs": logs,
        }
    finally:
        conn.close()


@router.get("/api/sh/overview")
def sh_overview():
    return build_overview()


@router.get("/api/approvals")
def sh_approvals():
    # Generasi gateway ini tidak melacak approval (backend repo punya tabel
    # approvals; tasks.db deployed tidak). Kosong yang JUJUR + flag.
    return {"approvals": [], "available": False,
            "note": "gateway generasi ini tidak melacak approval"}


@router.get("/api/projects/{pid}/files")
def ws_files(pid: int):
    raise _ws_unavailable()


@router.get("/api/projects/{pid}/file")
def ws_file(pid: int):
    raise _ws_unavailable()


@router.get("/api/projects/{pid}/logs")
def ws_logs(pid: int):
    raise _ws_unavailable()


@router.get("/api/projects/{pid}/git")
def ws_git(pid: int):
    raise _ws_unavailable()


def _ws_unavailable():
    from fastapi import HTTPException
    return HTTPException(
        501, "Workspace project tidak tersedia di gateway generasi ini "
             "(butuh generasi server.py repo — migration terpisah)")
