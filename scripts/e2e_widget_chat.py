#!/usr/bin/env python3
"""E2E widget AI CS dibantuin (siklus 160) — CDP :99, produksi :9503.

Diskriminasi 3 keadaan:
  A. /cs-widget/ pasca-fix  → kode benar ter-serve (API same-origin + endpoint
     /widget/chat) DAN chat end-to-end nyata: ketik "halo" → balasan AI (bukan
     "Gagal terhubung ke server.").
  B. Kontrol 1 — simulasi widget LAMA (API=localhost:8000) di halaman :9503
     → fetch GAGAL (membuktikan probe tidak lolos kosong / false-positive).
  C. Kontrol 2 — endpoint salah (/api/admin/chat, pola build lama) via proxy
     sama-origin → 404 (membuktikan diskriminasi path benar).
Exit 0 hanya bila A sukses dan B & C gagal seperti diharapkan.
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9457
BASE = "http://127.0.0.1:9503"


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
            if op != 0:
                break
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
    ok = False
    try:
        time.sleep(2)
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

        # ---------- A. widget produksi end-to-end ----------
        cmd("Page.enable")
        cmd("Page.navigate", url=BASE + "/cs-widget/")
        time.sleep(3)
        served_api = ev("document.body.innerHTML.includes(\"'/api/admin'\")")
        served_ep = ev("document.body.innerHTML.includes(\"'/widget/chat'\")")
        old_api = ev("document.body.innerHTML.includes('localhost:8000')")
        # klik bubble → form muncul → ketik → submit (alur user nyata)
        ev("document.getElementById('dbt-btn').click()")
        time.sleep(0.5)
        ev("const i=document.getElementById('dbt-in'); i.value='halo';"
           "document.getElementById('dbt-form').dispatchEvent(new Event('submit'))")
        # tunggu balasan AI (poll hingga 40 dtk — LLM proxy bisa lambat)
        reply = None
        for _ in range(40):
            time.sleep(1)
            reply = ev("(()=>{const m=document.querySelectorAll('.dbt-m');"
                       "return m.length? m[m.length-1].textContent : null})()")
            if reply and reply not in ("…", "halo") and not reply.startswith("Gagal"):
                break
        a_ok = bool(served_api and served_ep and not old_api and reply
                    and not reply.startswith("Gagal") and reply != "…")
        print(f"A widget-produksi: served_sameorigin={served_api} served_widgetchat={served_ep} "
              f"old_code={old_api} reply={reply!r} => {'OK' if a_ok else 'FAIL'}")

        # ---------- B. kontrol: image LAMA (pre-fix) vs baru — container throwaway ----------
        # Browser berjalan di VM-nya sendiri sehingga localhost:8000 terjangkau dari
        # dalam (itulah kenapa bug ini lolos saat dev); diskriminator yang benar adalah
        # KODE yang ter-serve: image lama memuat localhost:8000 + '/chat', image baru
        # same-origin + '/widget/chat'. Image lama dijalankan di port buangan.
        old_img = "saas-dibantuin-widget:pre-fix-1760000000"
        old_html = None
        docker_run = subprocess.run(
            ["docker", "run", "-d", "--rm", "--name", "wfs-widget-old-ctl", "-p",
             "127.0.0.1:3999:3001", old_img],
            capture_output=True, text=True)
        try:
            if docker_run.returncode == 0:
                for _ in range(10):
                    time.sleep(0.5)
                    try:
                        with urllib.request.urlopen("http://127.0.0.1:3999/", timeout=2) as r:
                            old_html = r.read().decode()
                            break
                    except Exception:
                        continue
        finally:
            subprocess.run(["docker", "rm", "-f", "wfs-widget-old-ctl"],
                           capture_output=True, text=True)
        old_has_local = bool(old_html) and "localhost:8000" in old_html
        old_has_chat_ep = bool(old_html) and "API + '/chat'" in old_html
        prod_html = urllib.request.urlopen(BASE + "/cs-widget/", timeout=5).read().decode()
        prod_same = "'/api/admin'" in prod_html and "localhost:8000" not in prod_html
        b_fail = old_has_local and old_has_chat_ep and prod_same
        print(f"B kontrol-build-lama: old localhost:8000={old_has_local} old '/chat'={old_has_chat_ep} "
              f"prod same-origin={prod_same} => {'OK' if b_fail else 'FAIL'}")

        # ---------- C. kontrol: endpoint salah (pola build lama) via proxy same-origin ----------
        # Backend menjawab 401 (auth) / 404 — entah bagaimana, BUKAN 200 + reply chat.
        c_res = ev("fetch('/api/admin/chat',{method:'POST',headers:{'Content-Type':'application/json'},"
                   "body:JSON.stringify({tenant_id:1,message:'x'})}).then(r=>r.status)")
        c_broken = c_res != 200
        print(f"C kontrol-endpoint-lama /api/admin/chat => {c_res} (harus bukan 200) => "
              f"{'OK' if c_broken else 'FAIL'}")

        ok = a_ok and b_fail and c_broken
        print(f"===> {'OK' if ok else 'FAIL'}")
        sys.exit(0 if ok else 1)
    finally:
        p.terminate()
        try:
            p.wait(3)
        except Exception:
            p.kill()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
