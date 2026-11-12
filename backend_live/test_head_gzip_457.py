"""SIKLUS 457: paritas HEAD vs GET untuk halaman HTML (/app/, /landing, /).

Kontrak siklus 222/223: HEAD harus kirim header IDENTIK dgn GET. Audit 457:
do_GET /app/ & /landing melakukan gzip_html() saat klien mendukung gzip, tapi
_serve_head_html TIDAK — Content-Length HEAD = ukuran mentah sedangkan GET
terkompresi. Monitor berbasis HEAD membaca metadata palsu. Fix:
_serve_head_html juga gzip_html() + Content-Encoding/Vary.
"""
import gzip
import io
import sys
import unittest
from unittest import mock

sys.path.insert(0, "backend_live")
from test_wfs_hq_server import FakeH  # noqa: E402
from wfs_hq_server import H  # noqa: E402
from static_serve import gzip_html  # noqa: E402

HTML = b"<html>" + b"x" * 1000 + b"</html>"


def _handler(accept_encoding=""):
    headers = {"Accept-Encoding": accept_encoding} if accept_encoding else {}
    return FakeH(path="/app/", command="HEAD", headers=headers)


class TestHeadGzipParity457(unittest.TestCase):
    def _run(self, fake):
        with mock.patch("builtins.open",
                        lambda p, m="rb", *a, **k: io.BytesIO(HTML)
                        if str(p).endswith(("index.html", "landing.html")) and "rb" in m
                        else open(p, m, *a, **k)):
            H._serve_head_html(fake, "index.html", inject=True)
        return dict(fake._headers), fake._status

    def _injected(self):
        # injeksi token memanjangkan payload; hitung eksak seperti handler
        return H._inject_token(FakeH(path="/app/", command="HEAD"), HTML)

    def test_head_gzip_matches_get_payload(self):
        h, status = self._run(_handler("gzip"))
        self.assertEqual(status, 200)
        self.assertEqual(h["Content-Encoding"], "gzip")
        self.assertEqual(h["Vary"], "Accept-Encoding")
        data, gz = gzip_html(self._injected(), "gzip")
        self.assertTrue(gz)
        self.assertEqual(int(h["Content-Length"]), len(data))
        self.assertLess(int(h["Content-Length"]), len(self._injected()))

    def test_head_no_gzip_raw_size(self):
        h, status = self._run(_handler(""))
        self.assertEqual(status, 200)
        self.assertNotIn("Content-Encoding", h)
        self.assertEqual(int(h["Content-Length"]), len(self._injected()))

    def test_gzip_helper_roundtrip(self):
        data, gz = gzip_html(gzip.decompress(gzip_html(self._injected(), "gzip")[0]), "gzip")
        self.assertTrue(gz)
        self.assertEqual(gzip.decompress(data), self._injected())


if __name__ == "__main__":
    unittest.main()
