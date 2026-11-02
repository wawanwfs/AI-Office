"""Regression tests for the superset gateway wfs_server.py (siklus 209).

Menarget superset backend_live/wfs_server.py — satu sumber server produksi
:8787 (pola 206/207/208). Skenario kunci:

- load_default = delegasi eksak ke taskengine.load_default() (satu sumber dgn
  engine 208) — bukan env openai, bukan duplikasi parser .env.
- Mode ganda guarded database.py: modul ada -> mode REPO (workspace/approvals/
  preview/events SSE); modul absen/rusak -> mode LIVE (routers read-only,
  /api/projects engine-only, planning tanpa sandbox) — startup tidak pernah
  menabrak, tapi require_launch_approval engine tetap LOUD (siklus 208).
- FIX #2 (pause persisten): /api/tasks/paused membaca taskengine.is_paused()
  (DB engine_state) — bukan _PAUSED in-memory server lama; pause_all menulis
  lewat engine dan resume yang ditolak tidak menghapus pause.
- /api/tasks/{tid}/run: guard 409 pause SEBELUM _schedule (mesin berbayar
  tidak pernah terjadwal saat paused).
- Hardening repo hidup: parser /proc toleran (anti-poisoning), /api/config
  key_hint tidak pernah membocorkan key penuh, sandbox exec _clamp_int,
  root redirect :9503 eksak (fitur live), catch-all 503 jujur tanpa static.
"""
import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import wfs_server as server
import wfs_tasks as taskengine


# ---------- kontrak superset: satu sumber + fitur live eksak ----------

def test_load_default_delegates_to_engine_single_source():
    assert server.load_default is taskengine.load_default or (
        server.load_default() == taskengine.load_default())
    src = Path(server.__file__).read_text()
    assert "def load_default():" in src
    assert "taskengine.load_default()" in src  # delegasi, bukan duplikasi
    assert "https://api.openai.com/v1" not in src  # default openai repo lama TIDAK kembali


def test_agents_meta_live_contract_bantuin():
    # Fitur live eksak: ai-cs = Bantuin AI dibantuin.com (frontend produksi).
    assert server.AGENTS_META["ai-cs"]["name"] == "Bantuin AI"
    assert "dibantuin.com" in server.ROLE_PROMPTS["ai-cs"]
    assert len(server.AGENTS_META) == 15


def test_root_redirects_to_kantor_9503():
    cl = TestClient(server.app)
    r = cl.get("/", follow_redirects=False)
    assert r.status_code == 307
    assert "100.117.198.46:9503" in r.headers["location"]


def test_unknown_path_honest_503_without_static():
    # Gateway produksi tidak melayani static; path tak dikenal -> 503 jujur
    # (hardening repo — bukan 404 generik).
    cl = TestClient(server.app)
    r = cl.get("/path/tidak/ada")
    assert r.status_code in (404, 503)


# ---------- mode ganda guarded database.py ----------

def test_dual_mode_guarded_startup():
    src = Path(server.__file__).read_text()
    # Guarded import: exception apa pun -> mode Live, startup tidak menabrak.
    assert "except Exception:\n        return None" in src
    assert "SH_DB.init_db()" in src
    # Routers live hanya di mode LIVE; kontrak jujur tercatat.
    assert "wfs_sh_console" in src and "wfs_events" in src and "wfs_dashboard_stats" in src


def test_live_mode_projects_engine_only():
    # Mode LIVE: /api/projects = engine list (fitur live eksak, tanpa merge SH_DB).
    async def scenario():
        out = await server.api_projects()
        assert "projects" in out
    asyncio.run(scenario())


# ---------- FIX #2: pause persisten via engine (bukan in-memory) ----------

def test_paused_endpoint_reads_engine_persistent_state(monkeypatch):
    monkeypatch.setattr(taskengine, "is_paused", lambda: True)
    assert asyncio.run(server.api_paused()) == {"paused": True}
    monkeypatch.setattr(taskengine, "is_paused", lambda: False)
    assert asyncio.run(server.api_paused()) == {"paused": False}
    src = Path(server.__file__).read_text()
    assert 'return {"paused": taskengine.is_paused()}' in src
    # Keadaan in-memory server lama TIDAK kembali (assignment/pemakaian).
    assert "_PAUSED = {" not in src and '_PAUSED["on"]' not in src


