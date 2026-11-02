"""Test wfs_hq_server.py — SATU SUMBER server produksi wfs-hq (:9503).

Siklus 206 — migrasi test_server_proxy.py (server_proxy.py dihapus; modul
diganti wfs_hq_server.py = superset fitur live siklus 154-161 + hardening
2026-10-28). Pola sama: stub gateway di port ephemeral, FakeH untuk memanggil
H._proxy langsung tanpa server sungguhan.
"""

import io
import json
import pathlib
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

    def __init__(self, path="/wfs-api/agents", command="GET", headers=None, body=b"",
                 wfs_cc=None):
        self.path = path
        self.command = command
        self.headers = FakeHeaders(headers or {})
        self.rfile = io.BytesIO(body)
        self.wfile = FakeWFile()
        self._status = None
        self._headers = []
        self._ended = False
        if wfs_cc is not None:
            self._wfs_cc = wfs_cc
        # SIKLUS 222: do_HEAD/_serve_head_html memanggil helper kelas H pada
        # instance — delegasikan ke implementasi asli (pola duck-typed sama
        # seperti pemanggilan H._proxy(fake) di test lain).
        self._allowed_rel = lambda: H._allowed_rel(self)
        self._inject_token = lambda data: H._inject_token(self, data)
        self._serve_head_html = lambda fname, inject=False: H._serve_head_html(self, fname, inject=inject)
        # SIKLUS 223: do_HEAD memanggil _serve_head_static pada instance.
        self._serve_head_static = lambda: H._serve_head_static(self)  # type: ignore[arg-type]
        # SIKLUS 224: do_HEAD memanggil helper proxy HEAD pada instance.
        self._head_proxy_helper = lambda port, path, timeout=30: H._head_proxy_helper(self, port, path, timeout)  # type: ignore[arg-type]
        self._serve_head_admin = lambda: H._serve_head_admin(self)  # type: ignore[arg-type]
        self._serve_head_cs_widget = lambda: H._serve_head_cs_widget(self)  # type: ignore[arg-type]
        self._serve_head_admin_api = lambda: H._serve_head_admin_api(self)  # type: ignore[arg-type]
        # SIKLUS 225: do_HEAD memanggil helper proxy HEAD baru pada instance.
        self._serve_head_api_service = lambda: H._serve_head_api_service(self)  # type: ignore[arg-type]
        self._serve_head_gateway = lambda: H._serve_head_gateway(self)  # type: ignore[arg-type]
        self._serve_head_project = lambda: H._serve_head_project(self)  # type: ignore[arg-type]
        # _head_body_sink = kelas nested (non-binding): panggil langsung dgn handler.
        self._head_body_sink = lambda h: H._head_body_sink(h)  # type: ignore[arg-type]
        # _serve_head_static memakai self.guess_type (SimpleHTTPRequestHandler)
        # yang butuh extensions_map — delegasikan + salin map kelas.
        self.extensions_map = dict(H.extensions_map)
        self.guess_type = lambda p: H.guess_type(self, p)  # type: ignore[arg-type]
        self.translate_path = lambda p: H.translate_path(self, p)
        import os as _os
        self.directory = _os.getcwd()  # SimpleHTTPRequestHandler.translate_path

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

    # --- SIKLUS 222: hardening CORS proxy admin + HEAD konsisten dgn GET ---

    def _proxy_bantuin_recording(self, fake):
        """Panggil H._proxy_bantuin dgn stub backend :8000 terpasang.

        Monkey-patch http.client.HTTPConnection di modul superset agar request
        admin tertangkap tanpa menyentuh backend sungguhan (berdampak-nol).
        """
        import http.client
        from unittest import mock
        rec = {}

        class _StubConn:
            def __init__(self, host, port, timeout=None):
                rec["host"], rec["port"] = host, port

            def request(self, method, path, body=None, headers=None):
                rec.update(method=method, path=path, body=body, headers=headers)

            def getresponse(self):
                resp = mock.Mock()
                resp.status = 200
                resp.read.return_value = b'{"ok": true}'
                resp.getheader.return_value = "application/json"
                return resp

            def close(self):
                rec["closed"] = True

        with mock.patch.object(wfs_hq_server.http, "client", http.client), \
                mock.patch.object(http.client, "HTTPConnection", _StubConn):
            H._proxy_bantuin(fake)
        return rec

    def test_proxy_bantuin_no_acao_wildcard_anymore(self):
        # Dulu: setiap respons /api/admin/* menyertakan
        # "Access-Control-Allow-Origin: *" — konsumen semuanya same-origin
        # (panel /admin/ diproxy :9503), ACAO * hanya memperluas permukaan
        # baca lintas-origin tanpa manfaat → dihapus siklus 222.
        fake = FakeH(path="/api/admin/stats", command="GET")
        self._proxy_bantuin_recording(fake)
        acao = [v for n, v in fake._headers if n == "Access-Control-Allow-Origin"]
        self.assertEqual(acao, [])

    def test_proxy_bantuin_auth_forward_and_status_kept(self):
        # Kontrak lain proxy admin ikut dikunci agar penghapusan ACAO tidak
        # menyeret regresi tersembunyi: status diteruskan, Authorization
        # diteruskan, body dikirim ke klien.
        fake = FakeH(path="/api/admin/stats", command="GET",
                     headers={"Authorization": "Bearer jwttest"})
        rec = self._proxy_bantuin_recording(fake)
        self.assertEqual(rec["host"], "127.0.0.1")
        self.assertEqual(rec["port"], 8000)
        self.assertEqual(rec["headers"].get("Authorization"), "Bearer jwttest")
        self.assertEqual(fake._status, 200)
        self.assertEqual(fake.wfile.data, b'{"ok": true}')
        self.assertTrue(fake._ended)

    def test_source_has_no_acao_wildcard(self):
        # Guard sumber: tidak ada lagi Access-Control-Allow-Origin "*" di file
        # server produksi (semua konsumen same-origin).
        src = pathlib.Path(wfs_hq_server.__file__).read_text(encoding="utf-8")
        self.assertNotIn('"Access-Control-Allow-Origin"', src)

    def _head_html_env(self):
        """Tmpdir dgn index.html & landing.html minimal + chdir (cwd test bukan web root)."""
        import os
        import tempfile
        outer = os.getcwd()
        tmp = tempfile.mkdtemp(prefix="wfs-head-")
        with open(os.path.join(tmp, "index.html"), "wb") as f:
            f.write(b"<html><head><title>t</title></head><body>app</body></html>")
        with open(os.path.join(tmp, "landing.html"), "wb") as f:
            f.write(b"<html><body>landing</body></html>")
        os.chdir(tmp)
        return tmp, outer

    def test_head_html_pages_match_get_status(self):
        # HEAD /, /app/, /landing kini 200 — konsisten dgn GET (dulu 404,
        # monitor uptime berbasis HEAD menerima "page down" palsu).
        import os
        tmp, outer = self._head_html_env()
        try:
            for path in ("/", "/app/", "/landing"):
                fake = FakeH(path=path, command="HEAD", wfs_cc="stale")
                H.do_HEAD(fake)
                self.assertEqual(fake._status, 200, msg=f"HEAD {path}")
                self.assertEqual(fake.wfile.data, b"", msg=f"HEAD {path} tanpa body")
                hdrs = dict(fake._headers)
                self.assertEqual(hdrs.get("Content-Type"), "text/html; charset=utf-8")
                self.assertTrue(int(hdrs.get("Content-Length", "0")) > 0,
                                msg=f"HEAD {path} Content-Length = panjang GET")
                self.assertEqual(fake._wfs_cc, "no-store")
                self.assertTrue(fake._ended)
        finally:
            os.chdir(outer)

    def test_head_root_injects_token_but_no_body(self):
        # HEAD / memakai injeksi token sama persis dgn GET /: Content-Length
        # = panjang html TERINJEKSI (bukan mentah), body tetap kosong.
        import os
        tmp, outer = self._head_html_env()
        try:
            raw = open("index.html", "rb").read()
            injected = H._inject_token(None, raw)
            fake = FakeH(path="/", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
            self.assertEqual(fake._status, 200)
            self.assertEqual(fake.wfile.data, b"")
            self.assertEqual(dict(fake._headers).get("Content-Length"),
                             str(len(injected)))
        finally:
            os.chdir(outer)

    def _head_static_env(self):
        """Tmpdir + assets/ dgn JS besar (>=1KB, kena gzip) + CSS + chdir."""
        import os
        import tempfile
        outer = os.getcwd()
        tmp = tempfile.mkdtemp(prefix="wfs-head-static-")
        os.makedirs(os.path.join(tmp, "assets"))
        js = ("const x=" + "a" * 2048 + ";\n").encode()  # >= MIN_GZ → gzip path
        with open(os.path.join(tmp, "assets", "index-BzSlm-bb.js"), "wb") as f:
            f.write(js)
        with open(os.path.join(tmp, "assets", "icon-192.png"), "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + b"0" * 24)  # binary, tak kena gzip
        os.chdir(tmp)
        return tmp, outer, js

    def test_head_static_assets_match_get_metadata(self):
        # SIKLUS 223: HEAD aset statis kini konsisten dgn GET — dulu via
        # super().do_HEAD() stdlib: Content-Length = ukuran mentah (GET gzip
        # lebih kecil) dan Cache-Control no-store (GET /assets/* immutable).
        # Monitor/cache-probe berbasis HEAD menerima metadata palsu.
        import os
        tmp, outer, js = self._head_static_env()
        try:
            # (1) JS besar + Accept-Encoding gzip → headers identik GET:
            #     CC immutable, Content-Encoding gzip + Vary, CL = panjang gzip.
            fake = FakeH(path="/assets/index-BzSlm-bb.js", command="HEAD",
                         headers={"Accept-Encoding": "gzip"}, wfs_cc="stale")
            H.do_HEAD(fake)
            self.assertEqual(fake._status, 200)
            self.assertEqual(fake.wfile.data, b"")  # HEAD tanpa body
            hdrs = dict(fake._headers)
            self.assertEqual(hdrs.get("Content-Encoding"), "gzip")
            self.assertEqual(hdrs.get("Vary"), "Accept-Encoding")
            self.assertEqual(fake._wfs_cc, "public, max-age=31536000, immutable")
            self.assertLess(int(hdrs["Content-Length"]), len(js))
            self.assertGreater(int(hdrs["Content-Length"]), 0)
            self.assertNotEqual(hdrs.get("Content-Length"), str(len(js)))
            self.assertTrue(fake._ended)
            # (2) Tanpa Accept-Encoding → tanpa Content-Encoding, CL = raw.
            fake2 = FakeH(path="/assets/index-BzSlm-bb.js", command="HEAD",
                          headers={"Accept-Encoding": "identity"}, wfs_cc="stale")
            H.do_HEAD(fake2)
            hdrs2 = dict(fake2._headers)
            self.assertEqual(fake2._status, 200)
            self.assertNotIn("Content-Encoding", hdrs2)
            self.assertEqual(hdrs2.get("Content-Length"), str(len(js)))
            self.assertEqual(fake2._wfs_cc, "public, max-age=31536000, immutable")
            self.assertEqual(fake2.wfile.data, b"")
            # (3) Binary (png) → tanpa gzip, CC immutable (di /assets/).
            fake3 = FakeH(path="/assets/icon-192.png", command="HEAD",
                          headers={"Accept-Encoding": "gzip"}, wfs_cc="stale")
            H.do_HEAD(fake3)
            hdrs3 = dict(fake3._headers)
            self.assertEqual(fake3._status, 200)
            self.assertNotIn("Content-Encoding", hdrs3)
            self.assertEqual(fake3._wfs_cc, "public, max-age=31536000, immutable")
            self.assertEqual(fake3.wfile.data, b"")
        finally:
            os.chdir(outer)

    def test_head_static_and_unknown_keep_allowlist_contract(self):
        # Kontrak 214 tidak berubah: path non-allowlist HEAD tetap 404 tanpa
        # body (server.py tak pernah ada di allowlist).
        fake404 = FakeH(path="/server.py", command="HEAD", wfs_cc="stale")
        H.do_HEAD(fake404)
        self.assertEqual(fake404._status, 404)
        self.assertEqual(fake404.wfile.data, b"")

    # --- SIKLUS 224: HEAD jalur proxy (/admin/, /cs-widget/, /api/admin/*) ---

    def _head_proxy_conn(self, resp_status=200, ct="text/html", body=b"<html>x</html>"):
        """Monkey-patch http.client.HTTPConnection dgn stub upstream loopback."""
        import http.client
        from unittest import mock
        rec = {}

        class _StubConn:
            def __init__(self, host, port, timeout=None):
                rec["host"], rec["port"] = host, port

            def request(self, method, path, body=None, headers=None):
                rec.update(method=method, path=path, headers=headers or {})

            def getresponse(self):
                resp = mock.Mock()
                resp.status = resp_status
                resp.read.return_value = body
                resp.getheader.return_value = ct
                return resp

            def close(self):
                rec["closed"] = True

        return rec, mock.patch.object(http.client, "HTTPConnection", _StubConn)

    def test_head_admin_panel_matches_get(self):
        # HEAD /admin/ & /admin dulu 404 stdlib (GET = 200 panel HTML :3000);
        # kini mirror cabang GET: status 200, CT text/html, CL = panjang
        # payload GET, TANPA body, CC no-store — monitor uptime tak menipu.
        for p in ("/admin", "/admin/"):
            rec, patcher = self._head_proxy_conn(body=b"<html>panel</html>")
            with patcher:
                fake = FakeH(path=p, command="HEAD", wfs_cc="stale")
                H.do_HEAD(fake)
            self.assertEqual(fake._status, 200, msg=f"HEAD {p}")
            self.assertEqual(fake.wfile.data, b"", msg=f"HEAD {p} tanpa body")
            hdrs = dict(fake._headers)
            self.assertEqual(hdrs.get("Content-Type"), "text/html")
            self.assertEqual(hdrs.get("Content-Length"),
                             str(len(b"<html>panel</html>")))
            self.assertEqual(fake._wfs_cc, "no-store")
            self.assertTrue(fake._ended)
            self.assertTrue(rec["closed"])
            self.assertEqual(rec["host"], "127.0.0.1")
            self.assertEqual(rec["port"], 3000)
            self.assertEqual(rec["method"], "GET")  # HEAD→GET rewrite loopback
            self.assertEqual(rec["path"], "/")

    def test_head_cs_widget_matches_get(self):
        # HEAD /cs-widget/widget.js dulu 404 stdlib; kini mirror cabang GET
        # (upstream :3001, sub-path diteruskan persis).
        rec, patcher = self._head_proxy_conn(resp_status=200, ct="application/javascript",
                                             body=b"window.WFS_CS=1")
        with patcher:
            fake = FakeH(path="/cs-widget/widget.js", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(fake.wfile.data, b"")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "application/javascript")
        self.assertEqual(hdrs.get("Content-Length"), "15")
        self.assertEqual(fake._wfs_cc, "no-store")
        self.assertTrue(fake._ended)
        self.assertEqual(rec["port"], 3001)
        self.assertEqual(rec["path"], "/widget.js")

    def test_head_cs_widget_upstream_404_is_forwarded(self):
        # Widget absen di upstream (:3001 balas 404 HTML) → HEAD meneruskan
        # status + CT + CL persis GET (bukan 404 "kosong tanpa CT" stdlib).
        rec, patcher = self._head_proxy_conn(resp_status=404, ct="text/html",
                                             body=b"<!doctype html>not found")
        with patcher:
            fake = FakeH(path="/cs-widget/absen.js", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 404)
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "text/html")
        self.assertEqual(hdrs.get("Content-Length"), "24")
        self.assertEqual(fake.wfile.data, b"")

    def test_head_admin_api_matches_get_without_auth(self):
        # HEAD /api/admin/stats dulu 404 tanpa CT; GET tanpa JWT = 401 JSON.
        # Kini HEAD mirror GET: 401 + CT JSON + CL body, Authorization
        # diteruskan (bila ada), CC no-store — uptime-probe tak menipu.
        rec, patcher = self._head_proxy_conn(resp_status=401, ct="application/json",
                                             body=b'{"detail":"Unauthorized"}')
        with patcher:
            fake = FakeH(path="/api/admin/stats", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 401)
        self.assertEqual(fake.wfile.data, b"")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "application/json")
        self.assertEqual(hdrs.get("Content-Length"),
                         str(len(b'{"detail":"Unauthorized"}')))
        self.assertEqual(fake._wfs_cc, "no-store")
        self.assertTrue(fake._ended)
        self.assertEqual(rec["port"], 8000)
        self.assertEqual(rec["path"], "/api/admin/stats")
        self.assertEqual(rec["method"], "GET")  # HEAD→GET rewrite: upstream 405-proof
        self.assertNotIn("Authorization", rec["headers"])

    def test_head_admin_api_forwards_authorization(self):
        rec, patcher = self._head_proxy_conn(resp_status=200, ct="application/json",
                                             body=b'{"ok": true}')
        with patcher:
            fake = FakeH(path="/api/admin/tenants", command="HEAD",
                         headers={"Authorization": "Bearer jwttest"}, wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(rec["headers"].get("Authorization"), "Bearer jwttest")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Length"), "12")

    # --- SIKLUS 225: HEAD api_service /api/* + gateway /wfs-api/* + project ---

    def test_head_api_service_tasks_matches_get(self):
        # HEAD /api/tasks dulu 404 stdlib tanpa CT (GET = 200 JSON api_service);
        # kini replay GET dgn wfile penangkap: status + CT + CL identik GET,
        # tanpa body. api_service di-patch agar tak menyentuh DB sungguhan.
        from unittest import mock
        payload = b'{"tasks": [{"id": 1}]}'

        class _Api:
            @staticmethod
            def handle_api_request(hd, m, p):
                hd.send_response(200)
                hd.send_header("Content-Type", "application/json")
                hd.send_header("Content-Length", str(len(payload)))
                hd.end_headers()
                hd.wfile.write(payload)
                return True

        with mock.patch.object(wfs_hq_server, "api_service", _Api):
            fake = FakeH(path="/api/tasks", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(fake.wfile.data, b"")  # HEAD tanpa body
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "application/json")
        self.assertEqual(hdrs.get("Content-Length"), str(len(payload)))
        self.assertTrue(fake._ended)

    def test_head_api_service_sse_events_stays_404(self):
        # /api/events = SSE streaming (GET tak berujung) — replay akan
        # menggantung; kontrak lama tetap: HEAD 404 stdlib tanpa body.
        from unittest import mock

        class _Api:
            @staticmethod
            def handle_api_request(hd, m, p):
                raise AssertionError("SSE tidak boleh direplay utk HEAD")

        with mock.patch.object(wfs_hq_server, "api_service", _Api):
            fake = FakeH(path="/api/events", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 404)
        self.assertEqual(fake.wfile.data, b"")

    def test_head_gateway_wfs_api_tasks_matches_get(self):
        # HEAD /wfs-api/tasks dulu 404 tanpa CT (GET = 200 JSON gateway :8787
        # via _proxy); kini HEAD→GET rewrite loopback, status + CT + CL
        # identik GET, tanpa body.
        rec, patcher = self._head_proxy_conn(resp_status=200,
                                             ct="application/json",
                                             body=b'{"agents": []}')
        with patcher:
            fake = FakeH(path="/wfs-api/tasks", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(fake.wfile.data, b"")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "application/json")
        self.assertEqual(hdrs.get("Content-Length"), "14")
        self.assertEqual(rec["port"], 8787)
        self.assertEqual(rec["method"], "GET")  # HEAD→GET rewrite loopback
        self.assertEqual(rec["path"], "/api/tasks")

    def test_head_gateway_sse_events_stays_404(self):
        # /wfs-api/events = SSE streaming — replay akan menggantung koneksi;
        # kontrak lama tetap: HEAD 404 stdlib.
        fake = FakeH(path="/wfs-api/events", command="HEAD", wfs_cc="stale")
        H.do_HEAD(fake)
        self.assertEqual(fake._status, 404)
        self.assertEqual(fake.wfile.data, b"")

    def test_head_project_matches_get(self):
        # HEAD /wfs-project dulu 404 (GET = 200 JSON snapshot project_api);
        # kini replay GET dgn sink: status + CT json + CL payload GET,
        # tanpa body. project_api di-patch (tak ada di env CI).
        from unittest import mock
        payload = b'{"projects": [], "agents": []}'

        class _Proj:
            @staticmethod
            def handle_project(hd):
                hd.send_response(200)
                hd.send_header("Content-Type", "application/json")
                hd.send_header("Cache-Control", "no-store")
                hd.send_header("Content-Length", str(len(payload)))
                hd.end_headers()
                hd.wfile.write(payload)

        with mock.patch.object(wfs_hq_server, "project_api", _Proj):
            fake = FakeH(path="/wfs-project", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 200)
        self.assertEqual(fake.wfile.data, b"")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "application/json")
        self.assertEqual(hdrs.get("Content-Length"), str(len(payload)))
        self.assertTrue(fake._ended)

    def test_head_api_service_preview_paths_covered(self):
        # Cabang replay mencakup /preview/* juga (mirror persis do_GET);
        # project tak dikenal → api_service membalas 404 HTML — status + CT
        # + CL diteruskan tanpa body.
        from unittest import mock
        msg = b"<h1>Preview Unavailable</h1><p>Project sandbox is not running.</p>"

        class _Api:
            @staticmethod
            def handle_api_request(hd, m, p):
                hd.send_response(404)
                hd.send_header("Content-Type", "text/html; charset=utf-8")
                hd.send_header("Content-Length", str(len(msg)))
                hd.end_headers()
                hd.wfile.write(msg)
                return True

        with mock.patch.object(wfs_hq_server, "api_service", _Api):
            fake = FakeH(path="/preview/abc/", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 404)
        self.assertEqual(fake.wfile.data, b"")
        hdrs = dict(fake._headers)
        self.assertEqual(hdrs.get("Content-Type"), "text/html; charset=utf-8")
        self.assertEqual(hdrs.get("Content-Length"), str(len(msg)))

    def test_head_proxy_upstream_down_is_502_no_body(self):
        # Upstream mati → 502 + tanpa body (konsisten dgn GET proxy yang
        # juga membalas 502 saat koneksi loopback gagal).
        import http.client
        from unittest import mock
        with mock.patch.object(http.client, "HTTPConnection",
                               mock.Mock(side_effect=OSError("conn refused"))):
            fake = FakeH(path="/admin/", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
        self.assertEqual(fake._status, 502)
        self.assertEqual(fake.wfile.data, b"")
        self.assertTrue(fake._ended)

    def test_head_allowlist_and_html_routes_untouched(self):
        # Rute lama tidak tersenggol cabang proxy baru: / tetap 200 injeksi
        # token tanpa body, non-allowlist tetap 404 tanpa body.
        import os
        tmp, outer = self._head_html_env()
        try:
            fake = FakeH(path="/", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake)
            self.assertEqual(fake._status, 200)
            self.assertEqual(fake.wfile.data, b"")
            fake404 = FakeH(path="/server.py", command="HEAD", wfs_cc="stale")
            H.do_HEAD(fake404)
            self.assertEqual(fake404._status, 404)
            self.assertEqual(fake404.wfile.data, b"")
        finally:
            os.chdir(outer)

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
