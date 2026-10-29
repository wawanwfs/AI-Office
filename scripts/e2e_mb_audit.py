#!/usr/bin/env python3
"""Audit objektif siklus 166 — enumerasi MeshBasicMaterial terang saat malam (CDP :99).
Latar: siklus 164 (jendela) & 165 (dinding) = bug kelas sama (elemen statis "selalu
terang" tidak ikut siklus siang↔malam). Skrip ini TIDAK menebak: ia traverse scene
live via window.__scene saat __setTime(0) (malam penuh) dan mencantumkan SEMUA mesh
MeshBasicMaterial yang masih terang (lum > 110 atau ada map dengan avg piksel terang).
Output: tabel kandidat + JSON ringkas utk analisis."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9462

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
    time.sleep(20)  # scene init
    if not ev("typeof window.__scene === 'object' && typeof window.__setTime === 'function'"):
        print("FAIL: __scene/__setTime tidak ada")
        sys.exit(2)

    # Malam penuh
    ev("window.__setTime(0)")
    time.sleep(1.5)
    night_state = ev("({sky: window.__skyNight(), wall: window.__wallNight()})")
    print(f"state malam: {night_state}")

    # Enumerasi MB terang — warna solid terang (lum>110) ATAU bertekstur map
    EXPR = r"""(() => {
  const out = [];
  window.__scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || !m.isMeshBasicMaterial) continue;
      const c = m.color || {r:0,g:0,b:0};
      const rgb = [Math.round(c.r*255), Math.round(c.g*255), Math.round(c.b*255)];
      const lum = 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2];
      const gp = o.geometry && o.geometry.parameters ? o.geometry.parameters : {};
      const dim = gp.width ? (Math.max(gp.width, gp.height||gp.depth||1)) : null;
      if (m.map || lum > 110) {
        out.push({name: o.name || '', geo: o.geometry && o.geometry.type,
          dim: dim ? [ +(gp.width.toFixed(2)), +( (gp.height||gp.depth||0).toFixed(2) ) ] : null,
          rgb, lum: Math.round(lum), map: !!m.map, op: m.opacity,
          pos: o.position ? [ +o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1) ] : null,
          py: o.parent && o.parent.name ? o.parent.name : (o.parent && o.parent.type)});
      }
      break;
    }
  });
  return out;
})()"""
    rows = ev(EXPR) or []
    print(f"total kandidat: {len(rows)}")
    # kelompokkan per (geo,dim,rgb,map) utk ringkas
    agg = {}
    for r0 in rows:
        k = json.dumps([r0["geo"], r0["dim"], r0["rgb"], r0["map"], r0["name"]], ensure_ascii=False)
        a = agg.setdefault(k, {"cnt": 0, "pos": []})
        a["cnt"] += 1
        if len(a["pos"]) < 3:
            a["pos"].append(r0["pos"])
    for k, a in sorted(agg.items(), key=lambda kv: -kv[1]["cnt"]):
        print(f"{a['cnt']:4d}x {k}  contoh pos={a['pos']}")
    json.dump(rows, open(os.path.expanduser("~/.hermes/cache/scratch/mb_audit_night.json"), "w"))
    print("detail tersimpan mb_audit_night.json")
finally:
    try:
        p.kill()
    except Exception:
        pass
    if xv:
        xv.terminate()
