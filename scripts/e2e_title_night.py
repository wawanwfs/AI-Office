#!/usr/bin/env python3
"""E2E siklus 168 — JUDUL dinding "WFS PROJECT" ikut meredup malam (CDP :99).
Dulu judul putih+amber (avgLum 194, MB unlit, latar transparan) tetap menyala
saat malam — kandidat terang tersisa audit siklus 167 (kandidat (c)).
Mekanisme: repaint kanvas parametrik (pola 164/165) — kanvas STATIS tanpa
redraw live; dua-tone brand terjaga via TITLE_DAY/TITLE_NIGHT (tint satu-warna
akan meratakan putih & amber). Bukti 6 keadaan (state hook + piksel kanvas):
  A) load real-time → __titleNight() sesuai jam (dini hari = malam)
  B) __setTime(720) siang → False + kanvas dua-tone terang (W=255, PROJECT>100)
  C) __setTime(0) malam → True + kanvas dua-tone redup (W<160, PROJECT<80)
  D) flip-flop 5× berakhir konsisten
  E) sinkron title == board == wall == trim == sky di 6 keadaan waktu
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9466
OUT_DAY = os.path.expanduser("~/.hermes/cache/scratch/ck168_day.png")
OUT_NIGHT = os.path.expanduser("~/.hermes/cache/scratch/ck168_night.png")

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
                elif n2 == 127:
                    n2 = struct.unpack(">Q", rx(8))[0]
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

    # Rata-rata piksel kanvas judul per wilayah teks (sumber kebenaran tekstur).
    # "WFS" ~ x 150..450 (fillText center di 300, 130px), "PROJECT" ~ x 580..880 (center 730).
    PX = ("(() => { const cv = window.__titleCv(); if (!cv) return null;"
          " const c2 = cv.getContext('2d'); const d = c2.getImageData(0,0,1024,200).data;"
          " const avg = (x0,x1) => { let r=0,g=0,b=0,n=0;"
          "  for (let y=30; y<170; y++) for (let x=x0; x<x1; x++) {"
          "   const i = (y*1024 + x) * 4; if (d[i+3] > 40) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; } }"
          "  return n ? [Math.round(r/n), Math.round(g/n), Math.round(b/n), n] : [0,0,0,0]; };"
          " return { w: avg(150,450), p: avg(580,880) }; })()")

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama
    has_hook = ev("typeof window.__titleNight === 'function' && typeof window.__titleCv === 'function'")
    if not has_hook:
        print("FAIL: __titleNight/__titleCv hook tidak ada — bundle lama ter-serve?")
        sys.exit(2)
    t0 = ev("window.__dbg().t")
    a_title = ev("window.__titleNight()")
    hour0 = int(t0) // 60
    expect_night = hour0 < 6 or hour0 >= 19
    ok_a = (a_title == expect_night)
    print(f"A realtime: t={t0} ({hour0:02d}:xx) titleNight={a_title} expect={expect_night} -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")
    # B: siang — hook false + kanvas dua-tone terang (W putih 255; PROJECT amber R tertinggi)
    ev("window.__setTime(720)")
    time.sleep(1.5)
    b_title = ev("window.__titleNight()")
    px_day = ev(PX)
    sz_day = shot(OUT_DAY)
    ok_b = (b_title is False and px_day and px_day["w"][0] > 240 and px_day["w"][1] > 240
            and px_day["p"][0] > 200 and px_day["p"][0] > px_day["p"][2])
    print(f"B siang 720: titleNight={b_title} W={px_day['w']} PROJECT={px_day['p']} (putih+amber terang) -> {'OK' if ok_b else 'FAIL'}; {OUT_DAY} {sz_day}B")
    if not ok_b: fails.append("B")
    # C: malam — hook true + kanvas dua-tone redup (W silver-biru <160; PROJECT amber gelap <90)
    ev("window.__setTime(0)")
    time.sleep(1.5)
    c_title = ev("window.__titleNight()")
    px_night = ev(PX)
    sz_night = shot(OUT_NIGHT)
    ok_c = (c_title is True and px_night and px_night["w"][0] < 160 and px_night["p"][0] < 90
            and px_night["w"][0] > px_night["w"][1])  # silver-biru: R > G
    print(f"C malam 0:   titleNight={c_title} W={px_night['w']} PROJECT={px_night['p']} (silver-biru+amber redup) -> {'OK' if ok_c else 'FAIL'}; {OUT_NIGHT} {sz_night}B")
    if not ok_c: fails.append("C")
    # sanity scene hidup: kedua screenshot >500KB (standar siklus)
    if sz_day < 500_000 or sz_night < 500_000:
        print("FAIL: screenshot <500KB — scene mati")
        fails.append("size")
    # D: flip-flop 5× berakhir siang — konsisten tanpa error
    for m in [720, 0, 720, 0, 720]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
    d_title = ev("window.__titleNight()")
    ok_d = (d_title is False)
    print(f"D flip-flop 5x: titleNight akhir={d_title} (siang) -> {'OK' if ok_d else 'FAIL'}")
    if not ok_d: fails.append("D")
    # E: sinkron title == board == wall == trim == sky di 6 keadaan waktu
    syncs = []
    for m in [0, 400, 720, 1000, 1100, 1200]:
        ev(f"window.__setTime({m})")
        time.sleep(0.6)
        st = ev("({s: window.__skyNight(), w: window.__wallNight(), t: window.__trimNight(), b: window.__boardNight(), j: window.__titleNight()})")
        syncs.append((m, st))
    ok_e = all(st["s"] == st["w"] == st["t"] == st["b"] == st["j"] for _, st in syncs)
    for m, st in syncs:
        print(f"   t={m:4d}: sky={st['s']} wall={st['w']} trim={st['t']} board={st['b']} title={st['j']} "
              f"{'OK' if st['s']==st['w']==st['t']==st['b']==st['j'] else 'MISMATCH'}")
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
