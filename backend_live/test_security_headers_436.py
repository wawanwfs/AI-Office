"""Siklus 436: header anti-klikjacking + Permissions-Policy.

Lighthouse best-practices memindai X-Frame-Options/CSP frame-ancestors dan
Permissions-Policy. Sebelum siklus ini respons :9503 hanya punya nosniff +
Referrer-Policy; UI shell bisa di-frame pihak luar (klikjacking) dan API
kamera/mic/geolocation tak dibatasi.
"""
import unittest

import wfs_hq_server


class TestSecurityHeaders436(unittest.TestCase):
    def _headers(self):
        return dict(wfs_hq_server._security_headers())

    def test_xfo_deny(self):
        self.assertEqual(self._headers()["X-Frame-Options"], "DENY")

    def test_permissions_policy_locks_unused_apis(self):
        pp = self._headers()["Permissions-Policy"]
        for api in ("camera", "microphone", "geolocation"):
            self.assertIn(f"{api}=()", pp)

    def test_existing_headers_kept(self):
        h = self._headers()
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertEqual(h["Referrer-Policy"], "same-origin")


if __name__ == "__main__":
    unittest.main()
