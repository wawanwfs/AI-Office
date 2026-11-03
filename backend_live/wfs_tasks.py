"""
WFS TASK ENGINE — orchestrator nyata.
PM memecah project → task dispatch ke agent sesuai role → agent kerja via LLM
(masing-masing dengan API config-nya sendiri) → output file nyata di repo
saas-dibantuin → QA review → status board.

SATU SUMBER tasks.py produksi gateway :8787 (wfs-office) — siklus 208 (pola 206/207).

Latar belakang (audit drift siklus 208):
- backend/tasks.py (repo) punya hardening eksekusi (require_launch_approval +
  is_paused/set_paused persisten + claim_task fcntl + recover_interrupted +
  _execution_llm guard paused/approval per-call) TAPI TANPA fitur live:
  load_default memakai env WFS_AI_* (default openai) bukan ~/.hermes/.env.
- ~/wfs-office/tasks.py (produksi :8787) memakai ~/.hermes/.env tapi TANPA
  semua hardening itu — plus BUG PRODUKSI: jalur retry QA-revise memanggil
  asyncio.sleep tanpa import asyncio dalam scope (NameError di produksi),
  dan pause engine in-memory (_PAUSED di server) hilang saat restart.
- File ini = SUPERSET keduanya: fitur live eksak + hardening hidup.
  Ter-track di git, dites backend_live/test_wfs_tasks_orders.py +
  test_wfs_execution_guards.py dan drift-gate src/__tests__/tasks_drift.test.js.

DEPLOY: python3 scripts/apply_wfs_tasks.py --apply
(backup → compile-check → restart wfs-office → smoke → auto-rollback).
JANGAN mengedit ~/wfs-office/tasks.py langsung — drift gate vitest akan FAIL.
"""
import sqlite3, json, os, time, threading, httpx, re
from pathlib import Path

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.db")
REPO = os.path.expanduser("~/wfs-office/saas-dibantuin")
Path(REPO).mkdir(parents=True, exist_ok=True)

