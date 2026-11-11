"""Siklus 445: Cache-Control ganda di wfs_api_service (send_json & SSE /api/events).

Siklus 444 membersihkan 5 titik di wfs_hq_server.py, tapi wfs_api_service.py
masih mengirim send_header("Cache-Control", ...) eksplisit di atas default
end_headers() → /api/* mengirim dua header Cache-Control (no-store + no-store),
SSE /api/events dua header (no-cache + no-store default, bertentangan).
Kontrak: TEPAT SATU Cache-Control per respons; nilai via handler._wfs_cc.
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class TestNoDupCacheControlApiService(unittest.TestCase):
    SRC = ROOT / "backend_live" / "wfs_api_service.py"

    def test_source_has_no_explicit_cache_control_header(self):
        src = self.SRC.read_text()
        self.assertNotIn(
            'send_header("Cache-Control"', src,
            "send_header Cache-Control eksplisit → duplikat dgn end_headers()")

    def test_send_json_sets_wfs_cc_no_store(self):
        src = self.SRC.read_text()
        self.assertIn('handler._wfs_cc = "no-store"', src)

    def test_sse_sets_wfs_cc_no_cache(self):
        src = self.SRC.read_text()
        self.assertIn('handler._wfs_cc = "no-cache"', src)

    def test_server_default_unchanged(self):
        src = (ROOT / "backend_live" / "wfs_hq_server.py").read_text()
        self.assertIn('self._wfs_cc = "no-store"', src)


if __name__ == "__main__":
    unittest.main()
