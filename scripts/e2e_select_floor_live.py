#!/usr/bin/env python3
"""E2E siklus 144: klik agen → sinkron lantai FloorNavigator dari posisi LIVE.

Bug yang diperbaiki: App.onSelectAgent memakai ag.floor (lantai MEJA statis,
di-set sekali saat scene build) — agen meja L2 yang diklik SAAT RAPAT (figur
di kursi ruang meeting L1) menyetel tombol "L2 · Engineering" aktif, padahal
kamera fokus ke posisi live (anchor kursi rapat L1) → label nav menunjuk
lantai kosong.

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. __setTime(600) (stand-up 10:00, window rapat 0) → peserta state 'meeting'.
  3. Pilih peserta rapat yang MEJANYA di L2 (agent.floor===2) via
     __wfsSceneSelect → App.onSelectAgent terpanggil jalur scene nyata.
  4. Tombol .floor-nav-btn.active HARUS "L1" (lantai live ruang rapat),
     BUKAN "L2" (lantai meja) — syarat diskriminasi: agent.floor===2 & live 1.
  5. __setTime(480) (08:00, tanpa rapat) → pilih ulang agen yang sama →
     tombol aktif = lantai meja (live == meja; alur lama tak berubah).
Pemakaian: uv run --with websocket-client python scripts/e2e_select_floor_live.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9465
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

        cmd("Runtime.enable")
        time.sleep(1)

        agents = -1
        for _ in range(40):
            v = ev("window.__agentData?window.__agentData.length:-1").get("value")
            if isinstance(v, (int, float)) and v >= 26:
                agents = int(v)
                break
            time.sleep(1)

        ACTIVE_EXPR = ("(()=>{const b=document.querySelector('.floor-nav-btn.active');"
                       "if(!b)return 'none';"
                       "const m=b.textContent.match(/L([123])/);"
                       "return m?'L'+m[1]:'?'})()")

        # 10:00 — jendela rapat 0 (600–630): peserta duduk di ruang meeting L1
        ev("window.__setTime(600)")
        pick = None
        for _ in range(30):
            time.sleep(1.5)
            v = ev("(()=>{const d=window.__agentData||[];"
                   "const p=d.findIndex(e=>e&&e.state==='meeting'&&e.agent"
                   "&&typeof e.agent.floor==='number'&&e.agent.floor===2);"
                   "return p>=0?JSON.stringify({idx:p,name:e_name(p)}):'none';"
                   "function e_name(i){return d[i].agent.name}})()").get("value", "none")
            if v != "none":
                pick = json.loads(v)
                break
        if not pick:
            # fallback: window rapat 1 (sprint review 14:00)
            ev("window.__setTime(840)")
            for _ in range(30):
                time.sleep(1.5)
                v = ev("(()=>{const d=window.__agentData||[];"
                       "const p=d.findIndex(e=>e&&e.state==='meeting'&&e.agent"
                       "&&typeof e.agent.floor==='number'&&e.agent.floor===2);"
                       "return p>=0?JSON.stringify({idx:p,name:e_name(p)}):'none';"
                       "function e_name(i){return d[i].agent.name}})()").get("value", "none")
                if v != "none":
                    pick = json.loads(v)
                    break
        if not pick:
            print("E2E_SELECTFLOOR: FAIL — tidak ada peserta rapat bermeja L2 di kedua window")
            return 1

        nm = pick["name"]
        # klik agen via jalur scene nyata → App.onSelectAgent (sinkron nav)
        ev(f"window.__wfsSceneSelect({json.dumps(str(nm).lower())})")
        time.sleep(1.5)
        active_meet = ev(ACTIVE_EXPR).get("value", "?")
        state_meet = ev("(()=>{const d=window.__agentData||[];"
                        f"const e=d.find(x=>x.agent&&x.agent.name==={json.dumps(nm)});"
                        "return e?JSON.stringify({state:e.state,desk:e.agent.floor,"
                        "ring:!!(window.__sceneSelRing&&window.__sceneSelRing.visible)}):'gone'})()").get("value", "{}")

        # 08:00 — tanpa rapat: agen kembali di meja; live == lantai meja
        ev("window.__setTime(480)")
        time.sleep(2.5)
        ev(f"window.__wfsSceneSelect({json.dumps(str(nm).lower())})")
        time.sleep(1.5)
        active_desk = ev(ACTIVE_EXPR).get("value", "?")

        sm = json.loads(state_meet) if state_meet.startswith("{") else {}
        # Diskriminasi: peserta rapat, meja L2 → tombol aktif harus L1 (bukan L2)
        cond_meet = (sm.get("state") == "meeting" and sm.get("desk") == 2
                     and active_meet == "L1")
        cond_desk = (active_desk == "L2")
        ok = (agents >= 26 and cond_meet and cond_desk)
        print(f"E2E_SELECTFLOOR: {'OK' if ok else 'FAIL'} agents={agents} "
              f"picked={nm!r} state={sm.get('state')} desk=L{sm.get('desk')} "
              f"active_meeting={active_meet} active_desk={active_desk} "
              f"ring={sm.get('ring')}")
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
