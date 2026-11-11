"""API Service & Reverse Proxy Router for WFS PROJECT - Autonomous AI Software House.
Provides full REST API endpoints and reverse proxy for live container previews.

SATU SUMBER api_service produksi wfs-hq (:9503) — siklus 207 (pola 206).

Latar belakang (audit drift siklus 207):
- backend/api_service.py (repo) punya hardening 2026-10-28 (_content_length
  toleran + MAX_API_BODY 5MB → 413) TAPI TANPA fitur live: endpoint DELETE
  /api/tasks (reset bersih) + DELETE /api/tasks/{id} yang hidup di produksi.
- ~/wfs-hq/api_service.py (produksi) punya fitur DELETE reset tersebut tapi
  TANPA hardening → int() telanjang Content-Length + read(ln) tanpa cap di
  jalur POST /api/* (header malformed = ValueError bunuh handler; body
  raksasa dibaca ke RAM).
- File ini = SUPERSET keduanya: fitur live eksak + hardening hidup di jalur
  POST. Ter-track di git, dites backend_live/test_wfs_api_service.py dan
  drift-gate src/__tests__/hq_api_service_drift.test.js.

DEPLOY: python3 scripts/apply_wfs_api_service.py --apply
(backup → compile-check → restart wfs-hq → smoke → auto-rollback).
JANGAN mengedit ~/wfs-hq/api_service.py langsung — drift gate vitest akan FAIL.
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

# Jalur import 3-tingkat (pola wfs_sh_console.py): (1) paket (git checkout
# produksi), (2) flat di backend_live (pytest superset) — database.py repo
# disediakan via sys.path, (3) flat di ~/wfs-hq (produksi).
_REPO_BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if _REPO_BACKEND not in sys.path:
    sys.path.append(_REPO_BACKEND)

try:
    from .database import (
        list_projects, get_project, save_project, get_db, list_agents, get_recent_logs, log_event
    )
    from .docker_sandbox import DockerSandboxManager
    from .orchestrator import TaskOrchestrator
except (ImportError, ValueError):
    from database import (
        list_projects, get_project, save_project, get_db, list_agents, get_recent_logs, log_event
    )
    from docker_sandbox import DockerSandboxManager
    from orchestrator import TaskOrchestrator

MAX_API_BODY = 5 * 1024 * 1024


def _content_length(headers):
    """Parse Content-Length toleran: invalid/negatif → 0.

    Pola sama dgn hq_proxy._parse_content_length / server._clamp_int — header
    malformed tidak boleh melempar ValueError (int() telanjang) yang membunuh handler.
    """
    try:
        n = int(headers.get("Content-Length", 0))
    except (TypeError, ValueError):
        return 0
    return n if n >= 0 else 0


def handle_api_request(handler, method, path):
    """
    Dispatches /api/* and /preview/* requests.
    Returns True if handled, False otherwise.
    """
    # ── 1. PREVIEW REVERSE PROXY: /preview/{project_id}/... ──
    if path.startswith("/preview/"):
        rest = path[len("/preview/"):]
        if "/" not in rest:
            # Redirect to trailing slash for proper relative asset resolution
            handler.send_response(302)
            handler.send_header("Location", f"/preview/{rest}/")
            handler.end_headers()
            return True

        parts = rest.split("/", 1)
        proj_id = parts[0]
        subpath = parts[1] if len(parts) > 1 and parts[1] else "index.html"

        proj = get_project(proj_id)
        if not proj or not proj.get("preview_port"):
            msg = b"<h1>Preview Unavailable</h1><p>Project sandbox is not running.</p>"
            handler.send_response(404)
            handler.send_header("Content-Type", "text/html; charset=utf-8")
            handler.send_header("Content-Length", str(len(msg)))
            handler.end_headers()
            handler.wfile.write(msg)
            return True

        target_url = f"http://127.0.0.1:{proj['preview_port']}/{subpath}"
        try:
            req = urllib.request.Request(target_url, headers={"User-Agent": "WFS-Proxy"})
            with urllib.request.urlopen(req, timeout=5) as r:
                data = r.read()
                handler.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() not in ("content-encoding", "transfer-encoding", "content-length"):
                        handler.send_header(k, v)
                handler.send_header("Content-Length", str(len(data)))
                handler.end_headers()
                handler.wfile.write(data)
                return True
        except Exception as e:
            msg = f"<h1>Preview Error</h1><p>{str(e)}</p>".encode("utf-8")
            handler.send_response(502)
            handler.send_header("Content-Type", "text/html; charset=utf-8")
            handler.send_header("Content-Length", str(len(msg)))
            handler.end_headers()
            handler.wfile.write(msg)
            return True

    # ── 2. REST API: /api/* ──
    if not path.startswith("/api/"):
        return False

    api_path = path[len("/api/"):].split("?")[0].strip("/")
    query = {}
    if "?" in path:
        qstr = path.split("?", 1)[1]
        for part in qstr.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                query[k] = urllib.parse.unquote(v)

    body = {}
    if method == "POST":
        ln = _content_length(handler.headers)
        if ln > MAX_API_BODY:
            # Cegah memory DoS via header Content-Length palsu (pola sama dgn hq_proxy 413).
            msg = json.dumps({"error": "payload terlalu besar"}).encode("utf-8")
            handler.send_response(413)
            handler.send_header("Content-Type", "application/json")
            handler.send_header("Content-Length", str(len(msg)))
            handler.end_headers()
            handler.wfile.write(msg)
            return True
        if ln > 0:
            raw = handler.rfile.read(ln)
            try:
                body = json.loads(raw.decode("utf-8"))
            except Exception:
                body = {}

    def send_json(data, status=200):
        payload = json.dumps(data).encode("utf-8")
        # Siklus 438: API JSON (mis. /api/agents ~4 KB) dikirim uncompressed —
        # Lighthouse menandai "No compression applied" untuk dokumen, tapi
        # payload API juga boros bandwidth. Gzip on-the-fly bila client
        # mendukung & hasil lebih kecil (pola gzip_html 434).
        try:
            import static_serve
            payload, gz = static_serve.gzip_html(
                payload, handler.headers.get("Accept-Encoding", ""))
        except Exception:
            gz = False
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json")
        # Siklus 445: hindari Cache-Control ganda — end_headers() default sudah
        # mengirim no-store; set _wfs_cc (pola 444), bukan send_header eksplisit.
        handler._wfs_cc = "no-store"
        handler.send_header("Access-Control-Allow-Origin", "*")
        if gz:
            handler.send_header("Content-Encoding", "gzip")
            handler.send_header("Vary", "Accept-Encoding")
        handler.send_header("Content-Length", str(len(payload)))
        handler.end_headers()
        handler.wfile.write(payload)

    # ── SSE REAL-TIME EVENTS: /api/events ──
    if api_path == "events" and method == "GET":
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream")
        handler._wfs_cc = "no-cache"  # Siklus 445: satu Cache-Control saja
        handler.send_header("Connection", "keep-alive")
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.end_headers()
        try:
            init_msg = json.dumps({"type": "connected", "software_house": "WFS PROJECT"}).encode("utf-8")
            handler.wfile.write(b"data: " + init_msg + b"\n\n")
            handler.wfile.flush()
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM execution_logs ORDER BY id DESC LIMIT 15")
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            for r in reversed(rows):
                evt = json.dumps({"type": "log", "data": r}).encode("utf-8")
                handler.wfile.write(b"data: " + evt + b"\n\n")
            handler.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        return True

    # ── PROJECTS ──
    if api_path == "projects":
        if method == "GET":
            send_json({"projects": list_projects()})
            return True
        elif method == "POST":
            name = body.get("name", "New Project")
            ptype = body.get("project_type", "website")
            desc = body.get("description", "")
            plan = TaskOrchestrator.plan_task(desc or f"Create {name}", project_name=name, task_type=ptype)
            send_json(plan, status=201)
            return True

    if api_path.startswith("projects/"):
        sub = api_path[len("projects/"):].split("/")
        pid = sub[0]

        if len(sub) == 1:
            # GET /api/projects/{id}
            proj = get_project(pid)
            if proj:
                send_json(proj)
            else:
                send_json({"error": "Project not found"}, 404)
            return True

        action = sub[1]
        if action == "files" and method == "GET":
            ws = DockerSandboxManager.get_workspace_path(pid)
            files = []
            for root, _, fnames in os.walk(ws):
                for fn in fnames:
                    rel = os.path.relpath(os.path.join(root, fn), ws)
                    files.append(rel)
            send_json({"files": sorted(files)})
            return True

        elif action == "file":
            rel_path = query.get("path") or body.get("path")
            if not rel_path:
                send_json({"error": "Missing path parameter"}, 400)
                return True

            ws = DockerSandboxManager.get_workspace_path(pid)
            target = os.path.realpath(os.path.join(ws, rel_path))
            if not target.startswith(os.path.realpath(ws) + os.sep) and target != os.path.realpath(ws):
                send_json({"error": "Path traversal denied"}, 403)
                return True

            if method == "GET":
                if os.path.isfile(target):
                    with open(target, "r", encoding="utf-8", errors="replace") as f:
                        send_json({"path": rel_path, "content": f.read()})
                else:
                    send_json({"error": "File not found"}, 404)
                return True
            elif method == "POST":
                content = body.get("content", "")
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as f:
                    f.write(content)
                send_json({"status": "saved", "path": rel_path})
                return True

        elif action == "container" and len(sub) > 2 and method == "POST":
            c_act = sub[2]
            if c_act == "start":
                res = DockerSandboxManager.start_container(pid)
                proj = get_project(pid)
                if proj:
                    proj["container_id"] = res["container_id"]
                    proj["preview_port"] = res["port"]
                    proj["preview_url"] = res["preview_url"]
                    proj["status"] = "running"
                    save_project(proj)
                send_json(res)
                return True
            elif c_act == "stop":
                res = DockerSandboxManager.stop_container(pid)
                proj = get_project(pid)
                if proj:
                    proj["status"] = "stopped"
                    save_project(proj)
                send_json(res)
                return True
            elif c_act == "restart":
                res = DockerSandboxManager.restart_container(pid)
                send_json(res)
                return True

        elif action == "logs" and method == "GET":
            logs = DockerSandboxManager.get_logs(pid)
            send_json({"logs": logs})
            return True

        elif action == "terminal" and method == "POST":
            # The public HTML UI token is not authorization for host execution.
            send_json({"error": "Legacy terminal execution is disabled",
                       "capability": "disabled"}, 410)
            return True

    # ── TASKS ──
    if api_path == "tasks":
        if method == "GET":
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks ORDER BY created_at DESC")
            tasks = [dict(r) for r in cur.fetchall()]
            conn.close()
            send_json({"tasks": tasks})
            return True
        elif method == "POST":
            instr = body.get("instruction", "")
            pname = body.get("project_name")
            ptype = body.get("task_type", "website")
            plan = TaskOrchestrator.plan_task(instr, project_name=pname, task_type=ptype)
            send_json(plan, status=201)
            return True

    # ── RESET / BERSIHKAN TASK (fitur live produksi, siklus 207) ──
    if api_path == "tasks" and method == "DELETE":
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM tasks")
        n = cur.fetchone()[0]
        with conn:
            conn.execute("DELETE FROM subtasks")
            conn.execute("DELETE FROM tasks")
            conn.execute("DELETE FROM projects")
            conn.execute("DELETE FROM execution_logs")
            conn.execute("UPDATE agents SET status='idle', current_task_id=NULL")
        conn.close()
        log_event(f"Reset data: {n} task dibersihkan — sistem siap tugas nyata baru", level="INFO", source="system")
        send_json({"ok": True, "cleared_tasks": n, "message": f"{n} task + project + log dibersihkan. Sistem siap untuk tugas nyata."})
        return True

    if api_path.startswith("tasks/") and api_path.count("/") == 1 and method == "DELETE":
        tid = api_path.split("/")[1]
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM subtasks WHERE task_id = ?", (tid,))
        cur.execute("DELETE FROM tasks WHERE id = ?", (tid,))
        conn.commit()
        left = cur.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        conn.close()
        send_json({"ok": True, "remaining": left})
        return True

    if api_path.startswith("tasks/") and api_path.endswith("/execute") and method == "POST":
        send_json({"error": "Legacy demo orchestrator execution is disabled",
                   "capability": "disabled"}, 410)
        return True

    # ── AGENTS ──
    if api_path == "agents" and method == "GET":
        send_json({"agents": list_agents()})
        return True

    # ── DASHBOARD STATS ──
    if api_path == "dashboard/stats" and method == "GET":
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM projects")
        total_p = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM projects WHERE status = 'running'")
        running_p = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM tasks")
        total_t = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'completed'")
        done_t = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'running'")
        running_t = cur.fetchone()[0]
        conn.close()

        send_json({
            "software_house": "WFS PROJECT",
            "projects_total": total_p,
            "projects_running": running_p,
            "tasks_total": total_t,
            "tasks_running": running_t,
            "tasks_completed": done_t,
            "agents_count": len(list_agents()),
            "logs": get_recent_logs(15)
        })
        return True

    return False
