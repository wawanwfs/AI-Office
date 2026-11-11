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
# Siklus 212 — SUPERSET hq_proxy.py (pola 206, duplikat stale ke-5 dihapus):
#   - backend/hq_proxy.py (server UI 9503 mode-repo dipakai layout runtime +
#     backend/test_hq_proxy.py) dihapus; fitur uniknya diserap:
#       * _security_headers() (X-Content-Type-Options + Referrer-Policy) kini
#         di end_headers() SEMUA respons — repo lebih maju, produksi tertinggal.
#       * index.html fallback / landing 500 jelas (sebelumnya exception kosong
#         tanpa respons = koneksi menggantung).
#       * ThreadingTCServer di __main__ kini SATU class yang sama dgn produksi.
# Siklus 214 — ALLOWLIST statis (anti source-disclosure): _serve_static kini
#   default-TOLAK; hanya jalur dist/ eksak (PWA shell + aset ber-hash + font +
#   ikon) yang dilayani. Dulu web root menyajikan *.py (source disclosure),
#   *.db, backups/*.bak, bahkan .wfs_ui_token (token UI ASLI) ke publik.
# Siklus 228 — HYGIENE LOG: BrokenPipeError/ConnectionResetError (klien memutus
#   koneksi di tengah respons: tab ditutup, fetch di-abort via rid-bump saat
#   ganti tab/drawer, EventSource reconnect) ADALAH peristiwa normal — bukti
#   jurnald 24 jam: 118 traceback BrokenPipe (59 _proxy, 31 do_GET, 2
#   handle_project) + rantai sekunder "During handling ... _reply_json 502"
#   menulis lagi ke socket yang sama yang sudah mati. Noise ini mengubur error
#   sungguhan di journald (65 MB). Kini: tulisan respons lewat
#   _wfs_write_or_client_gone (ClientGone ditelan senyap di SEMUA titik tulis
#   proxy/HTML/JSON), _reply_json & handle_project tidak lagi menulis ke socket
#   mati, dan _hq_handle_error (handle_error server class) menjaring sisanya —
#   disconnect klien TIDAK lagi memuntahkan traceback; kegagalan lain tetap LOUD.
import http.server, socketserver, os, socket, urllib.request, urllib.error, json, secrets, re


class ClientGone(Exception):
    """Klien memutus koneksi saat respons sedang ditulis (siklus 228).

    Ditandai eksplisit agar handle_error bisa membedakan disconnect normal
    (senyap) dari kegagalan server sungguhan (traceback LOUD tetap).
    """


def _wfs_write_or_client_gone(handler, data):
    """Tulis body respons; klien yang pergi → ClientGone (jangan ditulis lagi).

    Dipakai SEMUA titik tulis body utama (proxy GET/POST bantuin+gateway, SSE,
    api_service/project_api delegasi, static/index/landing). Fallback error
    (502/500) kini juga lewat sini: menulis ke socket mati dulu memicu rantai
    sekunder "During handling of the above exception" di journald (bukti 228).
    """
    try:
        handler.wfile.write(data)
    except (BrokenPipeError, ConnectionResetError, TimeoutError):
        raise ClientGone() from None


def _hq_handle_error(request, client_address, exc_info=None):
    """socketserver.handle_error: benteng terakhir thread handler.

    Disconnect klien (ClientGone/BrokenPipe/ConnectionReset mid-response) =
    peristiwa normal → SATU baris INFO, tanpa traceback. Exception lain tetap
    dicetak penuh (kegagalan server tidak boleh hilang).

    exc_info opsional (uji unit: sys.exc_info() hanya hidup DI DALAM blok
    except — Python 3.11+ membersihkannya saat frame except selesai).
    """
    import sys, traceback
    info = exc_info or sys.exc_info()
    etype = info[0]
    if etype is ClientGone or etype in (BrokenPipeError, ConnectionResetError):
        print(f"wfs-hq: klien {client_address} memutus koneksi (disconnect normal, senyap)",
              flush=True)  # stdout ter-buffer penuh di systemd — flush agar segera terlihat
        return
    if etype is None or info[1] is None:
        return  # tanpa exception aktif: tidak ada yang bisa dicetak
    traceback.print_exception(etype, info[1], info[2])
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