def test_run_task_rejects_paused_before_scheduling(monkeypatch):
    monkeypatch.setattr(taskengine, "is_paused", lambda: True)
    scheduled = []
    monkeypatch.setattr(server, "_schedule", lambda tids: scheduled.append(tids))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.api_run_task(999))
    assert exc.value.status_code == 409
    assert scheduled == []  # tidak pernah menjadwal saat paused


def test_pause_all_uses_engine_and_resume_keeps_pause_on_reject(monkeypatch):
    state = {"paused": True}
    monkeypatch.setattr(taskengine, "set_paused", lambda v: state.update(paused=v))
    monkeypatch.setattr(taskengine, "is_paused", lambda: state["paused"])
    monkeypatch.setattr(taskengine, "recover_interrupted", lambda: 0)
    # Satu task kandidat resume; get_task -> None = _check_task menolak 404.
    monkeypatch.setattr(taskengine, "list_tasks",
                        lambda project=None: [{"id": 999, "status": "pending"}])
    monkeypatch.setattr(taskengine, "get_task", lambda tid: None)
    out = asyncio.run(server.api_pause_all())
    assert out["paused"] is True
    # resume DITOLAK di pintu (task tidak sah) -> pause PERSISTEN tidak ikut terhapus.
    with pytest.raises(HTTPException):
        asyncio.run(server.api_resume_all({"project": 424242}))
    assert state["paused"] is True


# ---------- hardening repo hidup di server superset ----------

def test_proc_parsers_tolerant():
    assert server._parse_meminfo("MemTotal: abc\nMemAvailable:\n") == {"MemTotal": 0, "MemAvailable": 0}
    assert server._parse_uptime_s("junk") == 0
    assert server._parse_loadavg(None) == "0.00"
    assert server._clamp_int("x", 60, 1, 600) == 60


def test_config_endpoint_never_leaks_full_key():
    cfg = {"be1": {"key": "sk-super-secret-1234567890", "base": "http://x", "model": "m"}}
    class FakeCfg:
        def __init__(self, payload): self.payload = payload
    monkey_payload = cfg
    old = server.load_cfg
    server.load_cfg = lambda: monkey_payload
    try:
        out = server.get_cfg("be1")
    finally:
        server.load_cfg = old
    assert out["key_set"] is True
    assert "sk-super-secret" not in out["key_hint"] and "1234567890" not in out["key_hint"]


def test_sandbox_exec_timeout_clamped(monkeypatch):
    seen = {}
    class FakeSE:
        @staticmethod
        def run_in_sandbox(agent_id, code, timeout):
            seen["timeout"] = timeout
            return {"ok": True}
    import types
    fake = types.ModuleType("sandbox_exec")
    fake.run_in_sandbox = FakeSE.run_in_sandbox
    monkeypatch.setitem(sys.modules, "sandbox_exec", fake)
    asyncio.run(server.sandbox_exec("be1", {"code": "1", "timeout": "99999"}))
    assert seen["timeout"] == 600
    asyncio.run(server.sandbox_exec("be1", None))  # body None -> guard, tak melempar
    assert seen["timeout"] == 60


def test_schedule_hardening_claim_and_rollback_alive():
    src = Path(server.__file__).read_text()
    assert "taskengine.claim_task(tid)" in src
    assert "taskengine.release_task(tid, claim)" in src
    assert "taskengine.require_launch_approval(task['project'])" in src
    # Rollback reservasi saat konflik.
    assert "for tid, claim in claims.items():" in src


# ---------- HEAD mirror (siklus 227, pola 226) ----------

def test_head_mirror_replays_get_routes():
    # FastAPI APIRoute tidak mendaftarkan HEAD otomatis: tanpa mirror, HEAD
    # /api/health = 405 allow: GET (bukti live siklus 227) — monitor berbasis
    # HEAD menerima "service down" palsu. Middleware REPLAY HEAD -> GET lewat
    # app asli: status + Content-Type == GET, body kosong; Content-Length
    # == panjang body GET replay-nya SENDIRI. Untuk body statis CL harus
    # persis; /api/health memuat time.time() -> CL berubah antar call
    # (dinamis) — CL-eksis saja yang diwajibkan di situ.
    with TestClient(server.app) as cl:
        g = cl.get("/api/health")
        h = cl.head("/api/health")
        assert h.status_code == g.status_code == 200
        assert h.headers["content-type"] == g.headers["content-type"]
        assert int(h.headers["content-length"]) > 0
        assert h.content == b""
        # Rute router: paused (persisten) & agents (15 agen) — body statis,
        # CL wajib persis == GET.
        for path in ("/api/tasks/paused", "/api/agents"):
            g = cl.get(path)
            h = cl.head(path)
            assert h.status_code == g.status_code == 200, path
            assert h.headers["content-length"] == g.headers["content-length"], path
            assert h.content == b"", path


