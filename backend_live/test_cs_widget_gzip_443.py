"""Siklus 443: gzip respons proxy /cs-widget/ (Docker :3001).

Dulu cabang GET /cs-widget/* meneruskan HTML upstream (~14 KB) TANPA
kompresi — Lighthouse "No compression applied", boros bandwidth. Kini
gzip_html on-the-fly (pola cabang /admin siklus 434 & send_json 438):
header Content-Encoding: gzip + Vary bila client mendukung, dan
Content-Length = panjang payload BALIKAN (terkompres).
"""

import unittest


class TestCsWidgetGzip443(unittest.TestCase):
    def _branch_source(self):
        src = open("wfs_hq_server.py", encoding="utf-8").read()
        # Siklus 462: cabang GET /cs-widget/ kini delegasi ke _loopback_html_proxy;
        # gate gzip ditujukan ke helper HTML (mencakup /admin & /cs-widget).
        i = src.index("def _loopback_html_proxy")
        return src[i:i + 2400]

    def test_get_branch_gzips_upstream_payload(self):
        branch = self._branch_source()
        self.assertIn("static_serve.gzip_html(", branch)
        self.assertIn('self.send_header("Content-Encoding", "gzip")', branch)
        self.assertIn('self.send_header("Vary", "Accept-Encoding")', branch)

    def test_content_length_uses_returned_payload(self):
        branch = self._branch_source()
        # CL dihitung SETELAH gzip (bukan len(data) mentah sebelum kompresi)
        gi = branch.index("gzip_html(")
        cli = branch.index('send_header("Content-Length"', gi)
        self.assertGreater(cli, gi)

    def test_head_helper_paritas_tanpa_gzip_dibutuhkan(self):
        # HEAD tidak meneruskan Accept-Encoding → GET probe tanpa AE tetap
        # uncompressed, jadi _head_proxy_helper (CL = payload GET mentah)
        # tetap konsisten; helper tidak boleh mengirim Content-Encoding.
        src = open("wfs_hq_server.py", encoding="utf-8").read()
        helper = src[src.index("def _head_proxy_helper"):src.index("def _loopback_html_proxy")]
        self.assertNotIn("Content-Encoding", helper)


if __name__ == "__main__":
    unittest.main()