# === Siklus 214: ALLOWLIST statis (anti source-disclosure) ==================
# Web root produksi juga berisi file NON-aset: source code (*.py), database
# (*.db), backup *.bak, .wfs_ui_token (token UI ASLI 32 byte), dan artefak
# screenshot verifikasi. Dulu SEMUA tersaji publik via SimpleHTTPRequestHandler
# (_serve_static) — source disclosure + bocor token UI (bukti live siklus 214:
# GET /.wfs_ui_token 200 size 32 = nilai asli; GET /server.py 200 19008 byte;
# GET /backups/server.py.bak-* 200). Kini default = TOLAK: hanya jalur eksak
# hasil build dist/ (PWA shell, aset ber-hash, font, ikon PWA) yang dilayani.
# Aturan: (1) direktori eksak — semua isi dilayani; (2) file eksak per-nama.
STATIC_ALLOW_DIRS = frozenset(("assets", "fonts"))
# SIKLUS 279: entri terakhir = skrip SW fake eksak utk e2e_sw_update (siklus
# 192) — file fisik di web root hanya ditulis probe sekali-pakai & dihapus di
# finally; tanpa fisik = 404 (tak bisa ditanam via HTTP). Dulu entri ini TIDAK
# ADA → probe 192 register fake 404 senyap → banner tak naik → poll+cmd tanpa
# deadline menggantung >5 menit (terbukti live 3× di siklus 279, exit 124).
# CATATAN kontrak guard: tanpa komentar DI DALAM frozenset — drift-gate vitest
# mengekstrak isi via regex non-greedy '))' pertama (komentar berisi tanda
# kurung/koma merusak parsing item).
STATIC_ALLOW_FILES = frozenset((
    "index.html", "landing.html", "manifest.webmanifest",
    "sw.js", "registerSW.js", "workbox-2178cfdb.js", "workbox-2fbc6a65.js",
    "favicon.svg", "wfs-logo.svg", "robots.txt", "sitemap.xml",
    "og-image.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
    "e2e-sw-fake.js",
))


def _static_allowed(rel):
    """True bila jalur relatif (vs cwd web root) ada di allowlist statis.

    rel tanpa './' awalan (os.path.relpath). Sub-direktori dari allow-dir
    sah (assets/xxx.js, fonts/a.woff2); traversal (..) ditolak pemanggil
    sebelum fungsi ini (rel diawali '..' → False via startswith pemanggil).
    """
    rel = (rel or "").lstrip("./")
    if not rel or "/" not in rel:
        return rel in STATIC_ALLOW_FILES
    top = rel.split("/", 1)[0]
    return top in STATIC_ALLOW_DIRS


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
    """Kirim JSON kecil dengan Content-Length eksak (pola semua jalur 4xx/502).

    SIKLUS 228: tulis via _wfs_write_or_client_gone — fallback 401/502/413 ke
    socket yang sudah mati (klien pergi sebelum balasan) tidak lagi memicu
    rantai "During handling of the above exception" di journald.
    """
    msg = json.dumps(obj).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(msg)))
    handler.end_headers()
    _wfs_write_or_client_gone(handler, msg)


def _reject_oversize(handler):
    """413 tanpa membaca body — body besar tidak pernah masuk RAM."""
    _reply_json(handler, 413, {"error": "payload terlalu besar"})


def _security_headers():
    """Header keamanan dasar untuk semua respons UI (siklus 212, dari hq_proxy).

    Anti MIME-sniffing + referrer leak. Dipancarkan di end_headers() sehingga
    MENGALIR ke semua jalur: static, index/landing/app injeksi token, proxy
    /wfs-api/*, SSE, /admin, /cs-widget, api_service, do_DELETE.
    """
    return (
        ("X-Content-Type-Options", "nosniff"),
        ("Referrer-Policy", "same-origin"),
        # Siklus 436: klikjacking — semua UI shell melarang framing pihak luar.
        ("X-Frame-Options", "DENY"),
        # Siklus 436: minimalkan permukaan API browser yang tak dipakai UI
        # (kamera/mic/geolocation) di koneksi lintas origin.
        ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
    )


