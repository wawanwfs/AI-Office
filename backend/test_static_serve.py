import unittest
from static_serve import cache_control_for, maybe_gzip


class TestCacheControl(unittest.TestCase):
    def test_hashed_assets_immutable(self):
        self.assertEqual(
            cache_control_for("/assets/OfficeScene-B12x.js"),
            "public, max-age=31536000, immutable")
        self.assertEqual(
            cache_control_for("/assets/index-Ab3.css"),
            "public, max-age=31536000, immutable")

    def test_workbox_immutable(self):
        self.assertEqual(
            cache_control_for("/workbox-9c191d2f.js"),
            "public, max-age=31536000, immutable")

    def test_shell_no_store(self):
        for p in ("/", "/index.html", "/sw.js", "/registerSW.js"):
            self.assertEqual(cache_control_for(p), "no-store", p)

    def test_other_static_daily(self):
        self.assertEqual(cache_control_for("/fonts/x.woff2"), "public, max-age=86400")
        self.assertEqual(cache_control_for("/icon-512.png"), "public, max-age=86400")
        self.assertEqual(cache_control_for("/manifest.webmanifest"), "public, max-age=86400")

    def test_query_string_ignored(self):
        self.assertEqual(
            cache_control_for("/assets/a-X.js?v=1"),
            "public, max-age=31536000, immutable")


class TestGzip(unittest.TestCase):
    def test_gzips_large_js_when_accepted(self):
        data = b"window.a = 1;" * 500  # 6500 byte teks repetitif
        out, gz = maybe_gzip(data, "/assets/bundle.js", "gzip, deflate, br")
        self.assertTrue(gz)
        self.assertLess(len(out), len(data))
        self.assertEqual(out[:2], b"\x1f\x8b")

    def test_skips_when_not_accepted(self):
        data = b"x" * 5000
        out, gz = maybe_gzip(data, "/assets/bundle.js", "identity")
        self.assertFalse(gz)
        self.assertEqual(out, data)

    def test_skips_small(self):
        out, gz = maybe_gzip(b"ok", "/assets/x.js", "gzip")
        self.assertFalse(gz)
        self.assertEqual(out, b"ok")

    def test_skips_non_text(self):
        out, gz = maybe_gzip(b"\x00" * 5000, "/font.woff2", "gzip")
        self.assertFalse(gz)
        self.assertEqual(out, b"\x00" * 5000)

    def test_roundtrip(self):
        import gzip as g2
        data = ("<html>" + "kantor 3D " * 400).encode()
        out, gz = maybe_gzip(data, "/index.html", "gzip")
        self.assertTrue(gz)
        self.assertEqual(g2.decompress(out), data)

    def test_keeps_plain_if_gzip_bigger(self):
        data = b"\x9c\xab" * 1000  # binary-like sudah "teks" ext tapi tak terkompres
        out, gz = maybe_gzip(data, "/a.map", "gzip")
        # .map adalah teks-extension; fallback: bila lebih besar, kirim apa adanya
        if gz:
            self.assertLess(len(out), len(data))
        else:
            self.assertEqual(out, data)


if __name__ == "__main__":
    unittest.main(verbosity=2)
