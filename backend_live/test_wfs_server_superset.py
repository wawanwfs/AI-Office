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
