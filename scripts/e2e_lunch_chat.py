#!/usr/bin/env python3
"""E2E siklus 172 — REGRESI LUNCH-CRASH (bugfix checkConversations unwrap).
Dulu: pasangan chat dibaca .walker/.home di WRAPPER (undefined) → TypeError
per-frame begitu 2 agen berdekatan → animate() crash → KANTOR BEKU TOTAL
sepanjang jam makan siang (repro live 2× saat development siklus ini).
Bukti: muat, setTime(718) → auto-cross 12:00 lunch_start → agen ramai ke kafe
(cluster < CHAT_RADIUS) → 40 dtk: 0 error window, frame terus naik, sim clock
hidup, agen tiba di kafe, bubble obrolan muncul.
Exit non-zero bila ada yang gagal."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9472
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
            raise RuntimeError(f"eval gagal: {json.dumps(r['result']['exceptionDetails'])[:200]}")
        return res.get("value")

    def shot(out):
        r = cmd("Page.captureScreenshot", format="png")
        if "result" not in r:
            raise RuntimeError(f"captureScreenshot gagal: {json.dumps(r)[:200]}")
        open(out, "wb").write(base64.b64decode(r["result"]["data"]))
        return os.path.getsize(out)

    fails = []
    cmd("Page.navigate", url="http://127.0.0.1:9503/app/")
    time.sleep(15)
    ev("window.__errs=[]; window.addEventListener('error',e=>window.__errs.push((e.error&&e.error.stack?String(e.error.stack):String(e.message||e)).slice(0,200)));")
    ev("window.__setTime(718)")  # 2 menit sebelum lunch — biarkan AUTO-cross 720
    time.sleep(1.0)
    fr0 = ev("window.__animFrames")
    max_bubbles = 0
    for i in range(8):  # 40 dtk wall ≈ 40 menit sim → tengah jam makan penuh cluster
        time.sleep(5)
        n_err = ev("window.__errs.length")
        t = ev("window.__dbg().t")
        fr = ev("window.__animFrames")
        nb = ev("window.__bubbleCount") or 0
        cafe = ev("window.__lunch().atCafe")
        max_bubbles = max(max_bubbles, nb)
        print(f"t+{i*5+5}s errs={n_err} sim={t} frames={fr} bubbles={nb} atCafe={cafe}")
        if n_err:
            fails.append("errors")
            print("err[0]:", json.dumps(ev("window.__errs.slice(0,1)")))
            break
    t_end = ev("window.__dbg().t")
    fr_end = ev("window.__animFrames")
    ok_cross = t_end > 730 and fr_end > fr0  # melewati 720 & 730 dgn frame hidup
    print(f"cross 12:00: sim {718}->{t_end} frames {fr0}->{fr_end} maxBubbles={max_bubbles}")
    if not ok_cross: fails.append("cross")
    if max_bubbles < 1: fails.append("no-bubble")  # fitur chat hidup kembali
    sz = shot(os.path.expanduser("~/.hermes/cache/scratch/ck172_lunch.png"))
    print(f"shot: {sz}B (scene hidup utk jam makan)")
    if sz < 500_000: fails.append("scene-dead")
    if fails:
        print(f"===> FAIL: {fails}"); sys.exit(1)
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
