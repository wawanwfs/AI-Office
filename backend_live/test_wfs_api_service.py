"""Test wfs_api_service.py — SATU SUMBER api_service produksi wfs-hq (:9503).

Siklus 207 — migrasi backend/test_api_service.py (pola 206): modul superset
= hardening 2026-10-28 (parse Content-Length toleran + cap body 5MB -> 413)
+ fitur live produksi (DELETE /api/tasks reset, DELETE /api/tasks/{id}).

Fokus: parsing body (crash-proof header malformed), early-return 413, dan
perilaku endpoint DELETE dengan DB terisolasi (tmp_path).
"""

import io
import json
import unittest

import wfs_api_service as m
from wfs_api_service import MAX_API_BODY, _content_length, handle_api_request


class FakeHeaders:
    def __init__(self, d):
        self._d = d or {}

    def get(self, key, default=None):
        return self._d.get(key, default)


class FakeHandler:
    """Objek pengganti handler HTTP untuk memanggil handle_api_request langsung."""

    def __init__(self, headers=None, body=b""):
        self.headers = FakeHeaders(headers or {})
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self._status = None
        self._headers = []
        self._ended = False

    def send_response(self, code):
        self._status = code

    def send_header(self, name, value):
        self._headers.append((name, value))

    def end_headers(self):
        self._ended = True


def _decode(fh):
    raw = fh.wfile.getvalue()
    try:
        return json.loads(raw)
    except Exception:
        return {"_raw": raw.decode("utf-8", "replace")}


class TestContentLength(unittest.TestCase):
    def test_invalid_values_default_to_zero(self):
        for raw in ("abc", "12.5", "", None):
            with self.subTest(raw=raw):
                self.assertEqual(_content_length(FakeHeaders({"Content-Length": raw})), 0)

    def test_negative_defaults_to_zero(self):
        self.assertEqual(_content_length(FakeHeaders({"Content-Length": "-7"})), 0)

    def test_valid_value_parsed(self):
        self.assertEqual(_content_length(FakeHeaders({"Content-Length": "42"})), 42)

    def test_missing_header_defaults_to_zero(self):
        self.assertEqual(_content_length(FakeHeaders({})), 0)


class TestPostBodyLimit(unittest.TestCase):
    def test_oversized_content_length_returns_413_before_db(self):
        # Header Content-Length palsu yang melebihi batas -> 413 segera,
        # tanpa membaca body / menyentuh DB (early-return sebelum branch API).
        fh = FakeHandler(headers={"Content-Length": str(MAX_API_BODY + 1)})
        handled = handle_api_request(fh, "POST", "/api/projects")
        self.assertTrue(handled)
        self.assertEqual(fh._status, 413)
        self.assertEqual(_decode(fh), {"error": "payload terlalu besar"})

    def test_at_max_boundary_not_blocked_early(self):
        # Tepat di batas harus lolos check ukuran (dilanjutkan ke dispatch; bukan 413).
        fh = FakeHandler(headers={"Content-Length": str(MAX_API_BODY)})
        handled = handle_api_request(fh, "POST", "/api/projects")
        self.assertNotEqual(fh._status, 413)
        self.assertTrue(handled)


class TestLiveDeleteEndpoints(unittest.TestCase):
    """Fitur live produksi (drift 207): DELETE reset + DELETE per task."""

    @classmethod
    def setUpClass(cls):
        import database
        import tempfile
        cls._tmp = tempfile.mkdtemp(prefix="wfs_api_svc_207_")
        database.DB_DIR = cls._tmp
        database.DB_PATH = cls._tmp + "/test_sh.db"
        database.init_db()

    @classmethod
    def tearDownClass(cls):
        import shutil
        shutil.rmtree(cls._tmp, ignore_errors=True)

    def _seed(self):
        import database
        import time
        database.save_project({
            "id": "p207", "name": "Proj 207", "slug": "proj-207",
            "description": "", "project_type": "website",
            "tech_stack": "HTML", "workspace_path": self._tmp + "/ws",
            "container_id": None, "container_name": None,
            "preview_port": None, "preview_url": None, "status": "draft",
            "created_at": time.time(),
        })
        database.log_event("log 207")

    def test_delete_tasks_reset_clears_all_and_keeps_module_contract(self):
        self._seed()
        fh = FakeHandler()
        handled = handle_api_request(fh, "DELETE", "/api/tasks")
        self.assertTrue(handled)
        self.assertEqual(fh._status, 200)
        data = _decode(fh)
        self.assertTrue(data.get("ok"))
        self.assertIn("cleared_tasks", data)

        import database
        conn = database.get_db()
        for table in ("tasks", "projects"):
            n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            self.assertEqual(n, 0, table)
        # execution_logs dibersihkan lalu log_event menulis TEPAT satu log reset
        # (perilaku produksi eksak — bukan nol, dan bukan log lama).
        logs = conn.execute("SELECT message FROM execution_logs").fetchall()
        agents_idle = conn.execute(
            "SELECT COUNT(*) FROM agents WHERE status='idle'").fetchone()[0]
        total_agents = conn.execute("SELECT COUNT(*) FROM agents").fetchone()[0]
        conn.close()
        self.assertEqual(len(logs), 1)
        self.assertIn("Reset data", logs[0][0])
        self.assertGreater(total_agents, 0)
        self.assertEqual(agents_idle, total_agents)

    def test_delete_single_task(self):
        # tanpa task nyata pun endpoint harus hidup dan mengembalikan remaining
        fh = FakeHandler()
        handled = handle_api_request(fh, "DELETE", "/api/tasks/tidak-ada-207")
        self.assertTrue(handled)
        self.assertEqual(fh._status, 200)
        data = _decode(fh)
        self.assertTrue(data.get("ok"))
        self.assertIn("remaining", data)


class TestSupersetContract(unittest.TestCase):
    """Superset = hardening + fitur live, keduanya hidup di satu file."""

    def test_module_carries_both_sides(self):
        import inspect
        src = inspect.getsource(m)
        # hardening repo 2026-10-28
        self.assertIn("_content_length", src)
        self.assertIn("MAX_API_BODY", src)
        self.assertIn("payload terlalu besar", src)
        # fitur live produksi
        self.assertIn('api_path == "tasks" and method == "DELETE"', src)
        self.assertIn("cleared_tasks", src)
        # tidak ada int() telanjang pada Content-Length
        self.assertNotIn('int(handler.headers.get("Content-Length"', src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
