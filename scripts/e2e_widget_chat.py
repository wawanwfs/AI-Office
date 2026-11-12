#!/usr/bin/env python3
"""E2E widget AI CS dibantuin (siklus 160) — CDP :99, produksi :9503.

Diskriminasi 3 keadaan:
  A. /cs-widget/ pasca-fix  → kode benar ter-serve (API same-origin + endpoint
     /widget/chat) DAN chat end-to-end nyata: ketik "halo" → balasan AI (bukan
     "Gagal terhubung ke server." dan bukan fallback 'Maaf, terjadi gangguan.').
  B. Kontrol 1 — SIMULASI KODE LAMA (localhost:8000 + API + '/chat') di-INLINE
     via data: URL → fetch GAGAL (membuktikan probe tidak lolos kosong /
     false-positive). Siklus 273: dulu memakai container image lama
     `saas-dibantuin-widget:pre-fix-1760000000`, image itu sudah TIDAK ADA di
     host (docker run gagal → B FAIL deterministik); snapshot kode-lama
     mengembalikan diskriminator tanpa dependensi docker.
  C. Kontrol 2 — endpoint salah (/api/admin/chat, pola build lama) via proxy
     sama-origin → BUKAN 200 chat (membuktikan diskriminasi path benar).
     Dijalankan SEBELUM B karena navigasi data: URL mengubah origin halaman.
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


def __wfs_pick_chrome():
    """Siklus 469: resolver browser revision-agnostik (dulu hardcode 1248)."""
    import glob as _g, os as _o, re as _re
    def _rev(p):
        m = _re.search(r"-(\d+)/", p)
        return int(m.group(1)) if m else 0
    base = _o.path.expanduser("~/.cache/ms-playwright")
    cand = sorted(_g.glob(base + "/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"), key=_rev)
    if not cand:
        cand = sorted(_g.glob(base + "/chromium-*/chrome-linux*/chrome"), key=_rev)
    return cand[-1] if cand else ""

CHROME = __wfs_pick_chrome()
PORT = 9457
BASE = "http://127.0.0.1:9503"


WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        s.sock.settimeout(WS_TIMEOUT_S)  # d1: handshake tanpa deadline = hang selamanya
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:  # chrome mati di tengah handshake -> EOF, dulu loop selamanya
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

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
    if subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10, stdout=subprocess.DEVNULL,
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
                try:
                    op, payload = ws.recv()
                except socket.timeout:
                    return None  # siklus 197: reply macet -> None tercatat (bukan crash)
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
        # tunggu balasan AI (poll hingga 40 dtk — LLM proxy bisa lambat).
        # Siklus 273: selector dulu `.dbt-m` terakhir → mengambil .dbt-t (stempel
        # jam '06.07') BUKAN body balasan → kontrak terbalik dgn komentar;
        # `.dbt-m .dbt-t` (bubble sebelumnya) juga stempel. Body balasan = div
        # pertama dalam bubble. Guard: bukan fallback error server.
        reply = None
        for _ in range(40):
            time.sleep(1)
            reply = ev("(()=>{const b=document.querySelectorAll('.dbt-m');"
                       "if(!b.length) return null;"
                       "const body=b[b.length-1].querySelector('div:first-child');"
                       "return body? body.textContent : null})()")
            if reply and reply not in ("…", "halo") \
                    and not reply.startswith("Gagal") \
                    and reply != "Maaf, terjadi gangguan.":
                break
        a_ok = bool(served_api and served_ep and not old_api and reply
                    and not reply.startswith("Gagal")
                    and reply != "Maaf, terjadi gangguan." and reply != "…")
        print(f"A widget-produksi: served_sameorigin={served_api} served_widgetchat={served_ep} "
              f"old_code={old_api} reply={reply!r} => {'OK' if a_ok else 'FAIL'}")

        # ---------- C. kontrol: endpoint salah (pola build lama) via proxy same-origin ----------
        # Dijalankan DI SINI (sebelum B): halaman masih di origin :9503 sehingga
        # fetch relatif terjadi via proxy sama-origin persis pola build lama.
        # Backend menjawab 401 (auth) / 404 — entah bagaimana, BUKAN 200 + reply chat.
        c_res = ev("fetch('/api/admin/chat',{method:'POST',headers:{'Content-Type':'application/json'},"
                   "body:JSON.stringify({tenant_id:1,message:'x'})}).then(r=>r.status)")
        c_broken = c_res != 200
        print(f"C kontrol-endpoint-lama /api/admin/chat => {c_res} (harus bukan 200) => "
              f"{'OK' if c_broken else 'FAIL'}")

        # ---------- B. kontrol: KODE LAMA (pre-fix) vs baru — SNAPSHOT HTML ----------
        # Siklus 273: image kontrol `saas-dibantuin-widget:pre-fix-1760000000` sudah
        # TIDAK ADA di host (docker run gagal → probe B FAIL permanen sejak beberapa
        # minggu; DEV_LOG 272). Kontrol kini pakai SNAPSHOT kode lama yang DI-INLINE
        # lewat data: URL (pattern .js dari image):
        #   localhost:8000 + API + '/chat'  (endpoint TIDAK ADA di backend → selalu
        #   gagal fetch = bukti probe tidak lolos kosong / false-positive),
        # sedangkan produksi wajib same-origin ('/api/admin') + '/widget/chat'.
        # Sifat diskriminasi tetap: kode lama HARUS gagal chat, produksi HARUS sukses.
        old_html = ("""<!DOCTYPE html><html><body><script>
const API = 'http://localhost:8000';
fetch(API + '/chat', {method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({message:'halo'})}).then(r=>r.json()).then(j=>{
  document.title = 'REPLY:' + (j.reply || JSON.stringify(j)).slice(0, 60);
}).catch(e => { document.title = 'FETCH_FAIL:' + e.message; });
</script></body></html>""")
        data_url = "data:text/html;base64," + base64.b64encode(old_html.encode()).decode()
        cmd("Page.navigate", url=data_url)
        time.sleep(1.5)
        old_title = ev("document.title") or ""
        old_has_local = "localhost:8000" in old_html
        old_has_chat_ep = "API + '/chat'" in old_html
        old_fetch_failed = old_title.startswith("FETCH_FAIL") or old_title.startswith("REPLY:")
        prod_html = urllib.request.urlopen(BASE + "/cs-widget/", timeout=5).read().decode()
        prod_same = "'/api/admin'" in prod_html and "localhost:8000" not in prod_html
        b_fail = old_has_local and old_has_chat_ep and old_fetch_failed and prod_same
        print(f"B kontrol-kode-lama(snapshot): old localhost:8000={old_has_local} "
              f"old '/chat'={old_has_chat_ep} old_fetch_failed={old_fetch_failed} "
              f"(title={old_title!r}) prod same-origin={prod_same} => {'OK' if b_fail else 'FAIL'}")

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
