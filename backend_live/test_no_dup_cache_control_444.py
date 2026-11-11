"""Siklus 444: Cache-Control TIDAK boleh terkirim ganda.

Bug produksi: cabang /admin, /cs-widget/, /favicon.ico, dan SSE
/wfs-api/events mengirim send_header("Cache-Control", ...) eksplisit,
lalu override end_headers() menambah send_header("Cache-Control",
self._wfs_cc) lagi → dua header Cache-Control per respons (ambigu bagi
cache/shared proxy; RFC 7234: duplikat = invalid). Fix: set self._wfs_cc
saja, end_headers satu-satunya yang mengirim Cache-Control.
"""
import io
import sys
import os
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))

import wfs_hq_server as srv


class _H(srv.H):
    def __init__(self, path):
        self.path = path
        self.command = "GET"
        self.request_version = "HTTP/1.1"
        self._ae = "gzip"

    class _Hd:
        def get(self, *a, **k):
            return "gzip"

    headers = None

    def log_message(self, *a):
        pass


_H.headers = _H._Hd()


def _capture(path):
    h = _H(path)
    sent = {"code": None}
    h.send_response = lambda code: sent.__setitem__("code", code)
    h._hdrs = []
    h.send_header = lambda k, v: h._hdrs.append((k, v))

    def end_headers():
        # replika override produksi: Cache-Control via _wfs_cc (+ security headers)
        h.send_header("Cache-Control", getattr(h, "_wfs_cc", "no-store"))
        for k, v in srv._security_headers():
            h.send_header(k, v)

    h.end_headers = end_headers
    h.wfile = io.BytesIO()
    return h, sent


def _count_cc(h):
    return sum(1 for k, v in h._hdrs if k.lower() == "cache-control")


class TestNoDuplicateCacheControl(unittest.TestCase):
    def test_admin_single_cc(self):
        with mock.patch("http.client.HTTPConnection") as HC:
            r = HC.return_value.getresponse.return_value
            r.status = 200
            r.read = lambda: b"<html>x</html>"
            r.getheader = lambda k, d="": "text/html"
            h, sent = _capture("/admin")
            h.do_GET()
        self.assertEqual(sent["code"], 200)
        self.assertEqual(_count_cc(h), 1)
        self.assertIn(("Cache-Control", "no-store"), h._hdrs)

    def test_cs_widget_single_cc(self):
        with mock.patch("http.client.HTTPConnection") as HC:
            r = HC.return_value.getresponse.return_value
            r.status = 200
            r.read = lambda: b"<html>w</html>"
            r.getheader = lambda k, d="": "text/html"
            h, sent = _capture("/cs-widget/")
            h.do_GET()
        self.assertEqual(sent["code"], 200)
        self.assertEqual(_count_cc(h), 1)
        self.assertIn(("Cache-Control", "no-store"), h._hdrs)

    def test_favicon_single_cc(self):
        h, sent = _capture("/favicon.ico")
        # Siklus 454: fallback kini via _emit_favicon — butuh getmtime juga.
        with mock.patch("builtins.open", mock.mock_open(read_data=b"<svg/>")):
            with mock.patch("os.path.getmtime", return_value=1700000000.0):
                h.do_GET()
        self.assertEqual(sent["code"], 200)
        self.assertEqual(_count_cc(h), 1)
        self.assertIn(("Cache-Control", "public, max-age=86400"), h._hdrs)

    def test_sse_events_single_cc_no_cache(self):
        with mock.patch("urllib.request.urlopen") as ur:
            r = mock.Mock()
            r.status = 200
            r.headers = {"Content-Type": "text/event-stream"}
            r.read1 = lambda n: b""  # stream langsung habis
            ur.return_value = r
            h, sent = _capture("/wfs-api/events")
            h.do_GET()
        self.assertEqual(sent["code"], 200)
        self.assertEqual(_count_cc(h), 1)
        self.assertIn(("Cache-Control", "no-cache"), h._hdrs)


if __name__ == "__main__":
    unittest.main()
