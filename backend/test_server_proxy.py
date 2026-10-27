"""Test server_proxy.py — parsing Content-Length toleran + cap body proxy (port 9503).

Pola sama dgn test_hq_proxy.py: stub gateway di port ephemeral, FakeH untuk
memanggil H._proxy langsung tanpa server sungguhan.
"""

import io
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import server_proxy
from server_proxy import H


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


class TestServerProxy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.gw = HTTPServer(("127.0.0.1", 0), _StubGatewayHandler)
        cls.gw_port = cls.gw.server_address[1]
        cls.thread = threading.Thread(target=cls.gw.serve_forever, daemon=True)
        cls.thread.start()
        server_proxy.GATEWAY = f"http://127.0.0.1:{cls.gw_port}/api/"

    @classmethod
    def tearDownClass(cls):
        cls.gw.shutdown()
        cls.gw.server_close()
        cls.thread.join(timeout=5)

    # --- parse Content-Length toleran ---
    def test_parse_content_length_tolerant_invalid(self):
        self.assertEqual(server_proxy._parse_content_length("abc"), 0)
        self.assertEqual(server_proxy._parse_content_length("12.5"), 0)
        self.assertEqual(server_proxy._parse_content_length(""), 0)
        self.assertEqual(server_proxy._parse_content_length(None), 0)

    def test_parse_content_length_negative_is_zero(self):
        self.assertEqual(server_proxy._parse_content_length("-5"), 0)

    def test_parse_content_length_valid(self):
        self.assertEqual(server_proxy._parse_content_length("42"), 42)

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
                              "X-WFS-Token": server_proxy.UI_TOKEN})
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
                              "X-WFS-Token": server_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertIsNotNone(_StubGatewayHandler.last)
        self.assertEqual(_StubGatewayHandler.last["body"], b"{}")

    def test_post_with_negative_content_length_still_proxies(self):
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"tidak dipakai",
                     headers={"Content-Length": "-5",
                              "X-WFS-Token": server_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(_StubGatewayHandler.last["body"], b"{}")

    def test_post_with_oversized_content_length_returns_413(self):
        # Content-Length melebihi MAX_PROXY_BODY → 413 tanpa meneruskan ke gateway.
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(server_proxy.MAX_PROXY_BODY + 1),
                              "X-WFS-Token": server_proxy.UI_TOKEN})
        H._proxy(fake)
        self.assertEqual(fake._status, 413)
        self.assertEqual(json.loads(fake.wfile.data), {"error": "payload terlalu besar"})
        self.assertIsNone(_StubGatewayHandler.last)

    def test_post_at_max_content_length_still_proxies(self):
        # Tepat di batas harus tetap diteruskan (boundary).
        _StubGatewayHandler.last = None
        fake = FakeH(path="/wfs-api/projects", command="POST",
                     body=b"{}",
                     headers={"Content-Length": str(server_proxy.MAX_PROXY_BODY),
                              "X-WFS-Token": server_proxy.UI_TOKEN})
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
