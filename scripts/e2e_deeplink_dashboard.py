#!/usr/bin/env python3
"""E2E deep-link landing → Dashboard (siklus 159) — CDP :99, produksi :9503.

3 keadaan (diskriminasi):
  A. /app/#dashboard  → Dashboard TERBUKA on-mount (dialog [aria-label=Dashboard]).
  B. /app/ (bersih)   → Dashboard TERTUTUP.
  C. fallback localStorage 'wfs_open_dashboard' → Dashboard TERBUKA sekali,
     flag dikonsumsi (kunjungan berikutnya tak auto-buka).
Exit 0 hanya bila A & C benar dan B tertutup.
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9455
BASE = "http://127.0.0.1:9503"


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
                b += c
            return b

        def frame():
            hdr = rx(2); op = hdr[0] & 0xF; n = hdr[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", rx(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)

        op, d = frame()
        while op == 0:
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return op, d


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if subprocess.run(["xdpyinfo", "-display", ":99"], stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL).returncode != 0:
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", "about:blank"],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = False
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            ws.sock.settimeout(30)
            while True:
                op, payload = ws.recv()
                r = json.loads(payload)
                if r.get("id") == mid[0]:
                    return r

        def nav(url):
            cmd("Page.enable")
            cmd("Page.navigate", url=url)
            time.sleep(7)  # mount App + lazy scene

        def dash_open():
            r = cmd("Runtime.evaluate",
                    expression="!!document.querySelector('div#dashboard[role=dialog]')",
                    returnByValue=True)
            return r["result"]["result"].get("value") is True

        # A. deep-link hash
        nav(BASE + "/app/#dashboard")
        a = dash_open()
        # B. bersih (tab sama, tanpa hash)
        nav(BASE + "/app/")
        b_open = dash_open()
        # C. fallback localStorage: set flag saat app hidup → reload → mount dgn flag
        cmd("Runtime.evaluate", expression="localStorage.setItem('wfs_open_dashboard','1')")
        cmd("Page.navigate", url=BASE + "/app/")
        time.sleep(7)
        c_first = dash_open()
        flag_left = cmd("Runtime.evaluate", expression="localStorage.getItem('wfs_open_dashboard')",
                        returnByValue=True)["result"]["result"].get("value")
        cmd("Page.navigate", url=BASE + "/app/")
        time.sleep(7)
        c_second_open = dash_open()

        ok = a and (not b_open) and c_first and (flag_left is None) and (not c_second_open)
        print(f"A deeplink-hash buka={a} | B bersih buka={b_open} (harus False) | "
              f"C fallback buka={c_first} flag_konsumsi={flag_left is None} "
              f"kunjungan-2 buka={c_second_open} (harus False) => {'OK' if ok else 'FAIL'}")
        sys.exit(0 if ok else 1)
    finally:
        p.terminate()
        try:
            p.wait(3)
        except Exception:
            p.kill()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
