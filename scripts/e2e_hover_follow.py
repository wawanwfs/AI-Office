#!/usr/bin/env python3
"""E2E regresi "hover ring membeku" (siklus 116).

Bug lama (sebelum siklus 116): cincin hover biru hanya diposisikan di
handler pointermove (throttle 80 ms). Saat agent yang di-hover BERJALAN,
cincin tidak mengikuti — BEKU di posisi terakhir dan terlihat "tertinggal"
di lantai. Anchor-nya juga dihitung inline (hardcode .55, tanpa cek
sittingChar.visible) sehingga bila agent offsite, cincin nyangkut di meja.

Perbaikan siklus 116: anchor via selAnchorOf (satu sumber kebenaran dengan
sel ring) + follow per-frame di blok animasi (lerp 0.45).

Langkah probe (input mouse NYATA via CDP, jalur UI asli):
  1. __setTime(720) → fase makan siang; agen berjalan ke kafe (jalur asli).
  2. Pilih agen yang SEDANG BERJALAN (walker.visible + walkTarget).
  3. Hover badan agen via Input.dispatchMouseEvent (proyeksi ulang tiap
     langkah agar tidak basi oleh gerak agen).
  4. Tunggu 2.2 s TANPA menggerakkan kursor → jarak ring→agen harus tetap
     kecil (follow per-frame). Bug lama: ring beku → jarak membesar.
Pemakaian: uv run scripts/e2e_hover_follow.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, math

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


# daftar agen yang sedang berjalan (indeks + posisi walker)
WALKERS_EXPR = """
JSON.stringify((window.__agentData||[]).map((a,i)=>(a.walker&&a.walker.visible&&a.walkTarget)?
 {i,x:a.walker.position.x,y:a.walker.position.y,z:a.walker.position.z}:null).filter(Boolean))
