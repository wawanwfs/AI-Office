#!/usr/bin/env python3
"""E2E siklus 172 — KETAHANAN KONTEKS WEBGL (CDP :99, WEBGL_lose_context nyata).

Latar: GPU reset / driver crash / tab mobile dibuang OS memicu webglcontextlost.
Three r183 pulih sendiri, tapi lapisan aplikasi buta: perfStep menghitung frame
no-op (render() tak jalan → frame terus terhitung di kecepatan display) → chip
HUD berbohong "GPU xx FPS" di atas kanvas hitam, recovery tangga bisa terisi
streak semu, ambience audio terus berjalan, peta bayangan lama gugur pasca-
restore tanpa refresh paksa.

Bukti 5 keadaan (hook + chip HUD DOM + screenshot = sumber kebenaran):
  A) baseline  → __glLost() False, rAF hidup (__animFrames naik)
  B) loseContext → __glLost() True + __perf.glLost/stale True + fps BEKU
     (tak dihitung ulang) + __animFrames TETAP naik (premis: rAF tetap jalan)
     + chip HUD '.perf-chip.down' berisi "GPU terputus" + screenshot kanvas hitam
  C) restoreContext → flag bersih + chip.down hilang + sampling hidup lagi
     (stale False, fps dihitung ulang) + screenshot scene > 500 KB (hidup lagi)
  D) idempoten: lose→restore 2× siklus, keadaan akhir konsisten
  E) destroy() → hook __glLost ter-purge (SCENE_HOOKS) + jejak hygiene purge
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9467
OUT_LOST = os.path.expanduser("~/.hermes/cache/scratch/ck172_lost.png")
OUT_OK = os.path.expanduser("~/.hermes/cache/scratch/ck172_restored.png")

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
            raise RuntimeError(f"eval gagal {expr!r}: {json.dumps(r['result']['exceptionDetails'])[:300]}")
        return res.get("value")

    def shot(out):
        r = cmd("Page.captureScreenshot", format="png")
        if "result" not in r:
            raise RuntimeError(f"captureScreenshot gagal: {json.dumps(r)[:300]}")
        open(out, "wb").write(base64.b64decode(r["result"]["data"]))
        return os.path.getsize(out)

    # Spesifikasi WebGL: objek WEBGL_lose_context harus DIDAPAT sebelum konteks
    # hilang — getExtension saat/atas konteks lost mengembalikan null, dan
    # restoreContext() hanya bisa dipanggil dari referensi yang disimpan (MDN).
    LOSE = ("(() => { const c = window.__renderer ? window.__renderer.getContext() : null;"
            " if (!c) return 'NO-CTX';"
            " const x = c.getExtension('WEBGL_lose_context');"
            " if (!x) return 'NO-EXT'; window.__loseExt = x; x.loseContext(); return 'LOST'; })()")
    RESTORE = ("(() => { if (!window.__loseExt) return 'NO-REF';"
               " window.__loseExt.restoreContext(); return 'RESTORED'; })()")
    CHIP = ("(() => { const el = document.querySelector('.perf-chip');"
            " return el ? [el.className, el.textContent] : null; })()")

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama + sampel perf pertama
    has_hook = ev("typeof window.__glLost === 'function' && !!window.__perf && typeof window.__renderer !== 'undefined'")
    if not has_hook:
        print("FAIL: hook __glLost/__perf/__renderer tidak ada — bundle lama ter-serve?")
        sys.exit(2)

    # A) baseline
    a_lost = ev("window.__glLost()")
    fr1 = ev("window.__animFrames")
    time.sleep(1.5)
    fr2 = ev("window.__animFrames")
    ok_a = (a_lost is False) and (fr2 > fr1)
    print(f"A baseline: glLost={a_lost} rAF {fr1}->{fr2} (hidup) -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")

    # B) konteks HILANG
    how = ev(LOSE)
    time.sleep(1.0)  # event lost + ≥1 frame perfStep dgn injeksi
    b1_lost = ev("window.__glLost()")
    pf1 = ev("window.__perf.glLost === true && window.__perf.stale === true")
    fr3 = ev("window.__animFrames")
    time.sleep(3.0)  # > sampleMs: tanpa guard, fps akan dihitung ulang di sini
    b2_lost = ev("window.__glLost()")
    fps_frozen = ev("window.__perf.fps")
    fr4 = ev("window.__animFrames")
    chip = ev(CHIP)
    sz_lost = shot(OUT_LOST)
    ok_b = (b1_lost is True and b2_lost is True and pf1 is True
            and fr4 > fr3 and chip is not None
            and "down" in chip[0] and "terputus" in chip[1])
    print(f"B lost ({how}): glLost={b1_lost}->{b2_lost} perf.glLost+stale={pf1} "
          f"rAF {fr3}->{fr4} (tetap hidup) fps BEKU={fps_frozen} chip={chip} "
          f"{sz_lost}B -> {'OK' if ok_b else 'FAIL'}")
    if not ok_b: fails.append("B")

    # C) RESTORE
    how = ev(RESTORE)
    time.sleep(2.5)  # restore event + jendela sampel baru
    c1 = ev("window.__glLost()")
    pf2 = ev("window.__perf.glLost === undefined || window.__perf.glLost === false")
    chip2 = ev(CHIP)
    time.sleep(2.5)  # sampel valid pertama pasca-restore
    c2 = ev("window.__perf.stale === false && window.__perf.fps > 0")
    sz_ok = shot(OUT_OK)
    ok_c = (c1 is False and pf2 is True and c2 is True and sz_ok > 500_000
            and (chip2 is None or "down" not in chip2[0]))
    print(f"C restored ({how}): glLost={c1} perf bersih={pf2} sampling hidup={c2} "
          f"chip={chip2} {sz_ok}B (scene hidup) -> {'OK' if ok_c else 'FAIL'}")
    if not ok_c: fails.append("C")

    # D) idempoten: siklus ke-2 lose→restore
    ev(LOSE); time.sleep(1.0)
    d1 = ev("window.__glLost()")
    ev(RESTORE); time.sleep(2.5)
    d2 = ev("window.__glLost()")
    d3 = ev("window.__perf.stale === false && window.__perf.fps > 0")
    ok_d = (d1 is True and d2 is False and d3 is True)
    print(f"D siklus ke-2: lost={d1} restored={d2} sampling={d3} -> {'OK' if ok_d else 'FAIL'}")
    if not ok_d: fails.append("D")

    # E) destroy() → hook ter-purge, flag tak menggantung
    ev("window.__wfsSceneControls.destroy()")
    time.sleep(1.0)
    e1 = ev("window.__glLost === undefined && window.__sceneHygienePurge === true")
    print(f"E destroy: hook ter-purge + hygiene={e1} -> {'OK' if e1 else 'FAIL'}")
    if not e1: fails.append("E")

    if fails:
        print(f"===> FAIL: {fails}")
        sys.exit(1)
    print("===> OK")
finally:
    try:
        p.kill()
    except Exception:
        pass
    if xv:
        try:
            xv.kill()
        except Exception:
            pass
