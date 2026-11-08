#!/usr/bin/env python3
"""WFS gateway produksi :8787 — SUPERSET server.py (siklus 209, pola 206/207/208).

Satu sumber kebenaran server.py produksi gateway :8787 (~/wfs-office/server.py).
Deploy HANYA via scripts/apply_wfs_server.py --apply (backup -> compile-check ->
restart -> smoke 2 fase -> auto-rollback). Drift gate vitest: server_drift.test.js
(wajib sha identik, uji negatif menggigit).

Latar audit drift siklus 209 (drift ekstrem dua arah, terbesar):
- backend/server.py (repo, 972 baris) = generasi hardened: lifespan
  recover_interrupted, approval-gate di semua pintu eksekusi (_check_task ->
  require_launch_approval), _schedule dgn claim_task fcntl + rollback
  reservasi, pause PERSISTEN via taskengine.is_paused/set_paused (DB
  engine_state), api_resume_all yang tidak menghapus pause saat ditolak,
  parser /proc toleran (_parse_meminfo/_parse_uptime_s/_parse_loadavg),
  _clamp_int, api_config key tidak pernah bocor, workspace
  _safe_resolve/_workspace_private anti path-traversal + git-commit
  hardening, /api/system/resources anti-poisoning, static 503 jujur.
  TAPI TANPA fitur live: load_default env WFS_AI_* default openai,
  AGENTS_META/ROLE_PROMPTS generik (ai-cs "WFS Assistant"), /api/projects
  wajib database.py, tanpa router wfs_events/sh_console/dashboard_stats,
  root = static/UI bukan redirect :9503.
- ~/wfs-office/server.py (produksi :8787, 484 baris) = fitur-rich live:
  load_default ~/.hermes/.env (CUSTOM_API_KEY, base token.lightvela.ai,
  model 'auto'), ai-cs = Bantuin AI dibantuin.com, root redirect
  100.117.198.46:9503, include router wfs_events + wfs_sh_console +
  wfs_dashboard_stats + orders. TAPI: pause in-memory (_PAUSED) hilang saat
  restart (bukti live 208: DB paused=1 -> endpoint tetap false), TANPA
  approval-gate/pause-persisten/claim fcntl di server, /api/projects tanpa
  merge sandbox, parser /proc telanjang (500 pada format aneh), int(timeout)
  telanjang di sandbox exec.

Keputusan superset (fitur live eksak + hardening hidup):
- load_default = taskengine.load_default() (satu sumber dgn engine 208 —
  ~/.hermes/.env CUSTOM_API_KEY, base token.lightvela.ai, model 'auto').
- AGENTS_META/ROLE_PROMPTS/AGENT_COLORS = versi LIVE EKSAK (ai-cs Bantuin AI
  dibantuin.com) — kontrak wire yang benar-benar dikonsumsi frontend produksi.
- Mode ganda berbasis ketersediaan database.py software house (guarded):
  * Mode REPO (database.py importable — git checkout/backend_live): semua
    endpoint repo native (workspace, approvals, preview proxy, events SSE
    dari execution_logs, sandbox provisioning, approval seed).
  * Mode LIVE (database.py absen — produksi gateway): fallback eksak live —
    /api/projects = taskengine.list_projects(), /api/new_project = planning
    tanpa sandbox, workspace endpoints 501 jujur (kontrak router sh_console),
    /api/sh/overview + /api/approvals + /api/events dari routers live
    (wfs_sh_console/wfs_events, read-only tasks.db). Import router guarded:
    checkout API-only tanpa file itu tetap start.
- /api/tasks/paused -> taskengine.is_paused() SELALU (FIX PRODUKSI #2:
  pause persisten terbaca dari DB engine_state, bukan in-memory).
- approval-gate + _schedule + claim fcntl + recover_interrupted SELALU
  (hardening mesin berbayar).
- Root "/" = redirect live eksak ke 100.117.198.46:9503 (UI tunggal :9503);
  static TIDAK pernah dilayani gateway (persis live). Checkout API-only
  tanpa static -> catch-all 503 jujur "not built" (hardening repo).
- sandbox exec timeout: _clamp_int (hardening; live int() telanjang).
- orders.py & tasks.py & routers = superset backend_live (siklus 206/208) —
  import flat persis produksi.

Smoke deploy (scripts/apply_wfs_server.py) fase-2 membuktikan fix #2 lewat
HTTP: set DB paused=1 -> GET /api/tasks/paused harus {"paused": true}
(server lama: false) + POST /api/tasks/1/run saat paused -> 409 via HTTP.
"""
import json, os, re, time, asyncio, pathlib, subprocess
from typing import Optional, Union
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel

BASE = pathlib.Path(__file__).parent
CFG_DIR = BASE / "config"
CFG_DIR.mkdir(exist_ok=True)
CFG_FILE = CFG_DIR / "agents.json"

# ---------- TASK ENGINE — satu sumber produksi :8787 (siklus 208) ----------
import tasks as taskengine
from orders import router as orders_router


# ---------- default AI (Hermes) ----------
def load_default():
    """Fitur live eksak: delegasi ke taskengine.load_default() (siklus 208) —
    ~/.hermes/.env CUSTOM_BASE_URL/CUSTOM_API_KEY, model 'auto'; override env
    WFS_AI_* tetap didukung. Satu sumber dgn engine: konfigurasi chat dan
    eksekusi mustahil berbeda."""
    return taskengine.load_default()


DEFAULT_AI = load_default()


# ---------- WFS Software House — persistent state (guarded, fallback Live) ----------
def _load_sh_db():
    """database.py software house: importable -> mode REPO; absen -> mode LIVE.

    Produksi gateway :8787 tidak membawa database.py (state SH ada di wfs-hq).
    Try/except Exception (bukan cuma ImportError): database.py setengah rusak
    (SyntaxError dll) juga jatuh ke mode Live, bukan menabrak startup —
    tapi require_launch_approval engine tetap LOUD (siklus 208).
    """
    try:
        import database  # noqa: F401
        return database
    except Exception:
        return None


SH_DB = _load_sh_db()
if SH_DB is not None:
    SH_DB.init_db()


# Routers live (read-only tasks.db) — hanya dipasang di mode LIVE.
# Import guarded: checkout API-only tanpa file router tetap start (503 jujur).
_wfs_ev = _wfs_shc = _wfs_stats = None
if SH_DB is None:
    try:
        import wfs_events as _wfs_ev
    except Exception:
        _wfs_ev = None
    try:
        import wfs_sh_console as _wfs_shc
    except Exception:
        _wfs_shc = None
    try:
        import wfs_dashboard_stats as _wfs_stats
    except Exception:
        _wfs_stats = None

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app):
    taskengine.recover_interrupted()
    yield


