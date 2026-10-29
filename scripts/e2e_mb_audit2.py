#!/usr/bin/env python3
"""Audit pass-2 — sampel rata-rata kecerahan kanvas tiap map unik pada MB terang (malam)."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9463

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
    time.sleep(20)
    ev("window.__setTime(0)")
    time.sleep(1.5)

    EXPR = r"""(() => {
  const seen = new Map(); // map uuid -> info
  const avgCache = new Map();
  function avgOf(map){
    const img = map && map.image;
    if(!img || !img.width) return null;
    if(avgCache.has(img)) return avgCache.get(img);
    let v = {avg: null, size: [img.width, img.height]};
    try{
      const c = document.createElement('canvas');
      const w = Math.min(img.width, 64), h = Math.min(img.height, 64);
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0,0,w,h).data;
      let r=0,g=0,b=0,n=0;
      for(let i=0;i<d.length;i+=4){ if(d[i+3]>40){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; } }
      v.avg = n? [Math.round(r/n), Math.round(g/n), Math.round(b/n)] : [0,0,0];
    }catch(e){ v.avg = ['ERR', String(e).slice(0,40)]; }
    avgCache.set(img, v);
    return v;
  }
  const out = [];
  window.__scene.traverse(o => {
    if(!o.isMesh || !o.visible) return;
    const mats = Array.isArray(o.material)? o.material : [o.material];
    for(const m of mats){
      if(!m || !m.isMeshBasicMaterial) continue;
      const c = m.color||{r:0,g:0,b:0};
      const rgb=[Math.round(c.r*255),Math.round(c.g*255),Math.round(c.b*255)];
      const lum=0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
      const av = m.map? avgOf(m.map) : null;
      const avArr = av && av.avg && (typeof av.avg[0]==='number' || typeof av.avg[0]==='string') ? av.avg : null;
      const avLum = avArr? Math.round(0.2126*avArr[0]+0.7152*avArr[1]+0.0722*avArr[2]) : null;
      const gp=o.geometry&&o.geometry.parameters?o.geometry.parameters:{};
      if(m.map || lum>110){
        const key = m.map? ('M'+m.map.uuid) : ('C'+rgb.join(','));
        if(!seen.has(key)){
          seen.set(key, {map:!!m.map, rgb, avg:avArr, avgLum:avLum, size:av?av.size:null,
            geo:o.geometry.type, dim:gp.width?[+gp.width.toFixed(2),+((gp.height||gp.depth||0).toFixed(2))]:null,
            samplePos:o.position?[+o.position.x.toFixed(1),+o.position.y.toFixed(1),+o.position.z.toFixed(1)]:null});
        }
        const e=seen.get(key); e.n=(e.n||0)+1;
      }
      break;
    }
  });
  return [...seen.values()];
})()"""
    rows = ev(EXPR) or []
    rows.sort(key=lambda r: -( (r['dim'] and r['dim'][0]*r['dim'][1]) or 0))
    print(f"{'n':>3} {'size':>10} {'dim':>12} {'rgb':>15} {'avg':>15} {'avgL':>4}  pos / geo")
    for r in rows:
        print(f"{r.get('n',0):>3} {str(r['size']):>10} {str(r['dim']):>12} {str(r['rgb']):>15} "
              f"{str(r['avg'])[:15]:>15} {str(r['avgLum']):>4}  {r['samplePos']} {r['geo']}")
    json.dump(rows, open(os.path.expanduser("~/.hermes/cache/scratch/mb_audit_map.json"), "w"))
finally:
    try:
        p.kill()
    except Exception:
        pass
    if xv:
        xv.terminate()
