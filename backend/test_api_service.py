"""Test api_service.py — parsing Content-Length toleran + cap body POST /api/*.

Fokus: perilaku parsing body (tidak boleh crash pada header malformed) dan
early-return 413 untuk Content-Length > MAX_API_BODY (tanpa sentuh DB/orchestrator).
"""

import io
import json
import unittest

from api_service import MAX_API_BODY, _content_length, handle_api_request


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
        # Header Content-Length palsu yang melebihi batas → 413 segera,
        # tanpa membaca body / menyentuh DB (early-return sebelum branch API).
        fh = FakeHandler(headers={"Content-Length": str(MAX_API_BODY + 1)})
        handled = handle_api_request(fh, "POST", "/api/projects")
        self.assertTrue(handled)
        self.assertEqual(fh._status, 413)
        self.assertEqual(json.loads(fh.wfile.getvalue()), {"error": "payload terlalu besar"})

    def test_at_max_boundary_not_blocked_early(self):
        # Tepat di batas harus lolos check ukuran (dilanjutkan ke dispatch; bukan 413).
        fh = FakeHandler(headers={"Content-Length": str(MAX_API_BODY)})
        handled = handle_api_request(fh, "POST", "/api/projects")
        self.assertNotEqual(fh._status, 413)
        self.assertTrue(handled)


if __name__ == "__main__":
    unittest.main(verbosity=2)
