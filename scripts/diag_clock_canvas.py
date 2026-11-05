#!/usr/bin/env python3
"""diag_clock_canvas.py — dump mentah piksel kanvas jam 96×96 dari scene live
untuk analisis ground truth (T1/T2 probe 267). Simpan PNG + ASCII art."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = int(os.environ.get("DIAG_PORT", "9510"))
OUT = os.environ.get("DIAG_OUT", "/tmp/clock_dump.json")


def main():
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", "http://127.0.0.1:9503/app/"],
                         env=dict(os.environ, DISPLAY=":99"),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(6)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        wsu = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0]
        pr = urlparse(wsu)
        s = socket.create_connection((pr.hostname, pr.port), timeout=60)
        s.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                   "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                   f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                   "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += s.recv(1)
        mid = [0]

        def ev(expr, tmo=40):
            mid[0] += 1
            d = json.dumps({"id": mid[0], "method": "Runtime.evaluate",
                            "params": {"expression": expr, "returnByValue": True}}).encode()
            h = b"\x81"
            n = len(d)
            mask = os.urandom(4)
            h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
            s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))
            t0 = time.time()
            while time.time() - t0 < tmo:
                try:
                    hdr = s.recv(2)
                except socket.timeout:
                    continue
                if len(hdr) < 2:
                    return {}
                ln = hdr[1] & 0x7F
                if ln == 126:
                    ln = struct.unpack(">H", s.recv(2))[0]
                elif ln == 127:
                    ln = struct.unpack(">Q", s.recv(8))[0]
                data = b""
                while len(data) < ln:
                    c = s.recv(ln - len(data))
                    if not c:
                        break
                    data += c
                m = json.loads(data.decode())
                if m.get("id") == mid[0]:
                    rr = m.get("result", {})
                    v = rr.get("result", rr)
                    if isinstance(v, dict) and "value" in v and "type" in v:
                        return v["value"]
                    return v
            raise TimeoutError(expr[:50])

        def frames():
            r = ev("window.__animFrames||0")
            return r if isinstance(r, (int, float)) else 0

        time.sleep(10)
        f0 = frames()
        ev("window.__setTime(630)")
        # tunggu frame melewati kelipatan 20
        t0 = time.time()
        while time.time() - t0 < 400:
            f = frames()
            if f and (f // 20) > (f0 // 20):
                break
            time.sleep(1.5)
        time.sleep(1.5)
        f1 = frames()
        px = ev(r"""(() => { let cv=null; window.__scene.traverse(o=>{ if(!cv&&o.isMesh&&o.geometry&&o.geometry.type==='CircleGeometry'&&o.material&&o.material.map&&o.material.map.image&&o.material.map.image.width===96) cv=o.material.map.image; }); if(!cv) return null; return Array.from(cv.getContext('2d').getImageData(0,0,96,96).data); })()""")
        if not px:
            print("NO PIXELS")
            return 1
        with open(OUT, "w") as fh:
            json.dump({"frames": [f0, f1], "px": px}, fh)
        # ASCII render (downsample 2× → 48×48)
        rows = []
        for y in range(0, 96, 2):
            row = ""
            for x in range(0, 96, 2):
                i = (y * 96 + x) * 4
                r, g, b, a = px[i], px[i + 1], px[i + 2], px[i + 3]
                if a < 128:
                    row += "."
                elif r > 200 and 60 < g < 160 and b < 80:
                    row += "O"  # oranye (detik)
                elif r < 100 and g < 100 and b < 100:
                    row += "#"  # gelap (jam/menit/tick)
                else:
                    row += " "
            rows.append(row)
        print(f"frames {f0}→{f1}")
        print("\n".join(rows))
        return 0
    finally:
        p.terminate()


if __name__ == "__main__":
    sys.exit(main())
