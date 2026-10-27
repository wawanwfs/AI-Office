#!/usr/bin/env python3
"""E2E regresi "cincin hover menyangkut saat kursor meninggalkan kanvas" (siklus 117).

Bug lama (sebelum siklus 117): TIDAK ADA handler pointerleave di kanvas —
cincin hover biru & kursor `pointer` tetap tampil setelah kursor pindah ke
dock/header React atau keluar jendela; blok follow per-frame terus menggerakkan
ring utk agen yang sudah tidak di-hover, dan timeout throttle 80 ms yang masih
pending bisa menyalakan kembali ring dari NDC basi (posisi kursor terakhir di
tepi kanvas) TEPAT SETELAH leave.

Perbaikan siklus 117: handler pointerleave membatalkan timer throttle pending
(hoverTmr) + membersihkan ring/cursor/hoveredAgent. Formula posisi ring
diekstrak ke hoverRingPos() (duplikat handler vs follow 2× → 1).

Langkah probe (input mouse NYATA via CDP, jalur UI asli):
  1. __setTime(720) → fase makan siang; agen berjalan (target hover bergerak).
  2. Hover badan agen berjalan → ring HARUS tampil (pre-condition).
  3. Gerakkan kursor ke elemen DOCK React (elementFromPoint dicek ≠ canvas)
     → browser memicu pointerleave asli di kanvas.
  4. Ring harus HILANG. Lalu tunggu > 0.5 s (mencakup lewatnya timeout throttle
     80 ms lama) dan cek ulang: ring tetap hilang — timeout yang dulu bisa
     "membangunkan" ring dari NDC basi kini tak ada (dibatalkan/di-guard).
Pemakaian: uv run scripts/e2e_hover_leave.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, math

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9462
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
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c:
                    raise ConnectionResetError()
                b = b + c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


WALKERS_EXPR = """
JSON.stringify((window.__agentData||[]).map((a,i)=>(a.walker&&a.walker.visible&&a.walkTarget)?
 {i,x:a.walker.position.x,y:a.walker.position.y,z:a.walker.position.z}:null).filter(Boolean))
"""

RING_EXPR = """
JSON.stringify(window.__sceneRing?{vis:window.__sceneRing.visible,
x:window.__sceneRing.position.x,y:window.__sceneRing.position.y,
z:window.__sceneRing.position.z}:null)
"""


def proj_expr(x, y, z):
    return ("JSON.stringify((()=>{const c=window.__camCam;if(!c)return null;"
            "const v=new (c.position.constructor)(%f,%f,%f);v.project(c);"
            "if(v.z>=1||v.z<-1)return null;"
            "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};})())" % (x, y, z))


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
            return ((res.get("result") or {}).get("value"))

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init

        st0 = json.loads(ev(
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("cam"):
            print("E2E_HOVERLEAVE: FAIL (scene tidak siap)")
            sys.exit(1)

        # ── 1. agen berjalan (target hover yang bergerak — dulu bikin ring "tertinggal") ──
        ev("window.__setTime && window.__setTime(720)")
        walkers = []
        for _ in range(20):
            time.sleep(0.5)
            walkers = json.loads(ev(WALKERS_EXPR) or "[]")
            if len(walkers) >= 2:
                break
        if not walkers:
            print("E2E_HOVERLEAVE: FAIL (tidak ada agen berjalan)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 2. hover badan agen berjalan (pre-condition: ring tampil) ──
            w = walkers[attempt % len(walkers)]
            ring_on = False
            for _ in range(5):
                pj = json.loads(ev(proj_expr(w["x"], (w["y"] or 0) + 0.7, w["z"])) or "null")
                if pj and 0 <= pj["x"] <= 1365 and 0 <= pj["y"] <= 767:
                    cmd("Input.dispatchMouseEvent", type="mouseMoved",
                        x=int(round(pj["x"])), y=int(round(pj["y"])), buttons=0)
                time.sleep(0.1)
                cur = json.loads(ev(
                    "JSON.stringify((window.__agentData[%d]||{}).walker&&window.__agentData[%d].walker.visible?"
                    "{x:window.__agentData[%d].walker.position.x,y:window.__agentData[%d].walker.position.y,"
                    "z:window.__agentData[%d].walker.position.z}:null)" % (w["i"], w["i"], w["i"], w["i"], w["i"])) or "null")
                if cur:
                    w = dict(w, **cur)
            time.sleep(0.7)  # throttle 80 ms + render headless lambat
            hov = json.loads(ev(RING_EXPR) or "null")
            print("HOVER[%d]:" % attempt, json.dumps(hov))
            ring_on = bool(hov and hov.get("vis"))
            if not ring_on:
                continue

            # ── 3. kursor pindah ke DOCK React (elementFromPoint ≠ canvas → pointerleave asli) ──
            # Cari titik dock yang benar2 menutupi kanvas: pindai kolom bawah layar.
            spot = json.loads(ev("""
JSON.stringify((()=>{const els=[...document.querySelectorAll('.dock *')];
for(const el of els){const r=el.getBoundingClientRect();
if(r.width>20&&r.height>14&&r.bottom<=innerHeight&&r.top>=0&&r.left>=0){
const x=r.left+r.width/2,y=r.top+r.height/2;
const hit=document.elementFromPoint(x,y);
if(hit&&el.contains(hit)){return {x:Math.round(x),y:Math.round(y)};}}}
return null;})())""") or "null")
            if not spot:
                print("  (dock tidak ditemukan — layout berubah?)")
                continue
            over = ev("JSON.stringify((el=>!!el&&!(el.tagName==='CANVAS'))(document.elementFromPoint(%d,%d)))" % (spot["x"], spot["y"]))
            if not over:
                print("  (titik dock ternyata kanvas — skip attempt)")
                continue
            cmd("Input.dispatchMouseEvent", type="mouseMoved", x=spot["x"], y=spot["y"], buttons=0)
            time.sleep(0.4)
            h1 = json.loads(ev(RING_EXPR) or "null")
            print("LEAVE[%d]:" % attempt, json.dumps(h1), "cursor:", ev("renderer?" in ["0"] and "" or "document.querySelector('canvas').style.cursor||''"))
            left_ok = not (h1 and h1.get("vis"))

            # ── 4. tunggu melewati umur timeout throttle (0.8 s) — ring TETAP hilang ──
            time.sleep(0.8)
            h2 = json.loads(ev(RING_EXPR) or "null")
            cursor2 = ev("document.querySelector('canvas').style.cursor||''")
            print("AFTER[%d]:" % attempt, json.dumps(h2), "cursor:", cursor2)
            still_ok = not (h2 and h2.get("vis")) and cursor2 != "pointer"
            if left_ok and still_ok:
                ok = True
                break

        print("E2E_HOVERLEAVE:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
