"""Siklus 434: shell HTML (/ , /app/, /landing) kini di-gzip on-the-fly.

Lighthouse document-latency-insight 433: "No compression applied" untuk dokumen
— index.html/landing dikirim uncompressed (server_response 1 ms tapi wasted
~3 KB/request). Helper gzip_html() di backend/static_serve.py + handler
backend_live/wfs_hq_server.py. Locked via unittest (lintest JS backend tidak
mengimpor Python), konsisten dgn test_static_serve.py di backend/.
"""
import sys, os, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from static_serve import gzip_html, cache_control_for


HTML = (b"<html><body>" + b"x" * 4000 + b"</body></html>")


class GzipHtmlShell(unittest.TestCase):
    def test_gzip_html_compresses_when_accepted(self):
        data, gz = gzip_html(HTML, "gzip")
        self.assertTrue(gz)
        self.assertLess(len(data), len(HTML))
        self.assertEqual(data[:2], b"\x1f\x8b")  # magic number gzip

    def test_no_gzip_without_accept_encoding(self):
        for ae in ("", None, "br", "zstd", "deflate"):
            data, gz = gzip_html(HTML, ae)
            self.assertFalse(gz)
            self.assertEqual(data, HTML)

    def test_small_payload_untouched(self):
        data, gz = gzip_html(b"<html>hi</html>", "gzip")
        self.assertFalse(gz)
        self.assertEqual(data, b"<html>hi</html>")

    def test_shell_paths_are_no_store(self):
        for p in ("/", "/index.html", "/landing.html"):
            self.assertEqual(cache_control_for(p), "no-store", p)

    def test_server_handlers_call_gzip_html(self):
        src = open(os.path.join(os.path.dirname(__file__), "..",
                                "backend_live", "wfs_hq_server.py")).read()
        # / , /app/, /landing, /admin, /cs-widget — 5 titik injeksi gzip_html
        # (Siklus 443 menambah cs-widget; dulu assert 4 → rapuh terhadap
        # penambahan cabang gzip baru yang sah).
        self.assertEqual(src.count("gzip_html("), 5)
        self.assertEqual(src.count('send_header("Content-Encoding", "gzip")'),
                         src.count('send_header("Vary", "Accept-Encoding")'))


if __name__ == "__main__":
    unittest.main()
