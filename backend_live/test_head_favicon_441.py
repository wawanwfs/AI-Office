"""SIKLUS 441: HEAD /favicon.ico konsisten dgn GET (fallback favicon.svg 437).

Dulu GET /favicon.ico = 200 image/svg+xml (fallback siklus 437) tetapi
HEAD /favicon.ico = 404 stdlib — monitor uptime berbasis HEAD menerima
"asset hilang" palsu. Kontrak HEAD siklus 222: status + header identik GET,
tanpa body.
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
        self.headers = _ClientHeaders()

    def log_message(self, *a):
        pass


class _ClientHeaders:
    def get(self, *a, **k):
        return ""


class HeadFavicon441(unittest.TestCase):
    def _run(self, path):
        h = _H(path)
        sent = {}
        h.send_response = lambda code: sent.__setitem__("code", code)
        h._hdrs = []
        h.send_header = lambda k, v: h._hdrs.append((k, v))
        h.end_headers = lambda: None
        h.wfile = io.BytesIO()
        return h, sent

    def test_head_favicon_ico_served_as_svg_no_body(self):
        """HEAD /favicon.ico: 200 + CT svg + cache 86400, TANPA body."""
        h, sent = self._run("/favicon.ico")
        with mock.patch("builtins.open", mock.mock_open(read_data=b"<svg/>")):
            h.do_HEAD()
        self.assertEqual(sent["code"], 200)
        types = dict(h._hdrs)
        self.assertEqual(types.get("Content-Type"), "image/svg+xml")
        self.assertEqual(types.get("Cache-Control"), "public, max-age=86400")
        self.assertEqual(int(types["Content-Length"]), len(b"<svg/>"))
        self.assertEqual(h.wfile.getvalue(), b"")  # kontrak HEAD: tanpa body

    def test_head_favicon_ico_missing_file_404_json(self):
        """File hilang → 404 JSON konsisten dgn GET (helper _reply_404)."""
        h, sent = self._run("/favicon.ico")
        with mock.patch("builtins.open", side_effect=OSError):
            h.do_HEAD()
        self.assertEqual(sent["code"], 404)
        types = dict(h._hdrs)
        self.assertEqual(types.get("Content-Type"), "application/json")
        self.assertEqual(h.wfile.getvalue(), b"")  # head=True: tanpa body

    def test_head_get_parity(self):
        """Status + Content-Type + CL identik antara GET dan HEAD."""
        with mock.patch("builtins.open", mock.mock_open(read_data=b"<svg/>")):
            hg, sg = self._run("/favicon.ico")
            hg.do_GET()
            hh, sh = self._run("/favicon.ico")
            hh.do_HEAD()
        self.assertEqual(sg["code"], sh["code"])
        tg, th = dict(hg._hdrs), dict(hh._hdrs)
        self.assertEqual(tg["Content-Type"], th["Content-Type"])
        self.assertEqual(tg["Cache-Control"], th["Cache-Control"])
        self.assertEqual(tg["Content-Length"], th["Content-Length"])
        # GET menulis body, HEAD tidak
        self.assertEqual(hg.wfile.getvalue(), b"<svg/>")
        self.assertEqual(hh.wfile.getvalue(), b"")


if __name__ == "__main__":
    unittest.main()