def _reply_404(handler, head=False):
    """SIKLUS 439: 404 dengan body JSON + Content-Type eksplisit.

    Dulu send_response(404) telanjang di 5 titik (do_GET/do_POST/do_DELETE/
    favicon fallback/HEAD) → stdlib default Content-Type text/html + body
    kosong. Uptime monitor & crawler menerima HTML palsu; audit konsistensi
    API menuntut JSON. Satu titik: status 404, body {"error":"not found"},
    Content-Type application/json (header keamanan via end_headers()).
    head=True: header identik (incl. Content-Length body) TANPA menulis body
    — kontrak HEAD siklus 222.
    """
    msg = json.dumps({"error": "not found"}).encode()
    handler.send_response(404)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(msg)))
    handler.end_headers()
    if not head:
        _wfs_write_or_client_gone(handler, msg)


def _api_token_ok(handler):
    """SIKLUS 218: gerbang token UI untuk jalur legacy /api/* (api_service).

    Temuan audit 218: api_service TANPA otentikasi sendiri, frontend UI 100%
    lewat /wfs-api (src/lib/api.js — satu gerbang api()), dan probe nyata
    siklus ini membuktikan POST /api/tasks + DELETE /api/tasks (reset DB)
    diterima tanpa token dari jaringan publik (9503 bind 0.0.0.0, ufw ALLOW).
    Kerusakan: 20 task + 76 log + 3 proyek DB UI terhapus.

    Kebijakan: GET read-only tetap terbuka (smoke apply_wfs_api_service +
    dashboard stats); SEMUA mutasi (POST/PUT/PATCH/DELETE) wajib X-WFS-Token
    == UI_TOKEN — ditolak 401 tanpa membaca body (permukaan parse/ram jalur
    mutasi ikut tertutup bagi pemanggil tak berwenang).
    """
    return handler.command == "GET" or handler.headers.get("X-WFS-Token") == UI_TOKEN


class _HeadCaptureWriter:
    """SIKLUS 225: penelan body saat replay HEAD.

    handle_api_request/handle_project menulis body via handler.wfile.write()
    SETELAH end_headers; saat replay HEAD semua tulisan ini dibuang — status +
    header ditangkap terpisah oleh sink (intersep logis), bukan dari byte.
    """

    def write(self, b):
        return len(b)

    def flush(self):
        return None


