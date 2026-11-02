"""Test wfs_tasks.py & wfs_orders.py — SATU SUMBER engine produksi :8787 (siklus 208).

Migrasi backend/test_tasks_orders.py (pola 206/207); modul superset =
hardening eksekusi (approval gate + pause persisten + claim fcntl) +
fitur live (~/.hermes/.env default AI).

Sengaja memakai DB SQLite sementara (tmp_path) via monkeypatch variabel
global `DB`, supaya TIDAK menyentuh tasks.db / orders.db produksi.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))            # modul superset backend_live
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))  # database.py repo

import pytest

import wfs_tasks as tasks
import wfs_orders as orders


@pytest.fixture
def tmp_tasks_db(tmp_path, monkeypatch):
    monkeypatch.setattr(tasks, "DB", str(tmp_path / "tasks_test.db"))
    return tmp_path


@pytest.fixture
def tmp_orders_db(tmp_path, monkeypatch):
    monkeypatch.setattr(orders, "DB", str(tmp_path / "orders_test.db"))
    orders.init()
    return tmp_path


# ---------------- tasks.py ----------------

def test_add_project_and_list(tmp_tasks_db):
    pid = tasks.add_project("Proyek A", "ringkas")
    assert isinstance(pid, int) and pid > 0
    projects = tasks.list_projects()
    assert projects and projects[0]["name"] == "Proyek A"
    assert projects[0]["status"] == "planning"


def test_add_task_maps_role_agent(tmp_tasks_db):
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "Buat API", "backend", "tolong buatkan")
    row = tasks.get_task(tid)
    assert row["agent_id"] == "be1"      # dari ROLE_AGENT
    assert row["status"] == "pending"
    assert int(row["project"]) == pid     # kolom project ber-tipe TEXT


def test_add_task_normalizes_unknown_role_to_backend(tmp_tasks_db):
    """Siklus 232 — role tak dikenal TIDAK lagi jatuh diam-diam ke pm1.

    Dulu: ROLE_AGENT.get(role, "pm1") → task teknis dari planning dieksekusi
    SARI (PM) dgn system prompt backend — identitas salah + QA-review &
    sinkron sandbox meleset. Kini dinormalisasi ke 'backend' (be1) — koheren
    dgn ROLE_SYS.get(role, ROLE_SYS["backend"]) di _execute_task.
    """
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "T", "role-aneh", "x")
    row = tasks.get_task(tid)
    assert row["role"] == "backend"
    assert row["agent_id"] == "be1"


def test_add_task_normalizes_llm_role_family_to_canonical(tmp_tasks_db):
    """Siklus 232 — keluarga role bebas dari LLM (prompt pm lama tak membatasi
    daftar) dipetakan ke kunci kanonik ROLE_AGENT/ROLE_SYS. Bukti hidup:
    tasks.db produksi punya task 27 role='security' yang TIDAK ADA di
    ROLE_AGENT → dulu agent_id pm1. Kini 'security' → devops (Toni, tim
    DevOps & Security sesuai team_spec UI) → QA-review tuple & sandbox
    sync kena."""
    pid = tasks.add_project("P", "b")
    cases = [
        # (role mentah dari LLM, role kanonik, agent_id)
        ("security", "devops", "devops1"),
        ("Security Engineer", "devops", "devops1"),
        ("Frontend Engineer", "frontend", "fe1"),
        ("UI/UX Designer", "design", "ux1"),
        ("Payment gateway specialist", "backend2", "be2"),
        ("QA", "qa", "qa1"),
        ("Test Engineer", "qa", "qa1"),
        ("Mobile dev", "mobile", "mob1"),
        ("Project Manager", "pm", "pm1"),
        ("Growth marketing", "marketing", "mkt1"),
        ("Integration WhatsApp API", "integration", "integ"),
        ("Customer support", "cs", "cs-h"),
        ("ML Engineer", "ai", "ai-train"),
        ("Database engineer", "backend", "be1"),
        ("", "backend", "be1"),
        (None, "backend", "be1"),
    ]
    for raw, canon, agent in cases:
        tid = tasks.add_task(pid, f"T-{raw}", raw, "x")
        row = tasks.get_task(tid)
        assert row["role"] == canon, (
            f"role {raw!r} → {row['role']!r}, harusnya {canon!r}")
        assert row["agent_id"] == agent, (
            f"role {raw!r} → agent {row['agent_id']!r}, harusnya {agent!r}")


def test_list_tasks_filter_by_project(tmp_tasks_db):
    p1 = tasks.add_project("P1", "b")
    p2 = tasks.add_project("P2", "b")
    tasks.add_task(p1, "T1", "backend", "p")
    tasks.add_task(p2, "T2", "frontend", "p")
    only_p1 = tasks.list_tasks(project=p1)
    assert [t["title"] for t in only_p1] == ["T1"]
    assert tasks.list_tasks()[0]["agent_id"]  # semua task


def test_set_status_updates_result_and_files(tmp_tasks_db):
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "T", "qa", "p")
    tasks.set_status(tid, "done", result="OK", files=["a.py"], review="lulus")
    row = tasks.get_task(tid)
    assert row["status"] == "done"
    assert row["result"] == "OK"
    assert row["files"] == ["a.py"]


def test_get_task_missing_returns_none(tmp_tasks_db):
    assert tasks.get_task(999999) is None


def test_load_agent_cfg_reads_and_falls_back(tmp_path, monkeypatch):
    # agents.json dibaca relatif ke direktori modul tasks (__file__).
    cfg_dir = tmp_path / "config"
    cfg_dir.mkdir()
    (cfg_dir / "agents.json").write_text(json.dumps({
        "be1": {"model": "m1", "key": "k1"},
        "default": {"model": "m0"},
    }))
    monkeypatch.setattr(tasks, "__file__", str(tmp_path / "tasks.py"))
    assert tasks.load_agent_cfg("be1") == {"model": "m1", "key": "k1"}
    # agent tak dikenal → {} (default global dipakai call_llm)
    assert tasks.load_agent_cfg("nope") == {}
    # file hilang → {}, tidak throw (pola anti-poisoning)
    (cfg_dir / "agents.json").rename(cfg_dir / "agents.json.bak")
    assert tasks.load_agent_cfg("be1") == {}
    # JSON rusak → {}
    (cfg_dir / "agents.json").write_text("bukan json {")
    assert tasks.load_agent_cfg("be1") == {}


# ---------------- orders.py ----------------

def test_init_seeds_demo_orders(tmp_orders_db):
    data = orders.list_orders()
    assert data["ok"] is True
    ids = [o["id"] for o in data["orders"]]
    assert 1024 in ids and 1025 in ids and 1026 in ids


def test_get_order_found(tmp_orders_db):
    r = orders.get_order(1024)
    assert r["ok"] is True
    assert r["order"]["customer"] == "Bu Sari"
    assert r["order"]["total"] == 36000


def test_get_order_not_found(tmp_orders_db):
    r = orders.get_order(9999)
    assert r["ok"] is False
    assert "tidak ditemukan" in r["error"].lower()


def test_create_order_computes_total_and_next_id(tmp_orders_db):
    r = orders.create_order(orders.OrderIn(
        customer="Tes",
        items=[{"nama": "Kopi", "qty": 2, "harga": 15000},
               {"nama": "Teh", "qty": 1, "harga": 5000}],
    ))
    assert r["ok"] is True
    assert r["total"] == 35000
    assert r["order_id"] > 1026
    assert orders.get_order(r["order_id"])["order"]["customer"] == "Tes"


def test_lookup_parses_order_number(tmp_orders_db):
    r = orders.lookup("status pesanan saya #1025 gimana ya?")
    assert r["ok"] is True
    assert r["order"]["id"] == 1025


def test_lookup_without_number_returns_error(tmp_orders_db):
    r = orders.lookup("pesanan saya belum datang")
    assert r["ok"] is False
