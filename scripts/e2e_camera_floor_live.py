#!/usr/bin/env python3
"""E2E siklus 145: kamera pindah lantai TANPA agen → FloorNavigator ikut.

Bug yang diperbaiki: jalur kamera lintas lantai yang melewati onSelectAgent
tidak pernah melaporkan lantai ke App — window.__focusTeam (kartu "Fokus 3D"
TeamStats + TaskBoard) melompatkan kamera ke pod tim L1/L2/L3 sesuai
team_spec, dan focusMeetingRoom ke ruang rapat (L1), tapi tombol nav tetap
di lantai lama: founder melihat pod L3 sementara "L1 · Ops & AI" tetap aktif.

Langkah (semua via hook scene nyata window.__focusTeam/__focusMeetingRoom):
  1. Muat kantor, tunggu scene siap (agents>=26). Nav awal = L1.
  2. __focusTeam('core-be')  (pod Backend z=2)  → nav aktif HARUS L2.
  3. __focusTeam('qa-gov')   (pod QA z=8)       → nav aktif HARUS L3.
  4. __focusMeetingRoom()    (ruang rapat z=-3) → nav aktif HARUS L1.
Diskriminasi: kode lama → nav tetap L1 di semua langkah (FAIL).
Pemakaian: uv run --with websocket-client python scripts/e2e_camera_floor_live.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

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

        steps = [
            ("__focusTeam('core-be')", "L2"),       # pod Backend z=2
            ("__focusTeam('qa-gov')", "L3"),        # pod QA z=8
            ("__focusMeetingRoom()", "L1"),         # ruang rapat z=-3
        ]
        results = []
        for expr, want in steps:
            ev(expr)
            time.sleep(1.5)
            got = ev(ACTIVE_EXPR).get("value", "?")
            results.append((expr, want, got))

        cond = all(g == w for _, w, g in results)
        ok = (agents >= 26 and cond)
        detail = " ".join(f"[{e}→want {w} got {g}]" for e, w, g in results)
        print(f"E2E_CAMFLOOR: {'OK' if ok else 'FAIL'} agents={agents} {detail}")
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
