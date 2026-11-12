"""SIKLUS 460: empat helper proxy HEAD (_serve_head_admin, _serve_head_cs_widget,
_serve_head_admin_api, _serve_head_gateway) kini SEMUA mengirim via
_head_proxy_helper — satu titik loopback. Dulu pola http.client + send_response +
CT/CL + 502 terduplikasi 4x (pola drift 453/458). Gate: tidak ada lagi duplikasi.
"""
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "wfs_hq_server.py")


class TestHeadProxyUnification460(unittest.TestCase):
    def test_single_loopback_emitter(self):
        src = open(_SRC, encoding="utf-8").read()
        # Hanya _head_proxy_helper yang boleh membuka HTTPConnection di blok
        # helper HEAD proxy (setelah _serve_head_admin, sebelum do_HEAD).
        zone = src[src.index("def _serve_head_admin"):src.index("def do_HEAD")]
        self.assertEqual(zone.count("HTTPConnection("), 0)
        self.assertEqual(zone.count("conn.request("), 0)
        # Setiap cabang mendelegasi ke helper tunggal.
        self.assertEqual(zone.count("self._head_proxy_helper("), 4)

    def test_helper_signature_gates(self):
        src = open(_SRC, encoding="utf-8").read()
        helper = src[src.index("def _head_proxy_helper"):src.index("    def _serve_head_admin")]
        self.assertIn("default_ct", helper)
        self.assertIn("cc=None", helper)
        self.assertIn("fwd_headers=None", helper)
        # 502 eksak tetap satu titik (komentar docstring juga menyebut 502 →
        # hitung hanya di blok kode, bukan string docstring).
        body = helper.split('"""', 2)[2]
        self.assertEqual(body.count("502"), 1)
        # 443: helper tidak mengirim Content-Encoding (HEAD probe tanpa AE).
        self.assertNotIn("Content-Encoding", helper)


if __name__ == "__main__":
    unittest.main()
