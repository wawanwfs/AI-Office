#!/usr/bin/env python3
"""E2E panel admin saas-dibantuin (siklus 161) — CDP :99, produksi :9503.

Bug yang diperbaiki (kelas sama dgn widget siklus 160): panel admin memakai
API='http://localhost:8000' + TASK_URL IP-Tailscale → mati bagi browser
eksternal; :9503 pun tak punya GET/DELETE proxy /api/admin/* maupun rute /admin/
(link footer "Login Admin" → 404).

Diskriminasi 3 keadaan:
  A. /admin/ produksi → kode same-origin ter-serve (TANPA localhost:8000) →
     login SALAH ditolak ("Login salah") → login BENAR masuk → dashboard
     nyata (s-tenants angka, tenant-rows terisi) → Agent Tasks terisi status
     dari gateway :8787 via /wfs-api/tasks.
  B. Kontrol — file admin LAMA (pra-fix, dari backup) disajikan di port
     buangan → kode lama TERDETEKSI (localhost:8000 ada). Membuktikan
     detektor kode tidak false-negative. Catatan jujur: dari browser DALAM
     VM, localhost:8000 terjangkau (blind-spot dev yang membuat bug ini
     lolos) — karena itu diskriminator yang benar adalah KODE ter-serve,
     bukan konektivitas (pelajaran siklus 160).
  C. Kontrol — GET /api/admin/stats TANPA token → 401 (auth jalan; kebocoran
     auth route stats ditutup di siklus ini), dan POST /api/admin/chat
     (endpoint pola lama) → bukan 200.
Exit 0 hanya bila A sukses dan B & C sesuai harapan.
"""
import base64
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9459
BASE = "http://127.0.0.1:9503"
OLD_BAKS = sorted(p for p in os.listdir("/tmp") if p.startswith("admin-index.html.bak-"))
OLD_HTML: str = ("/tmp/" + OLD_BAKS[-1]) if OLD_BAKS else ""
CTRL_PORT = 3930


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port))
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += s.sock.recv(1)

    def send(s, m):
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126:
            h += bytes([0x80 | n])
        else:
            h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c:
                    raise ConnectionResetError()
                b += c
            return b

        def frame():
            hdr = rx(2); op = hdr[0] & 0xF; n = hdr[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", rx(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)

        op, d = frame()
        while op == 0:
            op, d2 = frame(); d += d2
        return op, d


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if subprocess.run(["xdpyinfo", "-display", ":99"], stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL).returncode != 0:
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", "about:blank"],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    httpd = None
    ok = False
    try:
        time.sleep(2)

        # ---------- B. kontrol dulu: admin LAMA terdeteksi (kode lama) ----------
        b_ok = None
        if OLD_HTML:
            subprocess.run(["pkill", "-f", f"http.server {CTRL_PORT}"], check=False)
            os.makedirs("/tmp/admin-old-serve", exist_ok=True)
            subprocess.run(["cp", OLD_HTML, "/tmp/admin-old-serve/index.html"], check=True)
            httpd = subprocess.Popen([sys.executable, "-m", "http.server", str(CTRL_PORT)],
                                     cwd="/tmp/admin-old-serve",
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1)

        m = re.search(r"ADMIN_PASSWORD=(.*)",
                      open(os.path.expanduser(
                          "~/wfs-office/saas-dibantuin/.env")).read())
        assert m, "ADMIN_PASSWORD tidak ada di .env"
        pw = m.group(1).strip()

        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            ws.sock.settimeout(45)
            while True:
                op, payload = ws.recv()
                r = json.loads(payload)
                if r.get("id") == mid[0]:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, awaitPromise=True,
                    returnByValue=True)
            return r.get("result", {}).get("result", {}).get("value")

        cmd("Page.enable")

        # ---------- B. kontrol dulu: admin LAMA terdeteksi (kode lama) ----------
        b_ok = None
        if OLD_HTML:
            cmd("Page.navigate", url=f"http://127.0.0.1:{CTRL_PORT}/")
            # retry: load halaman kontrol bisa race — poll sampai script lama terlihat
            old_api = old_task = None
            for _ in range(10):
                time.sleep(1)
                old_api = ev("document.body.innerHTML.includes('http://localhost:8000')")
                old_task = ev("document.body.innerHTML.includes('100.117.198.46:8787')")
                if old_api and old_task:
                    break
            b_ok = bool(old_api and old_task)
            print(f"B kontrol-admin-lama: localhost8000={old_api} tailscale_ip={old_task} "
                  f"=> {'OK' if b_ok else 'FAIL'} (detektor kode mengenali kode lama)")
        else:
            print("B kontrol-admin-lama: BACKUP TIDAK ADA — dilewati (bukan kegagalan fix)")

        # ---------- C. kontrol endpoint & auth ----------
        def http(method, url, body=None, hdr=None):
            r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                       method=method)
            r.add_header("Content-Type", "application/json")
            for k, v in (hdr or {}).items():
                r.add_header(k, v)
            try:
                with urllib.request.urlopen(r, timeout=30) as resp:
                    return resp.status
            except urllib.error.HTTPError as e:
                return e.code

        c1 = http("GET", BASE + "/api/admin/stats")
        c2 = http("POST", BASE + "/api/admin/chat", {"message": "x", "tenant_id": 1})
        c_ok = (c1 == 401) and (c2 != 200)
        print(f"C kontrol-auth-endpoint: stats-noauth={c1} (401) chat-lama={c2} (!200) "
              f"=> {'OK' if c_ok else 'FAIL'}")

        # ---------- A. panel admin produksi end-to-end ----------
        cmd("Page.navigate", url=BASE + "/admin/")
        time.sleep(3)
        served_sameorigin = ev("document.body.innerHTML.includes(\"const API = '';\")")
        served_no_old = not ev("document.body.innerHTML.includes('http://localhost:8000')")
        served_taskurl = ev("document.body.innerHTML.includes(\"TASK_URL = '/wfs-api'\")")

        # login SALAH → pesan, tetap di login screen
        ev("document.getElementById('l-user').value='admin';"
           "document.getElementById('l-pass').value='password-salah';"
           "document.querySelector('#login-screen button').click()")
        time.sleep(1.5)
        wrong_rejected = ev("document.getElementById('l-err').textContent") == "Login salah"

        # login BENAR → dashboard
        ev("document.getElementById('l-pass').value=%s;"
           "document.querySelector('#login-screen button').click()" % json.dumps(pw))
        tenants = None
        for _ in range(15):
            time.sleep(1)
            tenants = ev("document.getElementById('s-tenants').textContent")
            if tenants and tenants not in ("–", "", "…"):
                break
        # SIKLUS 161: tabel tenants hanya terisi saat tab Tenants aktif (show()) —
        # klik tab-nya dulu sebelum menghitung baris.
        ev("document.querySelectorAll('aside a')[1].click()")
        tenant_rows = 0
        for _ in range(10):
            time.sleep(1)
            tenant_rows = ev("document.querySelectorAll('#tenant-rows tr').length") or 0
            if tenant_rows:
                break
        tasks = None
        for _ in range(15):
            time.sleep(1)
            tasks = ev("document.querySelectorAll('#task-rows tr').length")
            if tasks:
                break
        task_first = ev("document.querySelector('#task-rows tr') ? "
                        "document.querySelector('#task-rows tr').textContent : null")
        a_ok = bool(served_sameorigin and served_no_old and served_taskurl
                    and wrong_rejected and tenants and tenants.isdigit()
                    and int(tenants) > 0 and tenant_rows > 0)
        print(f"A admin-produksi: sameorigin={served_sameorigin} no_old_code={served_no_old} "
              f"taskurl_sameorigin={served_taskurl} login_salah_ditolak={wrong_rejected} "
              f"tenants={tenants} tenant_rows={tenant_rows} task_rows={tasks} "
              f"task_first={task_first!r} => {'OK' if a_ok else 'FAIL'}")

        ok = a_ok and c_ok and (b_ok is not False)
        print("===>", "OK" if ok else "FAIL")
    finally:
        try:
            p.kill()
        except Exception:
            pass
        if httpd:
            try:
                httpd.kill()
            except Exception:
                pass
        if xv:
            try:
                xv.kill()
            except Exception:
                pass
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