def test_head_mirror_keeps_post_only_and_unknown_as_is():
    # Path tanpa rute GET TIDAK di-mirror: POST-only /api/tasks/999999/run
    # dan path asing sama-sama jatuh ke catch-all "not built" (repo checkout
    # tanpa backend/static: 503 jujur) — status HEAD persis GET, bukan hasil
    # replay rute GET lain (mirror tidak menambah status palsu).
    with TestClient(server.app) as cl:
        for path in ("/api/tasks/999999/run", "/path/tidak/ada"):
            g = cl.get(path)
            h = cl.head(path)
            assert g.status_code == h.status_code in (404, 405, 422, 503), path
            assert h.content == b""


def test_head_mirror_sse_excluded_and_replay_contract_in_source():
    src = Path(server.__file__).read_text()
    # SSE /api/events DIKECUALIKAN eksplisit SEBELUM cek replay (GET streaming
    # tanpa ujung akan di-buffer tanpa selesai oleh mirror).
    assert 'scope.get("path", "").split("?")[0] == "/api/events"' in src
    # Pola replay eksak (anti-deadlock terukur siklus 226: receive asli
    # TIDAK di-drain — transport mem-block receive sampai response selesai).
    assert 'get_scope["method"] = "GET"' in src
    assert "await self.app(get_scope, replay_receive, capture)" in src
    assert "receive asli TIDAK di-drain" in src
    # Header hop-by-hop dilucuti lalu CL diisi ulang dari panjang body GET.
    assert '_STRIP_OUT = (b"content-length", b"transfer-encoding")' in src
    assert "app.add_middleware(HeadMirrorMiddleware)" in src
    assert "recover_interrupted" in src


# ---------- siklus 229: background LLM planning TIDAK boleh tanpa referensi ----------

def test_plan_project_tasks_holds_strong_ref_and_pausable():
    """Pitfall asyncio resmi: loop hanya menyimpan WEAK ref ke task —
    `asyncio.create_task(coro)` tanpa menyimpan result-nya bisa di-GC di
    tengah jalan (planning LLM berbayar mati diam-diam, project STUCK
    status 'planning' selamanya). Kontrak _plan_project_tasks:

    1. Referensi kuat disimpan (set _bg_tasks) SEBELUM handler kembali.
    2. Done-callback membuang task dari set itu (anti-kebocoran memori,
       pola eksak _schedule() baris 1024-1030).
    3. Pause engine menghentikan planning SEBELUM call LLM berbayar
       (CancelledError -> project dikembalikan 'pending', bukan menggantung
       'planning' tanpa task) — pause_all yang mengcancel via _bg_tasks
       kini MENEMBUK planning juga (dulu: tidak terlacak).
    4. Anti-pola telanjang dilarang: `create_task(` tanpa penugasan.
    """
    src = Path(server.__file__).read_text()
    # (1)+(2): pola _schedule harus ada di _plan_project_tasks juga.
    assert "_bg_tasks.add(plan_t)" in src
    assert "plan_t.add_done_callback" in src
    assert "_bg_tasks.discard(plan_t)" in src
    # Anti-pola: create_task hasilnya WAJIB di-assign (tidak ada pemanggilan
    # telanjang create_task(...) tanpa penugasan di seluruh superset).
    assert "    asyncio.create_task(" not in src
    # (3): guard pause sebelum LLM berbayar + status kembali 'pending'.
    assert "taskengine.is_paused()" in src
    assert "UPDATE projects SET status='pending' WHERE id=?" in src
    # Jaring exception tetap ada (print "plan err") — kegagalan plan LOUD di log.
    assert 'print("plan err:", e)' in src


