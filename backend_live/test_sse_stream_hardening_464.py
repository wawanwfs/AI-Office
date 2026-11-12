"""Siklus 464: hardening _proxy_stream_events (SSE) — paritas kontrak 228.

1. Disconnect klien EventSource di mana pun (send_response/end_headers/
   flush/wfile) di-re-raise — ClientGone/BrokenPipe/ConnectionReset senyap
   via _hq_handle_error level server, TANPA _reply_json(502) palsu ke
   socket mati (dulu except Exception generik menangkap disconnect).
2. Kegagalan upstream sungguhan tetap → 502 {"error": "stream failed"}.
3. Perilaku streaming tak berubah: timeout=90 (> keepalive 15 dtk),
   _wfs_cc = no-cache, tulis chunk via _wfs_write_or_client_gone (228).
"""
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "wfs_hq_server.py")


class TestSseStreamHardening464(unittest.TestCase):
    def _helper(self):
        src = open(_SRC, encoding="utf-8").read()
        return src[src.index("def _proxy_stream_events"):
                   src.index("def _proxy(self):")]

    def test_client_disconnect_reraised(self):
        h = self._helper()
        self.assertIn(
            "except (ClientGone, BrokenPipeError, ConnectionResetError):",
            h)
        self.assertIn("            raise", h)

    def test_no_502_on_disconnect(self):
        h = self._helper()
        # Blok except Exception (upstream gagal) tetap satu-satunya jalur 502.
        self.assertEqual(h.count('_reply_json(self, 502, {"error": "stream failed"})'), 1)

    def test_streaming_contract_unchanged(self):
        h = self._helper()
        self.assertIn("timeout=90", h)
        self.assertIn('self._wfs_cc = "no-cache"', h)
        self.assertIn("_wfs_write_or_client_gone(self, chunk)", h)
        self.assertIn("r.read1(4096)", h)


if __name__ == "__main__":
    unittest.main()
