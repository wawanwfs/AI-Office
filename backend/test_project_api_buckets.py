"""SIKLUS 237 — bucket status /wfs-project LENGKAP (mirror normalizeTaskStatus frontend).

Bug produksi terbukti live (siklus 237): DB UI ~/wfs-projects/wfs_software_house.db
berisi 55 task status 'ready' (dari orchestrator) + 440 subtask 'queued', tapi
project_snapshot() hanya menghitung 'completed' & 'running' → papan kanban 3D
& TV lounge menampilkan "ANTRI (0) · JALAN (0) · SELESAI (0), 0% selesai"
padahal 55 task antri. failed/review juga tak pernah terisi dari DB.

project_api.py = SATU SUMBER produksi :9503 (drift-gate shared_prod_drift).
Test ini menguji fungsi MURNI logika bucket via import modul (tanpa server,
tanpa menyentuh DB produksi — DB path di-stub via tmp dir per test).
"""
import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_REPO = Path(__file__).resolve().parent.parent
_MOD = _REPO / "backend" / "project_api.py"

# ── helper: muat modul project_api dari sumber repo (bukan produksi) ──
def _load_module():
    spec = importlib.util.spec_from_file_location("project_api_under_test", _MOD)
    mod = importlib.util.module_from_spec(spec)
    sys.modules.pop("project_api_under_test", None)
    spec.loader.exec_module(mod)
    return mod


def _make_db(dirpath, rows):
    """Buat DB UI mini di tmp: tabel tasks dgn skema minimal yang dibaca snapshot."""
    dbp = os.path.join(dirpath, "wfs_software_house.db")
    c = sqlite3.connect(dbp)
    c.execute("CREATE TABLE tasks (id TEXT, title TEXT, status TEXT, created_at REAL, instruction TEXT)")
    c.executemany("INSERT INTO tasks (id, title, status, created_at, instruction) VALUES (?,?,?,?,?)", rows)
    c.commit()
    c.close()
    return dbp


class TestProjectApiBuckets(unittest.TestCase):
    def setUp(self):
        self.mod = _load_module()
        self.mod._cache["data"] = None  # reset cache TTL antar-test
        self.mod._cache["t"] = 0.0
        # isolasi defense-in-depth: modul test lain boleh mempatch DB produksi
        # via database.py — pastikan path produksi TIDAK tersentuh jalur mana pun
        # di test ini (project_api membaca path via expanduser yang di-mock).

    def _snapshot_with_db(self, rows):
        with tempfile.TemporaryDirectory() as td:
            _make_db(td, rows)
            with mock.patch.object(self.mod._os.path, "expanduser", return_value=os.path.join(td, "wfs_software_house.db")):
                return self.mod.project_snapshot()

    def test_source_still_has_full_bucket_logic(self):
        """Guard sumber: pemetaan bucket lengkap tidak boleh menyusut ke 2 status."""
        s = _MOD.read_text()
        for anchor in ("GROUP BY status", '_buckets["pending"]', '_buckets["failed"]',
                       '_buckets["review"]', '"finished"', '"in_progress"', '"error"', '"qa"'):
            self.assertIn(anchor, s)

    def test_ready_tasks_count_as_pending_not_zero(self):
        """Bug inti 237: 55 task 'ready' → pending=55, bukan semua bucket 0."""
        rows = [(f"task-{i:03d}", f"Develop: New Project", "ready", 1793600000.0 + i, "Create New Project") for i in range(55)]
        snap = self._snapshot_with_db(rows)
        t = snap["tasks"]
        self.assertEqual(t["total"], 55)
        self.assertEqual(t["pending"], 55)
        self.assertEqual(t["done"], 0)
        self.assertEqual(t["running"], 0)

    def test_all_status_families_mapped(self):
        """Semua keluarga status frontend (done/running/failed/review/pending) terpetakan."""
        rows = [
            ("t1", "A", "completed", 1.0, "x"),
            ("t2", "B", "done", 2.0, "x"),
            ("t3", "C", "running", 3.0, "x"),
            ("t4", "D", "in_progress", 4.0, "x"),
            ("t5", "E", "failed", 5.0, "x"),
            ("t6", "F", "review", 6.0, "x"),
            ("t7", "G", "ready", 7.0, "x"),
            ("t8", "H", "pending", 8.0, "x"),
        ]
        t = self._snapshot_with_db(rows)["tasks"]
        self.assertEqual(t["done"], 2)
        self.assertEqual(t["running"], 2)
        self.assertEqual(t["failed"], 1)
        self.assertEqual(t["review"], 1)
        self.assertEqual(t["pending"], 2)
        self.assertEqual(t["total"], 8)

    def test_unknown_status_falls_to_pending(self):
        """Status tak dikenal → pending (bukan hilang dari total)."""
        rows = [("t1", "A", "queued", 1.0, "x"), ("t2", "B", "weird-status", 2.0, "x")]
        t = self._snapshot_with_db(rows)["tasks"]
        self.assertEqual(t["pending"], 2)
        self.assertEqual(t["total"], 2)

    def test_recent_keeps_raw_status_for_frontend_normalize(self):
        """recent tetap membawa status mentah — frontend normalize sendiri."""
        rows = [("task-abc", "Judul", "ready", 1.0, "x")]
        snap = self._snapshot_with_db(rows)
        self.assertEqual(snap["tasks"]["recent"][0]["status"], "ready")
        self.assertEqual(snap["tasks"]["recent"][0]["id"], "task-abc")


if __name__ == "__main__":
    unittest.main()
