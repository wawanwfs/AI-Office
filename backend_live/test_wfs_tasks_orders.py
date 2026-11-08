"""Test wfs_tasks.py & wfs_orders.py — SATU SUMBER engine produksi :8787 (siklus 208).

Migrasi backend/test_tasks_orders.py (pola 206/207); modul superset =
hardening eksekusi (approval gate + pause persisten + claim fcntl) +
fitur live (~/.hermes/.env default AI).

Sengaja memakai DB SQLite sementara (tmp_path) via monkeypatch variabel
global `DB`, supaya TIDAK menyentuh tasks.db / orders.db produksi.
"""
import json
import inspect
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
    assert "created" in only_p1[0]
    assert "updated" in only_p1[0]
    assert "created_at" in only_p1[0]
    assert "updated_at" in only_p1[0]
    assert tasks.list_tasks()[0]["agent_id"]  # semua task


def test_list_tasks_and_add_task_string_slug_and_timestamps(tmp_tasks_db):
    """Siklus 234 — project slug teks (misal 'proj-demo') & timestamp konsisten."""
    tid = tasks.add_task("proj-demo", "Task Demo", "devops", "deploy infra")
    row = tasks.get_task(tid)
    assert row is not None
    assert row["project"] == "proj-demo"
    assert row["title"] == "Task Demo"
    assert row["role"] == "devops"
    assert row["created"] is not None
    assert row["updated"] is not None
    assert row["created_at"] == row["created"]
    assert row["updated_at"] == row["updated"]

    # Filter string slug eksak
    filtered = tasks.list_tasks(project="proj-demo")
    assert len(filtered) == 1
    assert filtered[0]["id"] == tid
    assert filtered[0]["project"] == "proj-demo"
    assert filtered[0]["created"] is not None
    assert filtered[0]["created_at"] is not None

    # Filter string kosong / None kembalikan semua
    assert len(tasks.list_tasks(project="")) >= 1
    assert len(tasks.list_tasks(project=None)) >= 1
    # Filter project yang tidak ada kembalikan kosong
    assert tasks.list_tasks(project="nonexistent-slug") == []


def test_set_status_updates_result_and_files(tmp_tasks_db):
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "T", "qa", "p")
    tasks.set_status(tid, "done", result="OK", files=["a.py"], review="lulus")
    row = tasks.get_task(tid)
    assert row is not None
    assert row["status"] == "done"
    assert row["result"] == "OK"
    assert row["files"] == ["a.py"]
    assert row["review"] == "lulus"  # siklus 234: review tidak lagi di-drop oleh get_task
    assert row["created"] is not None
    assert row["updated"] is not None
    assert row["created_at"] == row["created"]
    assert row["updated_at"] == row["updated"]


def test_parse_qa_verdict_prompt_format():
    """Siklus 233 — format teks prompt 'VERDICT: pass' / 'VERDICT: revise' dikenali benar."""
    assert tasks.parse_qa_verdict("VERDICT: revise\nAda kegagalan syntax di models.py") == "revise"
    assert tasks.parse_qa_verdict("VERDICT: pass\nSemua fungsi dan unit test berjalan baik") == "pass"
    assert tasks.parse_qa_verdict("VERDICT:revise\nTanpa spasi setelah titik dua") == "revise"
    assert tasks.parse_qa_verdict("verdict: revise\nHuruf kecil") == "revise"
    assert tasks.parse_qa_verdict("verdict: pass\nHuruf kecil") == "pass"


def test_parse_qa_verdict_json_and_edge_cases():
    """Siklus 233 — format JSON, awalan baris, dan fallback toleran."""
    # JSON payload dari LLM yang memilih format terstruktur
    assert tasks.parse_qa_verdict('{"verdict": "revise", "reason": "kurang exception"}') == "revise"
    assert tasks.parse_qa_verdict('{"verdict": "pass"}') == "pass"
    # Awalan baris jika LLM melupakan kata VERDICT
    assert tasks.parse_qa_verdict("Revise - test sandbox gagal pada endpoint auth") == "revise"
    assert tasks.parse_qa_verdict("Pass - implementasi sesuai spesifikasi") == "pass"
    # Fallback aman jika kosong / non-string / output ambigu
    assert tasks.parse_qa_verdict("") == "revise"
    assert tasks.parse_qa_verdict(None) == "revise"
    assert tasks.parse_qa_verdict("Teks penjelasan bebas tanpa putusan tegas") == "revise"


