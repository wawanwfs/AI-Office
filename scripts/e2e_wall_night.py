#!/usr/bin/env python3
"""E2E siklus 165 — dinding kantor ikut siang↔malam (CDP :99).
Dulu 8 tekstur dinding (MeshBasicMaterial, palet siang #E6EAF1) tak pernah
di-update — jam malam dinding tetap terang penuh. Kini createLighting me-repaint
kanvas dinding dgn palet WALL_NIGHT saat daylight ≤ 0.55.
Bukti 5 keadaan (state hook + PIKSEL KANVAS = sumber kebenaran tekstur):
  A) load real-time (dini hari) → __wallNight() True
  B) __setTime(720) siang → False (+ piksel kanvas = pucat #E6EAF1, screenshot)
  C) __setTime(0) malam → True (+ piksel kanvas = gelap #1B2436, screenshot)
  D) flip-flop 5× berakhir konsisten
  E) ambang sinkron dgn jendela: __wallNight == __skyNight di semua keadaan
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9461
OUT_DAY = os.path.expanduser("~/.hermes/cache/scratch/ck165_day.png")
OUT_NIGHT = os.path.expanduser("~/.hermes/cache/scratch/ck165_night.png")

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
        s.settimeout(30)

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

    # piksel kanvas tekstur dinding pertama (panel atas 512×256) — tengah panel
    # (x=288: bebas garis seam step-64 di 256; y=24: atas, jauh dari AO tepi kiri)
    PX = ("(() => { const c = window.__wallTexCv && window.__wallTexCv();"
          " if (!c) return null; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
          " const i = (24*c.width+288)*4; return [d[i], d[i+1], d[i+2]]; })()")

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama
    has_hook = ev("typeof window.__wallNight === 'function' && typeof window.__wallTexCv === 'function'")
    if not has_hook:
        print("FAIL: __wallNight/__wallTexCv hook tidak ada — bundle lama ter-serve?")
        sys.exit(2)
    # A: kondisi real-time (skrip dijalankan dini hari → night)
    t0 = ev("window.__dbg().t")
    a_wall = ev("window.__wallNight()")
    hour0 = int(t0) // 60
    expect_night = hour0 < 6 or hour0 >= 19
    ok_a = (a_wall == expect_night)
    print(f"A realtime: t={t0} ({hour0:02d}:xx) wallNight={a_wall} expect={expect_night} -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")
    # B: siang — hook false + piksel kanvas pucat terang
    ev("window.__setTime(720)")
    time.sleep(1.5)
    b_wall = ev("window.__wallNight()")
    day_px = ev(PX)
    sz_day = shot(OUT_DAY)
    ok_b = (b_wall is False) and day_px and day_px[0] > 150 and day_px[1] > 160 and day_px[2] > 170
    print(f"B siang 720: wallNight={b_wall} px={tuple(day_px)} (pucat terang) -> {'OK' if ok_b else 'FAIL'}; {OUT_DAY} {sz_day}B")
    if not ok_b: fails.append("B")
    # C: malam — hook true + piksel kanvas gelap
    ev("window.__setTime(0)")
    time.sleep(1.5)
    c_wall = ev("window.__wallNight()")
    night_px = ev(PX)
    sz_night = shot(OUT_NIGHT)
    ok_c = (c_wall is True) and night_px and night_px[0] < 110 and night_px[1] < 120 and night_px[2] < 140
    print(f"C malam 0:   wallNight={c_wall} px={tuple(night_px)} (gelap) -> {'OK' if ok_c else 'FAIL'}; {OUT_NIGHT} {sz_night}B")
    if not ok_c: fails.append("C")
    # sanity scene hidup: kedua screenshot >500KB (standar siklus)
    if sz_day < 500_000 or sz_night < 500_000:
        print("FAIL: screenshot <500KB — scene mati")
        fails.append("size")
    # D: flip-flop 5× berakhir siang — konsisten tanpa error
    for m in [720, 0, 720, 0, 720]:
        ev(f"window.__setTime({m})")
    time.sleep(0.8)
    final = ev("window.__wallNight()")
    ok_d = (final is False)
    print(f"D flip-flop 5x berakhir siang: wallNight={final} -> {'OK' if ok_d else 'FAIL'}")
    if not ok_d: fails.append("D")
    # E: ambang dinding == ambang jendela (satu sumber kebenaran daylight ≤ 0.55)
    sync_ok = True
    for m in [0, 400, 720, 1000, 1100, 1200]:
        ev(f"window.__setTime({m})")
        time.sleep(0.3)
        w = ev("window.__wallNight()"); k = ev("window.__skyNight()")
        if w != k:
            sync_ok = False
            print(f"   desinkron @ {m}: wall={w} sky={k}")
    print(f"E sinkron wall==sky di 6 keadaan waktu -> {'OK' if sync_ok else 'FAIL'}")
    if not sync_ok: fails.append("E")
    ev("window.__setTime(%d)" % t0)  # pulihkan waktu asli
    if fails:
        print(f"===> FAIL {fails}")
        sys.exit(1)
    print("===> OK")
finally:
    p.terminate()
    try:
        p.wait(3)
    except Exception:
        p.kill()
    if xv:
        xv.terminate()