def test_plan_project_tasks_pause_and_gc_contract_behavior(tmp_path, monkeypatch):
    """Perilaku nyata, bukan cuma source: (a) pause -> tak ada call LLM,
    project kembali 'pending'; (b) referensi kuat terlihat di server._bg_tasks
    selama coroutine hidup — GC weakref-loop tidak bisa membuangnya; (c) task
    dibersihkan dari _bg_tasks setelah selesai (tidak bocor)."""
    monkeypatch.setattr(taskengine, "DB", str(tmp_path / "tasks.db"))
    pid = taskengine.add_project("P229", "brief uji")
    assert pid is not None
    called = {"n": 0}

    async def fake_llm(*a, **k):
        called["n"] += 1
        await asyncio.sleep(0.05)
        return '[{"title":"t1","role":"backend","prompt":"x"}]'

    monkeypatch.setattr(taskengine, "call_llm", fake_llm)

    async def scenario():
        # (a) pause: planning dibatalkan SEBELUM LLM berbayar.
        taskengine.set_paused(True)
        server._bg_tasks.clear()
        server._plan_project_tasks(pid, "P229", "brief uji")
        await asyncio.gather(*server._bg_tasks, return_exceptions=True)
        assert called["n"] == 0, "LLM berbayar dipanggil saat paused!"
        c = taskengine.db()
        st = c.execute("SELECT status FROM projects WHERE id=?", (pid,)).fetchone()[0]
        c.close()
        assert st == "pending", f"project menggantung {st!r}, bukan 'pending'"
        # (b) tanpa pause: referensi kuat ada di _bg_tasks selama hidup.
        taskengine.set_paused(False)
        server._bg_tasks.clear()
        server._plan_project_tasks(pid, "P229", "brief uji")
        assert len(server._bg_tasks) == 1, "task planning TIDAK dipegang kuat"
        await asyncio.gather(*server._bg_tasks, return_exceptions=True)
        # (c) selesai -> bersih, tak bocor.
        assert len(server._bg_tasks) == 0, "_bg_tasks bocor"
        c = taskengine.db()
        row = c.execute(
            "SELECT status FROM projects WHERE id=?", (pid,)).fetchone()[0]
        n = c.execute("SELECT COUNT(*) FROM tasks WHERE project=?",
                      (str(pid),)).fetchone()[0]
        c.close()
        assert row == "backlog"
        assert n == 1

    asyncio.run(scenario())


def test_plan_project_tasks_llm_failure_marks_failed_not_stuck(tmp_path, monkeypatch):
    """Siklus 230 — sisa jalur STUCK 'planning' terakhir ditutup.

    LLM gagal (HTTP/timeout) ATAU respons tak bisa di-parse: dulu except-umum
    HANYA print tanpa UPDATE -> project menggantung status 'planning' tanpa
    jejak selamanya (founder melihat 'planning' mayat). Kini project WAJIB
    dikembalikan 'failed' — terlihat di UI & bisa di-retry. Dua varian:
    (a) call_llm raise; (b) respons sukses tapi tanpa array JSON.
    """
    monkeypatch.setattr(taskengine, "DB", str(tmp_path / "tasks.db"))
    taskengine.set_paused(False)

    def _status_of(pid):
        c = taskengine.db()
        st = c.execute("SELECT status FROM projects WHERE id=?", (pid,)).fetchone()[0]
        c.close()
        return st

    async def _drain():
        await asyncio.gather(*server._bg_tasks, return_exceptions=True)

    def _spawn_and_drain(pid, name, brief):
        async def scenario():
            server._plan_project_tasks(pid, name, brief)
            await asyncio.gather(*server._bg_tasks, return_exceptions=True)
        asyncio.run(scenario())

    # (a) call_llm melempar exception (HTTP 500 / timeout dari provider).
    pid_a = taskengine.add_project("P230a", "brief gagal")

    async def boom(*a, **k):
        raise RuntimeError("provider HTTP 503")

    monkeypatch.setattr(taskengine, "call_llm", boom)
    server._bg_tasks.clear()
    _spawn_and_drain(pid_a, "P230a", "brief gagal")
    assert _status_of(pid_a) == "failed", (
        f"project STUCK {_status_of(pid_a)!r} setelah LLM gagal — bug siklus 229 tersisa")
    n = taskengine.db().execute(
        "SELECT COUNT(*) FROM tasks WHERE project=?", (str(pid_a),)).fetchone()[0]
    assert n == 0, "task tidak boleh ter-add saat LLM gagal"

    # (b) LLM sukses tapi respons TIDAK mengandung array JSON → parse gagal
    #     (json.loads / regex [..] tak menemukan apa pun) → tetap 'failed'.
    pid_b = taskengine.add_project("P230b", "brief jawaban aneh")

    async def garbage(*a, **k):
        return "Maaf, saya tidak bisa membuat rencana saat ini."

    monkeypatch.setattr(taskengine, "call_llm", garbage)
    server._bg_tasks.clear()
    _spawn_and_drain(pid_b, "P230b", "brief jawaban aneh")
    assert _status_of(pid_b) == "failed", (
        f"project STUCK {_status_of(pid_b)!r} pada respons tak ter-parse")

    # (c) Siklus 231 — LLM sukses, respons berupa array JSON VALID, tapi SEMUA
    #     entri tanpa title ([{"role":"backend"}]) → guard parse-kosong 230b
    #     lolos (len>0) namun loop for menolak semua → 0 task ter-add → project
    #     ditulis 'backlog' dengan 0 TASK — dead-end senyap yang sama.
    pid_c = taskengine.add_project("P231c", "brief entri tanpa title")

    async def no_title(*a, **k):
        return '[{"role":"backend","prompt":"buat API"},{"desc":"tanpa title"}]'

    monkeypatch.setattr(taskengine, "call_llm", no_title)
    server._bg_tasks.clear()
    _spawn_and_drain(pid_c, "P231c", "brief entri tanpa title")
    assert _status_of(pid_c) == "failed", (
        f"project STUCK {_status_of(pid_c)!r} pada array tanpa title valid")

    # Anti-STUCK permanen: seluruh jalur exit _plan() menulis status non-'planning'.
    src = Path(server.__file__).read_text()
    body = src[src.index("async def _plan():"):src.index("plan_t = asyncio.create_task")]
    assert "UPDATE projects SET status='failed' WHERE id=?" in body
    assert "UPDATE projects SET status='backlog' WHERE id=?" in body
    assert "UPDATE projects SET status='pending' WHERE id=?" in body


