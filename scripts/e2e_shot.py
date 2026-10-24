#!/usr/bin/env python3
"""E2E visual check kantor 3D WFS HQ (pengganti shot.sh yang hilang).
Render via chrome-headless-shell + Xvfb (WebGL butuh X display; --headless murni
GAGAL buat konteks WebGL di VM ini). Setelah render:
  - cek window.__agentData (14 agent), __wallState, __dbg
  - cek banner 'Scene 3D tidak aktif' TIDAK muncul
  - simpan screenshot PNG + cetak ukuran file (scene mati < 500KB)
Pemakaian: uv run scripts/e2e_shot.py [output.png]
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shot9503.png"
CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9339
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
        def frame():
            hdr = s.sock.recv(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126:
                n = struct.unpack(">H", s.sock.recv(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", s.sock.recv(8))[0]
            d = b""
            while len(d) < n:
                d += s.sock.recv(n - len(d))
            return op, d
        op, d = frame()
        while op == 0:  # continuation frame: akumulasi sampai frame final
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return d.decode("utf-8", "replace")


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
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
            for _ in range(300):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # beri waktu scene init + beberapa frame animasi
        r = cmd("Runtime.evaluate", expression=(
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " ws: !!window.__wallState, dbg: window.__dbg ? window.__dbg() : null,"
            " uiOnly: document.body.innerText.includes('Scene 3D tidak aktif')})"))
        state = json.loads(r["result"]["result"].get("value", "{}"))
        print("STATE:", json.dumps(state))
        r = cmd("Page.captureScreenshot", format="png")
        open(OUT, "wb").write(base64.b64decode(r["result"]["data"]))
        size = os.path.getsize(OUT)
        print(f"SHOT: {OUT} {size} bytes")
        ok = (not state.get("uiOnly") and state.get("agents", -1) > 0
              and state.get("ws") and size > 500_000)
        print("E2E_VISUAL:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill(); xv.kill()


if __name__ == "__main__":
    main()
