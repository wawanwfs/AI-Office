import io, json, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import hq_proxy
from hq_proxy import H


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


class TestHQProxy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = HTTPServer(("127.0.0.1", 0), _StubGatewayHandler)
        cls.gw_port = cls.gw.server_address[1]
        cls.thread = threading.Thread(target=cls.gw.serve_forever, daemon=True)
        cls.thread.start()
        hq_proxy.GATEWAY = f"http://127.0.0.1:{cls.gw_port}/api/"

    @classmethod
    def tearDownClass(cls):
        cls.gw.shutdown()
        cls.gw.server_close()
        cls.thread.join(timeout=5)

    # --- injeksi token ke index.html ---
    def test_inject_token_adds_meta_into_head(self):
        html = "<html><head><title>x</title></head><body>y</body></html>"
        out = H._inject_token(None, html.encode()).decode()
        meta = f'<meta name="wfs-ui-token" content="{hq_proxy.UI_TOKEN}">'
        self.assertIn(meta, out)
        self.assertLess(out.index(meta), out.index("<title>"))

    def test_inject_token_prepends_when_no_head(self):
        html = "<html><body>y</body></html>"
        out = H._inject_token(None, html.encode()).decode()
        self.assertTrue(out.startswith('<meta name="wfs-ui-token"'))

    # --- otentikasi & proxy ---
    def test_post_without_token_returns_401(self):
        # reset rekaman stub
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
                              "X-WFS-Token": hq_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(json.loads(fake.wfile.data), {"ok": True, "method": "POST"})
        rec = _StubGatewayHandler.last
        self.assertIsNotNone(rec)
        self.assertEqual(rec["method"], "POST")
        self.assertEqual(rec["path"], "/api/projects")
        self.assertEqual(rec["body"], b'{"name":"X"}')
        # token UI hanya dicek di proxy, tidak diteruskan ke gateway (tidak bocor ke upstream)
        self.assertIsNone(rec["x_wfs_token"])

    def test_post_with_invalid_content_length_still_proxies(self):
        # Content-Length malformed (non-numerik) tidak boleh melempar — body fallback JSON {}.
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"tidak dipakai",
                     headers={"Content-Length": "abc",
                              "X-WFS-Token": hq_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        rec = _StubGatewayHandler.last
        self.assertIsNotNone(rec)
        self.assertEqual(rec["body"], b"{}")

    def test_post_with_negative_content_length_still_proxies(self):
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"tidak dipakai",
                     headers={"Content-Length": "-5",
                              "X-WFS-Token": hq_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(_StubGatewayHandler.last["body"], b"{}")

    def test_post_with_oversized_content_length_returns_413(self):
        # Content-Length melebihi MAX_PROXY_BODY → 413 tanpa meneruskan ke gateway
        # (cegah memory DoS: baca tak terbatas dari header palsu di port 9503).
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(hq_proxy.MAX_PROXY_BODY + 1),
                              "X-WFS-Token": hq_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 413)
        self.assertEqual(json.loads(fake.wfile.data), {"error": "payload terlalu besar"})
        self.assertIsNone(_StubGatewayHandler.last)

    def test_post_at_max_content_length_still_proxies(self):
        # Tepat di batas harus tetap diteruskan (boundary).
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(hq_proxy.MAX_PROXY_BODY),
                              "X-WFS-Token": hq_proxy.UI_TOKEN})
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

    # --- header keamanan ---
    def test_security_headers_baseline(self):
        sec = dict(hq_proxy._security_headers())
        self.assertEqual(sec.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(sec.get("Referrer-Policy"), "same-origin")

    def test_end_headers_emits_cache_and_security_headers(self):
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