def test_api_tasks_supports_string_slug_and_numeric_project(tmp_path, monkeypatch):
    """Siklus 234 — /api/tasks query & POST mendukung project slug teks & numerik (anti-422)."""
    # Isolasi tasks.db ke tmp_path agar tidak menyenggol DB produksi
    fake_db = str(tmp_path / "tasks.db")
    monkeypatch.setattr(taskengine, "DB", fake_db)

    with TestClient(server.app) as cl:
        # 1. GET saat DB kosong / filter slug teks tidak boleh 422
        r = cl.get("/api/tasks?project=proj-demo")
        assert r.status_code == 200
        assert r.json() == {"tasks": []}

        # 2. GET dengan string kosong atau numerik tidak boleh 422
        assert cl.get("/api/tasks?project=").status_code == 200
        assert cl.get("/api/tasks?project=123").status_code == 200
        assert cl.get("/api/tasks").status_code == 200

        # 3. POST task dengan project slug teks (dulu 422 Unprocessable Entity)
        r_post = cl.post("/api/tasks", json={
            "title": "Setup CI pipeline",
            "role": "devops",
            "prompt": "bikin workflow github actions",
            "project": "proj-demo"
        })
        assert r_post.status_code == 200
        data_post = r_post.json()
        assert data_post["ok"] is True
        tid1 = data_post["task_id"]

        # 4. POST task dengan project numerik
        r_post2 = cl.post("/api/tasks", json={
            "title": "Migrasi database",
            "role": "backend",
            "prompt": "alter table",
            "project": 101
        })
        assert r_post2.status_code == 200
        tid2 = r_post2.json()["task_id"]

        # 5. GET filter string slug mengembalikan task yang relevan
        r_slug = cl.get("/api/tasks?project=proj-demo")
        assert r_slug.status_code == 200
        tasks_slug = r_slug.json()["tasks"]
        assert len(tasks_slug) == 1
        assert tasks_slug[0]["id"] == tid1
        assert tasks_slug[0]["project"] == "proj-demo"
        assert tasks_slug[0]["role"] == "devops"
        assert "created" in tasks_slug[0]
        assert "created_at" in tasks_slug[0]

        # 6. GET filter numeric string mengembalikan task numerik
        r_num = cl.get("/api/tasks?project=101")
        assert r_num.status_code == 200
        tasks_num = r_num.json()["tasks"]
        assert len(tasks_num) == 1
        assert tasks_num[0]["id"] == tid2
        assert tasks_num[0]["project"] == "101"

        # 7. GET tanpa filter mengembalikan semua task
        r_all = cl.get("/api/tasks")
        assert r_all.status_code == 200
        assert len(r_all.json()["tasks"]) == 2

    # Kontrak statis sumber server
    src = Path(server.__file__).read_text()
    assert "async def api_tasks(project: Optional[str] = None):" in src
    assert "project: Optional[Union[int, str]] = None" in src
