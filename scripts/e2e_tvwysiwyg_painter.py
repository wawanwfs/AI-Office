#!/usr/bin/env python3
"""E2E WYSIWYG #2 — verifikasi colorSpace='srgb' dgn warna MEDIUM (badge hijau 16,229,160).
Fill kanvas TV dgn warna badge LIVE, screenshot, klasifikasi piksel dominan:
  exact (16,229,160)±12 dominan → srgb+unlit benar → WYSIWYG OK
  ~(70,244,208) → tekstur dianggap LINEAR (colorSpace salah)
  ~(20,218,148) dst → tone mapping masih aktif
Pemakaian: python3 e2e_tvwysiwyg_painter.py"""
import subprocess, os, time, urllib.request, json, base64, sys, struct, socket, zlib

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9359
URL = "http://127.0.0.1:9503/"
OUT = "/home/agentuser/.hermes/cache/scratch/tv_painter.png"
PAINTER = (16, 229, 160)
TOL = 12


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
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


AIM = r"""
(() => {
  if (!window.__scene || !window.__cam || !window.__camCam || !window.__tvCanvas) return 'no-scene';
  let mesh = null;
  window.__scene.traverse(o => {
    if (!mesh && o.isMesh && o.material && o.material.map && o.material.map.image === window.__tvCanvas) mesh = o;
  });
  if (!mesh) return 'no-mesh';
  mesh.updateWorldMatrix(true, false);
  const c = new (mesh.position.constructor)(0, 0, 0).applyMatrix4(mesh.matrixWorld);
  window.__cam.sph.radius = 2.6; window.__cam.sph.phi = 1.5; window.__cam.sph.theta = -Math.PI/2;
  window.__cam.tgt.set(c.x, c.y, c.z);
  window.__cam.upd();
  return JSON.stringify({tgt:[c.x,c.y,c.z], toneMapped: mesh.material.toneMapped,
                         colorSpace: mesh.material.map.colorSpace});
})()
"""

FILL = r"""
(() => {
  const c = window.__tvCanvas;
  const ctx = c.getContext('2d');
  ctx.save(); ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = 'rgb(16,229,160)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  let mesh = null;
  window.__scene.traverse(o => {
    if (!mesh && o.isMesh && o.material && o.material.map && o.material.map.image === c) mesh = o;
  });
  if (mesh) mesh.material.map.needsUpdate = true;
  return 'filled';
})()
"""


def load_png(p):
    data = open(p, 'rb').read()
    pos = 8; idat = b""; W = H = 0
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos+4])[0]; typ = data[pos+4:pos+8]
        if typ == b"IHDR":
            W, H = struct.unpack(">II", data[pos+8:pos+16])
        elif typ == b"IDAT":
            idat += data[pos+8:pos+8+ln]
        pos += 12 + ln
    raw = zlib.decompress(idat)
    img = bytearray(W*H*3); prev = bytearray(W*3); rp = 0
    for y in range(H):
        f = raw[rp]; rp += 1
        row = bytearray(raw[rp:rp+W*3]); rp += W*3
        if f == 1:
            for i in range(3, len(row)):
                row[i] = (row[i]+row[i-3]) & 0xff
        elif f == 2:
            for i in range(len(row)):
                row[i] = (row[i]+prev[i]) & 0xff
        elif f == 3:
            for i in range(len(row)):
                a = row[i-3] if i >= 3 else 0
                row[i] = (row[i]+((a+prev[i]) >> 1)) & 0xff
        elif f == 4:
            for i in range(len(row)):
                a = row[i-3] if i >= 3 else 0; b = prev[i]; c = prev[i-3] if i >= 3 else 0
                pa = abs(b-c); pb = abs(a-c); pc = abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[i] = (row[i]+pr) & 0xff
        img[y*W*3:(y+1)*W*3] = row; prev = row
    return W, H, img


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not os.path.exists("/tmp/.X11-unix/X99"):
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

        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            for _ in range(300):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        cmd("Page.enable"); cmd("Runtime.enable")
        for _ in range(40):
            time.sleep(0.5)
            r = cmd("Runtime.evaluate", expression="JSON.stringify({a: window.__agentData?window.__agentData.length:-1, tv: !!window.__tvCanvas, sc: !!window.__scene})")
            try:
                st = json.loads(r["result"]["result"].get("value", "{}"))
            except Exception:
                st = {}
            if st.get("a", -1) > 0 and st.get("tv") and st.get("sc"):
                break
        r = cmd("Runtime.evaluate", expression=AIM, returnByValue=True)
        val = r["result"]["result"].get("value")
        if not val or val in ("no-scene", "no-mesh"):
            print("PROBE_FAIL:", val); sys.exit(1)
        v = json.loads(val)
        print("MESH: toneMapped=", v["toneMapped"], "colorSpace=", v["colorSpace"])
        cmd("Runtime.evaluate", expression=FILL)
        time.sleep(0.5)
        cmd("Runtime.evaluate", expression=FILL)
        time.sleep(0.15)
        shot = cmd("Page.captureScreenshot", format="png")
        open(OUT, "wb").write(base64.b64decode(shot["result"]["data"]))
        W, H, img = load_png(OUT)
        pr, pg, pb = PAINTER
        exact = 0
        best = None; bd = 1e18
        from collections import Counter
        cnt = Counter()
        for i in range(0, W*H*3, 3):
            r8, g8, b8 = img[i], img[i+1], img[i+2]
            d2 = (r8-pr)**2 + (g8-pg)**2 + (b8-pb)**2
            if d2 <= TOL*TOL*3:
                exact += 1
            cnt[(r8//8*8, g8//8*8, b8//8*8)] += 1
            if d2 < bd:
                bd = d2; best = (r8, g8, b8)
        top = cnt.most_common(3)
        print(f"EXACT(px±{TOL}): {exact}")
        print("TOP_BUCKETS:", top)
        print("NEAREST:", best, "dist=", round(bd**0.5, 1))
        if exact > 30000:
            print("E2E_TV_PAINTER: OK (WYSIWYG 1:1)")
            sys.exit(0)
        print("E2E_TV_PAINTER: SHIFTED")
        sys.exit(2)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
