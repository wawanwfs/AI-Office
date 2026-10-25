# -*- coding: utf-8 -*-
"""Unit test untuk backend/database.py — fondasi state WFS Software House."""
import time
import pytest


@pytest.fixture()
def db(tmp_path):
    # Isolasi lokasi DB agar test tidak menyentuh data nyata di ~/wfs-projects.
    import database as sh
    sh.DB_DIR = str(tmp_path)
    sh.DB_PATH = str(tmp_path / "test_sh.db")
    sh.init_db()
    yield sh


def test_init_seeds_agents(db):
    agents = db.list_agents()
    assert len(agents) >= 11
    floors = {a["floor"] for a in agents}
    assert floors == {1, 2, 3}
    # setiap agent punya role & warna
    for a in agents:
        assert a["role"] and a["color"]


def test_save_and_list_projects(db):
    now = time.time()
    db.save_project({
        "id": "p1", "name": "Website WFS", "slug": "website-wfs",
        "description": "company profile", "project_type": "website",
        "tech_stack": "React/Vite", "workspace_path": "/tmp/p1",
        "container_id": None, "container_name": None,
        "preview_port": None, "preview_url": None, "status": "draft",
        "created_at": now,
    })
    projs = db.list_projects()
    assert any(p["id"] == "p1" for p in projs)
    got = db.get_project("p1")
    assert got and got["name"] == "Website WFS"
    # lookup by slug juga bekerja
    assert db.get_project("website-wfs") and db.get_project("website-wfs")["id"] == "p1"


def test_get_overview(db):
    ov = db.get_overview()
    assert "projects" in ov and "tasks" in ov and "agents" in ov
    assert ov["agents"] >= 11
    assert isinstance(ov["task_by_status"], dict)
    assert isinstance(ov["agent_by_status"], dict)
    # recent_logs adalah daftar
    assert isinstance(ov["recent_logs"], list)


def test_log_event_and_recent(db):
    db.log_event("test message", project_id="p99", level="INFO", source="test")
    logs = db.get_recent_logs(limit=5)
    assert logs and logs[0]["message"] == "test message"


def test_approval_lifecycle(db):
    aid = db.add_approval(project_id="2", action_type="project_launch",
                          description="Setujui peluncuran POS")
    pending = db.list_approvals("pending")
    assert any(a["id"] == aid and a["status"] == "pending" for a in pending)
    assert db.set_approval(aid, "approved") is True
    assert db.set_approval("tidak-ada", "approved") is False
    approved = db.list_approvals("approved")
    assert any(a["id"] == aid and a["status"] == "approved" for a in approved)
