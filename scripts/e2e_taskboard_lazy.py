#!/usr/bin/env python3
"""E2E siklus 189: TaskBoard LAZY — bukti live chunk + gerbang buffer/replay.

Konteks: TaskBoard.jsx (komponen terbesar app) kini di-chunk terpisah yang
hanya dimuat saat panel dibuka (lazy()). Risiko lazy modal klasik = event buka
yang dikirim SEBELUM chunk siap HILANG (tak ada listener) → pengguna klik
"Papan" dan tak terjadi apa-apa. Gerbang taskboard_gate.js membuffer event
papan, lalu me-replay-nya saat TaskBoard ter-mount (onChunkReady → flush).

Bukti yang diverifikasi di browser nyata (CDP, Xvfb :99, transport salinan
e2e_err_probe.py):
  1. Muat awal: script TaskBoard chunk TIDAK ada di DOM (lazy benar-benar
     ditunda; index lama = sudah termuat sejak awal).
  2. window.__openTaskBoard({view:'kanban'}) → chunk <script> TaskBoard
     MUNCUL di DOM (lazy() memuat saat pertama dipakai) dan dialog
     'Papan task' terbuka (listener menerima event hasil replay).
  3. Toggle kedua (shortcut-bridge 'wfs-toggle-task-board' pasca-flush →
     passthrough) menutup panel — jalur 1:1 setelah gate lepas pasang.
  4. Probe error paritas e2e_err: 0 console error, 0 page error, tanpa
     'Scene init failed', hooks inti utuh.
Exit non-zero bila ada bukti yang gagal.
"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9475
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
                          # Profil sekali-pakai: service worker SW + HTTP cache dari run
                          # sebelumnya bisa menyembunyikan efek lazy (preload/entry lama)
                          "--user-data-dir=/tmp/wfs-e2e-tb-profile", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {"errors": [], "tests": {}}
    try:
        # chrome siap: poll /json/list (di bawah beban memori, start bisa > 5 dtk)
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
            print("E2E_TASKBOARD_LAZY: FAIL {\"error\": \"chrome-no-page-tab\"}", flush=True)
            sys.exit(1)
        print("PROG: chrome-ready", flush=True)
        time.sleep(2)  # target siap (paritas err_probe: jangan WS-connect ke target yang baru lahir)
        ws = WS(tabs[0]["webSocketDebuggerUrl"])
        print("PROG: ws-open", flush=True)
        mid = [0]
        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(30):  # 30×10 dtk = batas tunggu per perintah; melebihi = gagal keras
                try:
                    r = json.loads(ws.recv_text())
                except (socket.timeout, ConnectionError, OSError):
                    continue  # jaringan lambat / drain event scene: coba baca lagi
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

        # TES1: lazy benar — chunk TaskBoard BELUM diunduh di awal (bukti
        # resource timing, bukan tag <script>: bundler modern boleh memuat
        # dynamic import tanpa tag yang tampak; yang kontrak = JARINGAN)
        t1 = ev("""JSON.stringify({
          res: performance.getEntriesByType('resource').some(e => /TaskBoard/.test(e.name)),
          dialog: !!document.querySelector('[role="dialog"]')
        })""")
        res["tests"]["tes1_initial_lazy"] = t1
        print("PROG: tes1", flush=True)
        ok1 = (t1 or {}).get("res") is False

        # TES2: buka papan via API scene (__openTaskBoard → gerbang → replay) —
        # chunk lazy terunduh + dialog 'Papan task' terbuka.
        # Pelajaran 182/183: jangan polling-loop panjang di evaluate (frame WS
        # bisa desync saat socket.timeout) — fire-and-forget lalu baca
        # fixed-delay dari Python (pola terbukti andal).
        ev("window.__openTaskBoard({ view: 'kanban' }); 1")
        t2 = {"ok": False}
        for i in range(8):
            time.sleep(2.5)
            t2 = ev("""JSON.stringify({
              res: performance.getEntriesByType('resource').some(e => /TaskBoard/.test(e.name)),
              dlg: !!document.querySelector('[role="dialog"]'),
              label: (document.querySelector('[role="dialog"]')?.getAttribute('aria-label') || '').slice(0, 40)
            })""") or {}
            if t2.get("res") and t2.get("dlg"):
                t2["ok"] = True; t2["ms"] = (i + 1) * 2500
                break
        res["tests"]["tes2_open_lazy"] = t2
        print("PROG: tes2", flush=True)
        ok2 = bool(t2.get("ok"))

        # TES3: toggle pasca-flush (passthrough) menutup panel — aliran 1:1
        ev("window.dispatchEvent(new CustomEvent('wfs-toggle-task-board')); 1")
        t3 = {"ok": False}
        for i in range(6):
            time.sleep(1.5)
            t3 = ev("JSON.stringify({ dlg: !!document.querySelector('[role=\"dialog\"]') })") or {}
            if not t3.get("dlg"):
                t3["ok"] = True; t3["ms"] = (i + 1) * 1500
                break
        res["tests"]["tes3_toggle_close"] = t3
        print("PROG: tes3", flush=True)
        ok3 = bool(t3.get("ok"))

        # TES4: error console halus — tak boleh ada chunk-load error / exception
        drain_id = 10 ** 6
        ws.send(json.dumps({"id": drain_id, "method": "Runtime.evaluate",
                            "params": {"expression": "1", "returnByValue": True}}))
        for _ in range(2000):
            try:
                r = json.loads(ws.recv_text())
            except (socket.timeout, ConnectionError):
                break
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

        # TES5: hooks inti tetap utuh pasca buka-tutup papan (scene tak terganggu)
        t5 = ev("""JSON.stringify({
          agents: window.__agentData ? window.__agentData.length : -1,
          controls: !!window.__wfsSceneControls,
          wall: !!window.__wallFade })""")
        res["tests"]["tes5_hooks"] = t5
        print("PROG: tes5", flush=True)
        ok5 = bool((t5 or {}).get("agents", -1) == 26 and (t5 or {}).get("controls") and (t5 or {}).get("wall"))

        res["ok"] = bool(ok1 and ok2 and ok3 and ok5 and not res["errors"])
        print("E2E_TASKBOARD_LAZY:", "OK" if res["ok"] else "FAIL",
              json.dumps(res, ensure_ascii=False))
        sys.exit(0 if res["ok"] else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()

if __name__ == "__main__":
    main()
