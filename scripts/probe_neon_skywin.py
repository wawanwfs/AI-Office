#!/usr/bin/env python3
"""Probe live: tint neon skyWin pada jendela dinding belakang/kiri.
Bug (ditemukan siklus 170): material jendela back/left di-KLON oleh collect()
wall-fade, skyWinMats masih pegang material asli -> tint neon 0x14213F meleset
pada 4 mesh itu (9 jendela lain gelap navy, 4 tetap putih terang).
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9464

env = dict(os.environ, DISPLAY=":99")
if subprocess.run(["xdpyinfo", "-display", ":99"], stdout=subprocess.DEVNULL,
                  stderr=subprocess.DEVNULL).returncode != 0:
    subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                      "--enable-unsafe-swiftshader", "--window-size=1366,768",
                      "--disable-dev-shm-usage", "about:blank"],
                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(2)
    tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
    wsu = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0]
    pr = urlparse(wsu)
    s = socket.create_connection((pr.hostname, pr.port))
    s.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
               "Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n").encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(1)
    mid = [0]

    def cmd(method, **params):
        mid[0] += 1
        d = json.dumps({"id": mid[0], "method": method, "params": params}).encode()
        h = b"\x81"; n = len(d); mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))
        s.settimeout(60)

        def rx(k):
            b = b""
            while len(b) < k:
                c = s.recv(k - len(b))
                if not c:
                    raise ConnectionResetError()
                b += c
            return b

        while True:
            hdr = rx(2); op = hdr[0] & 0xF; n = hdr[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", rx(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", rx(8))[0]
            d2 = rx(n)
            while op == 0:
                h2 = rx(2); op2 = h2[0] & 0xF; n2 = h2[1] & 0x7F
                if n2 == 126:
                    n2 = struct.unpack(">H", rx(2))[0]
                d2 += rx(n2)
                break
            r = json.loads(d2)
            if r.get("id") == mid[0]:
                return r

    def ev(expr):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        res = r.get("result", {}).get("result", {})
        if "exceptionDetails" in r.get("result", {}):
            raise RuntimeError(f"eval gagal: {json.dumps(r['result']['exceptionDetails'])[:400]}")
        return res.get("value")

    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)
    for _ in range(30):
        if ev("!!window.__scene && !!window.__skyCv && !!window.__toggleNeon") is True:
            break
        time.sleep(1)

    # pastikan neon OFF & waktu siang (720) supaya bersih dari day/night
    ev("(()=>{if(window.__toggleNeon())window.__toggleNeon();window.__setTime(720);return 1})()")
    time.sleep(0.8)

    PROBE = r"""(()=>{
  const cv=window.__skyCv, regs=window.__scene.__skyWinMats||null;
  const wins=[];
  window.__scene.traverse(o=>{if(o.isMesh&&o.material&&o.material.map&&o.material.map.image===cv)wins.push(o);});
  const walls=wins.map(o=>{const p=o.position;
    const w=Math.abs(p.x+17)<1?'left':(Math.abs(p.x-17)<1?'right':(p.z<0?'front':'back'));
    return {w,hex:o.material.color.getHexString(),rgb:[+o.material.color.r.toFixed(2),+o.material.color.g.toFixed(2),+o.material.color.b.toFixed(2)],op:o.material.opacity===undefined?null:+o.material.opacity.toFixed(2)};});
  return {n:wins.length,walls};
})()"""

    print("NEON-OFF:", json.dumps(ev(PROBE)))
    on = ev("window.__toggleNeon()")
    time.sleep(0.8)
    pr2 = ev(PROBE)
    print("NEON-ON:", json.dumps({"on": on, **pr2}))
    ev("window.__toggleNeon()")
    time.sleep(0.5)
    print("RESTORE:", json.dumps(ev(PROBE)))
finally:
    p.kill()
