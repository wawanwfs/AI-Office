#!/usr/bin/env python3
"""E2E smoke "e2e_err_probe" — pengganti permanen scratch e2e_err.py (hilang
diprune TMPDIR 24 jam, siklus 185). Smoketest kesehatan scene di browser nyata:

 1. Console error / pageerror / exception = 0 (Runtime + Log domain CDP).
 2. Tanpa 'Scene init failed' di console.
 3. Hook inti scene terpasang: __agentData (agen > 0), __camCam, __renderer,
    __wfsSceneControls, __zoneLabels (5 zona), __wallFade.
 4. Scene HIDUP: screenshot PNG > ambang (kanvas hitam/halusut = file kecil).
    (Pola ambang sama dgn e2e_perf_chip siklus 147.)
 5. Mode MOBILE (arg "mobile"): viewport 390x844 dsf=2 (HP umum user) +
    gate tambahan dock: .dock .ibbtn tidak ada yang terpotong viewport —
    kelas bug siklus 184 (dock 3-4 baris meluap kapsul/viewport).

Pemakaian: uv run --with websocket-client scripts/e2e_err_probe.py [mobile] [out.png]
Transport: salinan e2e_perf_chip.py (Xvfb :99 + chrome-headless-shell + CDP WS).
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9461
URL = "http://127.0.0.1:9503/"

# Ambang "scene hidup": PNG > ambang. Desktop 1366x768 terukur 640-690 KB
# saat sehat; mobile 390x844@2x (780x1688) diukur siklus 186 — dilihat
# MOBILE_MIN_SHOT_BYTES di bawah. Kanvas mati = puluhan KB.
MIN_SHOT_BYTES = 300000
MOBILE_MIN_SHOT_BYTES = 200000
MOBILE_W, MOBILE_H, MOBILE_DSF = 390, 844, 2

HOOKS_EXPECT = ["__agentData", "__camCam", "__renderer", "__wfsSceneControls",
                "__zoneLabels", "__wallFade"]


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
        if n < 126: h += bytes([0x80 | n])
        else: h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionError("ws closed")
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126: n = struct.unpack(">H", rx(2))[0]
        elif n == 127: n = struct.unpack(">Q", rx(8))[0]
        return op, rx(n)

    def recv_text(s):
        op, d = s.recv()
        while op == 0:  # continuation
            op, d2 = s.recv(); d += d2
        return d.decode("utf-8", "replace")


def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    args = [a for a in sys.argv[1:] if a != "-"]
    mobile = "mobile" in args
    out = args[0] if args and args[0] != "mobile" else (
        args[1] if len(args) > 1 and args[1] != "mobile" else "/tmp/e2e_err_probe.png")
    w, h = (MOBILE_W, MOBILE_H) if mobile else (1366, 768)
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        try:
            if os.path.exists("/tmp/.X11-unix/X99") and not x99_alive():
                os.remove("/tmp/.X11-unix/X99")
        except OSError:
            pass
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", f"--window-size={w},{h}",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {"mode": "mobile" if mobile else "desktop",
           "console_errors": [], "page_errors": [], "init_failed": False}
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(ws.recv_text())
                if r.get("id") == mid[0]: return r

        cmd("Runtime.enable"); cmd("Log.enable"); cmd("Page.enable")
        if mobile:
            # Viewport HP dari awal init scene (bukan emulasi setelahnya):
            # override metrik + reload, error console tetap terkumpul di socket.
            cmd("Emulation.setDeviceMetricsOverride", width=MOBILE_W, height=MOBILE_H,
                deviceScaleFactor=MOBILE_DSF, mobile=True)
            cmd("Page.reload", ignoreCache=False)
        # Kumpulkan console/pageerror SELAMA scene init + beberapa detik hidup.
        # Bacaan non-blocking: kirim evaluate setelah 22 dtk, console menumpuk
        # di socket dan dibaca di loop cmd berikutnya (paritas e2e lain).
        time.sleep(22)
        # drain event console/pageerror yang menumpuk
        drain = mid[0]
        ws.send(json.dumps({"id": 10 ** 6, "method": "Runtime.evaluate",
                            "params": {"expression": "1", "returnByValue": True}}))
        for _ in range(4000):
            try:
                r = json.loads(ws.recv_text())
            except (socket.timeout, ConnectionError):
                break
            m = r.get("method", "")
            if m == "Runtime.consoleAPICalled" and r["params"].get("type") == "error":
                for a in r["params"].get("args", []):
                    t = a.get("value") or a.get("description") or ""
                    res["console_errors"].append(str(t)[:200])
            elif m == "Runtime.exceptionThrown":
                e = r["params"].get("exceptionDetails", {})
                res["page_errors"].append(str(e.get("exception", {}).get("description", e.get("text", "")))[:200])
            elif m == "Log.entryAdded" and r["params"].get("entry", {}).get("level") == "error":
                src = r["params"]["entry"]
                if "net::ERR" not in src.get("text", ""):  # favicon dkk diabaikan
                    res["console_errors"].append(str(src.get("text", ""))[:200])
            elif r.get("id") == 10 ** 6:
                break
        res["init_failed"] = any("Scene init failed" in e for e in res["console_errors"] + res["page_errors"])
        # 3) hook inti
        r = cmd("Runtime.evaluate", expression="""JSON.stringify({
          agents: window.__agentData ? window.__agentData.length : -1,
          cam: !!window.__camCam, renderer: !!window.__renderer,
          controls: !!window.__wfsSceneControls,
          zone: window.__zoneLabels ? window.__zoneLabels.length : -1,
          wall: !!window.__wallFade })""", returnByValue=True)
        st = json.loads(((r.get("result") or {}).get("result") or {}).get("value", "{}"))
        res["hooks"] = st
        res["hooks_ok"] = bool(st.get("agents", -1) > 0 and st.get("cam") and st.get("renderer")
                               and st.get("controls") and st.get("zone", -1) == 5 and st.get("wall"))
        # 4) scene hidup: screenshot > ambang (desktop 300KB / mobile 200KB)
        shot = cmd("Page.captureScreenshot", format="png")
        data = base64.b64decode((shot.get("result") or {}).get("data", ""))
        open(out, "wb").write(data)
        res["shot_bytes"] = len(data)
        res["shot_ok"] = res["shot_bytes"] > (MOBILE_MIN_SHOT_BYTES if mobile else MIN_SHOT_BYTES)
        # 5) gate mobile: dock tak menyunat tombol (kelas bug siklus 184) —
        #    label + kotak tombol terakhir dinilai LIVE dari DOM, bukan tebak.
        if mobile:
            r = cmd("Runtime.evaluate", expression="""JSON.stringify((() => {
              const dock = document.querySelector('.dock');
              if (!dock) return { err: 'no-dock' };
              const btns = Array.from(dock.querySelectorAll('.ibtn'));
              if (!btns.length) return { err: 'no-btns' };
              const d = dock.getBoundingClientRect();
              const r = btns[btns.length - 1].getBoundingClientRect();
              return { nBtn: btns.length, vw: innerWidth, vh: innerHeight,
                       dockRight: Math.round(d.right), dockBottom: Math.round(d.bottom),
                       lastRight: Math.round(r.right), lastBottom: Math.round(r.bottom) };
            })())""", returnByValue=True)
            dk = json.loads((((r or {}).get("result") or {}).get("result") or {}).get("value", "{}"))
            res["dock"] = dk
            res["dock_ok"] = (not dk.get("err")
                              and dk.get("lastRight", 9e9) <= dk.get("vw", 0) + 1
                              and dk.get("lastBottom", 9e9) <= dk.get("vh", 0) + 1
                              and dk.get("lastRight", 0) <= dk.get("dockRight", -1) + 1
                              and dk.get("lastBottom", 0) <= dk.get("dockBottom", -1) + 1)
        clean = (not res["console_errors"] and not res["page_errors"]
                 and not res["init_failed"] and res["hooks_ok"] and res["shot_ok"]
                 and (res.get("dock_ok", True)))
        print("E2E_ERR_PROBE:", "OK" if clean else "FAIL", json.dumps(res, ensure_ascii=False))
        sys.exit(0 if clean else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()


if __name__ == "__main__":
    main()
