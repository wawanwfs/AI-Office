#!/usr/bin/env python3
"""E2E WYSIWYG warna UI 3D — probe v4 (deteksi piksel murni, tanpa proyeksi).
 1. Temukan mesh layar TV via scene graph; kamera frontal; isi kanvas TV MAGENTA solid.
 2. Re-fill tepat sebelum screenshot (drawTv timer bisa menimpa di antara).
 3. Screenshot → cari piksel MAGENTA KETAT (255,0,255)±10 di seluruh gambar:
    - bbox ketat dgn luas >30k px² & isi>0.6 → layar merender warna EXAK → WYSIWYG OK
    - hanya magenta LOOSE (r>180,g<120,b>180 dgn deviasi) → tone mapping masih aktif → SHIFTED
    - tidak keduanya → TV tak terlihat → PROBE_FAIL"""
import subprocess, os, time, urllib.request, json, base64, sys, struct, socket, zlib

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9357
URL = "http://127.0.0.1:9503/"
OUT = "/home/agentuser/.hermes/cache/scratch/tv_wysiwyg4.png"


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
  ctx.fillStyle = 'rgb(255,0,255)';
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


def analyze(W, H, img):
    strict = []
    loose = 0
    for y in range(H):
        base = y*W*3
        for x in range(W):
            i = base + x*3
            r8, g8, b8 = img[i], img[i+1], img[i+2]
            if abs(r8-255) <= 10 and g8 <= 10 and abs(b8-255) <= 10:
                strict.append((x, y))
            elif r8 > 180 and g8 < 120 and b8 > 180:
                loose += 1
    if not strict:
        return None, 0, 0, loose
    xs = [p[0] for p in strict]; ys = [p[1] for p in strict]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    area = (x1-x0+1)*(y1-y0+1)
    inside = 0
    sset = set(strict)
    for y in range(y0, y1+1):
        for x in range(x0, x1+1):
            if (x, y) in sset:
                inside += 1
    return (x0, y0, x1, y1), area, inside/area, loose


def _x99_alive():
    """Cek X server :99 hidup (bukan cuma socket basi — pelajaran siklus 127/
    128: probe sebelumnya men-terminate Xvfb-nya sendiri di finally dan socket
    basi membuat auto-start run berikutnya skip → probe 'scene tidak siap')."""
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

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
        print("MESH: toneMapped=", v["toneMapped"], "colorSpace=", v["colorSpace"], "tgt=", [round(x, 2) for x in v["tgt"]])
        cmd("Runtime.evaluate", expression=FILL)
        time.sleep(0.5)
        cmd("Runtime.evaluate", expression=FILL)  # re-fill tepat sebelum capture
        time.sleep(0.15)
        shot = cmd("Page.captureScreenshot", format="png")
        open(OUT, "wb").write(base64.b64decode(shot["result"]["data"]))
        W, H, img = load_png(OUT)
        bbox, area, fill_ratio, loose = analyze(W, H, img)
        if bbox:
            print(f"STRICT magenta bbox={bbox} area={area} fill={fill_ratio:.3f}")
        print(f"LOOSE magenta-ish px={loose}")
        if bbox and area > 30000 and fill_ratio > 0.6:
            print("E2E_TV_WYSIWYG: OK")
            sys.exit(0)
        if loose > 30000:
            print("E2E_TV_WYSIWYG: SHIFTED (magenta ter-tonemap)")
            sys.exit(2)
        print("PROBE_FAIL: TV magenta tidak terdeteksi (oklusi/kamera bergerak)")
        sys.exit(3)
    finally:
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
