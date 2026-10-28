#!/usr/bin/env python3
"""E2E siklus 142: badge Lokasi Lantai AgentInspector LIVE di scene NYATA.

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Pilih agen meja L1 (indeks 0 = BANTUIN AI, meja z=-3 → L1) via
     __wfsSceneSelect → badge awal "L1 · Ops & AI".
  3. __setTime(720) (jendela makan siang 12:00) → daycycle mengirim agen ke
     Executive Cafe L3 (walker berjalan, z melampaui 4.5) → badge berubah
     "L3 · Executive" via polling 1 dtk TANPA buka-tutup kartu.
Pemakaian: uv run --with websocket-client python scripts/e2e_inspector_floor.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9463
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

        # Badge lantai kartu: div setelah label 'Lokasi Lantai'
        FLOOR_EXPR = ("(()=>{const chip=document.querySelector('.agent-inspector');"
                      "if(!chip)return '(kartu tidak ada)';"
                      "const lab=[...chip.querySelectorAll('span')].find(s=>s.textContent.trim()==='Lokasi Lantai');"
                      "if(!lab)return '(label Lokasi Lantai tidak ada: '+chip.textContent.slice(0,120)+')';"
                      "const val=lab.parentElement.parentElement.querySelector('div[style] div');"
                      "const btn=lab.closest('button');"
                      "return 'FLOOR:'+(btn?btn.textContent.replace('Lokasi Lantai','').replace('FOKUS','').replace('↗','').trim():'?');})()")

        # agen meja L1: indeks 0 (BANTUIN AI, meja z=-3). Jam simulasi pagi (480 = 08:00,
        # semua sudah arriving/working — bukan lunch).
        ev("window.__setTime(480)")
        ev("window.__wfsSceneSelect('ai-cs')")
        time.sleep(1.5)
        floor_initial = ev(FLOOR_EXPR).get("value", "?")

        # entry scene awal
        z0 = ev("(()=>{const e=(window.__agentData||[])[0];return e?JSON.stringify({z:e.walker&&e.walker.visible?e.walker.position.z:(e.sittingChar?e.sittingChar.position.z:null),state:e.state,lunch:!!e.lunch}):'none'})()").get("value", "?")

        # 12:00 — lunch window: agen jalan ke Executive Cafe L3 (z≈5.6).
        # Walker ~1.3 m/s (WALK_SPEED) + rute koridor: perjalanan L1→L3 bisa ~40 dtk.
        ev("window.__setTime(720)")
        floor_final = None
        scene_final = {}
        for _ in range(40):
            time.sleep(1.5)
            st = ev("(()=>{const e=(window.__agentData||[])[0];if(!e)return '{}';const z=e.walker&&e.walker.visible?e.walker.position.z:(e.sittingChar?e.sittingChar.position.z:null);return JSON.stringify({z,state:e.state,lunch:!!e.lunch})})()").get("value", "{}")
            try:
                scene_final = json.loads(st)
            except Exception:
                scene_final = {}
            floor_final = ev(FLOOR_EXPR).get("value", "?")
            if str(floor_final).startswith("FLOOR:L3"):
                break

        print(f"E2E_INSPECTOR_FLOOR: agents={agents} initial={floor_initial!r} entry0={z0} "
              f"final={floor_final!r} scene={json.dumps(scene_final)}")
        ok = (agents >= 26 and str(floor_initial).startswith("FLOOR:L1")
              and str(floor_final).startswith("FLOOR:L3"))
        print("E2E_INSPECTOR_FLOOR: OK" if ok else "E2E_INSPECTOR_FLOOR: FAIL")
    finally:
        p.terminate()


if __name__ == "__main__":
    main()
