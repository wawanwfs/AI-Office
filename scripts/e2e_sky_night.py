#!/usr/bin/env python3
"""E2E siklus 164 — swap langit jendela siang↔malam (CDP :99).
Diskriminasi 3 keadaan via state hook (window.__skyNight):
  A) load real-time (02:xx WIB = malam) → __skyNight() True
  B) __setTime(720) siang → False (+ screenshot day)
  C) __setTime(0) malam → True (+ screenshot night)
Exit non-zero bila ada keadaan yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9459
OUT_DAY = os.path.expanduser("~/.hermes/cache/scratch/ck164_day.png")
OUT_NIGHT = os.path.expanduser("~/.hermes/cache/scratch/ck164_night.png")

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

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(20)  # scene init + frame pertama
    has_hook = ev("typeof window.__skyNight === 'function'")
    if not has_hook:
        print("FAIL: __skyNight hook tidak ada — bundle lama ter-serve?")
        sys.exit(2)
    # A: kondisi real-time (jam VM saat ini; skrip dijalankan dini hari → night)
    t0 = ev("window.__dbg().t")
    a_night = ev("window.__skyNight()")
    hour0 = int(t0) // 60
    expect_night = hour0 < 6 or hour0 >= 19
    ok_a = (a_night == expect_night)
    print(f"A realtime: t={t0} ({hour0:02d}:xx) skyNight={a_night} expect={expect_night} -> {'OK' if ok_a else 'FAIL'}")
    if not ok_a: fails.append("A")
    # B: siang
    ev("window.__setTime(720)")
    time.sleep(1.5)
    b_night = ev("window.__skyNight()")
    ok_b = (b_night is False)
    sz_day = shot(OUT_DAY)
    print(f"B siang 720: skyNight={b_night} -> {'OK' if ok_b else 'FAIL'}; {OUT_DAY} {sz_day}B")
    if not ok_b: fails.append("B")
    # C: malam
    ev("window.__setTime(0)")
    time.sleep(1.5)
    c_night = ev("window.__skyNight()")
    ok_c = (c_night is True)
    sz_night = shot(OUT_NIGHT)
    print(f"C malam 0:   skyNight={c_night} -> {'OK' if ok_c else 'FAIL'}; {OUT_NIGHT} {sz_night}B")
    if not ok_c: fails.append("C")
    # sanity scene hidup: kedua screenshot >500KB (standar siklus)
    if sz_day < 500_000 or sz_night < 500_000:
        print("FAIL: screenshot <500KB — scene mati")
        fails.append("size")
    # bolak-balik bebas stutter: 5x toggle cepat tetap konsisten
    seq_ok = True
    for i, m in enumerate([720, 0, 720, 0, 720]):
        ev(f"window.__setTime({m})")
    time.sleep(0.5)
    final = ev("window.__skyNight()")  # terakhir 720 → False
    seq_ok = (final is False)
    print(f"D flip-flop 5x berakhir siang: skyNight={final} -> {'OK' if seq_ok else 'FAIL'}")
    if not seq_ok: fails.append("D")
    # E: PIKSEL KANVAS LANGIT — sumber kebenaran tekstur jendela (bukan viewport
    # yang didominasi interior). Sampel via getImageData hook __skyCv.
    ev("window.__setTime(720)")
    time.sleep(0.5)
    day_px = ev("(() => { const c = window.__skyCv; const d = c.getContext('2d').getImageData(0,0,256,128).data; const mid = (128*64)*4; return [d[mid], d[mid+1], d[mid+2]]; })()")
    ev("window.__setTime(0)")
    time.sleep(0.5)
    night_px = ev("(() => { const c = window.__skyCv; const d = c.getContext('2d').getImageData(0,0,256,128).data; const mid = (128*64)*4; return [d[mid], d[mid+1], d[mid+2]]; })()")
    dr, dg, db = day_px; nr, ng, nb = night_px
    ok_e = (db > 200 and dg > 140 and dr < 170) and (nb < 120 and ng < 90)
    print(f"E piksel kanvas tengah: siang=({dr},{dg},{db}) biru cerah | malam=({nr},{ng},{nb}) gelap -> {'OK' if ok_e else 'FAIL'}")
    if not ok_e: fails.append("E")
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
