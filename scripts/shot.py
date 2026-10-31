#!/usr/bin/env python3
"""shot.py — pengganti permanen scratch shot.sh (hilang diprune TMPDIR 24 jam,
siklus 185). Screenshot halaman :9503 via CDP chrome-headless-shell di Xvfb :99.

Pemakaian: python3 scripts/shot.py W H out.png
  W/H  ukuran window (mis. 1366 768; mobile: 390 800)
  out  path PNG keluaran

Ambang kesehatan scene tetap diperiksa PEMAKAI (file > 500 KB = scene hidup;
lebih kecil = scene mati — JANGAN push). Untuk gate otomatis penuh
(0 error + hooks + ambang) pakai scripts/e2e_err_probe.py.
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9462
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
        if n < 126: h += bytes([0x80 | n])
        else: h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv_text(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionError("ws closed")
                b += c
            return b

        def frame():
            hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126: n = struct.unpack(">H", rx(2))[0]
            elif n == 127: n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)

        op, d = frame()
        while op == 0:  # continuation frame
            op, d2 = frame(); d += d2
            if op != 0: break
        return d.decode("utf-8", "replace")


def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    W = int(sys.argv[1]) if len(sys.argv) > 1 else 1366
    H = int(sys.argv[2]) if len(sys.argv) > 2 else 768
    out = sys.argv[3] if len(sys.argv) > 3 else "ck.png"
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        try:
            if os.path.exists("/tmp/.X11-unix/X99") and not x99_alive():
                os.remove("/tmp/.X11-unix/X99")
        except OSError:
            pass
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", f"{max(W, 1366)}x{max(H, 768)}x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", f"--window-size={W},{H}",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(ws.recv_text())
                if r.get("id") == mid[0]: return r

        cmd("Page.enable")
        time.sleep(18)  # scene init + settle visual (paritas shot.sh)
        shot = cmd("Page.captureScreenshot", format="png")
        data = base64.b64decode(str((shot.get("result") or {}).get("data") or ""))
        open(out, "wb").write(data)
        print(f"SHOT {out}: {len(data)} bytes")
        sys.exit(0 if len(data) > 0 else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()


if __name__ == "__main__":
    main()
