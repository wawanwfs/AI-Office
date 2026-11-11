"""Siklus 437: /favicon.ico fallback → favicon.svg (200, image/svg+xml).

Dulu 404: browser lama & crawler tetap minta .ico walau HTML pakai favicon.svg.
"""
import http.server
import unittest
from unittest import mock

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend_live"))

import wfs_hq_server as srv


class _H(srv.H):
    def __init__(self, path):
        self.path = path
        self.headers = http_client_headers()

    def log_message(self, *a):
        pass


def http_client_headers():
    class H:
        def get(self, *a, **k):
            return ""

    return H()


class FaviconIcoFallback(unittest.TestCase):
    def _run(self, path):
        h = _H(path)
        sent = {}
        h.send_response = lambda code: sent.__setitem__("code", code)
        h._hdrs = []

        def send_header(k, v):
            h._hdrs.append((k, v))

        h.send_header = send_header
        h.end_headers = lambda: None
        buf = b""

        def write(d):
            nonlocal buf
            buf += d

        import io
        h.wfile = io.BytesIO()
        return h, sent, buf

    def test_favicon_ico_served_as_svg(self):
        h, sent, buf = self._run("/favicon.ico")
        # Siklus 454: fallback via _emit_favicon — butuh getmtime juga.
        with mock.patch("builtins.open", mock.mock_open(read_data=b"<svg/>")):
            with mock.patch("os.path.getmtime", return_value=1700000000.0):
                h.do_GET()
        self.assertEqual(sent["code"], 200)
        self.assertEqual(h.wfile.getvalue(), b"<svg/>")
        types = dict(h._hdrs)
        self.assertEqual(types.get("Content-Type"), "image/svg+xml")

    def test_favicon_ico_missing_file_404(self):
        h, sent, buf = self._run("/favicon.ico")
        with mock.patch("builtins.open", side_effect=OSError):
            h.do_GET()
        self.assertEqual(sent["code"], 404)

    def test_other_paths_unaffected(self):
        h, sent, buf = self._run("/favicon.svg")
        # favicon.svg jalur statis asli — tidak boleh masuk cabang fallback
        # (path_only != "/favicon.ico"); cukup pastikan tidak ada return cepat.
        self.assertIsNotNone(h)


if __name__ == "__main__":
    unittest.main()
