"""SIKLUS 456: method HTTP yang tidak didukung → 405 JSON (Allow header),
bukan stdlib "Unsupported method" HTML 501.

Dulu PATCH/PUT/OPTIONS jatuh ke SimpleHTTPRequestHandler.send_error(501)
HTML polos: inkonsisten dgn kontrak JSON (siklus 439), status salah (501 =
server tidak mengenal method; di sini method dikenal tapi jalurnya tidak
mendukungnya), dan tanpa header Allow. Kini:
- OPTIONS apa pun → 204 No Content + Allow (preflight CORS tanpa ACAO —
  siklus 222 melarang konsumen lintas origin).
- Method tulis yang dikenal (PATCH/PUT/TRACE dsb.) pada jalur apa pun →
  405 JSON + Allow: GET, HEAD, POST, DELETE.
- OPTIONS dijalur read-only tetap dijawab tanpa body (204), bukan 405.
"""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import wfs_hq_server as srv


class _ClientHeaders:
    def __init__(self, d=None):
        self._d = d or {}

    def get(self, k, default=""):
        return self._d.get(k, default)


class _H(srv.H):
    def __init__(self, path, headers=None, command="GET"):
        self.path = path
        self.command = command
        self.headers = _ClientHeaders(headers)
        self._wfs_cc = "no-store"
        self.directory = os.getcwd()

    def log_message(self, *a):
        pass


class MethodNotSupported456(unittest.TestCase):
    def _run(self, path, command):
        h = _H(path, command=command)
        sent = {}
        h.send_response = lambda code: sent.__setitem__("code", code)
        h._hdrs = []
        h.send_header = lambda k, v: h._hdrs.append((k, v))

        def end_headers():
            h.send_header("Cache-Control", getattr(h, "_wfs_cc", "no-store"))
            for k, v in srv._security_headers():
                h.send_header(k, v)

        h.end_headers = end_headers
        h.wfile = io.BytesIO()
        getattr(h, "do_" + command)()
        return h, sent

    def test_patch_json_405_with_allow(self):
        h, sent = self._run("/api/tasks", "PATCH")
        self.assertEqual(sent["code"], 405)
        t = dict(h._hdrs)
        self.assertEqual(t["Content-Type"], "application/json")
        self.assertIn("GET", t["Allow"])
        self.assertIn("POST", t["Allow"])
        self.assertEqual(
            h.wfile.getvalue(), b'{"error": "method not allowed"}')

    def test_put_json_405_root(self):
        h, sent = self._run("/", "PUT")
        self.assertEqual(sent["code"], 405)
        self.assertEqual(dict(h._hdrs)["Content-Type"], "application/json")

    def test_options_any_path_204_with_allow(self):
        for path in ("/", "/api/tasks", "/app/deep-link"):
            h, sent = self._run(path, "OPTIONS")
            self.assertEqual(sent["code"], 204, path)
            t = dict(h._hdrs)
            self.assertIn("Allow", t)
            self.assertEqual(h.wfile.getvalue(), b"")
            self.assertNotIn("Access-Control-Allow-Origin", t)

    def test_trace_json_405(self):
        h, sent = self._run("/wfs-api/tasks", "TRACE")
        self.assertEqual(sent["code"], 405)
        self.assertEqual(dict(h._hdrs)["Content-Type"], "application/json")

    def test_405_has_security_headers(self):
        h, sent = self._run("/api/tasks", "PATCH")
        t = dict(h._hdrs)
        self.assertEqual(t["X-Content-Type-Options"], "nosniff")


if __name__ == "__main__":
    unittest.main()
