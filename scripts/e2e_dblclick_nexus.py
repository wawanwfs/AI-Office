#!/usr/bin/env python3
"""E2E regresi "dblclick nexus memecah goal kamera" (siklus 118).

Bug lama (sebelum siklus 118): handler dblclick kanvas TIDAK punya cabang
agen/nexus — dblclick pada NEXUS jatuh ke goal titik generik statis
(y = titik intersect + 0.8, r = min(radius,18)) yang MENIMPA goal nexus
r:16 yang dibuat klik pertama (kamera zoom ke kepala/dada nexus), dan
dblclick pada AGEN menimpa goal follow klik pertama (kamera berhenti
mengikuti agen yang berjalan). Jalur agen juga satu-satunya jalur fokus
yang skip ensureHomeRadius/saveCam → Escape "kembali" tidak berfungsi.

Perbaikan siklus 118: cabang agen (focusAgentRoot — idempoten dgn klik
tunggal: follow + saveCam + ensureHomeRadius) & cabang nexus (goal r:16
idempoten) di dblclick; goal titik/kosong diekstrak ke parts/dblclick_spec.js.

Langkah probe (input mouse NYATA via CDP, jalur UI asli):
  1. Proyeksikan posisi nexus (7.6, ~1.4, 6.1) → layar via kamera debug.
  2. Klik tunggal nexus → goal r:16 + selectedIdx -2 (pre-condition).
  3. DBLCLICK nexus → goal harus TETAP r:16 (bug lama: r jadi ≤ 18
     mengikuti radius kamera & y goal mengarah ke titik intersect badan).
  4. Cek window.__cam.sph.__saved ada (saveCam terpanggil jalur nexus).
Pemakaian: uv run scripts/e2e_dblclick_nexus.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, math

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = int(os.environ.get("E2E_DBLNX_PORT", "9463"))
URL = "http://127.0.0.1:9503/"

NEXUS = (7.6, 1.45, 6.1)


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


def proj_expr(x, y, z):
    return ("JSON.stringify((()=>{const c=window.__camCam;if(!c)return null;"
            "const v=new (c.position.constructor)(%f,%f,%f);v.project(c);"
            "if(v.z>=1||v.z<-1)return null;"
            "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};})())" % (x, y, z))


def click_seq(cmd, x, y, dbl):
    n = 2 if dbl else 1
    for cc in (1, 2)[:n if dbl else 1] if dbl else (1,):
        pass
    seq = [(1, 1), (2, 2)] if dbl else [(1, 1)]
    for cc, _ in seq:
        cmd("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y,
            button="left", buttons=cc, clickCount=cc)
        cmd("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y,
            button="left", buttons=0, clickCount=cc)


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
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("cam"):
            print("E2E_DBLNX: FAIL (scene tidak siap)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 1. proyeksikan posisi nexus ke layar (torso: karakter scale 2.2,
            # base dunia y≈1.24 → badan y≈2.2-3.6; kaki terlalu tipis utk ray) ──
            pj = None
            for ytry in (3.0, 2.6, 3.4, 2.2, 3.8):
                pj = json.loads(ev(proj_expr(NEXUS[0], ytry, NEXUS[2])) or "null")
                if pj and 0 <= pj["x"] <= 1365 and 0 <= pj["y"] <= 767:
                    break
                pj = None
            if not pj:
                print("  (nexus tidak terproyeksi ke viewport — kamera default, ulangi)")
                time.sleep(1)
                continue
            el = json.loads(ev(
                "JSON.stringify((document.elementFromPoint(%d,%d)||{}).tagName)" % (int(pj["x"]), int(pj["y"]))) or '"?"')
            print("ATTEMPT[%d] px=(%d,%d) el=%s" % (attempt, pj["x"], pj["y"], el))
            if el != "CANVAS":
                continue

            # ── 2. klik tunggal nexus → goal r:16 + seleksi nexus ──
            click_seq(cmd, int(pj["x"]), int(pj["y"]), dbl=False)
            # Tunggu kamera MENDAKAT (r < 28) — target besar, proyeksi stabil;
            # bila 10 s tak juga mendekat, klik kemungkinan meleset → ulangi.
            near = False
            for _ in range(20):
                time.sleep(0.5)
                r1 = ev("(window.__cam ? window.__cam.sph.radius : -1)")
                if isinstance(r1, (int, float)) and r1 < 28:
                    near = True
                    break
            s1 = json.loads(ev(
                "JSON.stringify({r: window.__cam ? window.__cam.sph.radius : -1,"
                " sel: window.__sceneSelRing ? window.__sceneSelRing.visible : null})") or "{}")
            print("  SINGLE:", json.dumps(s1), "near=", near)
            if not near or not s1.get("sel"):
                print("  (kamera tidak mendekat / seleksi nexus tidak aktif — ulangi)")
                # reset ke rumah bila sempat fokus
                ev("window.__focusMeetingRoom&&0")
                continue

            # ── 3. proyeksi ULANG (kamera sudah dekat & bergerak) lalu dblclick ──
            pj2 = None
            for ytry in (3.0, 2.6, 3.4, 2.2):
                pj2 = json.loads(ev(proj_expr(NEXUS[0], ytry, NEXUS[2])) or "null")
                if pj2 and 0 <= pj2["x"] <= 1365 and 0 <= pj2["y"] <= 767:
                    break
                pj2 = None
            if not pj2:
                print("  (nexus tak terproyeksi saat dekat — ulangi)")
                continue
            el2 = json.loads(ev(
                "JSON.stringify((document.elementFromPoint(%d,%d)||{}).tagName)" % (int(pj2["x"]), int(pj2["y"]))) or '"?"')
            if el2 != "CANVAS":
                print("  (titik dblclick bukan canvas: %s — ulangi)" % el2)
                continue
            click_seq(cmd, int(pj2["x"]), int(pj2["y"]), dbl=True)

            # ── 4. sampel r & tgt.y sampai 14 s: pembeda ganda ──
            # Kode BARU: dblclick nexus → goal r:16 idempoten (tgt.y → 2.0).
            # Bug LAMA: dblclick jatuh ke goal titik generik r=min(radius,18),
            # t.y = titik intersect badan + 0.8 (kepala/torso ≈ 3.3-4.3).
            verdict = None
            sm, r, ty = {}, None, None
            # 28 s (bukan 14): lerp .06/frame butuh ~18 frame utk turun 20.4→17.4;
            # SwiftShader ~1.5 FPS saat VM load tinggi → 14 s kerap ambigu
            # (r berhenti 17.4x tanpa verdict). Verdict tetap ketat.
            for _ in range(28):
                time.sleep(1.0)
                sm = json.loads(ev(
                    "JSON.stringify({r: window.__cam ? window.__cam.sph.radius : -1,"
                    " ty: window.__cam ? window.__cam.tgt.y : -1,"
                    " sv: !!(window.__cam && window.__cam.sph && window.__cam.sph.__saved),"
                    " sel: window.__sceneSelRing ? window.__sceneSelRing.visible : null})") or "{}")
                r, ty = sm.get("r"), sm.get("ty")
                if not isinstance(r, (int, float)) or not isinstance(ty, (int, float)):
                    continue
                if r < 17.4 and ty < 2.6 and sm.get("sv") and sm.get("sel"):
                    verdict = "NEW"
                    break
                if r >= 17.5 and ty >= 2.9:
                    verdict = "OLD"
                    break
            print("  SAMPLE-END:", json.dumps(sm))
            if verdict == "NEW":
                print("E2E_DBLNX: OK (r=%.2f tgt.y=%.2f — goal nexus r:16 idempoten, __saved ada)" % (r, ty))
                ok = True
                break
            if verdict == "OLD":
                print("  (perilaku LAMA terdeteksi: r=%.2f tgt.y=%.2f — goal dipecah dblclick)" % (r, ty))
                break
            print("  (ambiguous setelah 14 s — ulangi)")
        if not ok:
            print("E2E_DBLNX: FAIL (goal nexus dipecah dblclick / __saved hilang)")
            sys.exit(1)
        sys.exit(0)
    finally:
        try:
            p.terminate()
        except Exception:
            pass
        if xv:
            try:
                xv.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
