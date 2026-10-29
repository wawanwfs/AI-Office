#!/usr/bin/env python3
"""E2E siklus 146: pelapor lantai kamera TERPUSAT per-frame.

Bug yang diperbaiki (ekor terakhir keluarga 142-145):
  1. Klik PAPAN PROYEK (single + dblclick): goal z=13.2 dinding L3 — panel
     proyek terbuka tapi FloorNavigator tetap di lantai lama.
  2. FOLLOW: kamera mengikuti agen yang berjalan lintas lantai (lunch ke kafe
     L3) — nav beku di lantai saat agen diklik.
  3. Klik kosong/Escape (goal reset ke HOME_TGT) BUKAN pindah lantai — nav
     tidak boleh berubah (alur lama utuh).

Langkah (semua via scene nyata — raycast klik + daycycle):
  1. Muat kantor (agents>=26), nav awal = L1.
  2. Klik papan proyek via jalur klik scene nyata (dispatch pointerdown/up ke
     koordinat layar proyeksi mesh papan) → nav aktif HARUS L3.
  3. Klik canvas kosong (sudut atas) → goal reset → nav TETAP L3 (bukan L2).
  4. Klik papan lagi (setelah latch reset) → nav L3 lagi.
  5. Pilih agen meja L1, __setTime(720) lunch → agen berjalan ke kafe L3 →
     kamera follow → nav aktif HARUS berubah ke L3 LIVE (tanpa klik baru).
Diskriminasi: kode lama → langkah 2 & 5 FAIL (nav L1 terus).
Pemakaian: uv run --with websocket-client python scripts/e2e_goal_floor_live.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading, math

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9467
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
        d = json.dumps(m).encode()
        h = b"\x81"
        n = len(d)
        mask = os.urandom(4)
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
                    raise ConnectionResetError("socket closed")
                b += c
            return b
        hdr = rx(2)
        op = hdr[0] & 0xf
        n = hdr[1] & 0x7f
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


def _x99_alive():
    return os.path.exists("/tmp/.X11-unix/X99")


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
    ok = False
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0
        msgq = queue.Queue()

        def pump():
            while True:
                try:
                    raw = ws.recv()
                except Exception:
                    msgq.put(None)
                    return
                if not raw:
                    msgq.put(None)
                    return
                try:
                    msgq.put(json.loads(raw))
                except Exception:
                    continue

        threading.Thread(target=pump, daemon=True).start()

        def wait_id(myid, tries=200):
            for _ in range(tries):
                try:
                    m = msgq.get(timeout=20)
                except queue.Empty:
                    return None
                if m is None:
                    raise ConnectionResetError("CDP socket tertutup")
                if m.get("id") == myid:
                    return m
            return None

        def cmd(method, **params):
            nonlocal mid
            mid += 1
            myid = mid
            ws.send({"id": myid, "method": method, "params": params})
            return wait_id(myid)

        def ev(expr, tries=3):
            for _ in range(tries):
                r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
                if r:
                    return (r.get("result", {}).get("result", {}) or {})
                time.sleep(0.5)
            return {}

        def active_floor():
            return ev("(()=>{const b=document.querySelector('.floor-nav-btn.active');"
                      "if(!b)return 'none';const m=b.textContent.match(/L([123])/);"
                      "return m?'L'+m[1]:'?'})()").get("value", "?")

        def click_screen_xy(x, y):
            # Jalur klik scene NYATA: Input.dispatchMouseEvent (CDP) — pointerdown/up
            # dgn gerakan kecil (<6px drag guard) seperti klik pengguna asli.
            for t, typ in ((0, "mousePressed"), (0, "mouseReleased")):
                cmd("Input.dispatchMouseEvent", type=typ, x=x, y=y,
                    button="left", clickCount=1, buttons=1 if typ == "mousePressed" else 0)
                time.sleep(0.12)

        def project_to_screen(key, sub):
            """Proyeksi titik 3D scene → koordinat layar, via kamera + __camCam."""
            expr = (f"(()=>{{const c=window.__camCam;if(!c)return null;"
                    f"const o=window.__{key};if(!o||!o.{sub})return null;"
                    f"const p=new THREE.Vector3().setFromMatrixPosition(o.{sub}.matrixWorld);"
                    f"p.project(c);"
                    f"const cv=document.querySelector('canvas');const r=cv.getBoundingClientRect();"
                    f"return {{x:Math.round(r.left+(p.x+1)/2*r.width),y:Math.round(r.top+(1-p.y)/2*r.height),vis:p.z<1}};}})()")
            return ev(expr).get("value")

        cmd("Runtime.enable")
        time.sleep(1)

        agents = -1
        for _ in range(40):
            v = ev("window.__agentData?window.__agentData.length:-1").get("value")
            if isinstance(v, (int, float)) and v >= 26:
                agents = int(v)
                break
            time.sleep(1)

        # Jam kerja pagi: agen duduk di meja, tanpa rapat/lunch
        ev("window.__setTime(540)")  # 09:00
        time.sleep(1)

        nav0 = active_floor()

        # ── Langkah 2: klik papan proyek (jalur klik nyata → raycast → goal z=13.2) ──
        pt = project_to_screen("projectBoard", "mesh")
        board_res = "?"
        if pt and pt.get("vis"):
            click_screen_xy(pt["x"], pt["y"])
            time.sleep(2.0)  # lerp kamera + panel terbuka
            board_res = active_floor()

        # ── Langkah 3: klik area kosong (sudut atas kiri canvas) → goal reset ──
        cv = ev("(()=>{const c=document.querySelector('canvas');const r=c.getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+60)}})()").get("value")
        blank_res = "?"
        if cv:
            click_screen_xy(cv["x"], cv["y"])
            time.sleep(2.5)  # lerp ke home selesai
            blank_res = active_floor()

        # ── Langkah 4: klik papan lagi → latch sudah di-reset oleh overview ──
        board_res2 = "?"
        pt = project_to_screen("projectBoard", "mesh")
        if pt and pt.get("vis"):
            click_screen_xy(pt["x"], pt["y"])
            time.sleep(2.0)
            board_res2 = active_floor()

        # ── Langkah 5: follow agen lintas lantai (lunch) ──
        # __focusAgent('be1') (hook scene nyata focusAgent) → goal FOLLOW kamera
        # ke BUDI (meja L1); __setTime(720) memicu daycycle lunch → agen berjalan
        # ke kafe L3 → kamera follow LIVE → nav HARUS berubah L1→L3 tanpa klik.
        # (Catatan: __wfsSelectAgent hanya memilih — TANPA follow goal — kamera
        # tidak ikut, bukan jalur yang diuji di sini.)
        follow_res = "?"
        ev("window.__focusAgent && window.__focusAgent('be1')")
        time.sleep(1.5)
        sel = ev("(()=>{const a=window.__agentData||[];const e=a.find(x=>x.agent&&String(x.agent.name).toUpperCase()==='BUDI');"
                 "return e?{st:e.state,hz:e.home&&e.home.z}:{st:'none'}})()").get("value", {})
        if sel.get("st") in ("sitting", "walking_out") and isinstance(sel.get("hz"), (int, float)) and sel["hz"] < -0.8:
            ev("window.__setTime(720)")  # 12:00 lunch
            changed = False
            for _ in range(75):
                time.sleep(1)
                f = active_floor()
                if f == "L3":
                    changed = True
                    break
            follow_res = "L3" if changed else active_floor()
        else:
            follow_res = f"skip({sel})"

        cond = (agents >= 26 and nav0 == "L1" and board_res == "L3"
                and blank_res == "L3" and board_res2 == "L3" and follow_res == "L3")
        ok = cond
        detail = (f"nav0={nav0} board={board_res} afterBlank={blank_res} "
                  f"board2={board_res2} followLunch={follow_res}")
        print(f"E2E_GOALFLOOR: {'OK' if ok else 'FAIL'} agents={agents} {detail}")
        return 0 if ok else 1
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
    sys.exit(main())
