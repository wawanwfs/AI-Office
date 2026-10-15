"""
WFS TASK ENGINE — orchestrator nyata.
PM memecah project → task dispatch ke agent sesuai role → agent kerja via LLM
(masing-masing dengan API config-nya sendiri) → output file nyata di repo
saas-dibantuin → QA review → status board.
"""
import sqlite3, json, os, time, threading, httpx
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
    c = db()
    cur = c.execute("""INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)
        VALUES(?,?,?,?, 'pending',?,?,?)""",
        (project, title, role, ROLE_AGENT.get(role, "pm1"), prompt, time.time(), time.time()))
    tid = cur.lastrowid
    c.commit(); c.close()
    return tid

def list_tasks(project=None):
    c = db()
    if project:
        rows = c.execute("SELECT id,project,title,role,agent_id,status,files,review FROM tasks WHERE project=? ORDER BY id",(project,)).fetchall()
    else:
        rows = c.execute("SELECT id,project,title,role,agent_id,status,files,review FROM tasks ORDER BY id").fetchall()
    c.close()
    return [{"id":r[0],"project":r[1],"title":r[2],"role":r[3],"agent_id":r[4],
             "status":r[5],"files":json.loads(r[6] or "[]"),"review":r[7]} for r in rows]

def get_task(tid):
    c = db()
    r = c.execute("SELECT id,project,title,role,agent_id,status,prompt,result,files FROM tasks WHERE id=?",(tid,)).fetchone()
    c.close()
    if not r: return None
    return {"id":r[0],"project":r[1],"title":r[2],"role":r[3],"agent_id":r[4],
            "status":r[5],"prompt":r[6],"result":r[7],"files":json.loads(r[8] or "[]")}

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
    """Konfigurasi AI default dari environment: WFS_AI_BASE, WFS_AI_KEY, WFS_AI_MODEL."""
    return {"base": os.environ.get("WFS_AI_BASE", "https://api.openai.com/v1").rstrip("/"),
            "key": os.environ.get("WFS_AI_KEY", ""),
            "model": os.environ.get("WFS_AI_MODEL", "gpt-4o-mini")}

DEFAULT_AI = load_default()
ROLE_SYS = {
    "backend": 'Kamu Budi, Backend Engineer. Balas HANYA satu JSON object: {"files":[{"path":"app/models/tenant.py","code":"<kode lengkap python>"},{"path":"...","code":"..."}]}. Minimal 3 file, path nyata unik, kode lengkap siap jalan. Tanpa teks lain.',
    "backend2": 'Kamu Rizky, Backend payment/webhook. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "frontend": 'Kamu Dewi, Frontend React/Next.js. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "frontend2": 'Kamu Andi, Frontend performa/PWA. Balas HANYA JSON object {"files":[{"path":"...","code":"..."}]}. Minimal 3 file, kode lengkap. Tanpa teks lain.',
    "devops": 'Kamu Toni, DevOps. Balas HANYA JSON object {"files":[{"path":"Dockerfile","code":"..."},{"path":"docker-compose.yml","code":"..."}]}. Kode lengkap. Tanpa teks lain.',
    "qa": "Kamu Rina, QA. Review kode task ini: jawab mulai dengan 'VERDICT: pass' atau 'VERDICT: revise' lalu 1-3 kalimat alasan singkat.",
    "pm": "Kamu Sari, Product Manager. Pecah brief menjadi daftar task teknis. Jawab HANYA JSON valid array, tiap item: role, title, desc. Mulai dengan '[' langsung.",
    "default": "Kamu anggota tim engineering WFS. Jawab langsung, padat, teknis."
}


async def call_llm(agent_id, sys_prompt, user_prompt):
    # API config per agent (config/agents.json) atau default
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "agents.json")
    cfg = {}
    try:
        cfg = json.load(open(cfg_path)).get(agent_id, {})
    except Exception:
        pass
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

async def run_task(tid, attempt_no=0):
    t = get_task(tid)
    if not t: return
    set_status(tid, "running")
    try:
        # Multi-call: minta daftar path dulu, lalu 1 call per file (muat max_tokens)
        import re as _rex
        all_files = []
        plan_out = await call_llm(t["agent_id"],
            'Kamu engineer. Dari brief berikut, balas HANYA JSON: {"paths":["app/x.py","..."]} daftar 4-6 path file yang harus dibuat. Tanpa teks lain.',
            t["prompt"])
        paths = []
        try:
            pj = json.loads(plan_out[plan_out.index("{"):plan_out.rindex("}")+1])
            paths = [p for p in pj.get("paths",[]) if isinstance(p,str) and "/" in p][:6]
        except Exception:
            paths = []
        if not paths:
            out = await call_llm(t["agent_id"], ROLE_SYS.get(t["role"], ROLE_SYS["backend"]), t["prompt"])
            files = write_json_files(tid, out) or write_output_files(tid, out)
            result_out = out
        else:
            role_sys = ROLE_SYS.get(t["role"], ROLE_SYS["backend"])
            for p in paths:
                try:
                    fout = await call_llm(t["agent_id"],
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
            review = await call_llm("qa1",
                ROLE_SYS["qa"],
                f"Review task ini: '{t['title']}'. Output agent:\n\n{result_out[:6000]}{test_evidence}\n\nNilai layak/pass atau perlu revisi.")
            import re as _re
            vm = _re.search(r'"verdict"\s*:\s*"(pass|revise)"', review)
            verdict = vm.group(1) if vm else "pass"
            set_status(tid, "done" if verdict=="pass" else "review",
                       review=review[:3000])
            if verdict != "pass" and attempt_no < 1:
                await asyncio.sleep(2)
                await run_task(tid, attempt_no + 1)
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
