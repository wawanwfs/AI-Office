"""Siklus 214 — static allowlist wfs_hq_server (anti source-disclosure).

Bukti live siklus 214: web root produksi ~/wfs-hq (0.0.0.0:9503) menyajikan
file non-aset ke publik via _serve_static (SimpleHTTPRequestHandler tanpa
filter): GET /server.py → 200 (19008 byte source), GET /database.py → 200,
GET /.wfs_ui_token → 200 (32 byte = token UI ASLI), GET /backups/... → 200
(backup source), 20 PNG artefak screenshot ±10MB.

Fix: _serve_static default-TOLAK (STATIC_ALLOW_DIRS assets+fonts +
STATIC_ALLOW_FILES 12 jalur dist/ eksak). Test ini memverifikasi logika
_static_allowed langsung (murni, tanpa socket) + perilaku _serve_static
via instance H sintetis dengan cwd TMP web root buatan (tanpa produksi).
"""
import os
import tempfile
import unittest

import wfs_hq_server
from wfs_hq_server import H, _static_allowed


class TestStaticAllowlist(unittest.TestCase):
    # --- logika murni _static_allowed -------------------------------------

    def test_allow_dist_files_exact(self):
        for f in (
            "index.html", "landing.html", "manifest.webmanifest",
            "sw.js", "registerSW.js", "workbox-2178cfdb.js", "workbox-2fbc6a65.js",
            "favicon.svg", "wfs-logo.svg",
            "og-image.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
            # Siklus 279: fake-SW eksak utk probe pembaruan PWA 192 — file fisik
            # hanya ditulis probe sekali-pakai (dihapus di finally); tanpa fisik
            # tetap 404. Entri eksak, bukan pola: tidak membuka nama lain.
            "e2e-sw-fake.js",
        ):
            self.assertTrue(_static_allowed(f), f)

    def test_fake_sw_neighbor_names_still_rejected(self):
        # Siklus 279: allowlist = daftar EKSAK — nama mirip fake SW tetap TOLAK
        # (membuktikan entri baru bukan pola/prefix).
        for p in ("e2e-sw-fake2.js", "e2e-sw-fake.js.bak", "e2e-sw-fake",
                  "e2e-sw-fake.js.py", "other/e2e-sw-fake.js"):
            self.assertFalse(_static_allowed(p), p)

    def test_allow_dir_subpaths(self):
        self.assertTrue(_static_allowed("assets/index-eWLO-0Cj.js"))
        self.assertTrue(_static_allowed("assets/deep/sub-chunk.js"))
        self.assertTrue(_static_allowed("fonts/a.woff2"))
        self.assertTrue(_static_allowed("fonts/fonts.css"))

    def test_reject_source_code_and_secrets(self):
        for p in (
            "server.py", "database.py", "api_service.py", "wfs_tasks.py",
            ".wfs_ui_token", "tasks.db", "wfs_software_house.db",
            "backups/server.py.bak-1793270433", "backups/x.db",
            "office_grand_final.png", "test_x11.png", "live_window_shot.png",
        ):
            self.assertFalse(_static_allowed(p), p)

    def test_reject_empty_and_hidden(self):
        self.assertFalse(_static_allowed(""))
        self.assertFalse(_static_allowed(".git/config"))
        self.assertFalse(_static_allowed(".env"))

    # --- perilaku _serve_static (cwd TMP, tanpa produksi) ------------------

    def _make_webroot(self):
        tmp = tempfile.mkdtemp(prefix="wfs_static214_")
        old = os.getcwd()
        os.makedirs(os.path.join(tmp, "assets"), exist_ok=True)
        with open(os.path.join(tmp, "assets", "index-deadbeef.js"), "wb") as f:
            f.write(b"console.log(1)")
        with open(os.path.join(tmp, "server.py"), "wb") as f:
            f.write(b"SECRET_SOURCE=1")
        with open(os.path.join(tmp, ".wfs_ui_token"), "wb") as f:
            f.write(b"a" * 32)
        return tmp, old

    def _serve(self, relpath):
        """Panggil H._serve_static dengan cwd webroot buatan; balik (served, bytes)."""
        handler = H.__new__(H)
        handler.path = "/" + relpath
        handler.headers = {}
        handler._wfs_cc = "no-store"
        handler.directory = os.getcwd()  # translate_path butuh atribut ini
        sent = {}

        def send_response(code):
            sent["code"] = code

        def send_header(name, value):
            sent.setdefault("headers", []).append((name, value))

        def end_headers():
            sent["ended"] = True

        handler.send_response = send_response
        handler.send_header = send_header
        handler.end_headers = end_headers

        class _W:
            def __init__(self):
                self.data = b""

            def write(self, b):
                self.data += b

        handler.wfile = _W()
        served = H._serve_static(handler)
        return served, sent, handler.wfile.data

    def test_serve_static_serves_allowlisted_asset(self):
        tmp, old = self._make_webroot()
        try:
            os.chdir(tmp)
            served, sent, data = self._serve("assets/index-deadbeef.js")
            self.assertTrue(served)
            self.assertEqual(sent.get("code"), 200)
            self.assertEqual(data, b"console.log(1)")
        finally:
            os.chdir(old)

    def test_serve_static_rejects_source_py(self):
        tmp, old = self._make_webroot()
        try:
            os.chdir(tmp)
            served, sent, _ = self._serve("server.py")
            self.assertFalse(served)
            self.assertNotIn("code", sent)  # tidak pernah membaca/mengirim file
        finally:
            os.chdir(old)

    def test_serve_static_rejects_ui_token(self):
        tmp, old = self._make_webroot()
        try:
            os.chdir(tmp)
            served, sent, _ = self._serve(".wfs_ui_token")
            self.assertFalse(served)
            self.assertNotIn("code", sent)
        finally:
            os.chdir(old)

    def test_allowed_rel_gateway_rejects_non_allowlist(self):
        """Siklus 214: _allowed_rel satu gerbang — super().do_GET/do_HEAD kena."""
        tmp, old = self._make_webroot()
        try:
            os.chdir(tmp)
            handler = H.__new__(H)
            handler.path = "/server.py"
            handler.directory = os.getcwd()
            self.assertIsNone(handler._allowed_rel())
            handler.path = "/.wfs_ui_token"
            self.assertIsNone(handler._allowed_rel())
            handler.path = "/../etc/passwd"
            self.assertIsNone(handler._allowed_rel())
            handler.path = "/assets/index-deadbeef.js"
            self.assertEqual(handler._allowed_rel(), "assets/index-deadbeef.js")
        finally:
            os.chdir(old)

    def test_do_head_rejects_source_disclosure(self):
        """do_HEAD stdlib menyaji metadata file apa pun — kini 404 utk non-allowlist."""
        tmp, old = self._make_webroot()
        try:
            os.chdir(tmp)
            handler = H.__new__(H)
            handler.path = "/server.py"
            handler.headers = {}
            handler._wfs_cc = "no-store"
            handler.directory = os.getcwd()
            sent = []
            handler.send_response = lambda c: sent.append(c)
            handler.send_header = lambda n, v: sent.append((n, v))
            handler.end_headers = lambda: None

            class _W:
                data = b""

                def write(self, b):
                    pass

            handler.wfile = _W()
            H.do_HEAD(handler)
            self.assertEqual(sent[0], 404)
        finally:
            os.chdir(old)


if __name__ == "__main__":
    unittest.main()
