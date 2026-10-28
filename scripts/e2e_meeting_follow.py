#!/usr/bin/env python3
"""E2E regresi "kamera tidak mengikuti peserta rapat" (siklus 120).

Bug lama (sebelum siklus 120): goal kamera TIDAK tahu figur peserta rapat.
- updateFollowGoal hanya walker/home → klik agen peserta rapat = kamera menatap
  MEJA KOSONG agen selama 30 menit window.
- focusMeetingFigure (siklus 119) = goal STATIS (tanpa follow): figur lompat
  kursi saat window berganti → kamera menatap KURSI LAMA.

Perbaikan siklus 120: follow {meetIdx, root} — anchor kursi di-resolve
per-frame via meetingFigureAnchor; rapat usai → jatuh ke home agen.

Langkah probe (mouse NYATA via CDP):
  1. __setTime(605) → window rapat 10:00–10:30 → peserta tampil di kursi.
  2. __focusMeetingRoom → klik figur peserta (proyeksi __meetFigs) →
     focusMeetingFigure: goal follow aktif + __saved + sel ring.
  3. __setTime(700) → rapat USAI → kamera ikut pulang ke meja agen terpilih
     (kode baru dist<1.2; kode lama: tgt beku di kursi, dist≥2.5).
Pemakaian: uv run scripts/e2e_meeting_follow.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = int(os.environ.get("E2E_MEETFL_PORT", "9472"))
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
        if st0.get("agents", -1) <= 0 or not st0.get("cam") or st0.get("figs", -1) <= 0:
            log("E2E_MEETFL: FAIL (scene tidak siap)")
            sys.exit(1)

        ok = False
        for attempt in range(4):
            # ── 1. picu window rapat 1 via jalur asli __setTime ──
            ev("window.__setTime(605)")
            time.sleep(1.5)
            mt = json.loads(ev("JSON.stringify(window.__meet ? window.__meet() : {})") or "{}")
            log("ATTEMPT[%d] meet=%s" % (attempt, json.dumps(mt)))
            if not mt.get("active") or not mt.get("vis"):
                log("  (rapat tidak aktif — ulangi)")
                time.sleep(1)
                continue

            # ── 2. dekatkan kamera (HUD React menutup figur dari kamera default) ──
            ev("window.__focusMeetingRoom&&window.__focusMeetingRoom()")
            for _ in range(16):
                time.sleep(0.5)
                rv = ev("(window.__cam ? window.__cam.sph.radius : -1)")
                if isinstance(rv, (int, float)) and rv < 14.5:
                    break

            # ── 3. proyeksikan figur; kandidat = klik-able & home JAUH dari kursi ──
            pts = json.loads(ev(
                "JSON.stringify((window.__meetFigs||[]).map((f,i)=>{"
                "if(!f.visible)return null;const c=window.__camCam;"
                "const v=new (c.position.constructor)(f.position.x,f.position.y+1.05,f.position.z);"
                "v.project(c);if(v.z>=1||v.z<-1)return null;"
                "const ad=window.__agentData[i];"
                "return {i:i,x:(v.x*0.5+0.5)*innerWidth,y:(-v.y*0.5+0.5)*innerHeight,"
                "sx:f.position.x,sz:f.position.z,"
                "hx:ad&&ad.home?ad.home.x:null,hz:ad&&ad.home?ad.home.z:null};}))") or "null")
            cand = None
            for pj in (pts or []):
                if not pj:
                    continue
                x, y = int(pj["x"]), int(pj["y"])
                if not (0 <= x <= 1365 and 0 <= y <= 767):
                    continue
                if pj.get("hx") is None:
                    continue
                seat_home = ((pj["sx"] - pj["hx"]) ** 2 + (pj["sz"] - pj["hz"]) ** 2) ** 0.5
                if seat_home < 2.5:
                    continue  # kursi & meja terlalu dekat — pembeda lemah
                el = json.loads(ev(
                    "JSON.stringify((document.elementFromPoint(%d,%d)||{}).tagName)" % (x, y)) or '"?"')
                log("  CAND fig#%s px=(%d,%d) el=%s seat_home=%.2f" % (pj["i"], x, y, el, seat_home))
                if el == "CANVAS":
                    cand = pj
                    break
            if not cand:
                log("  (tak ada kandidat klik-able dgn meja jauh — ulangi)")
                time.sleep(1)
                continue
            cmd("Input.dispatchMouseEvent", type="mousePressed", x=int(cand["x"]), y=int(cand["y"]),
                button="left", buttons=1, clickCount=1)
            cmd("Input.dispatchMouseEvent", type="mouseReleased", x=int(cand["x"]), y=int(cand["y"]),
                button="left", buttons=0, clickCount=1)

            # konfirmasi jalur 119: kamera mendekat + seleksi + __saved
            f1 = {}
            ok_click = False
            for _ in range(28):
                time.sleep(0.5)
                f1 = json.loads(ev(
                    "JSON.stringify({r: window.__cam ? window.__cam.sph.radius : -1,"
                    " tx: window.__cam ? window.__cam.tgt.x : -1,"
                    " tz: window.__cam ? window.__cam.tgt.z : -1,"
                    " sv: !!(window.__cam && window.__cam.sph && window.__cam.sph.__saved),"
                    " sel: window.__sceneSelRing ? window.__sceneSelRing.visible : null,"
                    " fg: window.__dbg ? !!(window.__dbg().focus && !window.__dbg().focus.reset) : null})") or "{}")
                if f1.get("sel") and f1.get("sv"):
                    ok_click = True
                    break
            log("  CLICK1:", json.dumps(f1), "ok=", ok_click)
            if not ok_click:
                log("  (klik tidak memicu fokus figur — ulangi)")
                ev("window.__cam&&(window.__cam.sph.radius=42.5,window.__cam.upd())")
                ev("window.__sceneSelRing&&(window.__sceneSelRing.visible=false)")
                time.sleep(1)
                continue

            # ── 4. PEMBEDA siklus 120: rapat USAI → kamera ikut PULANG ke meja ──
            #     kode baru: follow root → tgt konvergen ke home agen terpilih.
            #     kode lama (goal statis 119): tgt beku di kursi rapat
            #     (dist kursi→meja ≥ 2.5 oleh pemilihan kandidat).
            ev("window.__setTime(700)")
            dist = None
            fin = {}
            for _ in range(28):
                time.sleep(0.5)
                fin = json.loads(ev(
                    "JSON.stringify({meet: window.__meet ? window.__meet() : null,"
                    " tx: window.__cam ? window.__cam.tgt.x : null,"
                    " tz: window.__cam ? window.__cam.tgt.z : null})") or "{}")
                if not fin.get("meet") or fin["meet"].get("active"):
                    continue  # rapat belum benar-benar usai
                d = ((fin["tx"] - cand["hx"]) ** 2 + (fin["tz"] - cand["hz"]) ** 2) ** 0.5
                dist = d
                if d < 1.2:
                    break
            log("  END: meet=%s tgt=(%.2f,%.2f) home=(%.2f,%.2f) dist=%.3f"
                % (json.dumps(fin.get("meet")), fin.get("tx") or -9, fin.get("tz") or -9,
                   cand["hx"], cand["hz"], dist if dist is not None else -1))
            if dist is not None and dist < 1.2:
                log("E2E_MEETFL: OK (follow root — rapat usai kamera pulang ke meja, dist=%.3f)" % dist)
                ok = True
                break
            log("  (kamera tidak mengikuti pulang — ulangi)")
            ev("window.__cam&&(window.__cam.sph.radius=42.5,window.__cam.upd())")
            ev("window.__sceneSelRing&&(window.__sceneSelRing.visible=false)")
            time.sleep(1)
        if not ok:
            log("E2E_MEETFL: FAIL (kamera tidak mengikuti kursi rapat)")
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
