#!/usr/bin/env python3
"""E2E regresi "figur peserta rapat tak bisa diklik" (siklus 119).

Bug lama (sebelum siklus 119): figur peserta rapat (createMeeting.figures)
TIDAK ada di daftar raycast (collectPickTargets) — klik pada peserta yang
duduk di ruang meeting jatuh ke jalur "klik kosong": kamera ME-RESET ke
rumah (goal reset), pilihan agen justru dihapus, hover tidak bereaksi.

Perbaikan siklus 119: meetingFigures disertakan di collectPickTargets;
cabang klik/dblclick/hover baru via findMeetingFigureOwner + focusMeeting
Figure (goal ke kursi rapat, r=min(radius,16), ensureHomeRadius+saveCam,
agen tetap dipilih — ring via meetingFigureAnchor).

Langkah probe (input mouse NYATA via CDP, jalur UI asli):
  1. __setTime(605) → window rapat 10:00–10:30 → peserta tampil di kursi.
  2. Pilih figur peserta dengan kursi TERDEKAT dari kamera (proyeksi layar
     via __camCam, elementFromPoint = CANVAS).
  3. Klik figur → kamera harus MENDEKAT (r < 26; bug lama: goal reset r≈39+)
     DAN __saved harus ada (ensureHomeRadius+saveCam; bug lama: tanpa __saved
     karena jalur klik kosong) DAN seleksi agen aktif (sel ring visible).
Pemakaian: uv run scripts/e2e_meeting_pick.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = int(os.environ.get("E2E_MEETPK_PORT", "9471"))
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


def proj_expr(x, y, z):
    return ("JSON.stringify((()=>{const c=window.__camCam;if(!c)return null;"
            "const v=new (c.position.constructor)(%f,%f,%f);v.project(c);"
            "if(v.z>=1||v.z<-1)return null;"
            "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};})())" % (x, y, z))


def click_seq(cmd, x, y, dbl=False):
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
            " cam: !!window.__camCam, ws: !!window.__wallState, setTime: typeof window.__setTime})") or "{}")
        print("STATE0:", json.dumps(st0))
        if st0.get("agents", -1) <= 0 or not st0.get("ws") or not st0.get("cam") or st0.get("setTime") != "function":
            print("E2E_MEETPK: FAIL (scene tidak siap)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 1. picu window rapat (10:00–10:30) via jalur asli __setTime ──
            ev("window.__setTime(605)")
            time.sleep(1.2)
            mt = json.loads(ev("JSON.stringify(window.__meet ? window.__meet() : {})") or "{}")
            print("ATTEMPT[%d] meet=%s" % (attempt, json.dumps(mt)))
            if not mt.get("active") or not mt.get("vis"):
                print("  (rapat tidak aktif — ulangi)")
                time.sleep(1)
                continue

            # ── 2. kandidat figur peserta: proyeksikan badan (y≈0.04+1.0) → layar;
            #       pilih yang elementFromPoint = CANVAS (kursi terdekat kamera) ──
            nfig = mt.get("vis") or 0
            cand = None
            for i in range(nfig):
                pj = json.loads(ev(proj_expr(8.6, 1.0, -3.6)) or "null")  # fallback lama
                break
            # proyeksikan tiap figur dari posisi real (figures[i].position) via JS
            pts = json.loads(ev(
                "JSON.stringify((()=>{const m=window.__meetFigs?window.__meetFigs:null;"
                "if(!m)return null;"
                "return m.map(f=>{const c=window.__camCam;"
                "const v=new (c.position.constructor)(f.position.x,f.position.y+1.0,f.position.z);"
                "v.project(c);if(v.z>=1||v.z<-1)return null;"
                "return {x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight};});})())") or "null")
            if not pts:
                # fallback: __meetFigs belum diekspos → proyeksikan kursi rapat (spec)
                pts = []
                for dx in (-1.4, 0, 1.4):
                    for dz in (-1.1, 1.1):
                        pj = json.loads(ev(proj_expr(8 + dx, 1.0, -3 + dz)) or "null")
                        if pj and 0 <= pj["x"] <= 1365 and 0 <= pj["y"] <= 767:
                            pts.append(pj)
            if not pts:
                print("  (tidak ada figur terproyeksi — kamera/viewport, ulangi)")
                time.sleep(1)
                continue
            # pilih kandidat dgn elementFromPoint = CANVAS (bukan tertutup React UI)
            for pj in pts:
                if not pj or not (0 <= int(pj["x"]) <= 1365 and 0 <= int(pj["y"]) <= 767):
                    continue
                el = json.loads(ev(
                    "JSON.stringify((document.elementFromPoint(%d,%d)||{}).tagName)" % (int(pj["x"]), int(pj["y"]))) or '"?"')
                print("  CAND px=(%d,%d) el=%s" % (pj["x"], pj["y"], el))
                if el == "CANVAS":
                    cand = pj
                    break
            if not cand:
                print("  (semua kandidat tertutup UI React — ulangi)")
                time.sleep(1)
                continue

            # ── 3. KLIK figur → kamera harus MENDEKAT + __saved + seleksi ──
            click_seq(cmd, int(cand["x"]), int(cand["y"]))
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
            print("  AFTER-CLICK:", json.dumps(sm), "near=", near)
            # Kode BARU: kamera mendekat ke kursi (r<26), tgt.y ≈ 1.54 (0.04+1.5),
            # __saved ada, sel ring visible. Bug lama: klik kosong → goal reset
            # (r tetap/home ≈39+, __saved TIDAK dibuat, sel ring hilang).
            if near and sm.get("sv") and sm.get("sel"):
                print("E2E_MEETPK: OK (r=%.2f tgt.y=%.2f — figur rapat bisa difokus, __saved+seleksi ada)" % (sm["r"], sm.get("ty") or -1))
                ok = True
                break
            print("  (klik tidak memicu fokus figur — ulangi)")
            ev("window.__sceneSelRing&&(window.__sceneSelRing.visible=false)")
        if not ok:
            print("E2E_MEETPK: FAIL (klik figur rapat jatuh ke jalur klik kosong)")
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