def test_parse_qa_verdict_closes_prompt_regex_discrepancy():
    """Siklus 233 — bukti merah->hijau penutupan bug: regex JSON lama GAGAL pada format teks prompt."""
    import re as _re
    qa_output = "VERDICT: revise\nFungsi belum menangani koneksi database putus."
    
    # Perilaku lama (bug): regex JSON menghasilkan None -> jatuh diam-diam ke 'pass'
    old_vm = _re.search(r'"verdict"\s*:\s*"(pass|revise)"', qa_output)
    assert old_vm is None, "Regex lama terbukti TIDAK cocok dengan format teks prompt"
    old_verdict = old_vm.group(1) if old_vm else "pass"
    assert old_verdict == "pass", "Bug lama terbukti: review revise ditandai pass!"
    
    # Perilaku baru (fix): parse_qa_verdict menghasilkan 'revise' secara akurat
    new_verdict = tasks.parse_qa_verdict(qa_output)
    assert new_verdict == "revise"


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


# ---------------- siklus 235: move_task persist kanban ----------------

def test_move_task_persists_status_and_rejects_invalid(tmp_tasks_db, monkeypatch):
    """Siklus 235 — pindah kolom kanban UI TERSIMPAN (dulu optimis-lokal).

    Dulu TaskBoard drag-drop/quick-move hanya mengubah state React: TIDAK ADA
    endpoint/engine mutasi status (POST /api/tasks/{id}/status live = 404) dan
    poll 8 dtk membalikkan posisi kartu diam-diam. engine.move_task kini satu
    sumber mutasi: validasi status sah + set_status persist.
    """
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "T", "backend", "p")
    assert tasks.get_task(tid)["status"] == "pending"

    # Pindah ke done → persist (bukan hanya return value). move = mutasi status
    # MURNI tanpa gate approval: tidak memicu LLM/kontainer/uang ('running' via
    # move hanya label; eksekusi nyata tetap eksklusif jalur run + approval).
    row = tasks.move_task(tid, "done")
    assert row["status"] == "done"
    assert tasks.get_task(tid)["status"] == "done"
    assert tasks.get_task(tid)["updated"] >= tasks.get_task(tid)["created"]

    # Pindah balik ke pending → persist juga
    assert tasks.move_task(tid, "Pending")["status"] == "pending"  # case-insensitive

    # Status tak sah → ValueError LOUD (tanpa fallback senyap)
    for bad in ("selesai", "archived", "", None, "DROP TABLE"):
        with pytest.raises(ValueError, match="status tidak sah"):
            tasks.move_task(tid, bad)

    # Task tak ada → LookupError (endpoint memetakan 404)
    with pytest.raises(LookupError):
        tasks.move_task(999999, "done")

    # Jalur eksekusi run TETAP digate approval (paritas uang) — siklus 186 tetap
    # hidup di jalur run/claim, bukan dipindah ke move_task.
    src = inspect.getsource(tasks)
    assert "require_launch_approval" in src
    run_src = src[src.index("async def run_task"):]
    assert "require_launch_approval(t['project'])" in run_src


def test_get_task_full_detail_has_prompt_and_result(tmp_tasks_db):
    """Siklus 236 — get_task menyajikan detail lengkap utk endpoint /api/tasks/{tid}.

    list_tasks sengaja ramping (tanpa prompt/result — payload poll 8 dtk),
    jadi satu-satunya sumber brief & output agen adalah get_task. Kontrak:
    prompt tersimpan saat add_task terbaca kembali eksak, result yang ditulis
    set_status terbaca, task absen tetap None (endpoint memetakan 404).
    """
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "Tulis modul auth", "backend", "buat login + JWT refresh")
    row = tasks.get_task(tid)
    assert row is not None
    assert row["prompt"] == "buat login + JWT refresh"  # brief tampil di modal
    assert row["result"] is None  # belum dieksekusi — tanpa result palsu

    tasks.set_status(tid, "done", result="auth.py selesai, 3 test hijau")
    row2 = tasks.get_task(tid)
    assert row2 is not None
    assert row2["result"] == "auth.py selesai, 3 test hijau"
    assert row2["prompt"] == "buat login + JWT refresh"  # brief tak tertimpa

    assert tasks.get_task(999999) is None


def test_qa_ambiguous_cannot_auto_pass():
    """No explicit approval in a QA text means a review, not a success."""
    for invalid in ("", None, "All good, probably", "Need additional tests"):
        assert tasks.parse_qa_verdict(invalid) == "revise"