# Siklus 217: introspeksi API DITUTUP — /docs, /redoc, /openapi.json = 404.
# Tidak dikonsumsi UI/skrip mana pun (census grep src/ scripts/ backend_live = 0
# referensi); permukaan introspeksi sia-sia bagi klien, mempermudah pemetaan
# endpoint oleh pihak luar di LAN/Tailscale. docs_url/redoc_url/openapi_url
# None = FastAPI tidak mendaftarkan rute itu sama sekali (bukan 404 dinamis).
app = FastAPI(
    title="WFS Virtual Office Gateway",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


# ---------- HEAD mirror (siklus 227, pola 226) ----------
# FastAPI APIRoute tidak mendaftarkan HEAD otomatis — SEMUA endpoint GET
# menjawab HEAD 405 Method Not Allowed (bukti live siklus 227:
# HEAD /api/health = 405 allow: GET padahal GET 200 json). Monitor/uptime
# berbasis HEAD menerima "service down" palsu. Pola replay yang sama dengan
# saas-dibantuin :8000 (siklus 226, backend/app/http_head_mirror.py) —
# ditanam langsung di superset karena deploy gateway = SATU file (server.py).
#
# - HEAD pada path ber-rute-GET di-REPLAY: scope diberi method GET, dijalankan
#   lewat app asli (melewati router + middleware berikutnya), body ditelan,
#   lalu status + header dipancarkan ulang dengan Content-Length = panjang
#   body GET eksak dan body kosong.
# - Path tanpa rute GET (POST-only /api/tasks/{tid}/run) TIDAK di-mirror ->
#   405 `allow: POST` asli; path asing tetap 404 asli.
# - Rute yang memang mendaftarkan HEAD dihormati (tidak dioverride).
# - /api/events (SSE streaming) DIKECUALIKAN eksplisit: GET replay akan
#   di-buffer tanpa ujung oleh mirror (streaming tanpa selesai) — HEAD
#   di situ tetap 405 asli, kontrak sama dengan :9503 (SSE dikecualikan).
_STRIP_OUT = (b"content-length", b"transfer-encoding")


class HeadMirrorMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    def _routes(self, scope):
        # scope["app"] di-set Starlette sebelum middleware stack jalan —
        # itu instance FastAPI yang punya .routes lengkap (termasuk router).
        app = scope.get("app")
        if app is not None and hasattr(app, "routes"):
            return list(app.routes)
        # fallback: gulung rantai middleware sampai Router (.routes)
        inner = self.app
        while inner is not None and not hasattr(inner, "routes"):
            inner = getattr(inner, "app", None)
        return list(getattr(inner, "routes", []) or [])

    def _has_get_route(self, scope) -> bool:
        from starlette.routing import Match

        probe = dict(scope)
        probe["method"] = "GET"
        for route in self._routes(scope):
            try:
                if route.matches(probe)[0] == Match.FULL:
                    return True
            except Exception:  # rute eksotis — jangan bunuh request HEAD
                continue
        return False

    def _has_native_head_route(self, scope) -> bool:
        from starlette.routing import Match

        for route in self._routes(scope):
            try:
                if route.matches(scope)[0] == Match.FULL:
                    return True
            except Exception:
                continue
        return False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "HEAD":
            await self.app(scope, receive, send)
            return
        # SSE dikecualikan eksplisit SEBELUM replay (GET streaming tanpa ujung).
        if scope.get("path", "").split("?")[0] == "/api/events":
            await self.app(scope, receive, send)
            return
        if self._has_native_head_route(scope) or not self._has_get_route(scope):
            await self.app(scope, receive, send)
            return

        # PENTING: receive asli TIDAK di-drain. Transport ASGI (uvicorn &
        # TestClient) mem-block receive berikutnya sampai response selesai —
        # loop "await receive()" di sini = deadlock (bukti siklus 226 di
        # :8000). App dalam diberi replay_receive terpisah di bawah; receive
        # asli cukup dibiarkan tak terpakai (request HEAD tanpa body).

        get_scope = dict(scope)
        get_scope["method"] = "GET"
        get_scope["headers"] = [
            (k, v) for (k, v) in scope.get("headers", []) if k.lower() != b"content-length"
        ]

        async def replay_receive():
            # GET replay tidak boleh menggantung menunggu body —
            # balas disconnect instan (semantik body kosong).
            return {"type": "http.disconnect"}

        status = 500
        headers = []
        body = bytearray()

        async def capture(message):
            nonlocal status, headers
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = [
                    (k, v)
                    for (k, v) in message.get("headers", [])
                    if k.lower() not in _STRIP_OUT
                ]
            elif message["type"] == "http.response.body":
                body.extend(message.get("body", b"") or b"")
            # http.response.pathsend / .stream dicerna sebagai tanpa body

        await self.app(get_scope, replay_receive, capture)

        out = list(headers)
        out.append((b"content-length", str(len(body)).encode("ascii")))
        await send({"type": "http.response.start", "status": status, "headers": out})
        await send({"type": "http.response.body", "body": b""})


app.add_middleware(HeadMirrorMiddleware)


# ---------- config per agent ----------
def load_cfg() -> dict:
    if CFG_FILE.exists():
        try:
            return json.loads(CFG_FILE.read_text())
        except Exception:
            pass
    return {}

def save_cfg(cfg: dict):
    tmp = CFG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    os.chmod(tmp, 0o600)
    tmp.replace(CFG_FILE)

def agent_cfg(agent_id: str) -> dict:
    c = load_cfg().get(agent_id, {})
    if c.get("key"):
        return c  # custom per-agent
    # default: AI WFS, model bisa dioverride
    d = dict(DEFAULT_AI)
    d["key"] = c.get("key") or DEFAULT_AI["key"]
    d["model"] = c.get("model") or DEFAULT_AI["model"]
    d["base"] = c.get("base") or DEFAULT_AI["base"]
    return d


def _clamp_int(v, default, lo=None, hi=None):
    """Parse int toleran: invalid -> default, lalu clamp ke rentang [lo, hi]."""
    try:
        n = int(v)
    except (TypeError, ValueError):
        return default
    if lo is not None and n < lo:
        return lo
    if hi is not None and n > hi:
        return hi
    return n


def _parse_meminfo(text):
    """Parse /proc/meminfo -> {MemTotal, MemAvailable} dalam MB, toleran.

    Baris tanpa colon / nilai non-numerik / kosong -> 0 (guard anti-poisoning,
    konsisten dgn pola _clamp_int; tidak pernah melempar pada format tak terduga).
    """
    out = {}
    for line in text.splitlines():
        k, _, v = line.partition(":")
        if k not in ("MemTotal", "MemAvailable"):
            continue
        try:
            kb = int(v.split()[0])
        except (ValueError, IndexError):
            kb = 0
        out[k] = kb // 1024
    return {"MemTotal": out.get("MemTotal", 0), "MemAvailable": out.get("MemAvailable", 0)}


def _parse_uptime_s(text):
    """Parse /proc/uptime -> detik (int), toleran terhadap format tak terduga."""
    try:
        return int(text.split()[0].split(".")[0])
    except (ValueError, IndexError):
        return 0


def _parse_loadavg(text):
    """Parse /proc/loadavg -> nilai load 1 menit (string), toleran.

    Format normal: "0.05 0.10 0.15 1/234 5678" — token pertama adalah load
    1 menit. Input kosong/None/malformed -> "0.00" (guard anti-poisoning,
    pola sama dgn _parse_meminfo; tidak pernah melempar ke pemanggil).
    """
    try:
        return text.split()[0]
    except (IndexError, AttributeError):
        return "0.00"

# ---------- models ----------
class ChatIn(BaseModel):
    agent_id: str
    message: str
    history: list = []          # [{role, content}]
    team_context: Optional[str] = None

class CfgIn(BaseModel):
    base: Optional[str] = ""
    key: Optional[str] = ""
    model: Optional[str] = ""
    prompt: Optional[str] = ""

class TestIn(BaseModel):
    base: Optional[str] = ""
    key: Optional[str] = ""
    model: Optional[str] = ""

AGENT_COLORS = {
 "ceo":"#f59e0b","pm1":"#f59e0b","be1":"#3b82f6","be2":"#3b82f6",
 "fe1":"#3b82f6","fe2":"#3b82f6","mob1":"#3b82f6","ux1":"#8b5cf6",
 "devops1":"#8b5cf6","qa1":"#8b5cf6","ai-cs":"#10b981","ai-train":"#10b981",
 "integ":"#10b981","mkt1":"#f97316","cs-h":"#f97316",
}
# AGENTS_META/ROLE_PROMPTS = fitur LIVE EKSAK (kontrak wire produksi :8787 —
# ai-cs = Bantuin AI dibantuin.com; frontend kantor mengonsumsi ini).
AGENTS_META = {
 "ceo":      {"name": "Wahyu Fajar S.", "role": "Founder / CEO", "emoji": "👑"},
 "pm1":      {"name": "Sari Wulandari", "role": "Project Manager", "emoji": "📋"},
 "be1":      {"name": "Budi Santoso", "role": "Backend Engineer", "emoji": "⚙️"},
 "be2":      {"name": "Rizky Pratama", "role": "Backend Engineer", "emoji": "🗄️"},
 "fe1":      {"name": "Dewi Lestari", "role": "Frontend Engineer", "emoji": "🎨"},
 "fe2":      {"name": "Andi Wijaya", "role": "Frontend Engineer", "emoji": "⚡"},
 "mob1":     {"name": "Yoga Saputra", "role": "Mobile Engineer", "emoji": "📱"},
 "ux1":      {"name": "Maya Putri", "role": "UI/UX Designer", "emoji": "🖌️"},
 "devops1":  {"name": "Toni Hartono", "role": "DevOps Engineer", "emoji": "🛡️"},
 "qa1":      {"name": "Rina Marlina", "role": "QA Engineer", "emoji": "🔍"},
 "ai-cs":    {"name": "Bantuin AI", "role": "AI Customer Service", "emoji": "🤖"},
 "ai-train": {"name": "Trainer AI", "role": "AI Knowledge Engineer", "emoji": "📚"},
 "integ":    {"name": "Integrator Bot", "role": "Integration Engineer", "emoji": "🔌"},
 "mkt1":     {"name": "Lina Halim", "role": "Growth Marketing", "emoji": "📈"},
 "cs-h":     {"name": "Support Human", "role": "Customer Success", "emoji": "🎧"},
}

ROLE_PROMPTS = {
 "ceo": "Kamu Wahyu Fajar Setiawan, Founder/CEO WFS Project. Gaya bicara visioner, memotivasi tim, fokus strategi & sales. Jawab singkat (max 4 kalimat), Bahasa Indonesia santai-profesional.",
 "pm1": "Kamu Sari, PM WFS Project. Fokus sprint, timeline, koordinasi. Sering sebut status task & deadline. Bahasa Indonesia, singkat & jelas.",
 "be1": "Kamu Budi, Backend Engineer. Jago API, database, optimasi. Jawab teknis tapi mudah dipahami, singkat, Bahasa Indonesia.",
 "be2": "Kamu Rizky, Backend Engineer spesialis payment gateway & webhook (Midtrans, Xendit). Singkat, teknis, Bahasa Indonesia.",
 "fe1": "Kamu Dewi, Frontend Engineer (React/Next.js). Perfeksionis UI pixel-perfect. Singkat, Bahasa Indonesia.",
 "fe2": "Kamu Andi, Frontend Engineer spesialis performa & PWA. Suka kasih angka (Lighthouse, load time). Singkat, Bahasa Indonesia.",
 "mob1": "Kamu Yoga, Mobile Engineer (Flutter). Handle Android & iOS. Singkat, Bahasa Indonesia.",
 "ux1": "Kamu Maya, UI/UX Designer. Fokus riset user, design system, Figma. Singkat, hangat, Bahasa Indonesia.",
 "devops1": "Kamu Toni, DevOps. CI/CD, server, monitoring, keamanan. Suka laporkan metrik server. Singkat, Bahasa Indonesia.",
 "qa1": "Kamu Rina, QA Engineer. Detail, suka sebut jumlah test case & status pass/fail. Singkat, Bahasa Indonesia.",
 "ai-cs": "Kamu Bantuin AI, produk AI Customer Service dibantuin.com. Kamu tahu harga & produk klien, bisa cek order. Ramah, pakai emoji secukupnya, Bahasa Indonesia gaya admin toko.",
 "ai-train": "Kamu Trainer AI, mengelola knowledge base klien dibantuin.com. Fokus akurasi jawaban & training data. Singkat, Bahasa Indonesia.",
 "integ": "Kamu Integrator Bot, sambungkan AI ke WhatsApp API, Instagram, marketplace. Teknis integrasi. Singkat, Bahasa Indonesia.",
 "mkt1": "Kamu Lina, Growth Marketing. Suka sebut metrik (CPC, CTR, konversi). Singkat, Bahasa Indonesia.",
 "cs-h": "Kamu Support Human, handle eskalasi & onboarding klien. Empatis. Singkat, Bahasa Indonesia.",
}

# ---------- API ----------
@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time(), "default_model": DEFAULT_AI["model"],
            "default_provider": DEFAULT_AI["base"]}


