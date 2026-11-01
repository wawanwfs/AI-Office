#!/usr/bin/env python3
"""E2E regresi "zoom membunuh goal kamera diam-diam" (siklus 121; v2 siklus 198).

Bug lama (sebelum siklus 121): handler `wheel` (dan tombol zoomIn/zoomOut)
melakukan `if(focusGoal&&!focusGoal.reset)focusGoal=null` — satu putaran
scroll selama kamera MENGIKUTI agen (goal follow hasil klik agen) MEMBATALKAN
follow diam-diam: kamera berhenti mengikuti agen yang berjalan, __saved
menjadi yatim, dan lerp goal statis/lantai terhenti di tengah jalan.
Saat goal reset berjalan, scroll dilawan lerp .06/frame (radius ditarik
balik ke goal.r tiap frame — terasa "sticky").

Perbaikan siklus 121 (zoom JUJUR, parts/zoom_spec.js):
  - goal follow/statis TIDAK dibatalkan; radius goal ikut digeser
    (zoomFocusGoal, clamp 12..130) → kamera tetap mengikuti & lerp
    bergerak bersama input.
  - radius aktual dihitung via zoomRadius (satu formula dgn clamp
    mirror eksak Math.max(12, Math.min(130, ...)) lama).

Langkah probe (input mouse/wheel NYATA via CDP, jalur UI asli):
  1. __setTime(720) → fase makan siang; agen berjalan ke kafe.
  2. KLIK badan agen berjalan (proyeksi ulang tiap langkah) → goal follow
     (window.__dbg().focus = {r, reset:false}).
  3. Scroll wheel ke ATAS (deltaY=-1000) di tengah canvas.
  4. Pembeda ganda (kode baru): focus MASIH ADA (follow dipertahankan)
     DAN goal.r berkurang (terdorong clamp 12) — radius aktual sph.radius
     ikut berkurang. Bug lama: focus = null (follow mati).

V2 (siklus 198 — perbaikan flakiness, pelajaran run 197):
  Defek v1 yang bikin flaky: wheel ditembakkan BLIND di (683,384) segera
  setelah goal follow aktif. Saat VM berat (SwiftShader ~1.5 FPS + lerp
  follow .06/frame + auto-rotate theta .0012/frame), kamera belum
  benar-benar "memegang" agen di tengah layar → raycast di tengah canvas
  meleset → jalur klik-kosong: focusGoal=resetFocusGoal (reset:true) →
  pembeda (a) focus2.reset=gagal & (b) goal.r TIDAK berkurang (goal reset
  r = homeRadius ≥24 > r_goal0) → FAIL palsu.
  Wheel itu sendiri tidak butuh hit (handler langsung zoomRadius dari
  deltaY) — syaratnya hanya goal follow benar-benar AKTIF saat wheel:
  - GATE LAYAR per attempt (screen_gate, murni + diuji unit): hitung arah
    angular kamera dari posisi EKSAK updCam — camera.position = tgt +
    r·sinφ·(sinθ,·,cosθ) → arah pandang XZ = atan2(dx,dz) dengan
    (dx,dz) = cam.position − tgt. Agen di dead-zone angular <25° DAN
    lebih dekat ke kamera daripada tgt (dist < 0.75·dist(tgt,kamera)) →
    konjungsi itu menjamin proyeksi agen jatuh dekat pusat layar
    (proyeksi perspektif) → raycast tengah canvas kena agen.
  - Gate dievaluasi SETELAH goal follow aktif; wheel HANYA ditembakkan
    bila gate True — tanpa gate, attempt diulang (bukan FAIL palsu).
  - Tanpa reset kamera paksa antar-attempt (auto-rotate theta lanjut
    alami — sisi orbit berubah sendiri tiap attempt); max attempt 6;
    daftar walker di-refresh saat attempt genap (walker bisa usai).
Pemakaian: uv run scripts/e2e_zoom_follow.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, math

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9452
URL = "http://127.0.0.1:9503/"


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
        def recv_exact(n):
            b = b""
            while len(b) < n:
                chunk = s.sock.recv(n - len(b))
                if not chunk: raise ConnectionResetError("socket closed")
                b += chunk
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


FOCUS_EXPR = "JSON.stringify(window.__dbg?window.__dbg().focus:null)"
RADIUS_EXPR = "JSON.stringify(window.__cam?window.__cam.sph.radius:null)"

# Posisi kamera+target eksak utk gate layar v2 (mirror data updCam):
# camera.position & window.__cam.tgt (tgt belum dilerp = posisi follow saat itu).
CAM_EXPR = ("JSON.stringify((()=>{const c=window.__camCam;if(!c||!window.__cam)return null;"
            "return {cx:c.position.x,cy:c.position.y,cz:c.position.z,"
            "tx:window.__cam.tgt.x,ty:window.__cam.tgt.y,tz:window.__cam.tgt.z};})())")


def _wrap_pi(a):
    """Bungkus sudut ke [-π, π]."""
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


def screen_gate(cam, agent):
    """Gate layar v2 (murni, diuji di zoom_follow_hardening.test.js):
    True BILA agen di dead-zone angular (<25° dari arah pandang kamera di
    bidang XZ) DAN lebih dekat ke kamera daripada titik target (dist <
    0.75·dist(tgt,kamera)) → proyeksi perspektifnya jatuh dekat pusat
    layar → raycast tengah canvas kena agen. False bila data tak lengkap
    (None/korup) — aman-fail: wheel tidak ditembakkan."""
    if not cam or agent is None:
        return False
    try:
        dx, dz = cam["cx"] - cam["tx"], cam["cz"] - cam["tz"]
        dc = math.hypot(dx, dz)
        if dc < 1e-6:
            return False
        ax, az = agent["x"] - cam["tx"], agent["z"] - cam["tz"]
        # sudut arah PANDANG kamera dari tgt: mirror eksak updCam (sinθ, cosθ)
        a = math.atan2(dx, dz)
        b = math.atan2(ax, az)
        angular_ok = abs(_wrap_pi(a - b)) < math.radians(25.0)
        dist_agent = math.hypot(cam["cx"] - agent["x"], cam["cz"] - agent["z"])
        radial_ok = dist_agent < 0.75 * dc
        return angular_ok and radial_ok
    except (KeyError, TypeError):
        return False


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
                try:
                    r = json.loads(ws.recv())
                except socket.timeout:
                    return None  # siklus 197: reply macet/hilang -> None tercatat (bukan hang)
                if r.get("id") == mid:
                    return r
            return None  # siklus 197: batas loop habis -> None tercatat
        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            val = (res.get("result") or {}).get("value")
            return val

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        st0 = json.loads(ev(
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState, dbg: !!window.__dbg})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("cam") or not st0.get("dbg"):
            print("E2E_ZOOMFOLLOW: FAIL (scene tidak siap)")
            sys.exit(1)

        # ── 1. fase makan siang → agen berjalan ke kafe (jalur UI asli) ──
        ev("window.__setTime && window.__setTime(720)")
        walkers = []
        for _ in range(20):
            time.sleep(0.5)
            walkers = json.loads(ev(WALKERS_EXPR) or "[]")
            if len(walkers) >= 1:
                break
        print("WALKERS:", len(walkers))
        if not walkers:
            print("E2E_ZOOMFOLLOW: FAIL (tidak ada agen berjalan setelah trigger lunch)")
            sys.exit(1)

        ok = False
        for attempt in range(6):
            if attempt and attempt % 2 == 0:
                walkers = json.loads(ev(WALKERS_EXPR) or "[]")  # walker bisa usai — refresh
                if not walkers:
                    break
            w = walkers[attempt % len(walkers)]
            # ── 2. klik badan agen berjalan via mouse nyata (refresh posisi) ──
            got = False
            for _ in range(8):
                pj = json.loads(ev(proj_expr(w["x"], (w["y"] or 0) + 0.7, w["z"])) or "null")
                if pj and 0 <= pj["x"] <= 1365 and 0 <= pj["y"] <= 767:
                    x, y = int(round(pj["x"])), int(round(pj["y"]))
                    cmd("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y, buttons=0)
                    cmd("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y,
                        button="left", buttons=1, clickCount=1)
                    cmd("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y,
                        button="left", buttons=0, clickCount=1)
                    got = True
                time.sleep(0.15)
                cur = json.loads(ev(
                    "JSON.stringify((window.__agentData[%d]||{}).walker&&window.__agentData[%d].walker.visible?"
                    "{x:window.__agentData[%d].walker.position.x,y:window.__agentData[%d].walker.position.y,"
                    "z:window.__agentData[%d].walker.position.z}:null)" % (w["i"], w["i"], w["i"], w["i"], w["i"])) or "null")
                if cur:
                    w = dict(w, **cur)
            if not got:
                continue
            time.sleep(2.0)  # lerp goal + seleksi (SwiftShader ~1.5 FPS)
            focus = json.loads(ev(FOCUS_EXPR) or "null")
            rad0 = json.loads(ev(RADIUS_EXPR) or "null")
            # pre-condition: goal follow aktif (reset:false) hasil klik agen
            if not focus or focus.get("reset") or not isinstance(focus.get("r"), (int, float)):
                print("  attempt[%d]: goal follow belum aktif (focus=%s)" % (attempt, json.dumps(focus)))
                continue
            r_goal0 = focus["r"]

            # ── 2b. GATE LAYAR v2: wheel hanya bila agen benar-benar di
            # dead-zone layar (angular <25° DAN lebih dekat dari tgt) —
            # dulu wheel ditembak BLIND → raycast tengah meleset saat lerp
            # belum tuntas → jalur klik-kosong me-reset goal → FAIL palsu.
            cam = json.loads(ev(CAM_EXPR) or "null")
            gate = screen_gate(cam, w)
            print("  attempt[%d]: gate=%s (cam=%s agent=(%.1f,%.1f))"
                  % (attempt, gate, json.dumps(cam), w["x"], w["z"]))
            if not gate:
                continue  # ulang attempt lain — JANGAN wheel blind

            # ── 3. scroll wheel NYATA ke atas (mendekat) di tengah canvas ──
            # deltaY=-1000 → d = zoomRadius(rad0, -40) - rad0 = 12 - rad0 →
            # sph.radius & goal.r terdorong ke CLAMP 12. Lerp follow hanya
            # bisa menarik radius menuju goal.r (≥12 tapi ≥ lama bila tanpa
            # wheel) — mencapai ~12 BUKTI wheel benar-benar mendarat.
            cmd("Input.dispatchMouseEvent", type="mouseWheel",
                x=683, y=384, deltaX=0, deltaY=-1000)
            time.sleep(1.5)  # lerp radius (beberapa frame)

            focus2 = json.loads(ev(FOCUS_EXPR) or "null")
            rad1 = json.loads(ev(RADIUS_EXPR) or "null")
            print("AFTER_WHEEL[%d]:" % attempt, json.dumps(focus2), "rad1=", rad1)
            # ── 4. pembeda ganda kode baru ──
            # (a) goal follow MASIH ADA (kode lama: focusGoal=null → null)
            # (b) goal.r BERKURANG signifikan (terdorong clamp 12 — bukti wheel
            #     mendarat; dulu goal dibuang sekalian)
            # (c) radius aktual ikut turun
            if focus2 and not focus2.get("reset"):
                new_r = focus2.get("r")
                rad_ok = (isinstance(rad0, (int, float)) and isinstance(rad1, (int, float))
                          and rad1 < rad0 - 2.0)
                goal_ok = isinstance(new_r, (int, float)) and new_r < r_goal0 - 2.0
                if goal_ok and rad_ok:
                    print("ZOOM_FOLLOW[%d]: OK (goal follow dipertahankan r=%.2f→%.2f, radius=%.1f→%.1f)"
                          % (attempt, r_goal0, new_r, rad0, rad1))
                    ok = True
                    break
                print("  (goal ada tapi radius tidak bergeser: goal %.2f→%s rad %s→%s)"
                      % (r_goal0, new_r, rad0, rad1))
            else:
                print("  (focus hilang setelah wheel — perilaku lama terdeteksi)")
        if not ok:
            print("E2E_ZOOMFOLLOW: FAIL")
            sys.exit(1)
        print("E2E_ZOOMFOLLOW: OK")
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
