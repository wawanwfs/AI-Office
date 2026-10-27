#!/usr/bin/env python3
"""E2E regresi interaksi kamera (siklus 115).

Membuktikan perbaikan bug "kamera runtuh" di jalur NYATA browser
(chrome-headless-shell + Xvfb :99, WebGL SwiftShader, CDP):

Bug lama: klik area kosong saat focusGoal aktif & homeRadius masih null
  (halaman segar → dblclick kosong membuat goal TANPA menyimpan homeRadius)
  membuat goal reset `r:homeRadius` = null → lerp focusStep membuat radius
  MELURUH ke ~0 → kamera runtuh ke titik target (view rusak) sampai reload.
Perbaikan siklus 115: resetFocusGoal() null-safe (fallback sph.radius).

Langkah probe:
  1. Muat halaman (homeRadius pasti null — belum ada interaksi fokus).
  2. dblclick pojok kanan-bawah (area kosong) → focusGoal aktif.
  3. Klik kiri pojok kiri-bawah (area kosong) → jalur reset dipicu.
  4. Tunggu ~3 s lerp → radius kamera HARUS tetap sehat (> 6).
     (Bug lama: radius meluruh eksponensial 0.94^n → ~0 dalam 3 s.)
Pemakaian: uv run scripts/e2e_camera_reset.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9451
URL = "http://127.0.0.1:9503/"


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
        def recv_exact(n):
            b = b""
            while len(b) < n:
                chunk = s.sock.recv(n - len(b))
                if not chunk: raise ConnectionResetError("socket closed")
                b = b + chunk
            return b

        def frame():
            hdr = recv_exact(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126:
                n = struct.unpack(">H", recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", recv_exact(8))[0]
            return op, recv_exact(n)
        op, d = frame()
        while op == 0:  # continuation frame
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return d.decode("utf-8", "replace")


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not os.path.exists("/tmp/.X11-unix/X99"):
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0

        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            val = (res.get("result") or {}).get("value")
            return val

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        st0 = json.loads(ev(
            "JSON.stringify({r: window.__cam ? window.__cam.sph.radius : -1,"
            " agents: window.__agentData ? window.__agentData.length : -1,"
            " ws: !!window.__wallState})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("r"):
            print("E2E_CAMRESET: FAIL (scene tidak siap)")
            sys.exit(1)

        # ── 1. dblclick LANGIT (pojok kanan-atas canvas, tanpa objek) → goal ──
        # (dock React menutupi bawah; langit atas = canvas murni, hits kosong)
        for cc in (1, 2):
            cmd("Input.dispatchMouseEvent", type="mousePressed", x=1250, y=100,
                button="left", buttons=cc, clickCount=cc)
            cmd("Input.dispatchMouseEvent", type="mouseReleased", x=1250, y=100,
                button="left", buttons=0, clickCount=cc)
        time.sleep(0.6)
        el_chk = ev(
            "JSON.stringify({p1:(document.elementFromPoint(1250,100)||{}).tagName,"
            " p2:(document.elementFromPoint(100,100)||{}).tagName})")
        print("ELEMENTS:", el_chk)
        dbg_dbl = json.loads(ev("JSON.stringify(window.__dbg ? window.__dbg() : {})") or "{}")
        r_dbl = ev("(window.__cam ? window.__cam.sph.radius : -1)")
        print("AFTER_DBLCLICK: r=", r_dbl, "dbg=", json.dumps(dbg_dbl))
        # ANTI-VAKUUS 1: titik input HARUS di canvas (bukan tertutup UI React)
        chk = json.loads(el_chk or "{}")
        if chk.get("p1") != "CANVAS" or chk.get("p2") != "CANVAS":
            print("E2E_CAMRESET: FAIL (titik klik tidak mengenai canvas — koordinat perlu ditinjau)")
            sys.exit(1)
        # ANTI-VAKUUS 2: goal HARUS aktif (bug lama hanya terjadi bila focusGoal
        # ada saat klik kosong). Bila tidak terbentuk, probe tidak sah.
        if not dbg_dbl.get("focus"):
            print("E2E_CAMRESET: FAIL (goal tidak terbentuk setelah dblclick — probe vakuus, koordinat perlu ditinjau)")
            sys.exit(1)

        # ── 2. klik kiri langit (pojok kiri-atas) → jalur reset bug ──
        cmd("Input.dispatchMouseEvent", type="mousePressed", x=100, y=100,
            button="left", buttons=1, clickCount=1)
        cmd("Input.dispatchMouseEvent", type="mouseReleased", x=100, y=100,
            button="left", buttons=0, clickCount=1)

        # ── 3. tunggu lerp ──
        time.sleep(5)
        r_end = ev("(window.__cam ? window.__cam.sph.radius : -1)")
        dbg = json.loads(ev("JSON.stringify(window.__dbg ? window.__dbg() : {})") or "{}")
        print("R_END:", r_end, "DBG:", dbg)

        # Bug lama: radius meluruh 0.94^n/frame → ~2 dalam 5 s (kamera runtuh).
        # Perbaikan: reset ke fallback radius (~42) → tetap sehat.
        ok = (isinstance(r_end, (int, float)) and r_end == r_end and r_end > 20)
        print("E2E_CAMRESET:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
