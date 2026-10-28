#!/usr/bin/env python3
"""E2E regresi "bubble chat bocor tekstur GPU" (siklus 122).

Bug lama (sebelum siklus 122): setiap bubble chat membuat CanvasTexture baru
(360x76) tapi SEMUA jalur penghapusannya hanya material.dispose():
  1) early-replace (bubble agen sama / posisi <1.2m),
  2) eviksi MAX_BUBBLES (batas 2-3 aktif),
  3) expiry life<=0 via updateBubbles.
Teksurnya sendiri TIDAK PERNAH di-dispose → tiap tekstur mati menumpuk di
VRAM selamanya. Sumber bubble: autoTalk (~8 dtk), chat pasangan dekat, klik
papan/whiteboard → kantor display :9503 yang jalan berhari-hari menumpuk
ribuan tekstur mati (memori GPU proses naik monoton).

Perbaikan siklus 122 (parts/bubbles.js::disposeBubble):
  map tekstur di-dispose SEBELUM material di ketiga jalur.

Langkah probe (scene NYATA, WebGL SwiftShader):
  1. Wrap gl.createTexture / gl.deleteTexture pada konteks WebGL nyata
     (window.__renderer.getContext()) — hitung alokasi & dealokasi tekstur
     GPU nyata. (info.memory.textures kurang informatif: dgn kode baru,
     eviksi MAX_BUBBLES langsung membuang → counter live tidak berubah.)
  2. Snapshot counter → spawn 1 bubble tiap 4.5 dtk × 8 (jalur asli
     createBubble via window.__spawnBubble). Interval > life 3.5 dtk →
     array TIDAK penuh (eviksi jarang) → tiap tekstur sempat ter-upload
     lalu mati via expiry (bukan eviksi) → pembeda murni jalur updateBubbles.
  3. Tunggu expiry terakhir + margin → snapshot counter lagi.
Pembeda:
  - Kode BARU: tekstur didelete saat expiry/early-replace → deleted ≥
    created - margin (sisa = bubble masih hidup + autoTalk latar).
  - Kode LAMA: deleted ≈ 0 (tekstur mati menumpuk) — kebocoran terdeteksi.
Pemakaian: uv run scripts/e2e_bubble_leak.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9458
URL = "http://127.0.0.1:9503/"
N_SPAWN = 8       # jumlah bubble (spawn bertahap 1 per SPAWN_EVERY dtk)
SPAWN_EVERY = 4.5  # > life 3.5 dtk → array tak penuh, expiry (bukan eviksi)

WRAP_EXPR = """
JSON.stringify((()=>{
  const r=window.__renderer; if(!r)return null;
  const gl=r.getContext(); if(!gl)return null;
  if(gl.__leakWrap)return {ok:true,already:true};
  const oC=gl.createTexture.bind(gl), oD=gl.deleteTexture.bind(gl);
  gl.__leak={created:0,deleted:0};
  gl.createTexture=(...a)=>{gl.__leak.created++;return oC(...a)};
  gl.deleteTexture=(...a)=>{gl.__leak.deleted++;return oD(...a)};
  gl.__leakWrap=true;
  return {ok:true};
})())
"""
SNAP_EXPR = ("JSON.stringify(window.__renderer&&window.__renderer.getContext().__leak?"
             "window.__renderer.getContext().__leak:null)")
SPAWN_HOOK = (
    "JSON.stringify((window.__spawnBubble?(function(){"
    "window.__spawnBubble(-9+(Math.floor(Math.random()*12)-6)*1.5, 2.2,"
    " -6+(Math.floor(Math.random()*10)-5)*1.5,"
    " 'probe-leak-'+Date.now(), '#10E5A0', null);return 1;})():null))"
)
BUB_N = "JSON.stringify(window.__bubbles?window.__bubbles.length:-1)"


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
        while op == 0:  # continuation frame
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return d.decode("utf-8", "replace")


def jval(v):
    """ev() mengembalikan string JSON.stringify → parse ke nilai Python."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return None
    return v


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
            for _ in range(600):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            val = (res.get("result") or {}).get("value")
            return val

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        st0 = jval(ev(
            "JSON.stringify({agents: window.__agentData ? window.__agentData.length : -1,"
            " cam: !!window.__camCam, ws: !!window.__wallState, dbg: !!window.__dbg,"
            " rend: !!window.__renderer, bub: !!window.__bubbles})"))
        print("STATE0:", json.dumps(st0))
        if (not isinstance(st0, dict) or st0.get("agents", -1) <= 0 or not st0.get("ws")
                or not st0.get("cam") or not st0.get("dbg") or not st0.get("rend")
                or not st0.get("bub")):
            print("E2E_BUBBLELEAK: FAIL (scene tidak siap)")
            sys.exit(1)

        # ── 1. wrap konteks WebGL dgn counter create/delete texture ──
        w = jval(ev(WRAP_EXPR))
        if not w or not w.get("ok"):
            print("E2E_BUBBLELEAK: FAIL (wrap konteks WebGL gagal:", w, ")")
            sys.exit(1)

        # ── 2. snapshot awal → spawn 1 bubble per SPAWN_EVERY dtk × N ──
        # (interval > life 3.5 dtk → array tak penuh; tiap tekstur sempat
        # ter-upload lalu mati via expiry — pembeda jalur updateBubbles)
        c0 = jval(ev(SNAP_EXPR)) or {"created": 0, "deleted": 0}
        spawned = 0
        for i in range(N_SPAWN):
            if jval(ev(SPAWN_HOOK)) != 1:
                print("E2E_BUBBLELEAK: FAIL (spawn hook tidak tersedia / gagal di iterasi %d)" % i)
                sys.exit(1)
            spawned += 1
            time.sleep(SPAWN_EVERY)
        time.sleep(1.0)
        c1 = jval(ev(SNAP_EXPR)) or {"created": 0, "deleted": 0}
        d_create = c1["created"] - c0["created"]
        d_delete = c1["deleted"] - c0["deleted"]
        print("AFTER_SPAWN(%d): created=%+d deleted=%+d bubbles=%s"
              % (spawned, d_create, d_delete, jval(ev(BUB_N))))
        if d_create < N_SPAWN // 2:
            print("E2E_BUBBLELEAK: FAIL (tekstur bubble tidak teralokasi — spawn tidak efektif)")
            sys.exit(1)

        # ── 3. tunggu expiry terakhir (life 3.5 + fade .5 + margin) ──
        time.sleep(6.0)

        # ── 4. pembeda ──
        nb = jval(ev(BUB_N))
        c2 = jval(ev(SNAP_EXPR)) or {"created": 0, "deleted": 0}
        created = c2["created"] - c0["created"]
        deleted = c2["deleted"] - c0["deleted"]
        print("FINAL: created=%d deleted=%d bubbles=%s" % (created, deleted, nb))
        if not isinstance(nb, int):
            print("E2E_BUBBLELEAK: FAIL (sampling akhir tidak terbaca)")
            sys.exit(1)
        if created < N_SPAWN // 2:
            print("E2E_BUBBLELEAK: FAIL (alokasi bubble terlalu sedikit: %d)" % created)
            sys.exit(1)
        # Kode baru: tekstur bubble dibuang saat eviksi/expiry → deleted ≥
        # created - margin (sisa = ≤MAX_BUBBLES hidup + autoTalk latar).
        # Kode lama: deleted ≈ 0 (hanya tekstur scene lain yg kebetulan didelete).
        margin = 6 + max(0, nb)
        if deleted >= created - margin:
            print("E2E_BUBBLELEAK: OK (tekstur bubble dibuang: deleted=%d / created=%d)"
                  % (deleted, created))
        else:
            print("E2E_BUBBLELEAK: FAIL (tekstur TIDAK dibuang — kebocoran: deleted=%d / created=%d)"
                  % (deleted, created))
            sys.exit(1)
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