@app.get("/api/status")
def status():
    import shutil, os
    # Guard anti-poisoning (pola sama dgn /api/system/resources): /proc & disk
    # hilang/tak terbaca (non-Linux, container tanpa /proc) -> fallback 0, jangan 500.
    try:
        du = shutil.disk_usage("/")
    except OSError:
        du = None
    try:
        mem = _parse_meminfo(open("/proc/meminfo").read())
    except OSError:
        mem = {"MemTotal": 0, "MemAvailable": 0}
    try:
        uptime_s = _parse_uptime_s(open("/proc/uptime").read())
    except OSError:
        uptime_s = 0
    return {"ok": True,
            "disk_used_gb": round(du.used / 2**30, 1) if du else 0.0,
            "disk_total_gb": round(du.total / 2**30, 1) if du else 0.0,
            "mem_available_mb": mem["MemAvailable"], "mem_total_mb": mem["MemTotal"],
            "uptime_s": uptime_s,
            "agents": len(AGENTS_META), "custom_cfg": sum(1 for c in load_cfg().values() if c.get("key"))}

@app.get("/api/agents")
def agents():
    cfg = load_cfg()
    out = []
    for aid, m in AGENTS_META.items():
        c = cfg.get(aid, {})
        out.append({**m, "id": aid, "color": AGENT_COLORS.get(aid, "#3b82f6"),
            "model": c.get("model") or DEFAULT_AI["model"],
            "custom": bool(c.get("key")),
            "has_prompt": bool(c.get("prompt"))})
    return out

@app.get("/api/config/{agent_id}")
def get_cfg(agent_id: str):
    c = load_cfg().get(agent_id, {})
    # jangan pernah balikan key penuh
    k = c.get("key", "")
    return {"base": c.get("base", ""), "model": c.get("model", ""),
            "prompt": c.get("prompt", ""), "key_set": bool(k),
            "key_hint": (k[:6] + "…" + k[-4:]) if len(k) > 12 else ("•••" if k else "")}

@app.post("/api/config/{agent_id}")
def set_cfg(agent_id: str, body: CfgIn):
    cfg = load_cfg()
    cur = cfg.get(agent_id, {})
    new = {**cur}
    if body.base != "": new["base"] = body.base
    if body.key != "": new["key"] = body.key      # kosong = pertahankan lama
    if body.model != "": new["model"] = body.model
    if body.prompt != "": new["prompt"] = body.prompt
    if body.base == "-" : new.pop("base", None)
    if body.key == "-": new.pop("key", None)      # "-" = hapus (fallback default)
    if body.model == "-": new.pop("model", None)
    if body.prompt == "-": new.pop("prompt", None)
    cfg[agent_id] = new
    save_cfg(cfg)
    return {"ok": True}

@app.post("/api/test")
async def test_conn(body: TestIn):
    if os.environ.get("WFS_METERING_REQUIRED") == "1":
        raise HTTPException(503, "Provider test disabled in strict mode")
    c = {"base": body.base or DEFAULT_AI["base"],
         "key": body.key or (DEFAULT_AI["key"] if not body.base else ""),
         "model": body.model}
    if not c["key"]:
        raise HTTPException(400, "Tidak ada API key (isi key atau kosongkan base untuk pakai default).")
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.get(c["base"].rstrip("/") + "/models",
                             headers={"Authorization": f"Bearer {c['key']}"})
        if r.status_code == 200:
            d = r.json()
            n = len(d.get("data", d.get("models", [])))
            return {"ok": True, "models": n}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:150]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


# ---------- MODE REPO: endpoint Software House (database.py tersedia) ----------
# Mode LIVE (SH_DB None): endpoints ini TIDAK terdaftar atau fallback live eksak.

