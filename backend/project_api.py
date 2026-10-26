# Endpoint proyek WFS PROJECT — Software House: data live dari database SQLite + Docker sandbox + OmniRoute.
import json as _json
import os as _os
import pathlib as _pathlib
import urllib.request as _ureq

_cache = {"t": 0.0, "data": None}
_TTL = 10  # detik

def project_snapshot():
    """Ringkasan WFS PROJECT live: Docker sandboxes + tasks + OmniRoute."""
    import time
    now = time.time()
    if _cache["data"] and now - _cache["t"] < _TTL:
        return _cache["data"]

    snap = {
        "project": "WFS PROJECT",
        "tasks": {"done": 0, "pending": 0, "running": 0, "failed": 0, "review": 0, "total": 0, "recent": []},
        "saas": {"online": True, "stats": {"projects": 0, "tasks": 0}},
        "agents": [],
        "omniroute": {"online": False, "port": 20128},
        "updated": int(now),
    }

    # 1) Database WFS PROJECT SQLite
    try:
        import sqlite3
        dbp = _os.path.expanduser("~/wfs-projects/wfs_software_house.db")
        if _os.path.exists(dbp):
            c = sqlite3.connect(dbp)
            cur = c.cursor()
            cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'completed'")
            snap["tasks"]["done"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM tasks WHERE status = 'running'")
            snap["tasks"]["running"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM tasks")
            snap["tasks"]["total"] = cur.fetchone()[0]
            cur.execute("SELECT id, title, status FROM tasks ORDER BY created_at DESC LIMIT 8")
            snap["tasks"]["recent"] = [{"id": r[0], "title": r[1], "status": r[2]} for r in cur.fetchall()]
            c.close()
        if snap["tasks"]["total"] == 0:
            req = _ureq.Request("http://127.0.0.1:8787/api/tasks", headers={"User-Agent": "WFS-HQ"})
            with _ureq.urlopen(req, timeout=3) as gr:
                gdata = _json.loads(gr.read().decode())
                gtasks = gdata.get("tasks") or []
                if gtasks:
                    snap["tasks"]["total"] = len(gtasks)
                    snap["tasks"]["done"] = sum(1 for x in gtasks if x.get("status") in ("done", "completed"))
                    snap["tasks"]["running"] = sum(1 for x in gtasks if x.get("status") in ("running", "in_progress"))
                    snap["tasks"]["recent"] = [{"id": x.get("id"), "title": x.get("title"), "status": x.get("status")} for x in gtasks[:8]]
    except Exception:
        pass

    # 2) Sandbox containers (docker) — status via docker ps
    try:
        out = _os.popen("docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null").read()
        for line in out.splitlines():
            if line.startswith("wfs-sandbox-") or line.startswith("wfs-agent-"):
                n, s = line.split("|", 1)
                snap["agents"].append({
                    "name": n.replace("wfs-sandbox-", "sbx-").replace("wfs-agent-", "sbx-"),
                    "status": s.split()[0]
                })
    except Exception:
        pass

    # 3) OmniRoute AI Router (:20128)
    try:
        req = _ureq.Request("http://127.0.0.1:20128/", headers={"User-Agent": "WFS-HQ"})
        with _ureq.urlopen(req, timeout=3) as r:
            if r.getcode() in (200, 307):
                snap["omniroute"] = {"online": True, "port": 20128}
    except Exception:
        pass

    _cache["t"] = now
    _cache["data"] = snap
    return snap


def handle_project(self):
    """GET /wfs-project/* dari handler server 9503."""
    try:
        data = _json.dumps(project_snapshot()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    except Exception as e:
        msg = _json.dumps({"error": str(e)}).encode()
        self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)