class H(http.server.SimpleHTTPRequestHandler):
    # Siklus 435: server_version generik — "Server: SimpleHTTP/0.6 Python/3.x.y"
    # membocorkan versi Python produksi ke pemindai otomatis (fingerprinting).
    server_version = "wfs"
    sys_version = ""

    def end_headers(self):
        if not hasattr(self, "_wfs_cc"):
            self._wfs_cc = "no-store"
        self.send_header('Cache-Control', self._wfs_cc)
        # Siklus 212: header keamanan di SEMUA respons (diserap dari hq_proxy).
        for name, value in _security_headers():
            self.send_header(name, value)
        super().end_headers()

    def _allowed_rel(self):
        """Siklus 214: jalur statis tersaring allowlist, atau None (TOLAK).

        Satu gerbang untuk SEMUA jalur penyajian file statis: _serve_static,
        fallback super().do_GET() (SimpleHTTPRequestHandler.send_head — sumber
        disclosure sebenarnya: _serve_static menolak tapi super tetap menyaji),
        dan super().do_HEAD(). Traversal & non-allowlist → None.
        """
        path = self.translate_path(self.path)
        rel = os.path.relpath(path, os.getcwd())
        if rel.startswith(("..", ".")):
            return None
        return rel if _static_allowed(rel) else None

    def _serve_static(self):
        """Serve file statis dgn cache policy + gzip (backend/static_serve.py)."""
        # Siklus 214: ALLOWLIST statis — web root produksi juga berisi file NON-aset
        # (source code *.py, *.db, backups/, .wfs_ui_token, artefak screenshot) yang
        # dulu tersaji publik via _serve_static (source disclosure + bocor token UI).
        # Default = TOLAK; hanya jalur dist/ eksak yang dilayani.
        rel = self._allowed_rel()
        if rel is None:
            return False
        path = self.translate_path(self.path)
        if os.path.basename(path) in ("index.html",):
            return False  # index.html lewat jalur khusus (injeksi token)
        if os.path.isfile(path):
            try:
                data = open(path, "rb").read()
                # Siklus 448: ETag + 304 — hemat bandwidth revalidasi.
                etag = static_serve.etag_for(data)
                lm_ts = os.path.getmtime(path)
                last_mod = static_serve.http_date(lm_ts)
                inm = self.headers.get("If-None-Match", "")
                ims = self.headers.get("If-Modified-Since", "")
                # Siklus 451: revalidasi ganda — ETag menang bila ada
                # (RFC 7232), If-Modified-Since fallback klien lama.
                if (inm and static_serve.not_modified(inm, etag)) or (
                        not inm and static_serve.not_modified_since(
                            lm_ts, ims)):
                    self._wfs_cc = static_serve.cache_control_for(self.path)
                    self.send_response(304)
                    self.send_header("ETag", etag)
                    self.send_header("Last-Modified", last_mod)
                    self.end_headers()  # 304 TANPA body (kontrak HTTP/1.1)
                    return True
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
                self.send_header("ETag", etag)
                self.send_header("Last-Modified", last_mod)
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
            # Siklus 444: jangan send_header eksplisit — end_headers menambah
            # Cache-Control kedua (no-store) → header duplikat ambigu. Set
            # self._wfs_cc agar TEPAT SATU Cache-Control terkirim (no-cache).
            self._wfs_cc = "no-cache"
            self.end_headers()
            while True:
                chunk = r.read1(4096)
                if not chunk:
                    break
                # SIKLUS 228: klien EventSource pergi di tengah stream →
                # ClientGone (senyap via handle_error), bukan traceback.
                _wfs_write_or_client_gone(self, chunk)
                self.wfile.flush()
        except Exception:
            try:
                _reply_json(self, 502, {"error": "stream failed"})
            except Exception:
                pass

    def _proxy(self):
        path = self.path[len("/wfs-api/"):]
        # SIKLUS 235: header X-HTTP-Method-Override (dari src/lib/api.js) —
        # proxy ini hanya punya do_GET/do_POST/do_DELETE; PATCH klien dikirim
        # sbg POST + override ini → gateway :8787 tetap menerima PATCH eksak
        # (mis. persist pindah kolom kanban /api/tasks/{id}/status).
        override = (self.headers.get("X-HTTP-Method-Override") or "").strip().upper()
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
        req = urllib.request.Request(url, data=body, method=override or self.command)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                _wfs_write_or_client_gone(self, data)  # SIKLUS 228
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            _wfs_write_or_client_gone(self, data)  # SIKLUS 228
        except Exception as e:
            _reply_json(self, 502, {"error": str(e)})

    def _proxy_bantuin(self):
        """Proxy /api/admin/* → backend saas-dibantuin :8000.

        SIKLUS 161: GET & DELETE ikut diproxy (dulu hanya POST — admin panel
        memanggil GET /api/admin/stats, tenants, conversations, knowledge via
        same-origin :9503), dan header Authorization diteruskan (JWT login
        admin). Widget chat (siklus 160) tetap jalan via jalur ini.

        SIKLUS 222: header "Access-Control-Allow-Origin: *" DIHAPUS. Semua
        konsumen /api/admin/* adalah same-origin :9503 (panel admin diproxy
        /admin/), dan CORS backend :8000 sendiri sudah allow_origins ["*"]
        sehingga tidak ada klien lintas origin yang bergantung pada ACAO dari
        proxy ini. ACAO * pada respons auth/admin hanya memperluas permukaan
        baca lintas-origin bagi halaman arbitrer — tanpa manfaat apa pun.
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
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            _wfs_write_or_client_gone(self, data)  # SIKLUS 228
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
        # SIKLUS 218: mutasi jalur legacy /api/* wajib token UI (probe nyata
        # 218: POST /api/tasks + DELETE reset diterima tanpa token → DB UI
        # terhapus). /api/admin/* & /api/auth/login di atas tetap di luar
        # gerbang ini (punya otentikasi sendiri di backend :8000).
        if api_service and self.path.startswith("/api/"):
            if not _api_token_ok(self):
                return _reply_json(self, 401, {"error": "unauthorized"})
            if api_service.handle_api_request(self, "POST", self.path):
                return
        if self.path.startswith("/wfs-api/"):
            return self._proxy()
        return _reply_404(self)

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
                data, gz = static_serve.gzip_html(
                    data, self.headers.get("Accept-Encoding", ""))
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                # Siklus 212: 500 eksak — dulu exception kosong tanpa respons
                # (koneksi menggantung, pola hq_proxy sama-sama cacat).
                self.send_response(500); self.send_header("Content-Length", "0"); self.end_headers()
            return
        if path_only in ("/app", "/app/"):
            try:
                data = open("index.html", "rb").read()
                data = self._inject_token(data)
                data, gz = static_serve.gzip_html(
                    data, self.headers.get("Accept-Encoding", ""))
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
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
                data, gz = static_serve.gzip_html(
                    data, self.headers.get("Accept-Encoding", ""))
                self.send_response(r.status)
                self.send_header("Content-Type", r.getheader("Content-Type", "text/html"))
                self._wfs_cc = "no-store"  # Siklus 444: hindari Cache-Control ganda
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
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
                # Siklus 443: HTML widget ~14 KB dikirim uncompressed (Lighthouse
                # "No compression applied") — gzip on-the-fly seperti cabang
                # /admin (434/438). Content-Length wajib panjang payload balikan.
                data, gz = static_serve.gzip_html(
                    data, self.headers.get("Accept-Encoding", ""))
                self.send_response(r.status)
                ctype = r.getheader("Content-Type", "text/html")
                self.send_header("Content-Type", ctype)
                self._wfs_cc = "no-store"  # Siklus 444: hindari Cache-Control ganda
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
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
        # Siklus 437: /favicon.ico 404 — browser lama & beberapa crawler tetap
        # meminta .ico walau HTML mendeklarasikan favicon.svg. Fallback: alirkan
        # ke favicon.svg (200, image/svg+xml) supaya tidak ada error 404 di log.
        if path_only == "/favicon.ico":
            try:
                data = open("favicon.svg", "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self._wfs_cc = "public, max-age=86400"  # Siklus 444: hindari duplikat
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                return _reply_404(self)
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
                data, gz = static_serve.gzip_html(
                    data, self.headers.get("Accept-Encoding", ""))
                self._wfs_cc = "no-store"
                self.send_response(200)
                self.send_header("Content-Type","text/html; charset=utf-8")
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                    self.send_header("Vary", "Accept-Encoding")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            except Exception:
                pass
        # Siklus 214: fallback super().do_GET() HANYA untuk allowlist (sumber
        # disclosure sebenarnya: SimpleHTTPRequestHandler.send_head menyaji
        # SEMUA file web root — dulu /server.py, /.wfs_ui_token, /backups/*
        # lolos via jalur ini saat _serve_static menolak).
        if self._allowed_rel() is not None:
            super().do_GET()
        else:
            return _reply_404(self)

    # SIKLUS 222: HEAD /app/, /landing, / kini 200 — konsisten dgn GET.
    # Dulu 404 (semua halaman HTML hanya di do_GET) padahal HEAD /index.html
    # statis = 200 via allowlist; monitor uptime / health-check berbasis HEAD
    # menerima jawaban palsu "page down" untuk halaman yang sebenarnya hidup.
    # Kontrak: jawab status sama dgn GET, headers identik, TANPA body.
    def _serve_head_html(self, fname, inject=False):
        try:
            data = open(fname, "rb").read()
        except Exception:
            self.send_response(500)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if inject:
            data = self._inject_token(data)
        self._wfs_cc = "no-store"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()

    # SIKLUS 223: HEAD aset statis kini konsisten dgn GET — dulu via
    # super().do_HEAD() stdlib yang TIDAK tahu cache policy & kompresi:
    # Content-Length = ukuran mentah file (GET gzip = ukuran terkompres)
    # dan Cache-Control = no-store (GET /assets/* = immutable 1 tahun).
    # Monitor/cache-probe berbasis HEAD menerima metadata palsu.
    # Kontrak: status 200, headers IDENTIK dgn GET (CC policy, Content-Encoding
    # + Vary bila gzip), Content-Length = panjang payload GET, TANPA body.
    def _serve_head_static(self):
        rel = self._allowed_rel()
        if rel is None:
            return False
        path = self.translate_path(self.path)
        if os.path.basename(path) in ("index.html",):
            return False  # index.html lewat jalur khusus (injeksi token)
        if not os.path.isfile(path):
            return False
        try:
            data = open(path, "rb").read()
            etag = static_serve.etag_for(data)
            lm_ts = os.path.getmtime(path)
            last_mod = static_serve.http_date(lm_ts)
            # Siklus 450+451: HEAD juga revalidasi — If-None-Match cocok →
            # 304 TANPA body/CL; If-Modified-Since fallback (ETag menang bila
            # keduanya ada). Metadata identik GET (kontrak HEAD siklus 222).
            inm = self.headers.get("If-None-Match", "")
            ims = self.headers.get("If-Modified-Since", "")
            if (inm and static_serve.not_modified(inm, etag)) or (
                    not inm and static_serve.not_modified_since(lm_ts, ims)):
                self._wfs_cc = static_serve.cache_control_for(self.path)
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Last-Modified", last_mod)
                self.end_headers()
                return True
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
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", last_mod)
            self.end_headers()
            return True
        except Exception:
            return False

    # SIKLUS 224: HEAD jalur proxy /admin/ & /cs-widget/ kini konsisten dgn
    # GET — dulu do_HEAD tidak mengenal rute proxy sama sekali: HEAD /admin/
    # = 404 palsu (GET = 200 panel admin) dan HEAD /api/admin/* = 404 tanpa
    # Content-Type (GET = 401 JSON). Monitor uptime berbasis HEAD menerima
    # "page down" untuk layanan yang sebenarnya hidup.
    # Strategi: rewrite HEAD → GET pada koneksi loopback upstream, lalu
    # buang body — konsisten dengan GET apa pun perilaku upstream (upstream
    # boleh saja tidak mendukung HEAD; :8000 bahkan menjawab 405 untuk HEAD).
    def _head_proxy_helper(self, port, path, timeout=30):
        """HEAD proxy loopback: GET ke upstream, kirim status+headers, tanpa body."""
        import http.client
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
            conn.request("GET", path)
            r = conn.getresponse()
            data = r.read()  # dibaca lalu dibuang — koneksi rapi ditutup
            conn.close()
            self.send_response(r.status)
            self.send_header("Content-Type",
                             r.getheader("Content-Type", "text/html"))
            self._wfs_cc = "no-store"  # GET proxy: tanpa CC eksplisit → no-store
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
        except Exception:
            self.send_response(502)
            self.send_header("Content-Length", "0")
            self.end_headers()

    def _serve_head_admin(self):
        # Cerminkan cabang GET /admin(/) eksak (panel admin :3000, timeout=30).
        if self.path.split("?")[0] in ("/admin", "/admin/"):
            self._head_proxy_helper(3000, "/")
            return True
        return False

    def _serve_head_cs_widget(self):
        # Cerminkan cabang GET /cs-widget/* (widget :3001, timeout=30).
        if self.path.startswith("/cs-widget/"):
            sub = self.path[len("/cs-widget/"):] or ""
            self._head_proxy_helper(3001, "/" + sub)
            return True
        return False

    def _serve_head_admin_api(self):
        # Cerminkan do_GET/do_POST/do_DELETE /api/admin/* → _proxy_bantuin
        # (backend :8000, timeout=120, Content-Type JSON, Authorization
        # diteruskan). HEAD → GET rewrite karena upstream menjawab 405 untuk
        # HEAD; status 401/403/200 konsisten dengan GET tetap tersampaikan.
        if not self.path.startswith("/api/admin/"):
            return False
        import http.client
        try:
            fwd_headers = {"Content-Type": "application/json"}
            auth = self.headers.get("Authorization")
            if auth:
                fwd_headers["Authorization"] = auth
            conn = http.client.HTTPConnection("127.0.0.1", 8000, timeout=120)
            conn.request("GET", self.path, headers=fwd_headers)
            r = conn.getresponse()
            data = r.read()
            conn.close()
            self.send_response(r.status)
            self.send_header("Content-Type",
                             r.getheader("Content-Type", "application/json"))
            # GET _proxy_bantuin mengirim Cache-Control: no-store via default
            # end_headers — HEAD menegaskan eksplisit agar identik.
            self._wfs_cc = "no-store"
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
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
        return True

    # SIKLUS 225: HEAD /api/* + /preview/* (api_service), /wfs-api/* (gateway
    # :8787), /wfs-project (project_api) kini konsisten dgn GET — sisa jalur
    # proxy terakhir yang masih 404 stdlib palsu (temuan live: HEAD
    # /api/tasks & /wfs-api/tasks & /wfs-project = 404 tanpa CT, GET = 200
    # JSON). Teknik: REPLAY cabang GET asli dengan wfile penangkap — status +
    # header blok dipancarkan byte-identik dgn GET (CT + CL payload GET),
    # body dibuang, tanpa duplikasi logika. KECUALI endpoint SSE streaming
    # (/api/events, /wfs-api/events): kontrak lama tetap (404 stdlib) karena
    # GET-nya tak berujung — replay akan menggantung koneksi.
    class _head_body_sink:
        """SIKLUS 225: intersep status+header saat replay GET untuk HEAD.

        Selama replay: send_response/send_header/end_headers diganti stub
        logis (status + daftar header ditangkap), wfile diganti penelan body.
        Saat keluar (sukses): metode ASLI dipulihkan lalu dipakai re-emit —
        jalur kirim persis GET (termasuk Cache-Control + security headers
        dari override end_headers), TANPA body. Gagal replay: tidak ada yang
        di-emit (pemanggil membalas 500/502 sendiri).
        """

        def __init__(self, handler):
            self._h = handler
            self._saved = None
            self.status = None
            self.hdrs = []

        def __enter__(self):
            h = self._h
            self._saved = (h.wfile, h.send_response, h.send_header, h.end_headers)
            cap = self
            h.wfile = _HeadCaptureWriter()
            h.send_response = lambda code: setattr(cap, "status", code)
            h.send_header = lambda n, v: cap.hdrs.append((n, v))
            h.end_headers = lambda: None
            return self

        def __exit__(self, *exc):
            h = self._h
            if self._saved is None:
                return False
            h.wfile, h.send_response, h.send_header, h.end_headers = self._saved
            if exc[0] is None and self.status is not None:
                try:
                    h.send_response(self.status)
                    for n, v in self.hdrs:
                        h.send_header(n, v)
                    h.end_headers()
                except Exception:
                    pass
            return False

    def _serve_head_api_service(self):
        # Cerminkan cabang do_GET: api_service.handle_api_request(handler,
        # "GET", path) untuk /api/* dan /preview/* (project_api punya cabang
        # sendiri). /api/events (SSE streaming) dikecualikan — HEAD tetap
        # 404 stdlib (kontrak lama; GET-nya tak berujung).
        p = self.path.split("?")[0]
        if api_service is None or not (
                self.path.startswith("/api/") or self.path.startswith("/preview/")):
            return False
        if p == "/api/events":
            return False
        try:
            with self._head_body_sink(self):
                handled = api_service.handle_api_request(self, "GET", self.path)
        except Exception:
            try:
                self.send_response(500)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except Exception:
                pass
            return True
        return bool(handled)

    def _serve_head_gateway(self):
        # Cerminkan cabang do_GET /wfs-api/* → _proxy() (gateway :8787,
        # timeout 120, CT json). HEAD → GET rewrite loopback (gateway bebas
        # menolak HEAD), body dibuang — status + CT + CL identik GET.
        # /wfs-api/events (SSE streaming) dikecualikan — kontrak 404 tetap.
        if not self.path.startswith("/wfs-api/"):
            return False
        if self.path.split("?")[0] == "/wfs-api/events":
            return False
        sub = self.path[len("/wfs-api/"):]
        import http.client
        try:
            conn = http.client.HTTPConnection("127.0.0.1", 8787, timeout=120)
            conn.request("GET", "/api/" + sub)
            r = conn.getresponse()
            data = r.read()  # dibaca lalu dibuang — koneksi rapi ditutup
            conn.close()
            self.send_response(r.status)
            self.send_header("Content-Type",
                             r.getheader("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
        except Exception:
            try:
                self.send_response(502)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except Exception:
                pass
        return True

    def _serve_head_project(self):
        # Cerminkan cabang do_GET /wfs-project → project_api.handle_project
        # (snapshot JSON). Replay dgn sink: status 200/500 + CT json + CL
        # payload GET, tanpa body.
        if project_api is None or self.path.split("?")[0] != "/wfs-project":
            return False
        try:
            with self._head_body_sink(self):
                project_api.handle_project(self)
        except Exception:
            try:
                self.send_response(500)
                self.send_header("Content-Length", "0")
                self.end_headers()
            except Exception:
                pass
        return True

    def do_HEAD(self):
        path_only = self.path.split("?")[0]
        if path_only in ("/", "/index.html"):
            return self._serve_head_html("index.html", inject=True)
        if path_only in ("/app", "/app/"):
            return self._serve_head_html("index.html", inject=True)
        if path_only in ("/landing", "/landing/"):
            return self._serve_head_html("landing.html")
        # SIKLUS 224: jalur proxy di atas dulu jatuh ke 404 stdlib — HEAD
        # /admin/ dan /api/admin/* membaca "page down" palsu. Kini mirror
        # cabang GET yang eksak (status + Content-Type + CL payload GET).
        # SIKLUS 225: sisa jalur proxy (api_service /api/* + /preview/*,
        # gateway /wfs-api/*, project_api /wfs-project) ikut disemakanikan;
        # SSE (/api/events, /wfs-api/events) sengaja tetap 404 (streaming).
        if self._serve_head_admin_api():
            return
        # Siklus 441: mirror fallback favicon 437 — dulu HEAD /favicon.ico
        # 404 stdlib padahal GET 200 image/svg+xml; monitor uptime berbasis
        # HEAD membaca "asset hilang" palsu. Header identik GET, tanpa body.
        if path_only == "/favicon.ico":
            try:
                data = open("favicon.svg", "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self._wfs_cc = "public, max-age=86400"  # Siklus 444: hindari duplikat
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
            except Exception:
                return _reply_404(self, head=True)
            return
        if self._serve_head_api_service():
            return
        if self._serve_head_gateway():
            return
        if self._serve_head_project():
            return
        if self._serve_head_admin():
            return
        if self._serve_head_cs_widget():
            return
        # Siklus 214: HEAD statis juga kena allowlist (stdlib do_HEAD menyaji
        # metadata file apa pun — probing path tanpa body tetap kebocoran).
        # SIKLUS 223: aset allowlist kini lewat _serve_head_static (cache
        # policy + kompresi konsisten GET); fallback stdlib hanya sisa.
        if self._serve_head_static():
            return
        if self._allowed_rel() is not None:
            super().do_HEAD()
        else:
            return _reply_404(self, head=True)

    def do_DELETE(self):
        # SIKLUS 161: DELETE /api/admin/* (knowledge base admin panel) → backend.
        if self.path.startswith("/api/admin/"):
            return self._proxy_bantuin()
        if api_service and self.path.startswith("/api/"):
            if not _api_token_ok(self):
                return _reply_json(self, 401, {"error": "unauthorized"})
            if api_service.handle_api_request(self, "DELETE", self.path):
                return
        return _reply_404(self)

if __name__ == "__main__":
    # Siklus 212: satu server class untuk SEMUA mode (hq_proxy lama pakai
    # TCPServer single-thread — SSE /wfs-api/events membekukan seluruh UI
    # mode-repo; produksi sudah benar sejak 154). Test layout runtime kini
    # memakai class yang IDENTIK dgn produksi.
    class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True

        # Siklus 447: koneksi keep-alive klien yang pergi mendadak (RST saat
        # server bind ulang / timeout idle) tidak boleh crash init baru.
        def server_bind(self):
            try:
                self.socket.setsockopt(
                    socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            except OSError:
                pass
            super().server_bind()

    with ThreadingTCPServer(("0.0.0.0", 9503), H) as s:
        # SIKLUS 447: HTTP/1.1 + keep-alive (perbaikan lama HTTP/1.0+close per
        # request). send_response secara otomatis mengirim "HTTP/1.1" saat
        # protocol_version = "HTTP/1.1"; Content-Length sudah eksak di SEMUA
        # jalur (audit siklus 446) sehingga klien tahu akhir body — prasyarat
        # keep-alive HTTP/1.1 terpenuhi, tidak ada koneksi menggantung.
        # SSE tetap aman: stream tanpa Content-Length memakai close_connection
        # (chunked/TCP-close), dan header "Connection: keep-alive" eksplisit
        # milik SSE tidak lagi memicu exception duplikat di stdlib ≥3.11.
        H.protocol_version = "HTTP/1.1"
        # SIKLUS 228: jaring disconnect klien di level server (thread handler
        # mati tanpa traceback); kegagalan lain tetap LOUD (traceback penuh).
        s.handle_error = _hq_handle_error
        s.serve_forever()
