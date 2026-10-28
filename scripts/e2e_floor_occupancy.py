#!/usr/bin/env python3
"""E2E siklus 143: badge okupansi lantai LIVE di tombol FloorNavigator (scene NYATA).

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Jam simulasi 480 (08:00, semua agen di meja) → tiap tombol lantai
     menampilkan badge jumlah agen (total badge = 26, distribusi 3 lantai).
  3. __setTime(720) (lunch 12:00) → daycycle mengirim agen ke Executive Cafe
     L3 (z≈5.6) → distribusi berubah LIVE: L3 naik, L1 turun — tanpa reload.
Pemakaian: uv run --with websocket-client python scripts/e2e_floor_occupancy.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9464
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

        # Baca badge okupansi tiap tombol lantai dari DOM
        OCC_EXPR = ("(()=>{const nav=document.querySelector('.floor-nav');"
                    "if(!nav)return 'no-nav';"
                    "const btns=[...nav.querySelectorAll('.floor-nav-btn')];"
                    "const out={};"
                    "btns.forEach(b=>{const m=b.querySelector('.floor-nav-occ');"
                    "const lbl=(b.textContent.match(/L([123])/)||[])[1];"
                    "out['L'+lbl]=m?parseInt(m.textContent,10):-1});"
                    "return JSON.stringify(out)})()")

        # 08:00 — semua agen di meja (bukan lunch/rapat)
        ev("window.__setTime(480)")
        time.sleep(2)
        occ_initial = ev(OCC_EXPR).get("value", "?")

        # 12:00 — lunch window: sebagian besar agen jalan ke kafe L3 (z≈5.6).
        ev("window.__setTime(720)")
        occ_final = None
        cafe = {}
        for _ in range(50):
            time.sleep(1.5)
            cafe = ev("(()=>{const d=window.__agentData||[];"
                      "const c=d.filter(e=>e.lunch).length;"
                      "const at3=d.filter(e=>{const z=e.walker&&e.walker.visible?e.walker.position.z:(e.sittingChar?e.sittingChar.position.z:null);return typeof z==='number'&&z>4.5}).length;"
                      "return JSON.stringify({lunch:c,atZ3:at3})})()").get("value", "{}")
            occ_final = ev(OCC_EXPR).get("value", "?")
            try:
                f = json.loads(occ_final)
                if f.get("L3", 0) >= 5:
                    break
            except Exception:
                pass

        print(f"E2E_FLOORSOCC: agents={agents} initial={occ_initial} final={occ_final} scene={json.dumps(cafe)}")
        try:
            i = json.loads(occ_initial); f = json.loads(occ_final)
            ok = (agents >= 26 and sum(i.values()) == agents and sum(f.values()) >= 1
                  and f.get("L3", 0) > i.get("L3", 0))
        except Exception:
            ok = False
        print("E2E_FLOORSOCC: OK" if ok else "E2E_FLOORSOCC: FAIL")
    finally:
        p.terminate()


if __name__ == "__main__":
    main()
