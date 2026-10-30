#!/usr/bin/env python3
"""E2E siklus 169 — PANEL PLAFON recessed (#F0F4FF, bidang unlit TERLUAS n=114)
& BOHLAM lampu gantung (#FFF3D6 ×26 meja) ikut siang↔malam (CDP :99).
Dulu keduanya MeshBasicMaterial statis — malam hari panel dinding/judul sudah
gelap (165-168) tapi plafon tetap menyala penuh seperti panel lampu.
Bukti 5 keadaan (state hook + warna material LIVE = sumber kebenaran):
  A) load real-time → __ceilNight() sesuai formula daylight() (ambang 0.55)
  B) __setTime(720) siang → False + material = #F0F4FF (terang) + screenshot
  C) __setTime(0) malam → True + material = #2E3A52 (redup) + screenshot
  D) flip-flop 5× berakhir konsisten
  E) sinkron ceil == wall == trim == board == title di 6 keadaan waktu
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9466
OUT_DAY = os.path.expanduser("~/.hermes/cache/scratch/ck169_day.png")
OUT_NIGHT = os.path.expanduser("~/.hermes/cache/scratch/ck169_night.png")

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

    # warna RGB material mesh ter-tag __ceil — PANEL plafon saja (dim ≥ 2m):
    # bohlam ter-tag juga (amber hangat) → filter dgn geometry dim (width ≥ 2).
    COL = ("(() => { let out = null; window.__scene.traverse(o => {"
           " if (out || !o.isMesh || !(o.userData && o.userData.__ceil !== undefined) || !o.material || !o.material.color) return;"
           " const gp=o.geometry&&o.geometry.parameters?o.geometry.parameters:null;"
           " if(gp&&gp.width&&gp.width>=2) out=[o.material.color.r,o.material.color.g,o.material.color.b]; }); return out; })()")
    TAGGED = ("(() => { let n = 0; window.__scene.traverse(o => {"
              " if (o.isMesh && o.userData && o.userData.__ceil !== undefined) n++; }); return n; })()")

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama
    has_hook = ev("typeof window.__ceilNight === 'function' && typeof window.__ceilMat === 'function'")
    if not has_hook:
        print("FAIL: __ceilNight/__ceilMat hook tidak ada — bundle lama ter-serve?")
        sys.exit(2)
    n_tagged = ev(TAGGED)
    print(f"mesh ter-tag live: {n_tagged} (inventaris: 35 panel plafon + 26 bohlam = 61)")
    t0 = ev("window.__dbg().t")
    a_ceil = ev("window.__ceilNight()")

    # Ekspektasi dari formula daylight() yang sama dgn daycycle (satu sumber
    # kebenaran, ambang 0.55) — heuristik jam hour<6|>=19 SALAH saat 06:xx-07:xx
    # (daylight smoothstep masih ≤0.55 = "malam"; bug tooling tersingkap 168).
    def _smooth(a, b, x):
        t = min(1, max(0, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)

    def _daylight(m):
        if m < 360: return 0.3
        if m < 480: return 0.3 + 0.7 * _smooth(360, 480, m)
        if m < 1020: return 1
        if m < 1140: return 1 - 0.7 * _smooth(1020, 1140, m)
        return 0.3

    expect_night = _daylight(int(t0)) <= 0.55
    ok_a = (a_ceil == expect_night)
    print(f"A realtime: t={t0} ceilNight={a_ceil} expect={expect_night} (daylight={_daylight(int(t0)):.2f}) -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")
    # B: siang — hook false + material terang (r linear > 0.87 utk #F0F4FF)
    ev("window.__setTime(720)")
    time.sleep(1.5)
    b_ceil = ev("window.__ceilNight()")
    day_col = ev(COL)
    sz_day = shot(OUT_DAY)
    ok_b = (b_ceil is False) and day_col and day_col[0] > 0.85 and day_col[1] > 0.9 and day_col[2] > 0.9
    print(f"B siang 720: ceilNight={b_ceil} rgb={day_col} (putih #F0F4FF) -> {'OK' if ok_b else 'FAIL'}; {OUT_DAY} {sz_day}B")
    if not ok_b: fails.append("B")
    # C: malam — hook true + material redup biru (#2E3A52: r lin < 0.25)
    ev("window.__setTime(0)")
    time.sleep(1.5)
    c_ceil = ev("window.__ceilNight()")
    night_col = ev(COL)
    sz_night = shot(OUT_NIGHT)
    ok_c = (c_ceil is True) and night_col and night_col[0] < 0.1 and night_col[2] < 0.2
    print(f"C malam 0:   ceilNight={c_ceil} rgb={night_col} (biru gelap #2E3A52) -> {'OK' if ok_c else 'FAIL'}; {OUT_NIGHT} {sz_night}B")
    if not ok_c: fails.append("C")
    # sanity scene hidup: kedua screenshot >500KB (standar siklus)
    if sz_day < 500_000 or sz_night < 500_000:
        print("FAIL: screenshot <500KB — scene mati")
        fails.append("size")
    # D: flip-flop 5× berakhir siang — konsisten tanpa error
    for m in [720, 0, 720, 0, 720]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
    d_ceil = ev("window.__ceilNight()")
    ok_d = (d_ceil is False)
    print(f"D flip-flop 5x: ceilNight akhir={d_ceil} (siang) -> {'OK' if ok_d else 'FAIL'}")
    if not ok_d: fails.append("D")
    # E: sinkron ceil == wall == trim == board == title di 6 keadaan waktu
    syncs = []
    for m in [0, 400, 720, 1000, 1100, 1200]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
        st = ev("({s: window.__skyNight(), w: window.__wallNight(), t: window.__trimNight(), b: window.__boardNight(), ti: window.__titleNight(), c: window.__ceilNight()})")
        syncs.append((m, st))
    ok_e = all(st["s"] == st["w"] == st["t"] == st["b"] == st["ti"] == st["c"] for _, st in syncs)
    for m, st in syncs:
        print(f"   t={m:4d}: sky={st['s']} wall={st['w']} trim={st['t']} board={st['b']} title={st['ti']} ceil={st['c']} "
              f"{'OK' if st['s']==st['w']==st['t']==st['b']==st['ti']==st['c'] else 'MISMATCH'}")
    if not ok_e: fails.append("E")
    print("===> " + ("OK" if not fails else f"FAIL {fails}"))
    sys.exit(0 if not fails else 1)
finally:
    try:
        p.kill()
    except Exception:
        pass
    if xv:
        xv.terminate()
