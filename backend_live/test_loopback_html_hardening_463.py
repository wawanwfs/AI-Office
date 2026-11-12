"""Siklus 463: _loopback_html_proxy diparalelkan dgn hardening _loopback_json_proxy (461).

Tiga penyempurnaan terhadap helper HTML 462:
1. Kontrak 228 menutup SELURUH proses — BrokenPipe/ConnectionReset di mana pun
   (termasuk saat 502 & end_headers) di-re-raise, bukan ditelan jadi
   traceback kedua; tulis body/502 tetap via _wfs_write_or_client_gone.
2. ETag & Last-Modified upstream diteruskan (dulu dibuang — revalidasi
   browser /admin & /cs-widget tak pernah efektif).
3. Set-Cookie upstream diteruskan (dulu dibuang — sesi berbasis cookie hilang).

Gate sumber (pola test_head_proxy_unify_460) + perilaku live: /admin GET 200.
"""
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "wfs_hq_server.py")


class TestLoopbackHtmlProxyHardening463(unittest.TestCase):
    def _helper(self):
        src = open(_SRC, encoding="utf-8").read()
        return src[src.index("def _loopback_html_proxy"):
                   src.index("def _serve_head_admin")]

    def test_client_gone_contract_covers_whole_flow(self):
        h = self._helper()
        # 228: disconnect klien di-re-raise di DUA titik (alur utama & 502) —
        # senyap via _hq_handle_error level server, tanpa 502 palsu.
        self.assertEqual(
            h.count("except (BrokenPipeError, ConnectionResetError):\n            raise"), 1)
        self.assertEqual(
            h.count("except (BrokenPipeError, ConnectionResetError):\n                raise"), 1)
        # Body & 502 tetap lewat helper 228 (bukan wfile.write telanjang).
        self.assertNotIn("self.wfile.write(", h)
        self.assertIn("_wfs_write_or_client_gone(self, data)", h)
        self.assertIn("_wfs_write_or_client_gone(self, b\"\")", h)

    def test_upstream_validators_and_cookie_forwarded(self):
        h = self._helper()
        for name in ("ETag", "Last-Modified", "Set-Cookie"):
            self.assertIn('"%s"' % name, h)
        # Hanya diteruskan bila upstream mengirim (getheader guard).
        self.assertIn("r.getheader(_hn)", h)

    def test_gzip_and_no_store_unchanged(self):
        h = self._helper()
        self.assertIn("static_serve.gzip_html(", h)
        self.assertIn('self._wfs_cc = "no-store"', h)
        self.assertIn('send_header("Content-Encoding", "gzip")', h)
        self.assertIn('send_header("Vary", "Accept-Encoding")', h)


if __name__ == "__main__":
    unittest.main()
