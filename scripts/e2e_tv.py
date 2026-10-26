#!/usr/bin/env python3
"""E2E verifikasi TV lounge live-data (kantor 3D WFS HQ).

TV lounge menggambar dashboard dari window.__tvData (fetch /wfs-project tiap 60s
+ saat tab visible). Harness ini memastikan:
  1. window.__tvData ADA (fetch berhasil) dgn tasks.total/done numerik
  2. window.__lastTvDrawAt di-set saat drawTv terakhir (bukti canvas digambar ulang)
  3. persen dihitung = round(done/total*100)
Output: E2E_TV OK / FAIL + detail JSON.
Pemakaian: uv run scripts/e2e_tv.py
"""
import subprocess, os, time, urllib.request, json, socket, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9341
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
        def recv_exact(n):
            b = b""
            while len(b) < n:
                chunk = s.sock.recv(n - len(b))
                if not chunk: raise ConnectionResetError("socket closed")
                b += chunk
            return b

        def frame():
            hdr = recv_exact(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126:
                n = struct.unpack(">H", recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", recv_exact(8))[0]
            return op, recv_exact(n)
        op, d = frame()
        while op == 0:
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return d.decode("utf-8", "replace")


import struct  # noqa: E402  (dipakai WS.send untuk payload > 125 byte)


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
        st = {}
        for _ in range(40):
            time.sleep(0.5)
            r = cmd("Runtime.evaluate", expression=(
                "JSON.stringify({tv: window.__tvData || null,"
                " drawnAt: window.__lastTvDrawAt || 0,"
                " agents: window.__agentData ? window.__agentData.length : -1})"))
            if r and "result" in r and "result" in r["result"]:
                st = json.loads(r["result"]["result"].get("value", "{}"))
                if st.get("tv") and st.get("drawnAt", 0) > 0 and st.get("agents", -1) > 0:
                    break
        tv = st.get("tv") or {}
        t = tv.get("tasks") or {}
        total, done = t.get("total", 0), t.get("done", 0)
        pct = round(done / total * 100) if total else 0
        ok = (isinstance(total, int) and total >= 0 and isinstance(done, int)
              and 0 <= done <= max(total, 0) and tv.get("at", 0) > 0
              and st.get("drawnAt", 0) > 0 and st.get("agents", -1) > 0)
        print("STATE:", json.dumps({"tasks": t, "at": tv.get("at"), "drawnAt": st.get("drawnAt"),
                                    "pct": pct, "agents": st.get("agents")}))
        print("E2E_TV:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill(); xv.kill()


if __name__ == "__main__":
    main()
