# backend_live/wfs_hq_server.py — SATU SUMBER server produksi wfs-hq (:9503).
#
# Siklus 206 — HAPUS DRIFT DUA ARAH antara repo dan produksi:
#   - backend/server_proxy.py (repo, ter-track, ada pytest): punya hardening
#     2026-10-28 (parse Content-Length toleran + cap body 5MB → 413) tapi TANPA
#     fitur live (SSE stream, /app, /landing, /admin, /cs-widget, _proxy_bantuin,
#     do_DELETE) → hardening TIDAK PERNAH sampai ke produksi.
#   - ~/wfs-hq/server.py (produksi): punya semua fitur siklus 154–161 tapi TANPA
#     hardening → int() telanjang + rfile.read(ln) tanpa cap di _proxy() dan
#     _proxy_bantuin() (header Content-Length malformed = ValueError membunuh
#     handler; body 1GB "gratis" dibaca ke RAM).
#   File ini SUPERSET keduanya: fitur live + hardening. Diedit DI SINI, lalu
#   deploy dengan scripts/apply_wfs_hq_server.py (backup + compile-check + health
#   + smoke fitur + auto-rollback). JANGAN mengedit ~/wfs-hq/server.py langsung —
#   drift_gate.test.js akan FAIL (guard regresi).
#
# Fitur live (dipertahankan eksak dari produksi):
#   - SSE streaming /wfs-api/events → :8787/api/events (siklus 154; timeout=90
#     > keepalive 15 dtk — bug stream mati tiap 10 dtk tertangkap E2E).
#   - /app(/) index.html + injeksi token UI (siklus 159), /landing(/) (159).
#   - /admin(/) → panel admin saas-dibantuin :3000 (161), /cs-widget/ → :3001,
#     /api/admin/* + /api/auth/login (GET/POST/DELETE) → backend :8000 (161).
#   - DELETE /api/* via api_service.
# Hardening 2026-10-28 (dipertahankan, kini benar-benar hidup di produksi):
#   - _parse_content_length toleran: invalid/negatif → 0 (tanpa ValueError).
#   - MAX_PROXY_BODY 5MB: POST /wfs-api/* dan /api/admin/* lebih besar → 413
#     TANPA membaca body ke RAM.
import http.server, socketserver, os, urllib.request, urllib.error, json, secrets, re
try:
    import project_api  # hanya ada di direktori deploy (~/wfs-hq)
except ImportError:  # pragma: no cover - dev/CI tanpa project_api
    project_api = None
try:
    import api_service
except Exception as _e:
    print(f"[API Service Import Error] {_e}")
    api_service = None
try:
    import static_serve  # deploy: static_serve.py di direktori yang sama
except ImportError:
    # repo: static_serve.py ter-track di backend/ (backend_live/test_wfs_hq_server.py)
    import sys as _sys, pathlib as _pl
    _sys.path.insert(0, str(_pl.Path(__file__).resolve().parent.parent / "backend"))
    import static_serve
os.chdir(os.path.dirname(os.path.abspath(__file__)))
GATEWAY = "http://127.0.0.1:8787/api/"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".wfs_ui_token")

def get_token():
    if os.path.exists(TOKEN_FILE):
        return open(TOKEN_FILE).read().strip()
    t = secrets.token_hex(16)
    with open(TOKEN_FILE, "w") as f:
        os.chmod(TOKEN_FILE, 0o600)
        f.write(t)
    return t

UI_TOKEN = get_token()

MAX_PROXY_BODY = 5 * 1024 * 1024


def _parse_content_length(raw):
    """Parse Content-Length toleran: nilai invalid/negatif → 0.

    Konsisten dgn pola _parse_content_length di hq_proxy.py — header malformed
    tidak boleh melempar ValueError (int() telanjang) yang membunuh handler proxy.
    """
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return 0
    return n if n >= 0 else 0


def _reply_json(handler, code, obj):
    """Kirim JSON kecil dengan Content-Length eksak (pola semua jalur 4xx/502)."""
    msg = json.dumps(obj).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(msg)))
    handler.end_headers()
    handler.wfile.write(msg)