if SH_DB is not None:
    @app.get("/api/sh/overview")
    def software_house_overview():
        """Ringkasan dashboard owner — angka nyata dari state SQLite."""
        return SH_DB.get_overview()


    async def _event_stream():
        """Server-Sent Events: stream log eksekusi baru secara real-time."""
        last_id = 0
        try:
            conn = SH_DB.get_db()
            cur = conn.execute("SELECT COALESCE(MAX(id),0) FROM execution_logs")
            last_id = cur.fetchone()[0] or 0
            conn.close()
        except Exception:
            pass
        yield "data: " + json.dumps({"type": "connected", "software_house": "WFS PROJECT"}) + "\n\n"
        while True:
            try:
                conn = SH_DB.get_db()
                rows = conn.execute(
                    "SELECT id, message, level, source, project_id, created_at FROM execution_logs "
                    "WHERE id > ? ORDER BY id ASC LIMIT 20", (last_id,)).fetchall()
                conn.close()
                for r in rows:
                    last_id = r[0]
                    evt = {"type": "log", "data": {
                        "id": r[0], "message": r[1], "level": r[2],
                        "source": r[3], "project_id": r[4], "created_at": r[5]}}
                    yield "data: " + json.dumps(evt) + "\n\n"
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1)


    @app.get("/api/events")
    async def api_events():
        return StreamingResponse(_event_stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


    @app.api_route("/preview/{slug}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def preview_proxy(slug: str, path: str, request: Request):
        """Reverse-proxy ke container sandbox project (preview URL nyata, bukan localhost host)."""
        proj = SH_DB.get_project(slug)
        port = proj and proj.get("preview_port")
        if not port:
            raise HTTPException(404, "project/preview tidak ditemukan")
        target = f"http://127.0.0.1:{port}/{path}"
        if request.url.query:
            sep = "&" if "?" in target else "?"
            target += sep + request.url.query
        body = await request.body() if request.method in ("POST", "PUT", "PATCH") else None
        # Sandbox applications must never receive dashboard credentials or metadata.
        allowed_headers = {"accept", "accept-language", "content-type", "range",
                           "if-none-match", "if-modified-since"}
        headers = {k: v for k, v in request.headers.items() if k.lower() in allowed_headers}
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=False, trust_env=False) as client:
                r = await client.request(request.method, target, content=body, headers=headers)
            if r.is_redirect:
                return Response(content="preview redirects are disabled", status_code=502)
            return Response(content=r.content, status_code=r.status_code,
                            media_type=r.headers.get("content-type"))
        except Exception as e:
            raise HTTPException(502, f"preview error: {e}")
else:
    # Mode LIVE: /api/events dari router read-only tasks.db (fitur live eksak).
    if _wfs_ev is not None:
        app.include_router(_wfs_ev.router)


def _container_status(name):
    if not name:
        return "missing"
    try:
        result = subprocess.run(
            ['docker', 'inspect', '--format', '{{.State.Status}}', name],
            capture_output=True, text=True, timeout=3)
        if result.returncode == 0:
            return result.stdout.strip() or 'unknown'
        if 'No such object' in result.stderr or 'No such container' in result.stderr:
            return 'missing'
    except (OSError, subprocess.TimeoutExpired):
        pass
    return 'unknown'


def _plan_project_tasks(pid: int, name: str, brief: str):
    """PM memecah jadi task via LLM (background — API balik cepat). Eksak live.

    Menjadwalkan coroutine-nya sendiri via asyncio.create_task (pemanggil
    tidak perlu tahu detail — API balik cepat, pola live).

    Siklus 229 — FIX pitfall asyncio resmi: hasil create_task dulu DIBUANG
    (loop hanya menyimpan weak-ref -> task planning LLM berdurasi puluhan
    detik bisa di-GC di tengah jalan, project STUCK 'planning' tanpa jejak),
    dan pause_all tidak menembus planning (tidak ada di _bg_tasks). Kini pola
    eksak _schedule(): referensi kuat di _bg_tasks + done-callback discard,
    guard pause SEBELUM call LLM berbayar (project dikembalikan 'pending'
    agar bisa di-resume, tidak menggantung 'planning').

    Siklus 230 — sisa jalur STUCK terakhir ditutup: LLM gagal (HTTP/timeout)
    atau respons tak bisa di-parse tidak lagi membiarkan project menggantung
    status 'planning' selamanya (dulu except-umum hanya print tanpa UPDATE).
    Sekarang project dikembalikan 'failed' — terlihat founder di UI & bisa
    di-retry (project baru / resume), tanpa jejak 'planning' mati.

    Siklus 231 — celah tersisa keluarga yang sama: array JSON valid tapi
    SEMUA entri tanpa title dulu lolos guard 230b (len>0) lalu loop for
    menolak semua → project 'backlog' dengan 0 TASK. Kini dihitung dulu:
    0 entri valid → raise → 'failed'.
    """
    async def _plan():
        try:
            if taskengine.is_paused():
                c = taskengine.db()
                c.execute("UPDATE projects SET status='pending' WHERE id=?", (pid,))
                c.commit(); c.close()
                return
            plan = await taskengine.call_llm(
                "pm1", taskengine.ROLE_SYS["pm"],
                f"Project: {name}\nBrief: {brief}\nBuat 6-10 task teknis untuk membangun project ini.")
            m = re.search(r"\[.*\]", plan, re.S)
            tasks = json.loads(m.group(0)) if m else []
            if not tasks:
                # Siklus 230b — parse kosong (tanpa array / semua entri tak
                # valid) BUKAN sukses: dulu jatuh ke 'backlog' dgn 0 task
                # (dead-end senyap). Lempar -> jalur except -> 'failed'.
                raise ValueError(
                    "planning: respons LLM tanpa array task ter-parse (len=0)")
            valid = [t for t in tasks[:10]
                     if isinstance(t, dict) and t.get("title")]
            if not valid:
                # Siklus 231 — array JSON valid tapi SEMUA entri tanpa title
                # sama-sama menghasilkan 0 task: dulu loop for melewati semua
                # lalu project ditulis 'backlog' dengan 0 TASK (dead-end senyap
                # yang lolos guard 230b karena len>0). Lempar -> 'failed'.
                raise ValueError(
                    "planning: respons LLM tanpa SATU PUN entri bertitle "
                    f"(len={len(tasks)}) — 0 task valid")
            for t in valid:
                # Siklus 240 — prompt task WAJIB berisi detail: desc PM + brief
                # founder + konteks project. Tanpa ini engineer hanya melihat
                # judul task (prompt kosong) dan menghasilkan template generik
                # yang ditolak QA (VERDICT: revise tanpa ujung).
                _desc = (t.get("desc") or t.get("description")
                         or t.get("prompt") or "").strip()
                _prompt = (
                    f"Project: {name}\nBrief founder: {brief}\n\n"
                    f"Task ini: {t.get('title', 'task')}\n"
                    f"Detail dari PM: {_desc}\n\n"
                    "Kerjakan sesuai detail di atas. Patuhi format balasan "
                    "system prompt."
                ).strip()
                taskengine.add_task(pid, t.get("title", "task"),
                                    t.get("role", "backend"), _prompt[:4000])
            c = taskengine.db()
            c.execute("UPDATE projects SET status='backlog' WHERE id=?", (pid,))
            c.commit(); c.close()
        except asyncio.CancelledError:
            c = taskengine.db()
            c.execute("UPDATE projects SET status='pending' WHERE id=?", (pid,))
            c.commit(); c.close()
            raise
        except Exception as e:
            # Siklus 230 — JANGAN biarkan project STUCK 'planning' selamanya:
            # LLM gagal (HTTP/timeout) ATAU respons tak bisa di-parse tidak
            # boleh menggantung status 'planning' tanpa jejak. Kembalikan
            # 'failed' (bisa dilihat founder & di-retry via project baru/
            # resume), lalu LOUD di stdout untuk jurnald.
            print("plan err:", e)
            try:
                c = taskengine.db()
                c.execute("UPDATE projects SET status='failed' WHERE id=?", (pid,))
                c.commit(); c.close()
            except Exception as dberr:
                print("plan err (status write):", dberr)
    plan_t = asyncio.create_task(_plan())
    _bg_tasks.add(plan_t)
    plan_t.add_done_callback(lambda t: _bg_tasks.discard(plan_t))


@app.get("/api/projects")
async def api_projects():
    if SH_DB is None:
        # Fitur live eksak: tanpa database.py, daftar project dari engine saja.
        return {"projects": taskengine.list_projects()}
    base = taskengine.list_projects()          # [{id,name,status}]
    try:
        sh_map = {str(p["id"]): p for p in SH_DB.list_projects()}
    except Exception as e:
        print("projects sh_db merge err:", e); sh_map = {}
    out = []
    for p in base:
        rec = dict(p)
        s = sh_map.get(str(p["id"]))
        if s:
            rec["description"] = s.get("description") or ""
            rec["preview_url"] = s.get("preview_url")
            port = s.get("preview_port")
            rec["direct_url"] = ("http://127.0.0.1:%s/" % port) if port else None
            rec["container_name"] = s.get("container_name")
            rec["container_status"] = await asyncio.to_thread(_container_status, s.get("container_name"))
            rec["workspace_path"] = s.get("workspace_path")
        out.append(rec)
    return {"projects": out}

@app.post("/api/projects")
async def api_new_project(body: dict):
    name = body.get("name", "").strip()
    brief = body.get("brief", "").strip()
    if not name or not brief:
        raise HTTPException(400, "name & brief wajib")
    pid = taskengine.add_project(name, brief)

    if SH_DB is None:
        # Fitur live eksak: planning saja tanpa sandbox/approval.
        _plan_project_tasks(pid, name, brief)
        return {"ok": True, "project_id": pid, "planning": True}

    # --- WFS Software House sandbox: scaffold workspace + start container (nyata) ---
    sandbox = None
    try:
        from docker_sandbox import DockerSandboxManager as SB
        slug = (re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "project") + f"-{pid}"
        SB.scaffold_project(slug, name)
        sandbox = SB.start_container(slug)
        try:
            SH_DB.save_project({
                "id": str(pid), "name": name, "slug": slug,
                "description": brief, "project_type": "website",
                "tech_stack": "HTML5/Tailwind/JS",
                "workspace_path": SB.get_workspace_path(slug),
                "container_id": sandbox.get("container_id"),
                "container_name": sandbox.get("container_name"),
                "preview_port": sandbox.get("port"),
                "preview_url": sandbox.get("preview_url"),
                "status": sandbox.get("status", "unknown"), "created_at": time.time(),
            })
        except Exception as e:
            print("save_project db:", e)
    except Exception as e:
        print("sandbox provisioning failed:", e)
        sandbox = {"status": "failed", "error": str(e)[:200]}

    _plan_project_tasks(pid, name, brief)
    try:
        SH_DB.add_approval(project_id=str(pid), action_type="project_launch",
                           description=(f"Setujui peluncuran project '{name}' untuk mulai eksekusi task "
                                        f"(container {sandbox.get('container_name') if sandbox else '-'})."))
    except Exception as e:
        print("approval seed:", e)
    return {"ok": True, "project_id": pid, "planning": True, "sandbox": sandbox}


if SH_DB is not None:
    # ---------------------------------------------------------------
    # Engineering Workspace — file explorer, logs, git, sandbox exec
    # ---------------------------------------------------------------
    def _project_workspace(pid):
        proj = SH_DB.get_project(str(pid))
        ws = proj and proj.get("workspace_path")
        if not ws or not os.path.isdir(ws):
            raise HTTPException(404, "workspace project tidak ditemukan")
        return ws, proj


    def _workspace_private(rel):
        """Conservative file-name policy, not a substitute for secret scanning."""
        for part in rel.replace("\\", "/").split("/"):
            name = part.lower()
            if (name.startswith(".") and name not in (
                "", ".", "..", ".gitignore", ".gitattributes", ".editorconfig",
            )) or name in {
                "id_rsa", "id_ed25519", "id_ecdsa", "credentials", "credentials.json",
                "secrets", "secrets.json", "secrets.yaml", "secrets.yml",
            } or name.endswith((".pem", ".key", ".p12", ".pfx", ".keystore",
                                ".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm")):
                return True
        return False


    def _safe_resolve(base, rel):
        base_r = os.path.realpath(base)
        lexical = os.path.abspath(os.path.join(base, rel or ""))
        p = os.path.realpath(lexical)
        if p != base_r and not p.startswith(base_r + os.sep):
            raise HTTPException(403, "path di luar workspace")
        if (_workspace_private(os.path.relpath(lexical, base_r)) or
                _workspace_private(os.path.relpath(p, base_r))):
            raise HTTPException(403, "private workspace path")
        return p


    @app.get("/api/projects/{pid}/files")
    def api_project_files(pid: int, path: str = ""):
        base, _ = _project_workspace(pid)
        target = _safe_resolve(base, path)
        if not os.path.isdir(target):
            raise HTTPException(404, "folder tidak ditemukan")
        entries = []
        for name in sorted(os.listdir(target), key=str.lower):
            full = os.path.join(target, name)
            try:
                full = _safe_resolve(base, os.path.relpath(full, base))
                st = os.stat(full)
                is_dir = os.path.isdir(full)
                entries.append({
                    "name": name, "type": "dir" if is_dir else "file",
                    "size": st.st_size if not is_dir else None,
                    "mtime": int(st.st_mtime),
                })
            except (OSError, HTTPException):
                continue
        return {"path": path, "entries": entries}


    @app.get("/api/projects/{pid}/file")
    def api_project_file(pid: int, path: str = ""):
        base, _ = _project_workspace(pid)
        target = _safe_resolve(base, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file tidak ditemukan")
        if os.path.getsize(target) > 200_000:
            raise HTTPException(413, "file terlalu besar untuk ditampilkan")
        with open(target, "r", errors="replace") as f:
            return {"path": path, "content": f.read()}


    @app.get("/api/projects/{pid}/logs")
    def api_project_logs(pid: int, lines: int = 100):
        _, proj = _project_workspace(pid)
        cname = proj.get("container_name")
        if not cname:
            raise HTTPException(404, "container belum ada")
        lines = _clamp_int(lines, 100, 10, 500)
        out = subprocess.run(
            ["docker", "logs", "--tail", str(lines), cname],
            capture_output=True, text=True, timeout=30)
        if out.returncode != 0:
            raise HTTPException(502, (out.stderr or out.stdout or "").strip()[:300])
        return {"logs": out.stdout.splitlines()[-lines:]}


    @app.post("/api/projects/{pid}/sandbox/{action}")
    def api_project_sandbox_action(pid: int, action: str):
        if action not in ("start", "stop", "restart"):
            raise HTTPException(400, "action harus start/stop/restart")
        _, proj = _project_workspace(pid)
        cname = proj.get("container_name")
        if not cname:
            raise HTTPException(404, "container belum ada")
        try:
            out = subprocess.run(["docker", action, cname],
                                 capture_output=True, text=True, timeout=60)
        except Exception as e:
            raise HTTPException(502, f"{action} error: {e}")
        if out.returncode != 0:
            raise HTTPException(502, out.stderr.strip()[:300])
        ps = subprocess.run(["docker", "ps", "--filter", f"name=^{cname}$", "--format", "{{.Names}}"],
                            capture_output=True, text=True, timeout=10)
        running = cname in ps.stdout
        return {"ok": True, "action": action, "running": running}


    @app.get("/api/projects/{pid}/git")
    def api_project_git(pid: int):
        base, _ = _project_workspace(pid)
        try:
            st = subprocess.run(["git", "-C", base, "status", "--short"],
                                capture_output=True, text=True, timeout=20)
            lg = subprocess.run(["git", "-C", base, "log", "--oneline", "-10"],
                                capture_output=True, text=True, timeout=20)
            br = subprocess.run(["git", "-C", base, "branch", "--show-current"],
                                capture_output=True, text=True, timeout=20)
            if lg.returncode != 0 and st.returncode != 0:
                return {"repo": False, "status": "", "log": "", "branch": ""}
            return {"repo": True, "status": st.stdout.strip(), "log": lg.stdout.strip(),
                    "branch": br.stdout.strip() or "(detached)"}
        except Exception:
            return {"repo": False, "status": "", "log": "", "branch": ""}


    @app.post("/api/projects/{pid}/git/commit")
    def api_project_git_commit(pid: int, body: dict):
        base, _ = _project_workspace(pid)
        msg = (body or {}).get("message", "").strip()
        if not msg or len(msg) > 500:
            raise HTTPException(400, "message wajib (≤500 karakter)")
        def sh(*args):
            result = subprocess.run(["git", "--literal-pathspecs", "-c", "core.hooksPath=/dev/null",
                                     *args], cwd=base, capture_output=True, text=True, timeout=30)
            if result.returncode != 0:
                raise HTTPException(502, "workspace git operation failed")
            return result
        # Never discover and modify an enclosing repository (or an external worktree).
        metadata = os.path.join(base, ".git")
        if os.path.lexists(metadata):
            if os.path.islink(metadata) or not os.path.isdir(metadata):
                raise HTTPException(403, "external git metadata is not allowed")
        else:
            parent = os.path.dirname(os.path.realpath(base))
            probe = subprocess.run(["git", "-C", parent, "rev-parse", "--show-toplevel"],
                                   capture_output=True, text=True, timeout=30)
            if probe.returncode == 0:
                raise HTTPException(403, "workspace is inside another repository")
            sh("init", "-q")
            sh("config", "user.name", "WFS Bot")
            sh("config", "user.email", "bot@wfs.local")
        if os.path.realpath(sh("rev-parse", "--show-toplevel").stdout.strip()) != os.path.realpath(base):
            raise HTTPException(403, "workspace repository root mismatch")

        def safe_path(name):
            try:
                _safe_resolve(base, name)
                return not os.path.islink(os.path.join(base, name))
            except HTTPException:
                return False

        def check_index():
            # Inspect the index itself: a staged secret may no longer exist on disk.
            for record in sh("ls-files", "--stage", "-z").stdout.split("\0"):
                if not record:
                    continue
                meta, name = record.split("\t", 1)
                if meta.split()[0] not in ("100644", "100755") or not safe_path(name):
                    raise HTTPException(403, "private or unsafe path in git index")

        check_index()
        candidates = sh("ls-files", "--cached", "--others", "--exclude-standard", "-z").stdout
        for name in sorted(set(candidates.split("\0")) - {""}):
            if safe_path(name):
                sh("add", "-A", "--", name)
        check_index()
        if not sh("diff", "--cached", "--name-only").stdout.strip():
            return {"ok": True, "committed": False, "reason": "nothing_to_commit"}
        sh("commit", "-m", msg)
        rev = sh("rev-parse", "--short", "HEAD")
        return {"ok": True, "committed": True, "hash": rev.stdout.strip() or ""}


    @app.post("/api/projects/{pid}/exec")
    def api_project_exec(pid: int, body: dict):
        _, proj = _project_workspace(pid)
        cname = proj.get("container_name")
        if not cname:
            raise HTTPException(404, "container belum ada")
        cmd = (body or {}).get("cmd", "").strip()
        if not cmd or len(cmd) > 1000:
            raise HTTPException(400, "cmd wajib / terlalu panjang")
        try:
            out = subprocess.run(["docker", "exec", "-w", "/app", cname,
                                  "sh", "-lc", cmd],
                                 capture_output=True, text=True, timeout=40)
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "timeout eksekusi")
        except Exception as e:
            raise HTTPException(502, f"exec error: {e}")
        return {"exit": out.returncode, "stdout": out.stdout[-8000:], "stderr": out.stderr[-4000:]}


    @app.get("/api/projects/{pid}/report")
    def api_project_report(pid: int):
        """Ringkasan status project (artifact delivery) — diagregasi dari state nyata."""
        proj = SH_DB.get_project(str(pid))
        if not proj:
            raise HTTPException(404, "project tidak ditemukan")
        tasks = [t for t in taskengine.list_tasks(pid)]
        from collections import Counter
        by_status = dict(Counter(t["status"] for t in tasks))
        base = proj.get("workspace_path")
        nfiles = 0
        if base and os.path.isdir(base):
            for root, dirs, files in os.walk(base):
                dirs[:] = [d for d in dirs if d not in (".git", "__pycache__", "node_modules")]
                nfiles += len(files)
        pending_approvals = sum(1 for a in SH_DB.list_approvals("pending") if a["project_id"] == str(pid))
        port = proj.get("preview_port")
        return {
            "project_id": str(pid),
            "name": proj.get("name"),
            "status": proj.get("status"),
            "container_name": proj.get("container_name"),
            "preview_url": proj.get("preview_url"),
            "port": port,
            "direct_url": ("http://127.0.0.1:%s/" % port) if port else None,
            "workspace": base,
            "files": nfiles,
            "tasks_total": len(tasks),
            "tasks_by_status": by_status,
            "pending_approvals": pending_approvals,
            "report_generated_at": time.time(),
        }


    @app.get("/api/approvals")
    def api_approvals(status: str = "pending"):
        if status not in ("pending", "approved", "rejected", "all"):
            raise HTTPException(400, "status tidak valid")
        if status == "all":
            conn = SH_DB.get_db()
            rows = conn.execute(
                "SELECT id, task_id, project_id, action_type, description, status, created_at "
                "FROM approvals ORDER BY created_at DESC").fetchall()
            conn.close()
            return {"approvals": [{"id": r[0], "task_id": r[1], "project_id": r[2],
                                   "action_type": r[3], "description": r[4],
                                   "status": r[5], "created_at": r[6]} for r in rows]}
        return {"approvals": SH_DB.list_approvals(status)}


    @app.post("/api/approvals/{aid}/decide")
    def api_approval_decide(aid: str, body: dict):
        action = (body or {}).get("action")
        if action not in ("approve", "reject"):
            raise HTTPException(400, "action harus 'approve'/'reject'")
        new_status = "approved" if action == "approve" else "rejected"
        if not SH_DB.set_approval(aid, new_status):
            raise HTTPException(404, "approval tidak ditemukan")
        return {"ok": True, "id": aid, "status": new_status}
else:
    # Mode LIVE: /api/sh/overview + /api/approvals + workspace 501 jujur
    # dari router read-only tasks.db (fitur live eksak, siklus 153).
    if _wfs_shc is not None:
        app.include_router(_wfs_shc.router)


# ---------- TASKS — engine satu sumber, hardening SELALU ----------
@app.get("/api/tasks")
async def api_tasks(project: Optional[str] = None):
    """Ambil daftar task — filter project opsional mendukung numerik atau slug teks (siklus 234)."""
    proj = project.strip() if (project and project.strip()) else None
    return {"tasks": taskengine.list_tasks(proj)}

_bg_tasks = set()

class TaskIn(BaseModel):
    title: str
    role: str = "backend"
    prompt: str = ""
    project: Optional[Union[int, str]] = None

@app.post("/api/tasks")
async def api_add_task(body: TaskIn):
    """Tambah satu task manual (status pending).

    Siklus 232 — role dinormalisasi via taskengine.normalize_role (satu sumber
    dgn engine): role bebas dari UI/manual juga tak pernah jatuh ke fallback
    senyap; title di-truncate sebelum masuk DB (kontrak lama utuh).
    Siklus 234 — project mendukung integer maupun slug string (misal 'proj-demo').
    """
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title wajib")
    proj = str(body.project).strip() if (body.project is not None and str(body.project).strip() != "") else None
    tid = taskengine.add_task(proj, title[:200], body.role, (body.prompt or title)[:4000])
    return {"ok": True, "task_id": tid, "role": taskengine.normalize_role(body.role)}

def _check_task(tid):
    task = taskengine.get_task(tid)
    if not task:
        raise HTTPException(404, "task not found")
    try:
        taskengine.require_launch_approval(task['project'])
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    if task['status'] not in ('pending', 'review', 'failed'):
        raise HTTPException(409, 'task is not runnable')


def _schedule(tids):
    # Only the authorized, budget-metered standalone worker may dispatch when
    # secure master-queue mode is selected. No HTTP shortcut to paid execution.
    if os.environ.get("WFS_MASTER_QUEUE_REQUIRED") == "1":
        raise HTTPException(503, "Legacy HTTP execution disabled: use approved Master Queue worker")
    # Reserve all tasks before returning; rollback reservations on any conflict.
    claims = {}
    try:
        for tid in tids:
            _check_task(tid)
            claims[tid] = taskengine.claim_task(tid)
    except Exception as exc:
        for tid, claim in claims.items():
            taskengine.release_task(tid, claim)
        if isinstance(exc, RuntimeError):
            raise HTTPException(409, str(exc)) from exc
        raise
    for tid, claim in claims.items():
        async def execute(tid=tid):
            try:
                if taskengine.is_paused():
                    taskengine.set_status(tid, 'pending')
                    return
                await taskengine._execute_task(tid)
            except asyncio.CancelledError:
                taskengine.set_status(tid, 'pending')
                raise
            except Exception as exc:
                taskengine.set_status(tid, 'failed', result=str(exc))
        taskengine.set_status(tid, 'assigned')
        t = asyncio.create_task(execute())
        _bg_tasks.add(t)
        def finished(t, tid=tid, claim=claim):
            if t.cancelled():
                taskengine.set_status(tid, 'pending')
            taskengine.release_task(tid, claim)
            _bg_tasks.discard(t)
        t.add_done_callback(finished)
    return tids


@app.post("/api/tasks/pause_all")
async def api_pause_all():
    taskengine.set_paused(True)
    active = [t for t in _bg_tasks if not t.done()]
    for t in active:
        t.cancel()
    await asyncio.gather(*active, return_exceptions=True)
    reset = taskengine.recover_interrupted()
    return {"ok": True, "paused": True, "cancelled": len(active), "reset": reset}


@app.get("/api/tasks/paused")
async def api_paused():
    # FIX PRODUKSI #2 (siklus 209): pause PERSISTEN dari DB engine_state via
    # engine — server lama membaca _PAUSED in-memory yang hilang saat restart.
    return {"paused": taskengine.is_paused()}


@app.post("/api/tasks/resume_all")
async def api_resume_all(body: dict = None):
    taskengine.recover_interrupted()
    ts = [t['id'] for t in taskengine.list_tasks((body or {}).get('project'))
          if t['status'] in ('pending', 'review', 'failed')]
    # A rejected resume must not clear the persistent pause.
    for tid in ts:
        _check_task(tid)
    was_paused = taskengine.is_paused()
    taskengine.set_paused(False)
    try:
        _schedule(ts)
    except Exception:
        taskengine.set_paused(was_paused)
        raise
    return {"ok": True, "paused": False, "started": ts}


@app.post("/api/tasks/{tid}/run")
async def api_run_task(tid: int):
    if taskengine.is_paused():
        raise HTTPException(409, 'paused')
    _schedule([tid])
    return {"ok": True, "started": tid}


class TaskMoveIn(BaseModel):
    status: str

@app.patch("/api/tasks/{tid}/status")
async def api_move_task(tid: int, body: TaskMoveIn):
    """Siklus 235 — persist pindah kolom kanban dari UI.

    Dulu TaskBoard drag-drop/quick-move hanya optimis-lokal (tidak ada endpoint
    status → POST /api/tasks/{id}/status live = 404; poll 8 dtk membalikkan
    kartu tanpa jejak). Kini delegasi taskengine.move_task: validasi status,
    approval-gate paritas run_task, 404/400 jujur. TIDAK menjadwalkan eksekusi
    (bukan run — mesin berbayar tak tersentuh; 'running' hanya label status).
    """
    try:
        t = taskengine.move_task(tid, body.status)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(404, "task not found") from exc
    return {"ok": True, "task_id": tid, "status": t["status"]}


@app.get("/api/tasks/{tid}")
async def api_task_detail(tid: int):
    """Siklus 236 — detail SATU task lengkap (brief prompt + result output agen).

    Dulu hanya GET /api/tasks (list ramping tanpa prompt/result — payload poll)
    yang ada: GET /api/tasks/{id} live = 404 sehingga detail modal TaskBoard
    tak bisa menampilkan Brief & Hasil Agen. Delegasi taskengine.get_task
    (satu sumber), read-only — tanpa approval gate (bukan jalur eksekusi).
    """
    t = taskengine.get_task(tid)
    if not t:
        raise HTTPException(404, "task not found")
    return t


@app.get("/api/system/resources")
async def api_system_resources():
    """Pemakaian CPU/RAM per kontainer docker + host, utk panel monitoring.

    Baca /proc lewat parser toleran (_parse_meminfo/_parse_loadavg) + try/except
    OSError agar endpoint tidak pernah 500 pada file hilang/format tak terduga
    (guard anti-poisoning, pola sama dgn _clamp_int).

    SIKLUS 253 — non-blocking + tanpa `docker stats` (lambat ~2.1 dtk):
    dulu endpoint ini menjalankan subprocess `docker stats --no-stream` DI
    THREAD event-loop uvicorn (async def tanpa offload) → seluruh gateway
    :8787 BEKU ~2 dtk setiap kali SysMeter/Dashboard/TeamStats menarik data
    (terukur: /api/status concurrent 1ms → 1914ms). Kini sampling CPU via
    delta cgroup cpu.stat dua-pass (250ms) dan RAM dari memory.current/
    memory.max cgroup v2 (baca file ~1ms), offload ke worker thread via
    asyncio.to_thread — total <400ms — angka setara docker stats
    (terverifikasi berdampingan, presisi 0.01–0.2%).
    """
    import asyncio, glob as _glob

    def _collect(prev, dt_s):
        """Sampling satu pass: nama via docker ps (subprocess cepat ~70ms),
        RAM/CPU dari cgroup v2 per-kontainer (baca file ~1ms/15 kontainer).
        dt efektif diukur EKSAK: stempel time.monotonic() di akhir pembacaan
        tiap pass (disimpan di prev["_t"]) → pembagi CPU% = rentang nyata
        antara dua batch baca cpu.stat, bukan nominal 250ms."""
        ncpu = os.cpu_count() or 2
        t_prev = prev.get("_t") if isinstance(prev, dict) else None
        try:
            ps = subprocess.run(["docker", "ps", "--format", "{{.ID}} {{.Names}}"],
                                capture_output=True, text=True, timeout=10)
        except Exception:
            ps = None
        cur = {}
        if ps is not None and ps.returncode == 0:
            for line in ps.stdout.splitlines():
                parts = line.split()
                if len(parts) < 2:
                    continue
                cid, name = parts[0], " ".join(parts[1:])
                usage = mem_cur = None
                mem_lim = None
                try:
                    hits = _glob.glob("/sys/fs/cgroup/system.slice/docker-" + cid + "*.scope")
                    if hits:
                        base = hits[0]
                        try:
                            mem_cur = int(open(os.path.join(base, "memory.current")).read())
                        except (OSError, ValueError):
                            mem_cur = None
                        try:
                            raw = open(os.path.join(base, "memory.max")).read().strip()
                            mem_lim = None if raw == "max" else int(raw)
                        except (OSError, ValueError):
                            mem_lim = None
                        # memory.current termasuk page cache: kurangi inactive_file
                        # (formula docker stats) — tanpa ini omniroute tampil
                        # 646MiB padahal docker stats 486MiB (selisih cache 160MiB).
                        if mem_cur is not None:
                            try:
                                with open(os.path.join(base, "memory.stat")) as f:
                                    for ln in f:
                                        if ln.startswith("inactive_file "):
                                            mem_cur -= int(ln.split()[1])
                                            break
                            except (OSError, ValueError, TypeError):
                                pass  # tanpa memory.stat: pakai current mentah
                        # cpu.stat baris pertama = "usage_usec <n>" (cgroup v2)
                        with open(os.path.join(base, "cpu.stat")) as f:
                            first = f.readline().split()
                        usage = int(first[1]) if (len(first) >= 2 and first[0] == "usage_usec") else None
                except Exception:
                    pass
                cur[cid] = (name, usage, mem_cur, mem_lim)
        now = time.monotonic()
        dt_eff = (now - t_prev) if t_prev else dt_s
        rows = []
        for cid, (name, u1, m1, lim) in cur.items():
            cpu = "0.00%"
            if prev and cid in prev and u1 is not None and prev[cid] is not None:
                d = max(0, u1 - prev[cid]) / 1e6 / max(dt_eff, 1e-3) / ncpu * 100
                cpu = f"{d:.2f}%"
            mem = "?" if m1 is None else f"{m1 / 2**20:.1f}MiB"
            if lim:
                mem += f" / {lim / 2**30:.3f}GiB"
            rows.append({"name": name, "cpu": cpu, "mem": mem})
            if u1 is not None:
                prev[cid] = u1
        if isinstance(prev, dict):
            prev["_t"] = now  # stempel utk pass berikutnya
        return rows, prev, dt_eff

    try:
        # Pass-0 baseline CPU (tanpa output) → jeda 250ms → pass-1 dgn delta.
        # asyncio.to_thread = primitif offload yang SUDAH dipakai file ini
        # (api_projects:710 utk docker inspect) — subprocess & baca file
        # JANGAN pernah dieksekusi langsung di event-loop.
        _r0, prev0, _ = await asyncio.to_thread(_collect, {}, 0.0)
        await asyncio.sleep(0.25)
        containers, prev1, dt = await asyncio.to_thread(_collect, prev0, 0.25)
    except Exception:
        containers = []
    try:
        mem = _parse_meminfo(open("/proc/meminfo").read())
        load = _parse_loadavg(open("/proc/loadavg").read())
    except OSError:
        mem = {"MemTotal": 0, "MemAvailable": 0}
        load = "0.00"
    ram_total = mem["MemTotal"]
    ram_used = max(0, mem["MemTotal"] - mem["MemAvailable"])  # clamp negatif (MemAvailable > MemTotal)
    return {"containers": containers, "load": load, "ram_mb": f"{ram_used}/{ram_total}"}


@app.get("/api/agents/status")
async def api_agents_status():
    """Ringkasan status per agent utk kantor 3D: {agent_id: {status_count, last_status}}."""
    cnt = {}
    last = {}
    for t in taskengine.list_tasks(None):
        aid = t.get("agent_id", "")
        if not aid: continue
        d = cnt.setdefault(aid, {"done": 0, "running": 0, "failed": 0, "review": 0, "pending": 0})
        d[t["status"]] = d.get(t["status"], 0) + 1
        last[aid] = t["status"]
    return {"agents": {k: dict(v, last=last.get(k)) for k, v in cnt.items()}}


@app.get("/api/sandboxes")
async def api_sandboxes():
    """Daftar sandbox agent (container wfs-agent-*) via docker ps.

    SIKLUS 254 — non-blocking (kelas sama dgn fix 253): dulu `docker ps`
    (~70ms, bisa lebih saat daemon sibuk) dijalankan LANGSUNG di event-loop
    async def tanpa offload & TANPA timeout — 12 request paralel terukur
    membekukan /api/status 2.7ms → 357ms (127×) dan eksekusi tanpa deadline
    melanggar kontrak guard subprocess (siklus 202). Kini di-offload via
    asyncio.to_thread + timeout=10 (pola api_system_resources 253); docker
    ps gagal/absen → [] (bukan 500, guard anti-poisoning)."""
    import asyncio

    def _list():
        try:
            ps = subprocess.run(["docker", "ps", "--format", "{{.Names}} {{.Status}}"],
                                capture_output=True, text=True, timeout=10)
        except Exception:
            return []
        return [l for l in ps.stdout.splitlines() if l.startswith("wfs-agent-")]

    return {"sandboxes": await asyncio.to_thread(_list)}


@app.post("/api/sandbox/{agent_id}/exec")
async def sandbox_exec(agent_id: str, body: dict):
    if os.environ.get("WFS_MASTER_QUEUE_REQUIRED") == "1":
        raise HTTPException(503, "Legacy Docker exec disabled in hardened gateway")
    """Jalankan kode Python di sandbox agent (executor mandiri).

    SIKLUS 255 — non-blocking event-loop (pola 253/254): dulu run_in_sandbox
    (memanggil docker exec hingga 600 dtk) dieksekusi LANGSUNG di event loop
    karena endpoint async def — terukur live membekukan /api/status dari ~2ms
    menjadi 1334ms (667×). Kini di-offload ke asyncio.to_thread sehingga
    event loop Uvicorn tetap bebas melayani request concurrent.
    """
    import asyncio
    import sandbox_exec
    body = body or {}
    timeout = _clamp_int(body.get("timeout"), 60, 1, 600)
    return await asyncio.to_thread(sandbox_exec.run_in_sandbox, agent_id, body.get("code", ""), timeout)


@app.post("/api/sandbox/{agent_id}/test")
async def sandbox_test(agent_id: str):
    if os.environ.get("WFS_MASTER_QUEUE_REQUIRED") == "1":
        raise HTTPException(503, "Legacy Docker test disabled in hardened gateway")
    """Jalankan pytest di workspace sandbox agent.

    SIKLUS 255 — non-blocking event-loop: dulu run_tests_in_sandbox (memanggil
    pip + pytest via docker exec hingga 120 dtk) dieksekusi LANGSUNG di event loop
    async def — terukur live membekukan /api/status dari ~2ms menjadi 1554ms (777×).
    Kini di-offload ke asyncio.to_thread.
    """
    import asyncio
    import sandbox_exec
    return await asyncio.to_thread(sandbox_exec.run_tests_in_sandbox, agent_id)


@app.post("/api/tasks/run_all")
async def api_run_all(body: dict):
    if taskengine.is_paused():
        raise HTTPException(409, "paused")
    taskengine.recover_interrupted()
    ts = [t['id'] for t in taskengine.list_tasks(body.get('project'))
          if t['status'] in ('pending', 'review', 'failed')]
    _schedule(ts)
    return {"ok": True, "started": ts}

@app.post("/api/chat")
async def chat(body: ChatIn):
    # The old public chat route has no CostLedger settlement. In secure mode
    # fail closed instead of generating unmetered provider charges.
    if os.environ.get("WFS_METERING_REQUIRED") == "1":
        raise HTTPException(503, "Unmetered chat disabled until metered chat adapter is installed")
    meta = AGENTS_META.get(body.agent_id)
    if not meta:
        raise HTTPException(404, "Agent tidak ditemukan")
    c = agent_cfg(body.agent_id)
    sys_prompt = ROLE_PROMPTS.get(body.agent_id, "Kamu anggota tim WFS Project.")
    user_extra = load_cfg().get(body.agent_id, {}).get("prompt", "")
    if user_extra:
        sys_prompt += " Instruksi tambahan dari owner: " + user_extra
    if body.team_context:
        sys_prompt += "\nKonteks tim (pesan group terakhir):\n" + body.team_context

    # Jika agent ai-cs dan pertanyaan soal order -> lookup DB asli
    order_info = ""
    if body.agent_id == "ai-cs":
        import re
        m = re.search(r"#?(\d{3,5})", body.message)
        if m and any(w in body.message.lower() for w in ["order", "pesanan", "resi", "paket", "kirim"]):
            try:
                async with httpx.AsyncClient(timeout=5) as cl2:
                    r2 = await cl2.get("http://127.0.0.1:8787/api/orders/" + m.group(1))
                od = r2.json().get("order")
                if od:
                    order_info = (f"\n[DATA ORDER ASLI dari sistem] Order #{od['id']} atas nama {od['customer']}: "
                                  f"status {od['status']}, total Rp{od['total']:,}"
                                  + (f", kurir {od['courier']} resi {od['resi']}, estimasi {od['eta']}" if od.get('resi') else "")
                                  + ". Gunakan data ini untuk menjawab.")
            except Exception:
                pass

    msgs = [{"role": "system", "content": sys_prompt}]
    if order_info:
        msgs.append({"role": "system", "content": order_info})
    for h in body.history[-12:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            msgs.append({"role": h["role"], "content": str(h["content"])[:2000]})
    msgs.append({"role": "user", "content": body.message})

    try:
        async with httpx.AsyncClient(timeout=60) as cl:
            r = await cl.post(c["base"].rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {c['key']}", "Content-Type": "application/json"},
                json={"model": c["model"], "messages": msgs,
                      "max_tokens": 1500, "temperature": 0.8})
        if r.status_code != 200:
            return {"ok": False, "error": f"Provider HTTP {r.status_code}: {r.text[:200]}"}
        data = r.json()
        msg = data.get("choices", [{}])[0].get("message", {})
        reply = msg.get("content") or ""
        if not reply and msg.get("reasoning_content"):
            reply = msg["reasoning_content"]  # fallback untuk model reasoning
        return {"ok": True, "reply": reply.strip(), "model": c["model"], "agent": meta}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

# Mode LIVE: dashboard/stats router (fitur live eksak siklus 152).
if SH_DB is None and _wfs_stats is not None:
    app.include_router(_wfs_stats.router)

# ---------- Phase 4 secure HTTP control plane (explicit operator opt-in) ----------
# The legacy API remains independent: enabling this adds a distinct, scoped
# /api/v4 contract; it is NOT proof that all old HTTP routes have RBAC.
# Deny startup if strict paid-route guards are not active.
if os.environ.get("WFS_SECURE_CONTROL_API_ENABLED") == "YES":
    if (os.environ.get("WFS_MASTER_QUEUE_REQUIRED") != "1" or
            os.environ.get("WFS_METERING_REQUIRED") != "1"):
        raise RuntimeError("Secure control API requires both legacy paid-route guards")
    _secure_required = ("WFS_MASTER_QUEUE_DB", "WFS_COST_DB",
                        "WFS_RBAC_DB", "WFS_AUTH_DB")
    _missing_secure = [name for name in _secure_required if not os.environ.get(name)]
    if _missing_secure:
        raise RuntimeError("Secure control API requires configured private DB paths: " +
                           ", ".join(_missing_secure))
    # This import is intentionally NOT guarded: a missing security adapter must
    # prevent a configured secure API from starting, never expose fallback URLs.
    from secure_control_api import create_secure_router, TokenStore
    from master_queue import DurableMasterQueue
    from project_rbac import ProjectRBAC
    from cost_ledger import CostLedger
    app.include_router(create_secure_router(
        queue=DurableMasterQueue(os.environ["WFS_MASTER_QUEUE_DB"],
                                 max_per_project=1),
        rbac=ProjectRBAC(os.environ["WFS_RBAC_DB"]),
        ledger=CostLedger(os.environ["WFS_COST_DB"]),
        tokens=TokenStore(os.environ["WFS_AUTH_DB"]),
        taskengine=taskengine))


# ---------- orders (satu sumber, siklus 208) ----------
app.include_router(orders_router)

# ---------- root / static ----------
# Fitur live eksak: UI tunggal ada di kantor :9503 — root gateway SELALU
# redirect ke sana (server live memang tidak pernah melayani static; static/
# di folder gateway sengaja tidak dimount supaya perilaku produksi tidak
# berubah). Checkout API-only tanpa UI build: path lain -> 503 jujur
# "not built" (hardening repo — bukan 404 generik).
@app.get("/", include_in_schema=False)
def _root_redirect():
    return RedirectResponse("http://100.117.198.46:9503/")

if not (BASE / "static" / "index.html").is_file():
    @app.get("/{path:path}", include_in_schema=False)
    async def ui_not_built(path: str):
        return Response(
            "UI assets not built. Run npm run build and copy dist/ into backend/static/, then restart the gateway.",
            status_code=503, media_type="text/plain",
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
