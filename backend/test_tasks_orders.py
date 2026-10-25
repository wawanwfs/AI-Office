"""Unit test untuk modul tasks.py & orders.py (backend WFS AI-Office).

Sengaja memakai DB SQLite sementara (tmp_path) via monkeypatch variabel
global `DB`, supaya TIDAK menyentuh tasks.db / orders.db produksi.
"""
import json

import pytest

import tasks
import orders


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


def test_add_task_default_agent_unknown_role(tmp_tasks_db):
    pid = tasks.add_project("P", "b")
    tid = tasks.add_task(pid, "T", "role-aneh", "x")
    assert tasks.get_task(tid)["agent_id"] == "pm1"


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