def _reject_oversize(handler):
    """413 tanpa membaca body — body besar tidak pernah masuk RAM."""
    _reply_json(handler, 413, {"error": "payload terlalu besar"})


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if not hasattr(self, "_wfs_cc"):
            self._wfs_cc = "no-store"
        self.send_header('Cache-Control', self._wfs_cc)
        super().end_headers()

    def _serve_static(self):
        """Serve file statis dengan cache policy + gzip (backend/static_serve.py)."""
        path = self.translate_path(self.path)
        if os.path.basename(path) in ("index.html",):
            return False  # index.html lewat jalur khusus (injeksi token)
        if os.path.isfile(path):
            try:
                data = open(path, "rb").read()
                data, gz = static_serve.maybe_gzip(
                    data, self.path, self.headers.get("Accept-Encoding", ""))
                self._wfs_cc = static_serve.cache_control_for(self.path)
                self.send_response(200)
                ctype = self.guess_type(path) or "application/octet-stream"
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return True
            except Exception:
                pass
        return False

    def log_message(self,*a): pass

    def _inject_token(self, data):
        # Sisipkan token UI ke index.html (same-origin) agar frontend bisa memakainya untuk POST
        html = data.decode("utf-8", "replace")
        meta = '<meta name="wfs-ui-token" content="%s">' % UI_TOKEN
        if "<head>" in html:
            html = html.replace("<head>", "<head>" + meta, 1)
        else:
            html = meta + html
        return html.encode("utf-8")

    # === wfs SSE streaming proxy (siklus 154) ===
    def _proxy_stream_events(self):
        """Passthrough streaming /wfs-api/events → :8787/api/events (SSE).

        MUNGKIN blocked saat menunggu chunk berikutnya (urlopen().read1()) —
        ini yang membedakannya dari _proxy() buffered: EventSource menerima
        frame sesuai ketika gateway memancarkannya, tanpa menunggu EOF.
        Thread-per-connection (ThreadingMixIn) membuat thread tunggal ini
        ter-block tanpa memengaruhi koneksi lain.
        """
        import urllib.request as _ur
        try:
            # timeout=90: batas per-recv() upstream — HARUS > interval keepalive
            # (15 dtk) agar stream tidak mati saat idle (bug tertangkap E2E
            # siklus 154: timeout=10 < 15 → tiap stream mati tiap ~10 dtk).
            r = _ur.urlopen(_ur.Request("http://127.0.0.1:8787/api/events"), timeout=90)
            self.send_response(r.status)
            self.send_header("Content-Type", r.headers.get("Content-Type") or "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            while True:
                chunk = r.read1(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            try:
                _reply_json(self, 502, {"error": "stream failed"})
            except Exception:
                pass

    def _proxy(self):
        path = self.path[len("/wfs-api/"):]
        url = GATEWAY + path
        body = None
        if self.command == "POST":
            # Semua POST ke gateway wajib token UI (same-origin, diinject ke index.html)
            if self.headers.get("X-WFS-Token") != UI_TOKEN:
                _reply_json(self, 401, {"error": "unauthorized"})
                return
            # Hardening 2026-10-28: parse toleran (malformed → 0) + cap 5MB → 413
            # tanpa membaca body ke RAM (dulu int() telanjang + read(ln) bebas).
            ln = _parse_content_length(self.headers.get("Content-Length", 0))
            if ln > MAX_PROXY_BODY:
                _reject_oversize(self)
                return
            body = self.rfile.read(ln) if ln else b"{}"
        req = urllib.request.Request(url, data=body, method=self.command)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            _reply_json(self, 502, {"error": str(e)})

    def _proxy_bantuin(self):
        """Proxy /api/admin/* → backend saas-dibantuin :8000.

        SIKLUS 161: GET & DELETE ikut diproxy (dulu hanya POST — admin panel
        memanggil GET /api/admin/stats, tenants, conversations, knowledge via
        same-origin :9503), dan header Authorization diteruskan (JWT login
        admin). Widget chat (siklus 160) tetap jalan via jalur ini.
        """
        import http.client
        try:
            # Hardening 2026-10-28: parse toleran + cap 5MB (sama dgn _proxy) —
            # dulu int() telanjang + read(ln) tanpa batas juga di jalur ini.
            ln = _parse_content_length(self.headers.get("Content-Length", 0))
            if ln > MAX_PROXY_BODY:
                _reject_oversize(self)
                return
            body = self.rfile.read(ln) if ln else None
            fwd_headers = {"Content-Type": "application/json"}
            auth = self.headers.get("Authorization")
            if auth:
                fwd_headers["Authorization"] = auth
            conn = http.client.HTTPConnection("127.0.0.1", 8000, timeout=120)
            conn.request(self.command, self.path, body=body,
                         headers=fwd_headers)
            r = conn.getresponse()
            data = r.read()
            self.send_response(r.status)
            self.send_header("Content-Type", r.getheader("Content-Type", "application/json"))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            conn.close()
        except Exception:
            try:
                self.send_response(502)
            except Exception:
                pass
            try:
                self.send_header("Content-Length", "0")
                self.end_headers()
            except Exception:
                pass

    def do_POST(self):
        if self.path.startswith("/api/admin/"):
            return self._proxy_bantuin()
        # SIKLUS 161: login admin panel (JWT) → backend saas-dibantuin.
        # Dibatasi persis endpoint login; sisanya tetap 404.
        if self.path == "/api/auth/login":
            return self._proxy_bantuin()
        if api_service and self.path.startswith("/api/"):
            if api_service.handle_api_request(self, "POST", self.path):
                return
        if self.path.startswith("/wfs-api/"):
            return self._proxy()
        self.send_response(404); self.end_headers()

    def do_GET(self):
        path_only = self.path.split("?")[0]
        # SIKLUS 161: GET /api/admin/* (stats, tenants, conversations, knowledge)
        # → backend saas-dibantuin. Dulu 404 permanen — proxy hanya ada di
        # do_POST, padahal panel admin memuat dashboard via GET.
        if self.path.startswith("/api/admin/"):
            return self._proxy_bantuin()
        # Landing page publik di /, kantor 3D penuh di /app/  — SIKLUS 159:
        # "/app/" TIDAK melayani landing lagi (loop navigasi: CTA landing menaut
        # /app/ yang balik ke landing, tak pernah sampai kantor). Sekarang:
        # /app(/) = index.html + injeksi token (SATU app, hash #dashboard utk deep-link)
        # /landing(/) = landing.html (tetap).
        if path_only in ("/landing", "/landing/"):
            try:
                data = open("landing.html", "rb").read()
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500); self.send_header("Content-Length", "0"); self.end_headers()
            return
        if path_only in ("/app", "/app/"):
            try:
                data = open("index.html", "rb").read()
                data = self._inject_token(data)
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                self.send_response(500); self.send_header("Content-Length", "0"); self.end_headers()
            return
        # SIKLUS 161: /admin(/) → panel admin saas-dibantuin (Docker :3000) via
        # proxy HTML same-origin. Dulu 404 — hanya widget (:3001) yang diproxy,
        # padahal link footer "Login Admin" menaut /admin/ dan kontainer admin
        # TIDAK diekspos publik. /api/admin/* (GET/POST/DELETE) sudah diproxy
        # _proxy_bantuin → /api/ di dalam kontainer diteruskan nginx ke backend.
        if path_only in ("/admin", "/admin/"):
            import http.client
            try:
                conn = http.client.HTTPConnection("127.0.0.1", 3000, timeout=30)
                conn.request("GET", "/")
                r = conn.getresponse()
                data = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", r.getheader("Content-Type", "text/html"))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                conn.close()
            except Exception:
                self.send_response(502); self.send_header("Content-Length", "0"); self.end_headers()
            return
        # Proxy widget chat AI CS dibantuin (Docker :3001) → same-origin /cs-widget/
        if self.path.startswith("/cs-widget/"):
            import http.client
            try:
                sub = self.path[len("/cs-widget/"):] or ""
                url_path = "/" + sub
                conn = http.client.HTTPConnection("127.0.0.1", 3001, timeout=30)
                conn.request("GET", url_path)
                r = conn.getresponse()
                data = r.read()
                self.send_response(r.status)
                ctype = r.getheader("Content-Type", "text/html")
                self.send_header("Content-Type", ctype)
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                conn.close()
            except Exception:
                self.send_response(502); self.send_header("Content-Length","0"); self.end_headers()
            return
        if api_service and (self.path.startswith("/api/") or self.path.startswith("/preview/")):
            if api_service.handle_api_request(self, "GET", self.path):
                return
        if project_api and self.path.split("?")[0] == "/wfs-project":
            return project_api.handle_project(self)
        if self.path == "/wfs-api/events":
            return self._proxy_stream_events()
        if self.path.startswith("/wfs-api/"):
            return self._proxy()
        if self._serve_static():
            return
        if self.path.split("?")[0] in ("/", "/index.html"):
            try:
                data = open("index.html","rb").read()
                data = self._inject_token(data)
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type","text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception:
                pass
        super().do_GET()

    def do_DELETE(self):
        # SIKLUS 161: DELETE /api/admin/* (knowledge base admin panel) → backend.
        if self.path.startswith("/api/admin/"):
            return self._proxy_bantuin()
        if api_service and self.path.startswith("/api/"):
            if api_service.handle_api_request(self, "DELETE", self.path):
                return
        self.send_response(404); self.end_headers()

if __name__ == "__main__":
    class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

    with ThreadingTCPServer(("0.0.0.0", 9503), H) as s:
        s.serve_forever()
