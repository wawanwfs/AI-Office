"""Siklus 465: hardening disconnect dua helper loopback — paritas kontrak 228.

Pola 228/463/464 menyisakan dua jalur yang masih menelan disconnect klien
di except Exception generik, lalu mencoba 502 ke socket mati (traceback
kedua "During handling" di journald):

1. _loopback_json_proxy (461) — proxy JSON GET/POST/DELETE gateway+bantuin.
   Disconnect (ClientGone/BrokenPipe/ConnectionReset) di-re-raise sebelum
   except Exception; kegagalan upstream sungguhan tetap 502 tanpa body.
2. _head_proxy_helper (460) — HEAD proxy loopback (admin/cs-widget/
   admin-api/gateway). Disconnect saat send_response/end_headers di-re-
   raise; upstream mati tetap 502.
"""
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "wfs_hq_server.py")


class TestDisconnectHardening465(unittest.TestCase):
    def _src(self):
        return open(_SRC, encoding="utf-8").read()

    def _helper(self, name, end):
        src = self._src()
        return src[src.index("def " + name):src.index(end)]

    def test_json_proxy_disconnect_reraised(self):
        h = self._helper("_loopback_json_proxy", "def _hq_handle_error")
        self.assertIn(
            "except (ClientGone, BrokenPipeError, ConnectionResetError):", h)
        self.assertIn("        raise", h)
        self.assertIn("handler.send_response(502)", h)  # satu jalur 502 tersisa

    def test_head_proxy_disconnect_reraised(self):
        h = self._helper("_head_proxy_helper", "def _loopback_html_proxy")
        self.assertIn(
            "except (ClientGone, BrokenPipeError, ConnectionResetError):", h)
        self.assertIn("        raise", h)
        self.assertIn("self.send_response(502)", h)

    def test_502_upstream_failure_unchanged(self):
        # Blok except Exception generik tetap jalur 502 untuk upstream mati —
        # disconnect tidak menulis apa pun lagi.
        h = self._helper("_loopback_json_proxy", "def _hq_handle_error")
        self.assertIn("_wfs_write_or_client_gone(handler, data)", h)


if __name__ == "__main__":
    unittest.main()
