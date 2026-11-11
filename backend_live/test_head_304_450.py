"""Siklus 450 — HEAD statis ikut 304 pada If-None-Match.

Kontrak sumber (backend_live/wfs_hq_server.py::_serve_head_static):
- HEAD dgn If-None-Match cocok → 304 TANPA Content-Length/TANPA body, ETag ada.
- HEAD tanpa match → 200, metadata identik GET (CC, gzip/Vary, CL, ETag).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wfs_hq_server import H  # noqa: E402
import static_serve  # noqa: E402


class TestHeadStatic304(unittest.TestCase):
    def _head(self, relpath, headers=None):
        handler = H.__new__(H)
        handler.path = "/" + relpath
        handler.headers = headers or {}
        handler._wfs_cc = "no-store"
        handler.directory = os.getcwd()
        sent = {}

        def send_response(code):
            sent["code"] = code

        def send_header(name, value):
            sent.setdefault("headers", []).append((name, value))

        def end_headers():
            sent["ended"] = True

        handler.send_response = send_response
        handler.send_header = send_header
        handler.end_headers = end_headers

        class _W:
            data = b""

            def write(self, b):
                self.data += b

        handler.wfile = _W()
        served = H._serve_head_static(handler)
        return served, sent, handler.wfile.data, handler

    def setUp(self):
        tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "_tmp_etag_450", "assets")
        os.makedirs(tmp, exist_ok=True)
        self.old = os.getcwd()
        self.path_ = os.path.join(tmp, "a-450.js")
        with open(self.path_, "wb") as f:
            f.write(b"console.log(450)")
        os.chdir(os.path.dirname(tmp))
        self.etag = static_serve.etag_for(b"console.log(450)")

    def tearDown(self):
        os.chdir(self.old)

    def test_head_304_on_match(self):
        served, sent, body, _ = self._head(
            "assets/a-450.js", {"If-None-Match": self.etag})
        self.assertTrue(served)
        self.assertEqual(sent.get("code"), 304)
        hdrs = dict(sent.get("headers", []))
        self.assertNotIn("Content-Length", hdrs)
        self.assertEqual(hdrs.get("ETag"), self.etag)
        self.assertEqual(body, b"")

    def test_head_200_metadata_matches_get(self):
        served, sent, body, handler = self._head("assets/a-450.js")
        self.assertTrue(served)
        self.assertEqual(sent.get("code"), 200)
        hdrs = dict(sent.get("headers", []))
        self.assertEqual(hdrs.get("Content-Length"), str(len(b"console.log(450)")))
        self.assertEqual(hdrs.get("ETag"), self.etag)
        self.assertEqual(handler._wfs_cc, "public, max-age=31536000, immutable")
        self.assertEqual(body, b"")


if __name__ == "__main__":
    unittest.main()
