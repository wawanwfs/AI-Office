"""SIKLUS 454: fallback /favicon.ico kini punya validator cache (ETag + LM).

Dulu (437/441) GET & HEAD /favicon.ico selalu 200 penuh TANPA ETag/
Last-Modified/revalidasi — inkonsisten dgn jalur statis (448/451/453),
cache browser tidak efektif. Kini: 200 + ETag + Last-Modified; permintaan
ulang dgn If-None-Match/If-Modified-Since cocok → 304 tanpa body.
"""
import http.server
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import wfs_hq_server as srv
from static_serve import etag_for


class _ClientHeaders:
    def __init__(self, d=None):
        self._d = d or {}

    def get(self, k, default=""):
        return self._d.get(k, default)


class _H(srv.H):
    def __init__(self, path, headers=None):
        self.path = path
        self.headers = _ClientHeaders(headers)

    def log_message(self, *a):
        pass


_SVG = b"<svg/>"


class Favicon454(unittest.TestCase):
    def _run(self, path, headers=None, data=_SVG):
        h = _H(path, headers)
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
        with mock.patch("builtins.open", mock.mock_open(read_data=data)):
            with mock.patch("os.path.getmtime", return_value=1700000000.0):
                h.do_GET()
        return h, sent

    def test_get_has_validators(self):
        h, sent = self._run("/favicon.ico")
        self.assertEqual(sent["code"], 200)
        t = dict(h._hdrs)
        self.assertEqual(t["Content-Type"], "image/svg+xml")
        self.assertEqual(t["Cache-Control"], "public, max-age=86400")
        self.assertEqual(t["ETag"], etag_for(_SVG))
        self.assertIn("Last-Modified", t)
        self.assertEqual(h.wfile.getvalue(), _SVG)

    def test_inm_match_304_no_body(self):
        etag = etag_for(_SVG)
        h, sent = self._run("/favicon.ico", {"If-None-Match": etag})
        self.assertEqual(sent["code"], 304)
        t = dict(h._hdrs)
        self.assertEqual(t["ETag"], etag)
        self.assertNotIn("Content-Length", t)
        self.assertEqual(h.wfile.getvalue(), b"")

    def test_ims_match_304(self):
        from static_serve import http_date
        h, sent = self._run("/favicon.ico",
                            {"If-Modified-Since": http_date(1700000000.0)})
        self.assertEqual(sent["code"], 304)
        self.assertEqual(h.wfile.getvalue(), b"")

    def test_head_parity_and_304(self):
        with mock.patch("builtins.open", mock.mock_open(read_data=_SVG)):
            with mock.patch("os.path.getmtime", return_value=1700000000.0):
                hh = _H("/favicon.ico")
                sh = {}
                hh.send_response = lambda c: sh.__setitem__("code", c)
                hh._hdrs = []
                hh.send_header = lambda k, v: hh._hdrs.append((k, v))

                def eh():
                    hh.send_header("Cache-Control",
                                   getattr(hh, "_wfs_cc", "no-store"))
                    for k, v in srv._security_headers():
                        hh.send_header(k, v)
                hh.end_headers = eh
                hh.wfile = io.BytesIO()
                hh.do_HEAD()
        hg, sg = self._run("/favicon.ico")
        self.assertEqual(sh["code"], sg["code"])
        th, tg = dict(hh._hdrs), dict(hg._hdrs)
        for k in ("Content-Type", "Cache-Control", "Content-Length",
                  "ETag", "Last-Modified"):
            self.assertEqual(th[k], tg[k])
        self.assertEqual(hh.wfile.getvalue(), b"")

    def test_missing_file_falls_through_404(self):
        h = _H("/favicon.ico")
        sent = {}
        h.send_response = lambda c: sent.__setitem__("code", c)
        h._hdrs = []
        h.send_header = lambda k, v: h._hdrs.append((k, v))
        h.end_headers = lambda: None
        h.wfile = io.BytesIO()
        with mock.patch("builtins.open", side_effect=OSError):
            h.do_GET()
        self.assertEqual(sent["code"], 404)


if __name__ == "__main__":
    unittest.main()
