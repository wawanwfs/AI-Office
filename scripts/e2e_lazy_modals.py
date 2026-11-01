#!/usr/bin/env python3
"""E2E siklus 190: ShConsole & SettingsModal LAZY + mount-on-demand.

Konteks: lanjutan pola TaskBoard (189). Kedua modal kini lazy() di App dan
di-mount on-demand — komponen POLLED (show via prop App-state, BUKAN
CustomEvent) sehingga TIDAK butuh gerbang buffer: membuka = flag wanted naik
BERSAMA show (satu batch React) → lazy render sudah dalam keadaan terbuka.
Kontrak ShConsole "tidak pernah unmount": pasca open pertama tetap ter-render
(show=false → null); open kedua SINKRON (chunk sudah ada).

Bukti yang diverifikasi di browser nyata (CDP, Xvfb :99, transport salinan
e2e_taskboard_lazy.py — pelajaran 182/183: fixed-delay dari Python, bukan
polling-loop panjang di evaluate):
  1. Muat awal: resource ShConsole & SettingsModal TIDAK ada di resource-timing
     (lazy benar-benar ditunda — kontrak JARINGAN, bukan tag <script>).
  2. Klik tombol dock 'Konsol Software House' → chunk terunduh + drawer dialog
     aria-label 'Konsol Software House' terbuka.
  3. Klik dock lagi (tutup) → dialog hilang, chunk TETAP terunduh (tanpa
     unmount); klik ketiga → dialog kembali SINKRON (mount-on-demand).
  4. window.__openSettings() → chunk SettingsModal terunduh + teks
     'Pengaturan Kantor 3D' muncul; tombol 'Tutup pengaturan' menutupnya.
  5. Error console halus = 0 (tanpa chunk-load error / exception).
  6. Hooks inti utuh (26 agen) — scene tak terganggu.
Exit non-zero bila ada bukti yang gagal.
"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9487
URL = "http://127.0.0.1:9503/"

WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas


class WS:
    def __init__(s, u):
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.settimeout(10)  # berlaku SEJAK handshake — tanpa ini recv bisa menggantung selamanya
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:  # chrome mati di tengah handshake -> EOF, dulu loop selamanya
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c
    def send(s, m):
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126: h += bytes([0x80 | n])
        else: h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))
    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionResetError()
                b += c
            return b
        def frame():
            hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126: n = struct.unpack(">H", rx(2))[0]
            elif n == 127: n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)
        op, d = frame()
        while op == 0:
            op, d2 = frame(); d += d2
            if op != 0: break
        return d.decode("utf-8", "replace")
    def recv_text(s):
        return s.recv()

def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage",
                          # Profil sekali-pakai: SW + HTTP cache lama menyembunyikan efek lazy (pelajaran 189)
                          "--user-data-dir=/tmp/wfs-e2e-lazym-profile", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {"errors": [], "tests": {}}
    try:
        tabs = []
        for _ in range(20):
            time.sleep(1)
            try:
                tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
                pages = [t for t in tabs if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
                if pages:
                    tabs = pages
                    break
            except Exception:
                continue
        if not tabs:
            print("E2E_LAZY_MODALS: FAIL {\"error\": \"chrome-no-page-tab\"}", flush=True)
            sys.exit(1)
        print("PROG: chrome-ready", flush=True)
        time.sleep(2)
        ws = WS(tabs[0]["webSocketDebuggerUrl"])
        print("PROG: ws-open", flush=True)
        mid = [0]
        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(30):
                try:
                    r = json.loads(ws.recv_text())
                    if not isinstance(r, dict): continue  # siklus 197: event malformed diabaikan
                except (socket.timeout, ConnectionError, OSError):
                    continue
                if r.get("id") == mid[0]: return r
            raise TimeoutError(f"no CDP reply: {method}")
        def ev(expr, await_p=False):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                    awaitPromise=await_p)
            v = ((r.get("result") or {}).get("result") or {}).get("value")
            try: return json.loads(v) if isinstance(v, str) else v
            except Exception: return v
        cmd("Runtime.enable"); cmd("Page.enable")
        print("PROG: enabled", flush=True)
        time.sleep(18)
        print("PROG: settled", flush=True)  # scene init (SwiftShader lambat) + sampling pertama

        # TES1: lazy benar — KEDUA chunk BELUM diunduh di awal (resource-timing)
        t1 = ev("""JSON.stringify({
          sh: performance.getEntriesByType('resource').some(e => /ShConsole/.test(e.name)),
          sm: performance.getEntriesByType('resource').some(e => /SettingsModal/.test(e.name)),
          dlg: !!document.querySelector('[role="dialog"]')
        })""")
        res["tests"]["tes1_initial_lazy"] = t1
        print("PROG: tes1", flush=True)
        ok1 = (t1 or {}).get("sh") is False and (t1 or {}).get("sm") is False

        # TES2: klik tombol dock 'Konsol Software House' → chunk + drawer terbuka.
        # Fixed-delay dari Python (pelajaran 182/183: evaluate loop flaky).
        ev("""(() => { const b = [...document.querySelectorAll('button')]
          .find(x => (x.getAttribute('aria-label') || '') === 'Konsol Software House');
          if (!b) return 'no-btn'; b.click(); return 'clicked' })()""")
        t2 = {"ok": False}
        for i in range(8):
            time.sleep(2.5)
            t2 = ev("""JSON.stringify({
              sh: performance.getEntriesByType('resource').some(e => /ShConsole/.test(e.name)),
              dlg: !!(document.querySelector('[role="dialog"][aria-label="Konsol Software House"]'))
            })""") or {}
            if t2.get("sh") and t2.get("dlg"):
                t2["ok"] = True; t2["ms"] = (i + 1) * 2500
                break
        res["tests"]["tes2_open_console"] = t2
        print("PROG: tes2", flush=True)
        ok2 = bool(t2.get("ok"))

        # TES3: tombol 'Tutup konsol' (drawer) → dialog hilang, chunk TETAP;
        # klik dock lagi → dialog kembali SINKRON (mount-on-demand, tanpa unmount).
        # Catatan diag: tombol dock Konsol memang HANYA membuka (bukan toggle) —
        # satu-satunya penutup adalah tombol ✕ drawer (kontrak onClose).
        ev("""(() => { const b = document.querySelector('[aria-label="Tutup konsol"]');
          if (!b) return 'no-btn'; b.click(); return 'clicked' })()""")
        t3 = {"ok": False}
        for i in range(6):
            time.sleep(1.5)
            t3 = ev("""JSON.stringify({
              dlg: !!(document.querySelector('[role="dialog"][aria-label="Konsol Software House"]')),
              sh: performance.getEntriesByType('resource').some(e => /ShConsole/.test(e.name))
            })""") or {}
            if not t3.get("dlg") and t3.get("sh"):
                t3["ok"] = True; t3["ms"] = (i + 1) * 1500
                break
        if t3.get("ok"):
            ev("""(() => { const b = [...document.querySelectorAll('button')]
              .find(x => (x.getAttribute('aria-label') || '') === 'Konsol Software House');
              if (!b) return 'no-btn'; b.click(); return 'clicked' })()""")
            for i in range(3):
                time.sleep(1)
                t3b = ev("JSON.stringify({ dlg: !!(document.querySelector('[role=\"dialog\"][aria-label=\"Konsol Software House\"]')) })") or {}
                if t3b.get("dlg"):
                    t3["reopen_sync"] = True; t3["reopen_ms"] = (i + 1) * 1000
                    break
            else:
                t3["ok"] = False
        res["tests"]["tes3_close_reopen"] = t3
        print("PROG: tes3", flush=True)
        ok3 = bool(t3.get("ok")) and bool(t3.get("reopen_sync"))

        # TES4: window.__openSettings() → chunk SettingsModal + dialog terbuka;
        # tombol 'Tutup pengaturan' menutup.
        ev("window.__openSettings && window.__openSettings(); 1")
        t4 = {"ok": False}
        for i in range(8):
            time.sleep(2.5)
            t4 = ev("""JSON.stringify({
              sm: performance.getEntriesByType('resource').some(e => /SettingsModal/.test(e.name)),
              txt: !!document.querySelector('div') && [...document.querySelectorAll('h2,h3,div')]
                .some(x => x.textContent === 'Pengaturan Kantor 3D')
            })""") or {}
            if t4.get("sm") and t4.get("txt"):
                t4["ok"] = True; t4["ms"] = (i + 1) * 2500
                break
        if t4.get("ok"):
            ev("""(() => { const b = [...document.querySelectorAll('button')]
              .find(x => (x.getAttribute('aria-label') || '') === 'Tutup pengaturan');
              if (!b) return 'no-btn'; b.click(); return 'clicked' })()""")
            for i in range(3):
                time.sleep(1)
                t4b = ev("JSON.stringify({ txt: [...document.querySelectorAll('h2,h3,div')].some(x => x.textContent === 'Pengaturan Kantor 3D') })") or {}
                if not t4b.get("txt"):
                    t4["closed"] = True; t4["close_ms"] = (i + 1) * 1000
                    break
            else:
                t4["ok"] = False
        res["tests"]["tes4_open_settings"] = t4
        print("PROG: tes4", flush=True)
        ok4 = bool(t4.get("ok")) and bool(t4.get("closed"))

        # TES5: error console halus — tak boleh ada chunk-load error / exception
        drain_id = 10 ** 6
        ws.send(json.dumps({"id": drain_id, "method": "Runtime.evaluate",
                            "params": {"expression": "1", "returnByValue": True}}))
        for _ in range(2000):
            try:
                r = json.loads(ws.recv_text())
            except (socket.timeout, ConnectionError):
                break
            if not isinstance(r, dict):
                continue  # siklus 197: event malformed diabaikan
            m = r.get("method", "")
            if m == "Runtime.consoleAPICalled" and r["params"].get("type") == "error":
                for a in r["params"].get("args", []):
                    t = a.get("value") or a.get("description") or ""
                    res["errors"].append(str(t)[:200])
            elif m == "Runtime.exceptionThrown":
                e = r["params"].get("exceptionDetails", {})
                res["errors"].append(str(e.get("exception", {}).get("description", e.get("text", "")))[:200])
            elif m == "Log.entryAdded" and r["params"].get("entry", {}).get("level") == "error":
                src = r["params"]["entry"]
                if "net::ERR" not in src.get("text", ""):
                    res["errors"].append(str(src.get("text", ""))[:200])
            elif r.get("id") == drain_id:
                break

        # TES6: hooks inti tetap utuh pasca buka-tutup kedua modal
        t6 = ev("""JSON.stringify({
          agents: window.__agentData ? window.__agentData.length : -1,
          controls: !!window.__wfsSceneControls,
          wall: !!window.__wallFade })""")
        res["tests"]["tes6_hooks"] = t6
        print("PROG: tes6", flush=True)
        ok6 = bool((t6 or {}).get("agents", -1) == 26 and (t6 or {}).get("controls") and (t6 or {}).get("wall"))

        res["ok"] = bool(ok1 and ok2 and ok3 and ok4 and ok6 and not res["errors"])
        print("E2E_LAZY_MODALS:", "OK" if res["ok"] else "FAIL",
              json.dumps(res, ensure_ascii=False))
        sys.exit(0 if res["ok"] else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()

if __name__ == "__main__":
    main()