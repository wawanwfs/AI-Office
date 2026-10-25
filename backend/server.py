import os
#!/usr/bin/env python3
"""
WFS Project — Virtual Office Agent Gateway
Backend nyata: chat agent per-role dengan API key/model yang dikonfigurasi user.
Default AI diatur lewat env WFS_AI_BASE / WFS_AI_KEY / WFS_AI_MODEL.
"""
import json, os, re, time, asyncio, pathlib
from typing import Optional
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

BASE = pathlib.Path(__file__).parent
CFG_DIR = BASE / "config"
CFG_DIR.mkdir(exist_ok=True)
CFG_FILE = CFG_DIR / "agents.json"

# ---------- default AI (Hermes) ----------
def load_default():
    """Konfigurasi AI default dari environment: WFS_AI_BASE, WFS_AI_KEY, WFS_AI_MODEL."""
    return {
        "base": os.environ.get("WFS_AI_BASE", "https://api.openai.com/v1").rstrip("/"),
        "key": os.environ.get("WFS_AI_KEY", ""),
        "model": os.environ.get("WFS_AI_MODEL", "gpt-4o-mini"),
    }

DEFAULT_AI = load_default()

app = FastAPI(title="WFS Virtual Office Gateway")

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
 "ai-cs": "Kamu WFS Assistant, autonomous AI agent WFS PROJECT Software House. Kamu membantu koordinasi tugas, memantau status Docker sandbox, dan melaporkan kemajuan proyek. Ramah, singkat, Bahasa Indonesia profesional.",
 "ai-train": "Kamu Trainer AI, mengelola knowledge base dan arsitektur kode WFS PROJECT Software House. Fokus akurasi rancangan & training data. Singkat, Bahasa Indonesia.",
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
    du = shutil.disk_usage("/")
    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, v = line.partition(":")
            if k in ("MemTotal", "MemAvailable"):
                mem[k] = int(v.split()[0]) // 1024
    return {"ok": True, "disk_used_gb": round(du.used / 2**30, 1), "disk_total_gb": round(du.total / 2**30, 1),
            "mem_available_mb": mem.get("MemAvailable", 0), "mem_total_mb": mem.get("MemTotal", 0),
            "uptime_s": int(open("/proc/uptime").read().split()[0].split(".")[0]),
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


# ---------- TASK ENGINE (100% real) ----------
import tasks as taskengine

@app.get("/api/projects")
async def api_projects():
    return {"projects": taskengine.list_projects()}

@app.post("/api/projects")
async def api_new_project(body: dict):
    name = body.get("name","").strip()
    brief = body.get("brief","").strip()
    if not name or not brief:
        raise HTTPException(400, "name & brief wajib")
    pid = taskengine.add_project(name, brief)
    # PM memecah jadi task via LLM (background — API balik cepat)
    async def _plan():
        try:
            plan = await taskengine.call_llm(
                "pm1", taskengine.ROLE_SYS["pm"],
                f"Project: {name}\nBrief: {brief}\nBuat 6-10 task teknis untuk membangun project ini.")
            m = re.search(r"\[.*\]", plan, re.S)
            tasks = json.loads(m.group(0)) if m else []
            for t in tasks[:10]:
                if isinstance(t, dict) and t.get("title"):
                    taskengine.add_task(pid, t.get("title","task"), t.get("role","backend"), t.get("prompt",""))
            c = taskengine.db()
            c.execute("UPDATE projects SET status='backlog' WHERE id=?", (pid,))
            c.commit(); c.close()
        except Exception as e:
            print("plan err:", e)
    asyncio.create_task(_plan())
    return {"ok": True, "project_id": pid, "planning": True}

async def _unused_plan():
    plan = await taskengine.call_llm(
        "pm1",
        taskengine.ROLE_SYS["pm"],
        f"Project: {name}\nBrief: {brief}\nBuat 6-10 task teknis untuk membangun project ini.")
    try:
        m = re.search(r"\[.*\]", plan, re.S)
        tasks = json.loads(m.group(0)) if m else []
    except Exception:
        tasks = []
    import tasks as _te
    if not tasks:
        # fallback: minta PM ulang dgn output lebih disiplin
        plan2 = await taskengine.call_llm("pm1", taskengine.ROLE_SYS["pm"],
            f"Project: {name}\nBrief: {brief}\nOutput HANYA JSON array, mulai [ akhir ]")
        try:
            m2 = re.search(r"\[.*\]", plan2, re.S)
            tasks = json.loads(m2.group(0)) if m2 else []
        except Exception:
            tasks = []
    for t in tasks[:10]:
        if isinstance(t, dict) and t.get("title"):
            taskengine.add_task(pid, t.get("title","task"), t.get("role","backend"),
                                t.get("prompt",""))
    c = taskengine.db()
    c.execute("UPDATE projects SET status='backlog' WHERE id=?", (pid,))
    c.commit(); c.close()
    return {"ok": True, "project_id": pid, "tasks_created": len(tasks)}

@app.get("/api/tasks")
async def api_tasks(project: int = None):
    return {"tasks": taskengine.list_tasks(project)}

_bg_tasks = set()
_PAUSED = {"on": False}

class TaskIn(BaseModel):
    title: str
    role: str = "backend"
    prompt: str = ""
    project: Optional[int] = None

@app.post("/api/tasks")
async def api_add_task(body: TaskIn):
    """Tambah satu task manual (status pending)."""
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title wajib")
    tid = taskengine.add_task(body.project, title[:200], body.role, (body.prompt or title)[:4000])
    return {"ok": True, "task_id": tid}

@app.post("/api/tasks/pause_all")
async def api_pause_all():
    """Hentikan semua task yang sedang jalan -> kembali pending, dan blok run baru sampai resume."""
    _PAUSED["on"] = True
    n = 0
    for t in list(_bg_tasks):
        if not t.done():
            t.cancel(); n += 1
    c = taskengine.db()
    cur = c.execute("UPDATE tasks SET status='pending' WHERE status IN ('running','assigned')")
    reset = cur.rowcount
    c.commit(); c.close()
    return {"ok": True, "paused": True, "cancelled": n, "reset": reset}

@app.get("/api/tasks/paused")
async def api_paused():
    return {"paused": _PAUSED["on"]}

@app.post("/api/tasks/resume_all")
async def api_resume_all(body: dict = None):
    """Lepas pause lalu jalankan semua task pending/review/failed."""
    import asyncio
    _PAUSED["on"] = False
    pid = (body or {}).get("project")
    ts = [t["id"] for t in taskengine.list_tasks(pid) if t["status"] in ("pending","review","failed")]
    for tid in ts:
        t = asyncio.create_task(taskengine.run_task(tid))
        _bg_tasks.add(t)
        t.add_done_callback(_bg_tasks.discard)
    return {"ok": True, "paused": False, "started": ts}

@app.post("/api/tasks/{tid}/run")
async def api_run_task(tid: int):
    import asyncio
    if _PAUSED["on"]:
        raise HTTPException(409, "paused")
    t = asyncio.create_task(taskengine.run_task(tid))
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return {"ok": True, "started": tid}

@app.get("/api/system/resources")
async def api_system_resources():
    """Pemakaian CPU/RAM per kontainer docker + host, utk panel monitoring."""
    import subprocess, os
    try:
        out = subprocess.run(["docker","stats","--no-stream","--format","{{.Name}} {{.CPUPerc}} {{.MemUsage}}"],
                             capture_output=True, text=True, timeout=15).stdout.strip().splitlines()
        containers = []
        for line in out:
            parts = line.split()
            if len(parts) >= 3:
                containers.append({"name": parts[0], "cpu": parts[1], "mem": " ".join(parts[2:])})
    except Exception as e:
        containers = []
    with open("/proc/loadavg") as f:
        la = f.read().split()
    with open("/proc/meminfo") as f:
        mi = {l.split(":")[0]: l.split()[1] for l in f.readlines()[:3]}
    ram_used = (int(mi["MemTotal"]) - int(mi["MemAvailable"])) // 1024
    ram_total = int(mi["MemTotal"]) // 1024
    return {"containers": containers, "load": la[0], "ram_mb": f"{ram_used}/{ram_total}"}


@app.get("/api/agents/status")
async def api_agents_status():
    """Ringkasan status per agent utk kantor 3D: {agent_id: {status_count, last_status}}."""
    from collections import defaultdict
    cnt = {}
    last = {}
    for t in taskengine.list_tasks(None):
        aid = t.get("agent_id","")
        if not aid: continue
        d = cnt.setdefault(aid, {"done":0,"running":0,"failed":0,"review":0,"pending":0})
        d[t["status"]] = d.get(t["status"],0)+1
        last[aid] = t["status"]
    return {"agents": {k: dict(v, last=last.get(k)) for k,v in cnt.items()}}


@app.get("/api/sandboxes")
async def api_sandboxes():
    import subprocess, os
    out = subprocess.run(["docker","ps","--format","{{.Names}} {{.Status}}"],
                         capture_output=True, text=True).stdout
    boxes = [l for l in out.splitlines() if l.startswith("wfs-agent-")]
    return {"sandboxes": boxes}


@app.post("/api/sandbox/{agent_id}/exec")
async def sandbox_exec(agent_id: str, body: dict):
    """Jalankan kode Python di sandbox agent (executor mandiri)."""
    import sandbox_exec
    return sandbox_exec.run_in_sandbox(agent_id, body.get("code",""), int(body.get("timeout",60)))


@app.post("/api/sandbox/{agent_id}/test")
async def sandbox_test(agent_id: str):
    """Jalankan pytest di workspace sandbox agent."""
    import sandbox_exec
    return sandbox_exec.run_tests_in_sandbox(agent_id)


@app.post("/api/tasks/run_all")
async def api_run_all(body: dict):
    import asyncio
    if _PAUSED["on"]:
        raise HTTPException(409, "paused")
    pid = body.get("project")
    ts = [t["id"] for t in taskengine.list_tasks(pid) if t["status"] in ("pending","review","failed")]
    for tid in ts:
        t = asyncio.create_task(taskengine.run_task(tid))
        _bg_tasks.add(t)
        t.add_done_callback(_bg_tasks.discard)
    return {"ok": True, "started": ts}

@app.post("/api/chat")
async def chat(body: ChatIn):
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

    # Jika agent ai-cs dan pertanyaan soal order → lookup DB asli
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

# ---------- orders ----------
from orders import router as orders_router
app.include_router(orders_router)

# ---------- static ----------
app.mount("/", StaticFiles(directory=BASE / "static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8787)
