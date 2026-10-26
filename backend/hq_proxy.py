import http.server, socketserver, os, urllib.request, urllib.error, json, secrets
try:
    import project_api  # hanya ada di direktori deploy (~/wfs-hq)
except ImportError:  # pragma: no cover - dev/CI tanpa project_api
    project_api = None
import static_serve
GATEWAY = "http://127.0.0.1:8787/api/"
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".wfs_ui_token")

def get_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE) as f:  # tutup handle eksplisit
            return f.read().strip()
    t = secrets.token_hex(16)
    with open(TOKEN_FILE, "w") as f:
        os.chmod(TOKEN_FILE, 0o600)
        f.write(t)
    return t

UI_TOKEN = get_token()

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

    def _proxy(self):
        path = self.path[len("/wfs-api/"):]
        url = GATEWAY + path
        body = None
        if self.command == "POST":
            # Semua POST ke gateway wajib token UI (same-origin, diinject ke index.html)
            if self.headers.get("X-WFS-Token") != UI_TOKEN:
                msg = json.dumps({"error": "unauthorized"}).encode()
                self.send_response(401)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
                return
            ln = int(self.headers.get("Content-Length", 0))
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
            msg = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def _proxy_preview(self):
        """Forward /preview/{project}/... ke gateway API (8787) yang reverse-proxy ke container."""
        url = "http://127.0.0.1:8787" + self.path
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "text/html; charset=utf-8")
                self.send_response(r.status)
                self.send_header("Content-Type", ctype)
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
            msg = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def _proxy_stream(self):
        """Streaming passthrough untuk SSE /wfs-api/events (jangan buffering)."""
        import urllib.request
        try:
            r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8787/api/events"), timeout=10)
            self.send_response(r.status)
            self.send_header("Content-Type", r.headers.get("Content-Type") or "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            while True:
                chunk = r.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            try:
                msg = json.dumps({"error": "stream failed"}).encode()
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            except Exception:
                pass

    def do_GET(self):
        if project_api and self.path.split("?")[0] == "/wfs-project":
            return project_api.handle_project(self)
        if self.path.startswith("/wfs-api/"):
            if self.path == "/wfs-api/events":
                return self._proxy_stream()
            return self._proxy()
        if self.path.startswith("/preview/"):
            return self._proxy_preview()
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

    def do_POST(self):
        if self.path.startswith("/wfs-api/"):
            return self._proxy()
        self.send_response(404); self.end_headers()

_orig_send_head = http.server.SimpleHTTPRequestHandler.send_head
def _send_head_with_token(self):
    f, code, headers = None, None, None
    self._wfs_cc = static_serve.cache_control_for(self.path)
    path = self.translate_path(self.path)
    if os.path.basename(path) == "index.html" and os.path.isfile(path):
        try:
            data = open(path, "rb").read()
            data = self._inject_token(data)
            self._wfs_cc = "no-store"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return data
        except Exception:
            pass
    return _orig_send_head(self)

http.server.SimpleHTTPRequestHandler.send_head = _send_head_with_token

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", 9503), H) as s:
        s.serve_forever()
