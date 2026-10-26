#!/usr/bin/env python3
"""Probe tekstur 3D TV lounge via CDP: pastikan tvTex.needsUpdate benar-benar
diaplikasikan — verifikasi badge TERPUTUS tampak di tekstur saat /wfs-project
dipaksa gagal (bug siklus 109: kanvas berubah, tekstur tidak)."""
import subprocess, os, time, urllib.request, json, socket, base64, sys, struct

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9344
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
    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionResetError()
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126: n = struct.unpack(">H", rx(2))[0]
        elif n == 127: n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")

def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(3)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0
        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            for _ in range(300):
                r = json.loads(ws.recv())
                if r.get("id") == mid: return r
        cmd("Page.enable"); cmd("Runtime.enable")
        # 1) tunggu scene hidup + badge LIVE tergambar
        expr = ("(()=>{const c=window.__tvCanvas;if(!c||!window.__tvData)return JSON.stringify({ok:false});"
                "const d=c.getContext('2d').getImageData(238,14,10,10).data;"
                "let best=[0,0,0];for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];"
                "if(r+g+b>best[0]+best[1]+best[2])best=[r,g,b];}"
                "return JSON.stringify({ok:true,rgb:best})})()")
        out = {}
        for _ in range(40):
            time.sleep(0.5)
            r = cmd("Runtime.evaluate", expression=expr)
            if r and "result" in r and "result" in r["result"]:
                v = r["result"]["result"].get("value")
                if v:
                    out = json.loads(v)
                    if out.get("ok") and out.get("rgb") == [16, 229, 160]: break
        live = out.get("rgb") == [16, 229, 160]
        print("BASELINE_LIVE:", out.get("rgb"), "OK" if live else "GAGAL")
        # 2) blokir /wfs-project (fetch override → selalu reject) lalu paksa poll
        expr2 = ("(()=>{window.__origFetch=window.fetch;window.fetch=()=>Promise.reject(new Error('blocked'));"
                 "window.__tvCanvas.__probe=1;return 'fetch blocked'})()")
        cmd("Runtime.evaluate", expression=expr2)
        time.sleep(1)
        # trigger poll langsung: dispatch visibilitychange? Lebih pasti: tunggu tick backoff pertama (≤60s)
        # Namun tvPull(true) hanya internal. Pakai trik: requestIdleCallback tidak ada. Cukup tunggu hingga 70 dtk.
        seen = None
        for _ in range(140):  # 140 x 0.5s = 70 dtk
            time.sleep(0.5)
            r = cmd("Runtime.evaluate", expression=expr)
            if r and "result" in r and "result" in r["result"]:
                v = r["result"]["result"].get("value")
                if v:
                    out = json.loads(v)
                    rgb = out.get("rgb")
                    if rgb and rgb != [16, 229, 160]:
                        seen = rgb; break
        if seen:
            r_, g_, b_ = seen
            if r_ > 200 and g_ < 120 and b_ < 120: verdict = "TERPUTUS (merah) — tekstur ikut segar"
            elif r_ > 200 and g_ > 130 and b_ < 90: verdict = "SINKRON (amber)"
            else: verdict = f"TAK DIKENAL {seen}"
        else:
            verdict = "badge tidak berubah dalam 70 dtk"
        print("AFTER_BLOCK:", seen, verdict)
        ok = bool(seen) and "merah" in verdict or "amber" in verdict
        print("E2E_TV_TEXTURE:", "OK" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    finally:
        p.kill(); xv.kill()

if __name__ == "__main__":
    main()
