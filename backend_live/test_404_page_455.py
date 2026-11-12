"""SIKLUS 455: GET halaman HTML yang tak ada → 404 tampilan manusiawi.

Dulu /app/halaman-tak-ada dsb. jatuh ke super().do_GET() stdlib →
'Error response' polos tanpa navigasi. Kini halaman 404 HTML manusiawi
(taut ke / dan /app/); aset & jalur non-allowlist tetap 404 JSON (439).
"""
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import wfs_hq_server as srv


class _ClientHeaders:
    def __init__(self, d=None):
        self._d = d or {}

    def get(self, k, default=""):
        return self._d.get(k, default)


class _H(srv.H):
    def __init__(self, path, headers=None):
        self.path = path
        self.headers = _ClientHeaders(headers)
        self._wfs_cc = "no-store"
        self.directory = os.getcwd()

    def log_message(self, *a):
        pass


class NotFound405(unittest.TestCase):
    def _run(self, path, method="do_GET", head=False):
        h = _H(path)
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
        getattr(h, method)()
        return h, sent

    def test_get_missing_html_page_404_view(self):
        h, sent = self._run("/app/halaman-tak-ada")
        self.assertEqual(sent["code"], 404)
        t = dict(h._hdrs)
        self.assertEqual(t["Content-Type"], "text/html; charset=utf-8")
        body = h.wfile.getvalue()
        self.assertIn(b"404", body)
        self.assertIn(b'href="/app/"', body)
        self.assertEqual(t["Content-Length"], str(len(body)))

    def test_get_landing_deeplink_404_view(self):
        h, sent = self._run("/landing/tak-ada")
        self.assertEqual(sent["code"], 404)
        self.assertEqual(dict(h._hdrs)["Content-Type"],
                         "text/html; charset=utf-8")

    def test_get_missing_asset_still_json(self):
        h, sent = self._run("/assets/nope.js")
        self.assertEqual(sent["code"], 404)
        t = dict(h._hdrs)
        self.assertEqual(t["Content-Type"], "application/json")
        self.assertEqual(h.wfile.getvalue(), b'{"error": "not found"}')

    def test_get_missing_assets_prefix_json_even_no_ext(self):
        h, sent = self._run("/assets/bundle")
        self.assertEqual(sent["code"], 404)
        self.assertEqual(dict(h._hdrs)["Content-Type"], "application/json")

    def test_head_missing_html_page_headers_no_body(self):
        h, sent = self._run("/app/tak-ada", method="do_HEAD")
        self.assertEqual(sent["code"], 404)
        t = dict(h._hdrs)
        self.assertEqual(t["Content-Type"], "text/html; charset=utf-8")
        self.assertEqual(h.wfile.getvalue(), b"")
        self.assertTrue(t["Content-Length"].isdigit())

    def test_non_allowlisted_still_json(self):
        h, sent = self._run("/server.py")
        self.assertEqual(sent["code"], 404)
        self.assertEqual(dict(h._hdrs)["Content-Type"], "application/json")


if __name__ == "__main__":
    unittest.main()
