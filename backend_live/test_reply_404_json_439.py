"""Siklus 439: semua 404 produksi kirim JSON + Content-Type eksplisit.

Dulu send_response(404) telanjang di 5 titik (do_GET/do_POST/do_DELETE/
favicon fallback/HEAD) → stdlib default Content-Type text/html, body kosong.
Kini satu titik _reply_404(): {"error":"not found"} JSON di semua jalur.
"""
import http.server
import io
import unittest
from unittest import mock

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))

import wfs_hq_server as srv


class _H(srv.H):
    def __init__(self, path):
        self.path = path
        self.request_version = "HTTP/1.0"
        self.directory = os.getcwd()

        class _Hdrs:
            def get(self, *a, **k):
                return ""

        self.headers = _Hdrs()

    def log_message(self, *a):
        pass


class Reply404Json(unittest.TestCase):
    def _run(self, path, method="do_GET"):
        h = _H(path)
        sent = {}
        h.send_response = lambda code: sent.__setitem__("code", code)
        h._hdrs = []
        h.send_header = lambda k, v: h._hdrs.append((k, v))
        h.end_headers = lambda: None
        h.wfile = io.BytesIO()
        getattr(h, method)()
        return h, sent

    def _hdr(self, h, name):
        return dict(h._hdrs).get(name)

    def test_get_unknown_json(self):
        h, sent = self._run("/nope404")
        self.assertEqual(sent["code"], 404)
        self.assertIn("application/json", self._hdr(h, "Content-Type") or "")
        self.assertEqual(h.wfile.getvalue(), b'{"error": "not found"}')

    def test_head_unknown_json(self):
        h, sent = self._run("/nope404", method="do_HEAD")
        self.assertEqual(sent["code"], 404)
        self.assertIn("application/json", self._hdr(h, "Content-Type") or "")
        self.assertEqual(self._hdr(h, "Content-Length"), str(len(b'{"error": "not found"}')))
        self.assertEqual(h.wfile.getvalue(), b"")  # kontrak HEAD: tanpa body

    def test_post_unknown_json(self):
        h, sent = self._run("/nope404", method="do_POST")
        self.assertEqual(sent["code"], 404)
        self.assertIn("application/json", self._hdr(h, "Content-Type") or "")

    def test_delete_unknown_json(self):
        h, sent = self._run("/nope404", method="do_DELETE")
        self.assertEqual(sent["code"], 404)
        self.assertIn("application/json", self._hdr(h, "Content-Type") or "")

    def test_reply_404_uses_end_headers_flow(self):
        # end_headers() nyata memancarkan Cache-Control + header keamanan
        # (X-Frame-Options dll) — verifikasi via jalur end_headers kelas H,
        # dengan BaseOutputStream distub agar tidak menulis socket.
        h = _H("/nope404")
        sent = {}
        h.send_response = lambda code, msg=None: sent.__setitem__("code", code)
        h._hdrs = []
        real_end = srv.H.end_headers
        h.send_header = lambda k, v: h._hdrs.append((k, v))
        with mock.patch.object(http.server.BaseHTTPRequestHandler, "end_headers", lambda self: None):
            h.end_headers = lambda: real_end(h)
            h.wfile = io.BytesIO()
            import json as _json
            body = _json.dumps({"error": "not found"}).encode()
            with mock.patch.object(srv, "_wfs_write_or_client_gone",
                                   lambda handler, data: handler.wfile.write(data)):
                srv._reply_404(h)
        hd = dict(h._hdrs)
        self.assertEqual(sent["code"], 404)
        self.assertEqual(hd.get("X-Frame-Options"), "DENY")
        self.assertEqual(hd.get("Cache-Control"), "no-store")
        self.assertEqual(h.wfile.getvalue(), body)

    def test_no_bare_404_left_in_server(self):
        src = open(os.path.join(os.path.dirname(__file__), "wfs_hq_server.py")).read()
        self.assertNotIn('send_response(404); self.end_headers()', src)
        self.assertNotIn("send_response(404)\n            self.send_header", src)
        self.assertGreaterEqual(src.count("_reply_404(self"), 5)


if __name__ == "__main__":
    unittest.main()