def db():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS tasks(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT, title TEXT, role TEXT, agent_id TEXT,
        status TEXT DEFAULT 'pending',   -- pending|assigned|running|review|done|failed
        prompt TEXT, result TEXT, review TEXT,
        files TEXT,                       -- JSON list of file paths
        created REAL, updated REAL)""")
    c.execute("""CREATE TABLE IF NOT EXISTS projects(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, brief TEXT, status TEXT DEFAULT 'planning',
        created REAL)""")
    return c

ROLE_AGENT = {  # role task -> agent executor
    "pm": "pm1", "backend": "be1", "backend2": "be2", "frontend": "fe1",
    "frontend2": "fe2", "mobile": "mob1", "design": "ux1", "devops": "devops1",
    "qa": "qa1", "ai": "ai-train", "integration": "integ", "marketing": "mkt1",
    "cs": "cs-h", "ceo": "ceo",
}

# Siklus 232 — keluarga role bebas dari LLM → kunci kanonik ROLE_AGENT/ROLE_SYS.
# Prompt PM dulu TIDAK membatasi daftar role; LLM bisa balas "security",
# "Frontend Engineer", "Database engineer", dst. → dulu .get(role, "pm1")
# menjatuhkannya diam-diam ke pm1 (SARI, PM) sebagai pelaksana task teknis:
# identitas salah di kanban/UI, QA-review (tuple backend/frontend/devops) &
# sandbox sync meleset. Bukti hidup: task 27 produksi ber-role 'security'
# → dulu agent_id pm1.
_ROLE_KEYWORD_RULES = [
    # (kata-kunci, role kanonik) — dievaluasi berurutan, spesifik dulu
    (("payment", "webhook", "billing", "midtrans", "xendit"), "backend2"),
    (("database", "sql", "postgres", "mysql", "redis"), "backend"),
    (("security", "secops", "pentest", "vulnerab"), "devops"),
    (("infra", "sre", "ci/cd", "kubernetes", "docker", "cloud", "devops"), "devops"),
    (("frontend", "front-end", "react", "vue", "css", "html"), "frontend"),
    (("mobile", "android", "ios", "flutter"), "mobile"),
    (("design", "ui/ux", "figma"), "design"),
    (("qa", "test", "quality"), "qa"),
    (("integration", "integrasi", "whatsapp", "instagram", "marketplace"), "integration"),
    (("marketing", "growth", "seo", "ads"), "marketing"),
    (("support", "customer"), "cs"),
    (("train", "knowledge", "machine learning"), "ai"),
    (("project manager", "manajer proyek", "scrum", "product owner"), "pm"),
]
_ROLE_ALIAS = {  # alias pendek & gaya UI (be/fe/ops/sec/ml) + judul umum LLM
    "be": "backend", "fe": "frontend", "ops": "devops", "sec": "devops",
    "ml": "ai", "dev": "backend", "eng": "backend", "tech": "backend",
    "programmer": "backend", "developer": "backend", "fullstack": "backend",
    "full-stack": "backend", "full stack": "backend",
    "tester": "qa", "qa engineer": "qa", "qa lead": "qa",
    "ui": "design", "uiux": "design", "ux": "design", "designer": "design",
    "devops engineer": "devops", "sysadmin": "devops",
    "backend engineer": "backend", "frontend engineer": "frontend",
    "front end": "frontend", "mobile engineer": "mobile", "mobile dev": "mobile",
    "database engineer": "backend", "data engineer": "backend",
    "product": "pm", "product owner": "pm",
    "growth marketing": "marketing", "digital marketing": "marketing",
    "customer support": "cs", "integration engineer": "integration",
    "integrator": "integration", "ai engineer": "ai", "machine learning": "ai",
    "ml engineer": "ai", "ml specialist": "ai", "ml": "ai",
}
_ROLE_CANON = set(ROLE_AGENT.keys())  # kunci sah = kunci ROLE_SYS juga


def normalize_role(role):
    """Siklus 232 — role mentah (dari LLM/manual/API) → kunci kanonik engine.

    Kembalikan PERSIS salah satu kunci ROLE_AGENT/ROLE_SYS, agar:
    - ROLE_AGENT.get(role) SELALU kena (tidak ada fallback senyap), dan
    - ROLE_SYS.get(t["role"], ROLE_SYS["backend"]) di _execute_task memakai
      system prompt yang koheren dgn agent eksekutor (dulu dua keputusan dari
      dua map berbeda bisa tidak konsisten: agent pm1 + prompt backend).
    Fallback terakhir 'backend' (bukan 'pm'): task teknis dikerjakan engineer.
    """
    r = str(role or "").strip().lower()
    if r in _ROLE_CANON:
        return r
    if r in _ROLE_ALIAS:
        return _ROLE_ALIAS[r]
    # heuristic kata-kunci utk frasa bebas dari LLM ("Security Engineer", dst.)
    for keys, canon in _ROLE_KEYWORD_RULES:
        if any(k in r for k in keys):
            return canon
    return "backend"


def parse_qa_verdict(review):
    """Siklus 233 — ekstrak verdict QA ('pass' atau 'revise') dari output LLM QA.

    ROLE_SYS['qa'] menginstruksikan format teks: "jawab mulai dengan 'VERDICT: pass' atau
    'VERDICT: revise'". Dulu _execute_task mengecek regex JSON r'"verdict"\\s*:\\s*"(pass|revise)"'
    sehingga respons teks standar dari Rina QA ("VERDICT: revise...") gagal cocok,
    jatuh diam-diam ke default 'pass', dan task bermasalah langsung ditandai 'done'
    tanpa revisi.

    Kini mendukung:
    - Pola teks prompt: "VERDICT: pass" / "VERDICT: revise" (case-insensitive)
    - Pola JSON: {"verdict": "pass"} / {"verdict": "revise"}
    - Pola awalan: kata pertama baris diawali 'pass' atau 'revise'
    Fallback aman: 'pass'.
    """
    if not review or not isinstance(review, str):
        return "pass"
    m = re.search(r'(?:verdict\s*[:=]\s*["\']?|["\']verdict["\']\s*:\s*["\'])(pass|revise)["\']?', review, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    first_line = review.strip().splitlines()[0].strip().lower() if review.strip() else ""
    if first_line.startswith("revise") or (("revise" in first_line) and ("pass" not in first_line)):
        return "revise"
    if first_line.startswith("pass"):
        return "pass"
    return "pass"

def add_project(name, brief):
    c = db()
    cur = c.execute("INSERT INTO projects(name,brief,status,created) VALUES(?,?, 'planning',?)",
                    (name, brief, time.time()))
    pid = cur.lastrowid
    c.commit(); c.close()
    return pid

def list_projects():
    c = db()
    rows = c.execute("SELECT id,name,status FROM projects ORDER BY id DESC").fetchall()
    c.close()
    return [{"id":r[0],"name":r[1],"status":r[2]} for r in rows]

def add_task(project, title, role, prompt):
    role = normalize_role(role)  # siklus 232: tanpa role liar masuk DB
    c = db()
    proj = str(project).strip() if (project is not None and str(project).strip() != "") else None
    cur = c.execute("""INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)
        VALUES(?,?,?,?, 'pending',?,?,?)""",
        (proj, title, role, ROLE_AGENT.get(role, "be1"), prompt, time.time(), time.time()))
    tid = cur.lastrowid
    c.commit(); c.close()
    return tid

def list_tasks(project=None):
    c = db()
    proj = str(project).strip() if (project is not None and str(project).strip() != "") else None
    if proj:
        rows = c.execute("SELECT id,project,title,role,agent_id,status,files,review,created,updated FROM tasks WHERE project=? ORDER BY id",(proj,)).fetchall()
    else:
        rows = c.execute("SELECT id,project,title,role,agent_id,status,files,review,created,updated FROM tasks ORDER BY id").fetchall()
    c.close()
    return [{"id":r[0],"project":r[1],"title":r[2],"role":r[3],"agent_id":r[4],
             "status":r[5],"files":json.loads(r[6] or "[]"),"review":r[7],
             "created":r[8],"updated":r[9],"created_at":r[8],"updated_at":r[9]} for r in rows]

def get_task(tid):
    c = db()
    r = c.execute("SELECT id,project,title,role,agent_id,status,prompt,result,files,review,created,updated FROM tasks WHERE id=?",(tid,)).fetchone()
    c.close()
    if not r: return None
    return {"id":r[0],"project":r[1],"title":r[2],"role":r[3],"agent_id":r[4],
            "status":r[5],"prompt":r[6],"result":r[7],"files":json.loads(r[8] or "[]"),
            "review":r[9],"created":r[10],"updated":r[11],"created_at":r[10],"updated_at":r[11]}

def move_task(tid, status):
    """Siklus 235 — pindahkan task ke kolom kanban dari UI (persist, bukan optimis-lokal).

    Dulu TaskBoard drag-drop & tombol 'Pindah Kolom' hanya mengubah state React:
    TIDAK ADA endpoint status di gateway (POST /api/tasks/{id}/status = 404 live)
    dan poll 8 dtk membalikkan posisi kartu diam-diam (kelas 'badge live palsu'
    siklus 203/204). Engine sediakan mutasi eksplisit:

    - status target WAJIB salah satu status engine sah (pending/assigned/running/
      review/done/failed) — string lain ditolak ValueError (bukan fallback senyap).
    - approval-gate: task tanpa approval project_launch ditolak PermissionError
      (paritas run_task — mutasi status juga gate mesin berbayar yang sama).
    - 'running' via move TIDAK menjalankan LLM apa pun (hanya set_status).
    """
    tid = int(tid)
    s = str(status or "").strip().lower()
    _VALID_MOVE = ("pending", "assigned", "running", "review", "done", "failed")
    if s not in _VALID_MOVE:
        raise ValueError(f"status tidak sah: {status!r} (sah: {', '.join(_VALID_MOVE)})")
    t = get_task(tid)
    if not t:
        raise LookupError("task not found")
    require_launch_approval(t["project"])
    set_status(tid, s)
    return get_task(tid)


def set_status(tid, status, result=None, files=None, review=None):
    c = db()
    if status == "running":
        c.execute("UPDATE tasks SET status=?,updated=? WHERE id=?",(status,time.time(),tid))
    else:
        c.execute("""UPDATE tasks SET status=?,result=COALESCE(?,result),
            files=COALESCE(?,files),review=COALESCE(?,review),updated=? WHERE id=?""",
            (status,result,json.dumps(files) if files else None,review,time.time(),tid))
    c.commit(); c.close()

# ---------- LLM execution ----------
def load_default():
    """Konfigurasi AI default gateway (fitur live produksi, eksak siklus 200):

    Baca ~/.hermes/.env (CUSTOM_BASE_URL + CUSTOM_API_KEY, model 'auto') —
    fallback kosong jujur bila file absen. Override env WFS_AI_* tetap
    didukung untuk test/isolasi.
    """
    env = {}
    try:
        with open(os.path.expanduser("~/.hermes/.env")) as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, _, v = line.strip().partition("=")
                    env[k] = v
    except Exception:
        pass
    return {
        "base": os.environ.get("WFS_AI_BASE") or env.get("CUSTOM_BASE_URL", "https://token.lightvela.ai/v1").rstrip("/"),
        "key": os.environ.get("WFS_AI_KEY") or env.get("CUSTOM_API_KEY", ""),
        "model": os.environ.get("WFS_AI_MODEL") or "auto",
    }

DEFAULT_AI = load_default()
ROLE_SYS = {
    "backend": 'Kamu Budi, Backend Engineer. Balas HANYA satu JSON object: {"files":[{"path":"app/models/tenant.py","code":"<kode lengkap python>"},{"path":"...","code":"..."}]}. Minimal 3 file, path nyata unik, kode lengkap siap jalan. Tanpa teks lain.',
    "backend2": 'Kamu Rizky, Backend payment/webhook. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "frontend": 'Kamu Dewi, Frontend React/Next.js. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "frontend2": 'Kamu Andi, Frontend performa/PWA. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "devops": 'Kamu Toni, DevOps. Balas HANYA JSON object {"files":[{"path":"Dockerfile","code":"..."},{"path":"docker-compose.yml","code":"..."}]}. Kode lengkap. Tanpa teks lain.',
    "qa": "Kamu Rina, QA. Review kode task ini: jawab mulai dengan 'VERDICT: pass' atau 'VERDICT: revise' lalu 1-3 kalimat alasan singkat.",
    "pm": "Kamu Sari, Product Manager. Pecah brief menjadi daftar task teknis. Jawab HANYA JSON valid array, tiap item WAJIB ada key: role, title, desc. role HANYA salah satu dari: backend, backend2, frontend, frontend2, mobile, design, devops, qa, ai, integration, marketing, cs, pm (jangan buat role lain). Mulai dengan '[' langsung.",
    "default": "Kamu anggota tim engineering WFS. Jawab langsung, padat, teknis."
}


def load_agent_cfg(agent_id):
    """Baca config agent dari config/agents.json (toleran).

    File hilang/rusak/bukan JSON → {} (jangan 500). Handle file ditutup
    eksplisit via context manager (sebelumnya open() telanjang bocor FD).
    """
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "agents.json")
    try:
        with open(cfg_path, encoding="utf-8") as f:
            return json.load(f).get(agent_id, {})
    except Exception:
        return {}


async def call_llm(agent_id, sys_prompt, user_prompt):
    # API config per agent (config/agents.json) atau default
    cfg = load_agent_cfg(agent_id)
    base = cfg.get("base") or DEFAULT_AI["base"]
    key = cfg.get("key") or DEFAULT_AI["key"]
    model = cfg.get("model") or DEFAULT_AI["model"]
    last_err = None
    async with httpx.AsyncClient(timeout=300) as cl:
        for attempt in range(2):
            try:
                r = await cl.post(base.rstrip("/")+"/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": model, "max_tokens": 20000, "temperature": 0.2,
                          "messages":[{"role":"system","content":sys_prompt},
                                      {"role":"user","content":user_prompt}]})
                d = r.json()
                msg = d.get("choices",[{}])[0].get("message",{})
                out = msg.get("content") or msg.get("reasoning_content") or ""
                if out.strip():
                    return out
                last_err = RuntimeError("empty content: "+str(d)[:200])
            except Exception as e:
                last_err = e
    raise last_err or RuntimeError("no output")

FILE_RE_SPLIT = "### FILE:"

def write_json_files(task_id, output):
    """Parse JSON array [{path, code}] / {"files":[...]} → tulis file. Return list path atau None."""
    import json as _json
    txt = output.strip()
    if txt.startswith("```"):
        txt = txt.strip("`")
        if txt.startswith("json"):
            txt = txt[4:]
        txt = txt.strip()
    try:
        data = _json.loads(txt)
    except Exception:
        # JSON terbenam di dalam reasoning text — cari {"files": ...}
        import re as _re
        m = _re.search(r'\{\s*"files"\s*:', txt)
        if not m:
            return None
        depth = 0
        startpos = m.start()
        for i in range(startpos, len(txt)):
            if txt[i] == '{':
                depth += 1
            elif txt[i] == '}':
                depth -= 1
                if depth == 0:
                    try:
                        data = _json.loads(txt[startpos:i+1])
                        break
                    except Exception:
                        return None
        else:
            return None
    items = data.get("files") if isinstance(data, dict) else data
    if isinstance(data, dict) and "files" not in data and data.get("path"):
        items = [data]  # format single file {"path","code"}
    if not isinstance(items, list):
        return None
    written = []
    for it in items:
        if not isinstance(it, dict):
            continue
        path = str(it.get("path") or it.get("file") or "").strip()
        code = it.get("code") or it.get("content") or ""
        if not path or " " in path or len(path) > 120 or path.startswith(("<", "path", "nama")):
            continue
        fp = Path(REPO) / path
        if not str(fp.resolve()).startswith(str(Path(REPO).resolve())):
            continue
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(code)
        written.append(path)
    return written or None

def write_output_files(task_id, output):
    """Parse '### FILE: path ```...```' → tulis file nyata, return list path"""
    written = []
    if FILE_RE_SPLIT not in output:
        # simpan sebagai dokumen
        p = Path(REPO)/"docs"/f"task_{task_id}_output.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(output)
        return [str(p.relative_to(REPO))]
    import re
    parts = output.split(FILE_RE_SPLIT)[1:]
    for part in parts:
        lines = part.strip().split("\n",1)
        rawpath = lines[0].strip()
        body = lines[1] if len(lines)>1 else ""
        # path bersih: buang " — deskripsi" & backticks & spasi
        path = rawpath.split(" — ")[0].split(" - ")[0].split("`")[0].strip().rstrip(".,;")
        # skip kalau bukan path valid (mengandung spasi/kalimat)
        if not path or " " in path or len(path)>120 or path.startswith(("path","<","blocks","nama/path","app/nama_file","nama_file","README_PAYLOADS.md or","requirements.txt /")):
            continue
        m = re.search(r"```\w*\n(.*?)```", body, re.S)
        if m: body = m.group(1)
        elif body.strip().startswith("```"):
            blines = body.strip().split("\n")
            body = "\n".join(blines[1:-1]) if len(blines)>2 else body
        if not body.strip():
            continue
        fp = Path(REPO)/path
        if not str(fp.resolve()).startswith(str(Path(REPO).resolve())):
            continue  # safety
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(body)
        written.append(path)
    if len(written)==1 and written[0] in ("app/nama_file.py",):
        written=[]
    if not written and FILE_RE_SPLIT in output:
        p = Path(REPO)/"docs"/f"task_{task_id}_output.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(output)
        return [str(p.relative_to(REPO))]
    return written

def require_launch_approval(project):
    """Approval gate eksekusi task (hardening siklus 186) — DB approvals.

    Lokasi DB software house: modul `database` repo bila tersedia (git
    checkout / backend_live dgn sys.path), fallback produksi ~/wfs-hq/
    database.py (gateway :8787 tidak memuat database.py — path eksplisit,
    pola import 3-tingkat wfs_api_service.py). DB absen = FAIL LOUD
    (PermissionError jelas, bukan lolos diam-diam): mesin berbayar tidak
    pernah eksekusi tanpa approval terbaca.
    """
    from contextlib import closing
    try:
        import database  # noqa: F401  (repo / backend_live via sys.path)
        conn_cm = closing(database.get_db())
    except ImportError:
        import importlib.util
        _db_py = os.path.expanduser("~/wfs-hq/database.py")
        spec = importlib.util.spec_from_file_location("wfs_database_live", _db_py)
        if spec is None or spec.loader is None:
            raise PermissionError('project_launch approval required (database.py tidak ditemukan)')
        _dbm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_dbm)
        conn_cm = closing(_dbm.get_db())
    with conn_cm as conn:
        row = conn.execute(
            "SELECT status FROM approvals WHERE project_id=? AND action_type='project_launch' "
            "ORDER BY created_at DESC, rowid DESC LIMIT 1", (str(project),)).fetchone()
    if not row or row[0] != 'approved':
        raise PermissionError('project_launch approval required')


def is_paused():
    c = db()
    c.execute("CREATE TABLE IF NOT EXISTS engine_state (key TEXT PRIMARY KEY, value INTEGER)")
    row = c.execute("SELECT value FROM engine_state WHERE key='paused'").fetchone()
    c.close()
    return bool(row and row[0])


def set_paused(paused):
    c = db()
    c.execute("CREATE TABLE IF NOT EXISTS engine_state (key TEXT PRIMARY KEY, value INTEGER)")
    c.execute("INSERT OR REPLACE INTO engine_state VALUES ('paused', ?)", (int(paused),))
    c.commit(); c.close()


def claim_task(tid):
    """OS lock survives concurrent processes, and is released on process death."""
    import fcntl
    lock = open(f'{DB}.{tid}.lock', 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError('already running')
    return lock


def release_task(tid, claim):
    claim.close()


def recover_interrupted():
    recovered = 0
    for task in list_tasks():
        if task['status'] not in ('running', 'assigned'):
            continue
        try:
            claim = claim_task(task['id'])
        except RuntimeError:
            continue
        try:
            if get_task(task['id'])['status'] in ('running', 'assigned'):
                set_status(task['id'], 'pending')
                recovered += 1
        finally:
            release_task(task['id'], claim)
    return recovered


async def run_task(tid, attempt_no=0):
    import asyncio
    t = get_task(tid)
    if not t:
        raise LookupError('task not found')
    require_launch_approval(t['project'])
    if is_paused():
        raise RuntimeError('paused')
    claim = claim_task(tid)
    try:
        if get_task(tid)['status'] not in ('pending', 'review', 'failed'):
            raise RuntimeError('task is not runnable')
        await _execute_task(tid, attempt_no)
    except asyncio.CancelledError:
        set_status(tid, 'pending')
        raise
    finally:
        release_task(tid, claim)


async def _execution_llm(tid, *args):
    import asyncio
    if is_paused():
        raise asyncio.CancelledError()
    require_launch_approval(get_task(tid)['project'])
    result = await call_llm(*args)
    if is_paused():
        raise asyncio.CancelledError()
    require_launch_approval(get_task(tid)['project'])
    return result


async def _execute_task(tid, attempt_no=0):
    import asyncio
    t = get_task(tid)
    require_launch_approval(t['project'])
    set_status(tid, "running")
    try:
        # Multi-call: minta daftar path dulu, lalu 1 call per file (muat max_tokens)
        import re as _rex
        all_files = []
        plan_out = await _execution_llm(tid, t["agent_id"],
            'Kamu engineer. Dari brief berikut, balas HANYA JSON: {"paths":["app/x.py","..."]} daftar 4-6 path file yang harus dibuat. Tanpa teks lain.',
            t["prompt"])
        paths = []
        try:
            pj = json.loads(plan_out[plan_out.index("{"):plan_out.rindex("}")+1])
            paths = [p for p in pj.get("paths",[]) if isinstance(p,str) and "/" in p][:6]
        except Exception:
            paths = []
        if not paths:
            out = await _execution_llm(tid, t["agent_id"], ROLE_SYS.get(t["role"], ROLE_SYS["backend"]), t["prompt"])
            files = write_json_files(tid, out) or write_output_files(tid, out)
            result_out = out
        else:
            role_sys = ROLE_SYS.get(t["role"], ROLE_SYS["backend"])
            for p in paths:
                try:
                    fout = await _execution_llm(tid, t["agent_id"],
                        'Balas HANYA JSON: {"path":"%s","code":"<kode lengkap>"}. Kode lengkap siap jalan. Tanpa teks lain.' % p,
                        t["prompt"])
                    fl = write_json_files(tid, fout)
                    if fl:
                        all_files.extend(fl)
                except Exception:
                    continue
            files = all_files
            result_out = plan_out
            if not files:
                p = Path(REPO)/"docs"/f"task_{tid}_output.md"
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("no files produced")
                files = [str(p.relative_to(REPO))]
        set_status(tid, "review", result=result_out[:8000], files=files)
        sync_sandbox(t["agent_id"], files if isinstance(files, list) else [])
        # QA review utk task kode — mulai dari hasil test sandbox (bukti objektif)
        if t["role"] in ("backend","backend2","frontend","frontend2","devops"):
            test_evidence = ""
            try:
                import sandbox_exec
                tr = sandbox_exec.run_tests_in_sandbox(t["agent_id"], timeout=90)
                if "collected" in tr.get("output","") or "passed" in tr.get("output","") or "error" in tr.get("output",""):
                    test_evidence = f"\n\nHASIL TEST SANDBOX (ok={tr['ok']}):\n{tr['output'][:1500]}"
            except Exception:
                pass
            review = await _execution_llm(tid, 'qa1',
                ROLE_SYS['qa'],
                f"Review task ini: '{t['title']}'. Output agent:\n\n{result_out[:6000]}{test_evidence}\n\nNilai layak/pass atau perlu revisi.")
            verdict = parse_qa_verdict(review)
            set_status(tid, 'done' if verdict=='pass' else 'review',
                       review=review[:3000])
            if verdict != "pass" and attempt_no < 1:
                await asyncio.sleep(2)
                await _execute_task(tid, attempt_no + 1)
                return
        else:
            set_status(tid, "done")
    except Exception as e:
        set_status(tid, "failed", result=str(e)[:2000])


def sync_sandbox(agent_id: str, files: list) -> str:
    """Salin file hasil agent ke sandbox docker agent tsb (jalan). Return path atau ''."""
    import shutil, subprocess
    sb = os.path.expanduser(f"~/wfs-office/sandboxes/{agent_id}/workspace")
    if not os.path.isdir(sb):
        return ""
    copied = []
    for f in files:
        src = os.path.join(REPO, f)
        if os.path.isfile(src):
            dst = os.path.join(sb, f)
            os.makedirs(os.path.dirname(dst) or sb, exist_ok=True)
            shutil.copy2(src, dst)
            copied.append(f)
    return f"{len(copied)} file ke sandbox {agent_id}"
