# Endpoint proyek nyata dibantuin.com: agregasi data live dari gateway (8787) + SaaS (8000) + OmniRoute (20128).
# Kredensial SaaS TIDAK pernah dikirim ke frontend — semua fetch dilakukan sisi server di sini.
import json as _json
import os as _os
import pathlib as _pathlib
import urllib.request as _ureq

_SAAS_ENV = _os.path.join(_os.path.expanduser("~"), "wfs-office/saas-dibantuin/.env")
_cache = {"t": 0.0, "data": None}
_TTL = 15  # detik


def _saas_token():
    env = {}
    try:
        for line in open(_SAAS_ENV):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v
    except Exception:
        return None
    pw = env.get("ADMIN_PASSWORD")
    if not pw:
        return None
    try:
        req = _ureq.Request(
            "http://127.0.0.1:8000/api/auth/login",
            data=_json.dumps({"username": "admin", "password": pw}).encode(),
            headers={"Content-Type": "application/json"},
        )
        return _json.load(_ureq.urlopen(req, timeout=8)).get("access_token")
    except Exception:
        return None


def _get(url, headers=None, timeout=8):
    req = _ureq.Request(url, headers=headers or {})
    with _ureq.urlopen(req, timeout=timeout) as r:
        return _json.load(r)


def project_snapshot():
    """Ringkasan proyek dibantuin.com live: task engine + SaaS + sandbox + OmniRoute."""
    import time
    now = time.time()
    if _cache["data"] and now - _cache["t"] < _TTL:
        return _cache["data"]

    snap = {
        "project": "dibantuin.com",
        "tasks": {"done": 0, "pending": 0, "running": 0, "failed": 0, "review": 0, "total": 0, "recent": []},
        "saas": {"online": False},
        "agents": [],
        "omniroute": {"online": False, "port": 20128},
        "updated": int(now),
    }

    # 1) Task engine (gateway 8787, tanpa auth)
    try:
        t = _get("http://127.0.0.1:8787/api/tasks")
        tasks = t.get("tasks", t) if isinstance(t, dict) else t
        for x in tasks:
            s = x.get("status", "?")
            if s in snap["tasks"]:
                snap["tasks"][s] += 1
            snap["tasks"]["total"] += 1
        snap["tasks"]["recent"] = [
            {"id": x.get("id"), "title": x.get("title") or x.get("description", ""),
             "status": x.get("status")} for x in tasks[-8:]
        ]
    except Exception:
        pass

    # 2) SaaS bantuin (backend :8000, butuh login admin — di sisi server saja)
    tok = _saas_token()
    if tok:
        h = {"Authorization": "Bearer " + tok}
        try:
            st = _get("http://127.0.0.1:8000/api/admin/stats", h)
            tn = _get("http://127.0.0.1:8000/api/admin/tenants", h)
            snap["saas"] = {
                "online": True,
                "stats": st,
                "tenants": tn if isinstance(tn, list) else tn.get("tenants", []),
            }
        except Exception:
            pass

    # 3) Sandbox agent (docker) — status via docker ps
    try:
        out = _os.popen("docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null").read()
        for line in out.splitlines():
            if line.startswith("wfs-agent-"):
                n, s = line.split("|", 1)
                snap["agents"].append({"name": n.replace("wfs-agent-", ""), "status": s.split()[0]})
    except Exception:
        pass

    # 4) OmniRoute AI Router (:20128)
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