"""

# proyeksi titik dunia → layar via kamera debug (null bila di belakang kamera)
def proj_expr(x, y, z):
    return ("JSON.stringify((()=>{const c=window.__camCam;if(!c)return null;"
            "const v=new (c.position.constructor)(%f,%f,%f);v.project(c);"
            "if(v.z>=1||v.z<-1)return null;"
            "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};})())" % (x, y, z))


RING_EXPR = """
JSON.stringify(window.__sceneRing?{vis:window.__sceneRing.visible,
x:window.__sceneRing.position.x,y:window.__sceneRing.position.y,
z:window.__sceneRing.position.z}:null)
"""


def _x99_alive():
    """Cek X server :99 hidup (bukan cuma socket basi — pelajaran siklus 127/
    128: probe sebelumnya men-terminate Xvfb-nya sendiri di finally dan socket
    basi membuat auto-start run berikutnya skip → probe 'scene tidak siap')."""
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99_alive():
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
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("cam"):
            print("E2E_HOVERFOLLOW: FAIL (scene tidak siap)")
            sys.exit(1)

        # ── 1. fase makan siang → agen berjalan ke kafe (jalur UI asli) ──
        ev("window.__setTime && window.__setTime(720)")
        walkers = []
        for _ in range(20):
            time.sleep(0.5)
            walkers = json.loads(ev(WALKERS_EXPR) or "[]")
            if len(walkers) >= 2:
                break
        print("WALKERS:", len(walkers))
        if not walkers:
            print("E2E_HOVERFOLLOW: FAIL (tidak ada agen berjalan setelah trigger lunch)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 2. hover badan agen berjalan via mouse nyata ──
            w = walkers[attempt % len(walkers)]
            got = False
            for _ in range(4):
                pj = json.loads(ev(proj_expr(w["x"], (w["y"] or 0) + 0.7, w["z"])) or "null")
                if pj and 0 <= pj["x"] <= 1365 and 0 <= pj["y"] <= 767:
                    cmd("Input.dispatchMouseEvent", type="mouseMoved",
                        x=int(round(pj["x"])), y=int(round(pj["y"])), buttons=0)
                time.sleep(0.08)
                cur = json.loads(ev(
                    "JSON.stringify((window.__agentData[%d]||{}).walker&&window.__agentData[%d].walker.visible?"
                    "{x:window.__agentData[%d].walker.position.x,y:window.__agentData[%d].walker.position.y,"
                    "z:window.__agentData[%d].walker.position.z}:null)" % (w["i"], w["i"], w["i"], w["i"], w["i"])) or "null")
                if cur:
                    w = dict(w, **cur)
                    got = True
            if not got:
                continue
            time.sleep(0.6)  # throttle hover 80 ms + lerp follow (headless ~1.5 FPS)
            hov = json.loads(ev(RING_EXPR) or "null")
            print("HOVER[%d]:" % attempt, json.dumps(hov))
            if not hov or not hov.get("vis"):
                continue
            # Identifikasi agen yang BENAR-BENAR di-hover: argmin jarak ring→agen
            # berjalan (raycast tak bisa dipakai dari luar; SwiftShader ~1.5 FPS
            # membuat lerp settle tidak instan — 1.2 unit toleransi wajar).
            allw = json.loads(ev(WALKERS_EXPR) or "[]")
            best, bi = None, -1
            for j, aw in enumerate(allw):
                dd = math.dist([hov["x"], hov["z"]], [aw["x"], aw["z"]])
                if best is None or dd < best:
                    best, bi = dd, j
            if bi < 0 or best is None or best > 1.2:
                print("  (ring tidak menempel agen berjalan mana pun — d=%.3f, ulangi)" % (best if best is not None else -1))
                continue
            w = dict(walkers[bi])  # agen target = yang benar-benar di-hover
            d0 = best
            print("TARGET[%d]: idx=%d d0=%.3f" % (attempt, w["i"], d0))

            # ── 3. agen terus berjalan, kursor DIAKUI tidak digerakkan ──
            # Sampling tiap 0.4 s sampai agen berpindah > 1.0 unit (anti-vakuus:
            # gerak kecil tidak membedakan kode lama/bebek vs follow). Maks ~7 s.
            moved = 0.0
            a1 = hov1 = None
            for _ in range(18):
                time.sleep(0.4)
                a1 = json.loads(ev(
                    "JSON.stringify((window.__agentData[%d]||{}).walker?{x:window.__agentData[%d].walker.position.x,"
                    "y:window.__agentData[%d].walker.position.y,z:window.__agentData[%d].walker.position.z,"
                    "v:window.__agentData[%d].walker.visible}:null)" % (w["i"], w["i"], w["i"], w["i"], w["i"])) or "null")
                hov1 = json.loads(ev(RING_EXPR) or "null")
                if not a1 or not hov1 or not hov1.get("vis"):
                    break
                if not a1.get("v"):
                    break  # tiba & duduk → coba agen lain
                moved = math.dist([a1["x"], a1["y"], a1["z"]], [w["x"], w["y"], w["z"]])
                if moved > 1.0:
                    break
            print("A1[%d]:" % attempt, json.dumps(a1), "HOVER1:", json.dumps(hov1))
            if not a1 or not hov1 or not hov1.get("vis") or not a1.get("v"):
                print("  (agen tiba di tujuan & duduk / ring hilang — coba agen lain)")
                continue
            d1 = math.dist([hov1["x"], hov1["y"], hov1["z"]], [a1["x"], a1["y"] + 0.02, a1["z"]])
            print("MOVED[%d]: %.3f  DIST1: %.3f" % (attempt, moved, d1))
            # Perbaikan: ring mengikuti agen per frame → jarak tetap kecil.
            # Bug lama: ring beku di posisi lama → jarak ≈ sejauh agen pindah (≥1.0).
            if moved > 1.0 and d1 < 0.6:
                ok = True
                break

        print("E2E_HOVERFOLLOW:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
