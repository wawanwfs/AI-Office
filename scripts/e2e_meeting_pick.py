#!/usr/bin/env python3
"""E2E regresi "figur peserta rapat tak bisa diklik" (siklus 119).

Bug lama (sebelum siklus 119): figur peserta rapat (createMeeting.figures)
TIDAK ada di daftar raycast (collectPickTargets) — klik pada peserta yang
duduk di ruang meeting jatuh ke jalur "klik kosong": kamera ME-RESET ke rumah
(goal reset), pilihan agen justru dihapus, hover tidak bereaksi sama sekali.

Perbaikan siklus 119: meetingFigures disertakan di collectPickTargets; cabang
klik/dblclick/hover baru via findMeetingFigureOwner + focusMeetingFigure
(goal ke kursi rapat, r=min(radius,16), ensureHomeRadius+saveCam, agen tetap
dipilih — ring emas via meetingFigureAnchor).

Langkah probe (input mouse NYATA via CDP, jalur UI asli):
  1. __setTime(605) → window rapat 10:00–10:30 → peserta tampil di kursi.
  2. Proyeksikan tiap figur peserta (window.__meetFigs) ke layar; pilih yang
     elementFromPoint = CANVAS (tidak tertutup UI React).
  3. Klik figur → kamera MENDEKAT (r < 26), __saved ada (ensureHomeRadius +
     saveCam), sel ring tampil. Bug lama: klik kosong → goal reset (r tetap
     ~39+), __saved TIDAK dibuat, seleksi dihapus.
Pemakaian: uv run scripts/e2e_meeting_pick.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = int(os.environ.get("E2E_MEETPK_PORT", "9471"))
URL = "http://127.0.0.1:9503/"


def log(*a):
    print(*a, flush=True)


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
        hdr = rx(2); n = hdr[1] & 0x7f
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
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=8).read())
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
            return (res.get("result") or {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        st0 = json.loads(ev(
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState,"
            " figs: window.__meetFigs ? window.__meetFigs.length : -1})") or "{}")
        log("STATE0:", json.dumps(st0))
        allow_old = os.environ.get("E2E_MEETPK_ALLOW_OLD") == "1"  # mode diskriminasi kode lama (tanpa hook)
        if st0.get("agents", -1) <= 0 or not st0.get("cam") or (st0.get("figs", -1) <= 0 and not allow_old):
            log("E2E_MEETPK: FAIL (scene tidak siap)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 1. picu window rapat via jalur asli __setTime ──
            ev("window.__setTime(605)")
            time.sleep(1.5)
            mt = json.loads(ev("JSON.stringify(window.__meet ? window.__meet() : {})") or "{}")
            log("ATTEMPT[%d] meet=%s" % (attempt, json.dumps(mt)))
            if not mt.get("active") or not mt.get("vis"):
                log("  (rapat tidak aktif — ulangi)")
                time.sleep(1)
                continue

            # ── 2a. dekatkan kamera ke ruang meeting via API scene asli (HUD React
            #        menutup figur dari kamera default — proyeksi jatuh di area overlay) ──
            ev("window.__focusMeetingRoom&&window.__focusMeetingRoom()")
            for _ in range(16):
                time.sleep(0.5)
                rv = ev("(window.__cam ? window.__cam.sph.radius : -1)")
                if isinstance(rv, (int, float)) and rv < 14.5:
                    break
            # ── 2. proyeksikan figur peserta (posisi kursi nyata) ──
            pts = json.loads(ev(
                "JSON.stringify((window.__meetFigs||[]).map(f=>{"
                "if(!f.visible)return null;const c=window.__camCam;"
                "const v=new (c.position.constructor)(f.position.x,f.position.y+1.05,f.position.z);"
                "v.project(c);if(v.z>=1||v.z<-1)return null;"
                "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};}))") or "null")
            if not pts:
                log("  (tak ada figur terproyeksi — ulangi)")
                time.sleep(1)
                continue
            cand = None
            for pj in pts:
                if not pj:
                    continue
                x, y = int(pj["x"]), int(pj["y"])
                if not (0 <= x <= 1365 and 0 <= y <= 767):
                    continue
                el = json.loads(ev(
                    "JSON.stringify((document.elementFromPoint(%d,%d)||{}).tagName)" % (x, y)) or '"?"')
                log("  CAND px=(%d,%d) el=%s" % (x, y, el))
                if el == "CANVAS":
                    cand = (x, y)
                    break
            if not cand:
                log("  (semua kandidat tertutup UI React — ulangi)")
                time.sleep(1)
                continue

            # ── 3. KLIK figur → kamera mendekat + __saved + seleksi ──
            for cc in (1,):
                cmd("Input.dispatchMouseEvent", type="mousePressed", x=cand[0], y=cand[1],
                    button="left", buttons=1, clickCount=cc)
                cmd("Input.dispatchMouseEvent", type="mouseReleased", x=cand[0], y=cand[1],
                    button="left", buttons=0, clickCount=cc)
            near = False
            sm = {}
            for _ in range(20):
                time.sleep(0.5)
                sm = json.loads(ev(
                    "JSON.stringify({r: window.__cam ? window.__cam.sph.radius : -1,"
                    " ty: window.__cam ? window.__cam.tgt.y : -1,"
                    " sv: !!(window.__cam && window.__cam.sph && window.__cam.sph.__saved),"
                    " sel: window.__sceneSelRing ? window.__sceneSelRing.visible : null})") or "{}")
                r1 = sm.get("r")
                if isinstance(r1, (int, float)) and r1 < 26:
                    near = True
                    break
            log("  AFTER-CLICK:", json.dumps(sm), "near=", near)
            if near and sm.get("sv") and sm.get("sel"):
                log("E2E_MEETPK: OK (r=%.2f tgt.y=%.2f — figur rapat difokus, __saved+seleksi ada)"
                    % (sm["r"], sm.get("ty") or -1))
                ok = True
                break
            log("  (klik tidak memicu fokus figur — ulangi)")
            ev("window.__cam&&(window.__cam.sph.radius=42.5,window.__cam.upd())")
            ev("window.__sceneSelRing&&(window.__sceneSelRing.visible=false)")
            time.sleep(1)
        if not ok:
            log("E2E_MEETPK: FAIL (klik figur rapat jatuh ke jalur klik kosong)")
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
