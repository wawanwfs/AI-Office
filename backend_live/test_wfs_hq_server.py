"""Test wfs_hq_server.py — SATU SUMBER server produksi wfs-hq (:9503).

Siklus 206 — migrasi test_server_proxy.py (server_proxy.py dihapus; modul
diganti wfs_hq_server.py = superset fitur live siklus 154-161 + hardening
2026-10-28). Pola sama: stub gateway di port ephemeral, FakeH untuk memanggil
H._proxy langsung tanpa server sungguhan.
"""

import io
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import wfs_hq_server
from wfs_hq_server import H


class _StubGatewayHandler(BaseHTTPRequestHandler):
    """Gateway stub — merekam request dan membalas JSON (tanpa dependensi eksternal)."""

    last = None  # dict: method, path, x_wfs_token, body

    def _record(self):
        ln = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(ln) if ln else b""
        _StubGatewayHandler.last = {
            "method": self.command,
            "path": self.path,
            "x_wfs_token": self.headers.get("X-WFS-Token"),
            "body": body,
        }

    def do_GET(self):
        self._record()
        self._reply({"ok": True, "method": "GET"})

    def do_POST(self):
        self._record()
        self._reply({"ok": True, "method": "POST"})

    def _reply(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class FakeHeaders:
    def __init__(self, d):
        self._d = d or {}

    def get(self, key, default=None):
        return self._d.get(key, default)


class FakeWFile:
    def __init__(self):
        self.data = b""

    def write(self, b):
        self.data += b


class FakeH:
    """Objek pengganti instance handler untuk memanggil H._proxy secara langsung."""

    def __init__(self, path="/wfs-api/agents", command="GET", headers=None, body=b""):
        self.path = path
        self.command = command
        self.headers = FakeHeaders(headers or {})
        self.rfile = io.BytesIO(body)
        self.wfile = FakeWFile()
        self._status = None
        self._headers = []
        self._ended = False

    def send_response(self, code):
        self._status = code

    def send_header(self, name, value):
        self._headers.append((name, value))

    def end_headers(self):
        self._ended = True


class TestWfsHqServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = HTTPServer(("127.0.0.1", 0), _StubGatewayHandler)
        cls.gw_port = cls.gw.server_address[1]
        cls.thread = threading.Thread(target=cls.gw.serve_forever, daemon=True)
        cls.thread.start()
        wfs_hq_server.GATEWAY = f"http://127.0.0.1:{cls.gw_port}/api/"

    @classmethod
    def tearDownClass(cls):
        cls.gw.shutdown()
        cls.gw.server_close()
        cls.thread.join(timeout=5)

    # --- parse Content-Length toleran ---
    def test_parse_content_length_tolerant_invalid(self):
        self.assertEqual(wfs_hq_server._parse_content_length("abc"), 0)
        self.assertEqual(wfs_hq_server._parse_content_length("12.5"), 0)
        self.assertEqual(wfs_hq_server._parse_content_length(""), 0)
        self.assertEqual(wfs_hq_server._parse_content_length(None), 0)

    def test_parse_content_length_negative_is_zero(self):
        self.assertEqual(wfs_hq_server._parse_content_length("-5"), 0)

    def test_parse_content_length_valid(self):
        self.assertEqual(wfs_hq_server._parse_content_length("42"), 42)

    # --- otentikasi & proxy ---
    def test_post_without_token_returns_401(self):
        _StubGatewayHandler.last = None
        fake = FakeH(command="POST", body=b'{"a":1}',
                     headers={"Content-Length": "7"})
        H._proxy(fake)
        self.assertEqual(fake._status, 401)
        self.assertEqual(json.loads(fake.wfile.data), {"error": "unauthorized"})
        self.assertIsNone(_StubGatewayHandler.last)

    def test_post_with_valid_token_forwards_request(self):
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b'{"name":"X"}',
                     headers={"Content-Length": "12",
                              "X-WFS-Token": wfs_hq_server.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(json.loads(fake.wfile.data), {"ok": True, "method": "POST"})
        rec = _StubGatewayHandler.last
        self.assertIsNotNone(rec)
        self.assertEqual(rec["method"], "POST")
        self.assertEqual(rec["path"], "/api/projects")
        self.assertEqual(rec["body"], b'{"name":"X"}')
        # token UI hanya dicek di proxy, tidak diteruskan ke gateway
        self.assertIsNone(rec["x_wfs_token"])

    def test_post_with_invalid_content_length_still_proxies(self):
        # Content-Length malformed tidak boleh melempar — body fallback JSON {}.
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"tidak dipakai",
                     headers={"Content-Length": "abc",
                              "X-WFS-Token": wfs_hq_server.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertIsNotNone(_StubGatewayHandler.last)
        self.assertEqual(_StubGatewayHandler.last["body"], b"{}")

    def test_post_with_negative_content_length_still_proxies(self):
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"tidak dipakai",
                     headers={"Content-Length": "-5",
                              "X-WFS-Token": wfs_hq_server.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(_StubGatewayHandler.last["body"], b"{}")

    def test_post_with_oversized_content_length_returns_413(self):
        # Content-Length melebihi MAX_PROXY_BODY → 413 tanpa meneruskan ke gateway.
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(wfs_hq_server.MAX_PROXY_BODY + 1),
                              "X-WFS-Token": wfs_hq_server.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 413)
        self.assertEqual(json.loads(fake.wfile.data), {"error": "payload terlalu besar"})
        self.assertIsNone(_StubGatewayHandler.last)

    def test_post_at_max_content_length_still_proxies(self):
        # Tepat di batas harus tetap diteruskan (boundary).
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(wfs_hq_server.MAX_PROXY_BODY),
                              "X-WFS-Token": wfs_hq_server.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertIsNotNone(_StubGatewayHandler.last)

    def test_get_proxies_without_token(self):
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/agents", command="GET")
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        rec = _StubGatewayHandler.last
        self.assertEqual(rec["method"], "GET")
        self.assertEqual(rec["path"], "/api/agents")

    # --- siklus 212: fitur unik hq_proxy yang diserap superset ---
    def test_inject_token_adds_meta_into_head(self):
        # Dari backend/test_hq_proxy.py (dihapus) — kontrak injeksi token.
        html = "<html><head><title>x</title></head><body>y</body></html>"
        out = H._inject_token(None, html.encode()).decode()
        meta = f'<meta name="wfs-ui-token" content="{wfs_hq_server.UI_TOKEN}">'
        self.assertIn(meta, out)
        self.assertLess(out.index(meta), out.index("<title>"))

    def test_inject_token_prepends_when_no_head(self):
        html = "<html><body>y</body></html>"
        out = H._inject_token(None, html.encode()).decode()
        self.assertTrue(out.startswith('<meta name="wfs-ui-token"'))

    def test_security_headers_baseline(self):
        sec = dict(wfs_hq_server._security_headers())
        self.assertEqual(sec.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(sec.get("Referrer-Policy"), "same-origin")

    def test_end_headers_emits_cache_and_security_headers(self):
        # Header keamanan mengalir lewat end_headers() — semua jalur respons
        # (static, proxy, SSE, admin, widget) mewarisinya otomatis.
        import http.server as hs
        from unittest import mock
        with mock.patch.object(hs.BaseHTTPRequestHandler, "send_header") as m_send, \
                mock.patch.object(hs.BaseHTTPRequestHandler, "end_headers") as m_end:
            h = H.__new__(H)
            h._wfs_cc = "no-store"
            h.end_headers()
        self.assertEqual(m_send.call_args_list, [
            mock.call("Cache-Control", "no-store"),
            mock.call("X-Content-Type-Options", "nosniff"),
            mock.call("Referrer-Policy", "same-origin"),
        ])

    # --- SIKLUS 218: gerbang token jalur legacy /api/* (api_service) ---

    def _legacy_api(self, method, path, token=None):
        """FakeH-style: objek duck-typed, do_POST/do_DELETE dipanggil langsung."""
        fake = FakeH(path=path, command=method,
                     headers={"X-WFS-Token": token} if token else {},
                     body=b"{}" if method != "GET" else b"")
        called = {"api": False, "method": None}

        class _Api:
            @staticmethod
            def handle_api_request(hd, m, p):
                called.update(api=True, method=m)
                return True

        orig_api, orig_proj = wfs_hq_server.api_service, wfs_hq_server.project_api
        wfs_hq_server.api_service = _Api()
        wfs_hq_server.project_api = None
        try:
            (H.do_POST if method == "POST" else H.do_DELETE)(fake)
        finally:
            wfs_hq_server.api_service = orig_api
            wfs_hq_server.project_api = orig_proj
        return fake, called

    def test_legacy_api_post_without_token_is_401_and_not_dispatched(self):
        # Bukti insiden 218: POST /api/tasks tanpa token dulu MENCAPAI
        # api_service (task dibuat). Kini 401 sebelum dispatch.
        h, called = self._legacy_api("POST", "/api/tasks")
        self.assertEqual(h._status, 401)
        self.assertFalse(called["api"])
        self.assertIn(b"unauthorized", h.wfile.data)

    def test_legacy_api_delete_without_token_is_401_and_not_dispatched(self):
        # DELETE /api/tasks = reset DB UI yang menghapus 20 task di insiden 218.
        h, called = self._legacy_api("DELETE", "/api/tasks")
        self.assertEqual(h._status, 401)
        self.assertFalse(called["api"])

    def test_legacy_api_post_with_valid_token_dispatched(self):
        h, called = self._legacy_api("POST", "/api/tasks", token=wfs_hq_server.UI_TOKEN)
        self.assertTrue(called["api"])
        self.assertEqual(called["method"], "POST")

    def test_legacy_api_delete_with_valid_token_dispatched(self):
        h, called = self._legacy_api("DELETE", "/api/tasks/25", token=wfs_hq_server.UI_TOKEN)
        self.assertTrue(called["api"])
        self.assertEqual(called["method"], "DELETE")

    def test_api_token_ok_get_is_open_and_mutations_require_exact_match(self):
        # GET read-only tetap terbuka (smoke apply_wfs_api_service memakai
        # /api/agents & /api/dashboard/stats via urllib TANPA header token).
        h = FakeH(command="GET", headers={})
        self.assertTrue(wfs_hq_server._api_token_ok(h))
        h = FakeH(command="DELETE", headers={"X-WFS-Token": "TOKEN-SALAH"})
        self.assertFalse(wfs_hq_server._api_token_ok(h))
        h = FakeH(command="DELETE", headers={"X-WFS-Token": wfs_hq_server.UI_TOKEN})
        self.assertTrue(wfs_hq_server._api_token_ok(h))

    def test_admin_and_auth_login_stay_outside_legacy_gate(self):
        # /api/admin/* & /api/auth/login punya otentikasi sendiri (backend
        # :8000) — tetap diproxy, TIDAK kena 401 gerbang legacy.
        fake = FakeH(path="/api/auth/login", command="POST", body=b"{}", headers={})
        sent = []
        # Monkey-patch di INSTANCE (lookup atribut terjadi di FakeH, bukan H).
        fake._proxy_bantuin = lambda: sent.append(fake.path)
        H.do_POST(fake)
        self.assertEqual(sent, ["/api/auth/login"])
        self.assertIsNone(fake._status)


if __name__ == "__main__":
    unittest.main(verbosity=2)
