#!/usr/bin/env python3
"""e2e_pinch.py — siklus 174: verifikasi live pinch-zoom (CDP :99).
Seluruh skenario dijalankan dalam SATU Runtime.evaluate (awaitPromise) — eval
terpisah kelaparan oleh main-thread render SwiftShader (~0.3 fps).
Tes: (1) pinch melebar → zoom IN; (2) pinch saat follow goal → goal dipertahankan
(radius goal ikut); (3) pinch aktif → pointermove TIDAK memutar kamera;
(4) pinch end bersih (pinchActive turun — drag 1 jari hidup lagi);
(5) error window sesi = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9472
APP = "http://127.0.0.1:9503/app/"

env = dict(os.environ, DISPLAY=":99")
if subprocess.run(["xdpyinfo", "-display", ":99"], stdout=subprocess.DEVNULL,
                  stderr=subprocess.DEVNULL).returncode != 0:
    subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                      "--enable-unsafe-swiftshader", "--window-size=1366,768",
                      "--disable-dev-shm-usage", "about:blank"],
                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = False
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
    errs, excs = [], []

    def send_raw(d):
        h = b"\x81"; n = len(d); mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def rx(k):
        b = b""
        while len(b) < k:
            c = s.recv(k - len(b))
            if not c:
                raise ConnectionResetError()
            b += c
        return b

    def read_msg():
        hdr = rx(2); op = hdr[0] & 0xF; n = hdr[1] & 0x7F
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        d = rx(n)
        while op == 0:
            h2 = rx(2); op2 = h2[0] & 0xF; n2 = h2[1] & 0x7F
            if n2 == 126:
                n2 = struct.unpack(">H", rx(2))[0]
            d += rx(n2)
            op = op2
        return json.loads(d)

    def handle(m):
        meth = m.get("method", "")
        pms = m.get("params", {})
        if meth == "Runtime.consoleAPICalled" and pms.get("type") == "error":
            txt = " ".join(str(a.get("value", a.get("description", "")))[:200]
                           for a in pms.get("args", []) if isinstance(a, dict))
            if "deprecated" not in txt.lower():
                errs.append(txt)
        elif meth == "Runtime.exceptionThrown":
            excs.append(json.dumps(pms.get("exceptionDetails", {}))[:300])

    def pump(seconds, want_id=None, timeout_s=2.0):
        deadline = time.time() + seconds
        s.settimeout(timeout_s)
        while True:
            if time.time() > deadline:
                return None
            try:
                m = read_msg()
            except (socket.timeout, TimeoutError):
                if time.time() > deadline:
                    return None
                continue
            if want_id is not None and m.get("id") == want_id:
                return m
            handle(m)

    def ev(expr, wait=6.0, await_promise=False):
        mid[0] += 1
        myid = mid[0]
        send_raw(json.dumps({"id": myid, "method": "Runtime.evaluate",
                             "params": {"expression": expr, "returnByValue": True,
                                        "awaitPromise": await_promise}}).encode())
        r = pump(wait, want_id=myid)
        if r is None:
            return {"TIMEOUT": True}
        r = r.get("result", {})
        if "exceptionDetails" in r:
            return {"EXC": json.dumps(r["exceptionDetails"])[:500]}
        return r.get("result", {}).get("value")

    def ev_until(expr, wait_total=40, poll=1.0):
        t0 = time.time()
        while time.time() - t0 < wait_total:
            v = ev(expr, poll)
            if v is True:
                return True
            time.sleep(0.3)
        return False

    def cmd(method, wait=3.0, **params):
        mid[0] += 1
        myid = mid[0]
        send_raw(json.dumps({"id": myid, "method": method, "params": params}).encode())
        return pump(wait, want_id=myid)

    cmd("Runtime.enable")
    cmd("Page.enable")
    cmd("Page.navigate", url=APP)
    hooks = ev_until("!!window.__scene && !!window.__agentData && !!window.__toggleNeon")
    if not hooks:
        print("FAIL: hooks scene tak terpasang")
        raise SystemExit(1)
    pump(6)

    SCENARIO = r"""(() => {
      const el = document.querySelector('canvas');
      if (!el) return { fatal: 'no-canvas' };
      // Skenario SINKRON penuh: semua handler pinch/pointer & mutasi state
      // (pinchRadius/zoomFocusGoal/updCam) sinkron — tak perlu await antar
      // langkah (SwiftShader ~0.3fps membuat await timer mahal per langkah).
      const pinch = (x1, y1, x2, y2, phase) => {
        const mk = (id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
        const tch = [mk(1, x1, y1), mk(2, x2, y2)];
        const tt = phase === 'end' ? [] : tch;
        el.dispatchEvent(new TouchEvent('touch' + phase, {
          touches: tt, targetTouches: tt, changedTouches: tch, bubbles: true, cancelable: true
        }));
      };
      const out = {};
      // TES 1: pinch melebar → zoom IN
      out.r0 = window.__cam.sph.radius;
      pinch(300, 300, 500, 300, 'start');
      for (let i = 1; i <= 6; i++) { pinch(300, 300, 500 + i * 50, 300, 'move'); }
      pinch(300, 300, 800, 300, 'end');
      out.r1 = window.__cam.sph.radius;
      // TES 2: pinch saat follow goal aktif → goal dipertahankan, radius goal ikut
      const nm = window.__agentData && window.__agentData[0] && window.__agentData[0].agent.name;
      window.__focusAgent(nm);
      out.goalA = window.__dbg().focus;
      pinch(300, 300, 500, 300, 'start');
      pinch(300, 300, 560, 300, 'move');
      pinch(300, 300, 620, 300, 'move');
      pinch(300, 300, 620, 300, 'end');
      out.goalB = window.__dbg().focus;
      window.__wfsSceneControls.resetFocus();
      // TES 3: pinch aktif → pointermove tidak memutar kamera
      out.phi0 = window.__cam.sph.phi; out.th0 = window.__cam.sph.theta;
      pinch(300, 300, 500, 300, 'start');
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 200, bubbles: true }));
      out.phi1 = window.__cam.sph.phi; out.th1 = window.__cam.sph.theta;
      pinch(300, 300, 500, 300, 'end');
      // TES 4: sesudah pinch selesai, drag 1 jari hidup lagi (pointerdown → isDrag)
      out.th2 = window.__cam.sph.theta;
      el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 600, clientY: 300, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, clientY: 300, bubbles: true }));
      out.th3 = window.__cam.sph.theta;
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 700, clientY: 300, bubbles: true }));
      return out;
    })()"""
    res = ev(SCENARIO, wait=40.0, await_promise=True)
    print("hasil:", json.dumps(res)[:600])

    t1 = isinstance(res, dict) and not res.get("fatal") and \
        res.get("r1") is not None and res["r1"] < res["r0"] - 0.5
    ga, gb = (res or {}).get("goalA"), (res or {}).get("goalB")
    t2 = bool(ga) and bool(gb) and ga.get("r") is not None and gb.get("r") is not None \
        and gb["r"] < ga["r"]
    t3 = isinstance(res, dict) and res.get("phi0") == res.get("phi1") and res.get("th0") == res.get("th1")
    t4 = isinstance(res, dict) and res.get("th3") is not None and res.get("th2") is not None \
        and res["th3"] != res["th2"]
    pump(4)
    n_err = len([e for e in errs if "init failed" not in e.lower()])
    print(f"TES1 zoomIN={t1} TES2 goal-preserved={t2} TES3 drag-suppressed={t3} TES4 drag-resumed={t4}")
    print(f"ERRS={n_err} EXCS={len(excs)}")
    ok = t1 and t2 and t3 and t4 and n_err == 0 and len(excs) == 0
    print("===> OK" if ok else "===> FAIL")
finally:
    p.kill()
    os.system(f"pkill -f 'remote-debugging-port={PORT}' 2>/dev/null")
