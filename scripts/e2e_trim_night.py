#!/usr/bin/env python3
"""E2E siklus 166 — TRIM (crown molding/sill putih #F4F6FA) & PILAR (#8E9BB0)
ikut siang↔malam (CDP :99). Dulu keduanya warna solid MeshBasicMaterial statis —
jam malam panel dinding sudah gelap (siklus 165) tapi lis & pilar tetap menyala.
Bukti 5 keadaan (state hook + warna material LIVE = sumber kebenaran):
  A) load real-time → __trimNight() sesuai jam (malam dini hari)
  B) __setTime(720) siang → False + material = #F4F6FA (terang)
  C) __setTime(0) malam → True + material = #8FA0BC (redup) + screenshot day/night
  D) flip-flop 5× berakhir konsisten
  E) sinkron trim == wall == sky di semua keadaan
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9464
OUT_DAY = os.path.expanduser("~/.hermes/cache/scratch/ck166_day.png")
OUT_NIGHT = os.path.expanduser("~/.hermes/cache/scratch/ck166_night.png")

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

    # warna RGB material trim AKTIF (mesh ter-tag pertama di scene) — sumber kebenaran
    # nilai warna. CATATAN: hook __trimMat (material asli trimPaints[0]) TIDAK dipakai
    # utk warna karena wall-fade meng-clone material mesh → asli bisa jadi "mati"
    # (tak dipakai mesh); yang terlihat render = klon aktif pada mesh ter-tag.
    COL = ("(() => { let out = null; window.__scene.traverse(o => {"
           " if (!out && o.isMesh && o.userData && o.userData.__trim && o.material && o.material.color)"
           " out = [o.material.color.r, o.material.color.g, o.material.color.b]; }); return out; })()")
    TAGGED = ("(() => { let n = 0; window.__scene.traverse(o => {"
              " if (o.isMesh && o.userData && o.userData.__trim) n++; }); return n; })()")

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama
    has_hook = ev("typeof window.__trimNight === 'function' && typeof window.__trimMat === 'function'")
    if not has_hook:
        print("FAIL: __trimNight/__trimMat hook tidak ada — bundle lama ter-serve?")
        sys.exit(2)
    n_tagged = ev(TAGGED)
    print(f"mesh trim ter-tag live: {n_tagged} (inventaris: crown/sill + pilar)")
    t0 = ev("window.__dbg().t")
    a_trim = ev("window.__trimNight()")
    hour0 = int(t0) // 60
    expect_night = hour0 < 6 or hour0 >= 19
    ok_a = (a_trim == expect_night)
    print(f"A realtime: t={t0} ({hour0:02d}:xx) trimNight={a_trim} expect={expect_night} -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")
    # B: siang — hook false + material terang (r linear > 0.87 utk #F4F6FA)
    ev("window.__setTime(720)")
    time.sleep(1.5)
    b_trim = ev("window.__trimNight()")
    day_col = ev(COL)
    sz_day = shot(OUT_DAY)
    ok_b = (b_trim is False) and day_col and day_col[0] > 0.85 and day_col[1] > 0.9 and day_col[2] > 0.9
    print(f"B siang 720: trimNight={b_trim} rgb={day_col} (putih #F4F6FA) -> {'OK' if ok_b else 'FAIL'}; {OUT_DAY} {sz_day}B")
    if not ok_b: fails.append("B")
    # C: malam — hook true + material redup biru (#8FA0BC: r lin < 0.65)
    ev("window.__setTime(0)")
    time.sleep(1.5)
    c_trim = ev("window.__trimNight()")
    night_col = ev(COL)
    sz_night = shot(OUT_NIGHT)
    ok_c = (c_trim is True) and night_col and night_col[0] < 0.65 and 0.4 < night_col[2] < 0.9
    print(f"C malam 0:   trimNight={c_trim} rgb={night_col} (abu-biru #8FA0BC) -> {'OK' if ok_c else 'FAIL'}; {OUT_NIGHT} {sz_night}B")
    if not ok_c: fails.append("C")
    # sanity scene hidup: kedua screenshot >500KB (standar siklus)
    if sz_day < 500_000 or sz_night < 500_000:
        print("FAIL: screenshot <500KB — scene mati")
        fails.append("size")
    # D: flip-flop 5× berakhir siang — konsisten tanpa error
    for m in [720, 0, 720, 0, 720]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
    d_trim = ev("window.__trimNight()")
    ok_d = (d_trim is False)
    print(f"D flip-flop 5x: trimNight akhir={d_trim} (siang) -> {'OK' if ok_d else 'FAIL'}")
    if not ok_d: fails.append("D")
    # E: sinkron trim == wall == sky di 6 keadaan waktu
    syncs = []
    for m in [0, 400, 720, 1000, 1100, 1200]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
        st = ev("({s: window.__skyNight(), w: window.__wallNight(), t: window.__trimNight()})")
        syncs.append((m, st))
    ok_e = all(st["s"] == st["w"] == st["t"] for _, st in syncs)
    for m, st in syncs:
        print(f"   t={m:4d}: sky={st['s']} wall={st['w']} trim={st['t']} {'OK' if st['s']==st['w']==st['t'] else 'MISMATCH'}")
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
