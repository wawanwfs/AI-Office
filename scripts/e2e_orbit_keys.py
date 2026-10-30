#!/usr/bin/env python3
"""e2e_orbit_keys.py — siklus 177: verifikasi live orbit kamera via keyboard (CDP :99).
Satu Runtime.evaluate sinkron (pelajaran 174). Tes: (1) panah kiri/kanan
memutar theta ±0.12; (2) panah atas/bawah mengubah phi dgn arah benar;
(3) clamp: panah bawah 30× tak pernah menembus π/2.3 (kamera tak jatuh ke
lantai), panah atas 30× tak pernah menembus 0.18; (4) Shift+panah = 3× lebih
cepat (0.36 eksak); (5) goal follow TETAP hidup saat orbit (kontrak orbit
jujur — dulu tidak ada jalurnya, kini dijaga eksplisit); (6) Escape tetap
mengembalikan kamera setelah orbit (kontrak lama tak rusak); (7) error
window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9475
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
    hooks = ev_until("!!window.__scene && !!window.__agentData && !!window.__orbitStep")
    if not hooks:
        print("FAIL: hooks scene tak terpasang")
        raise SystemExit(1)
    pump(6)

    SCENARIO = r"""(() => {
      const out = {};
      const KEY = (key, shift) => new KeyboardEvent('keydown', {
        key, shiftKey: !!shift, bubbles: true, cancelable: true });
      const PHIMAX = Math.PI / 2.3;

      // TES 1: panah kiri/kanan memutar theta ±0.12.
      const th0 = window.__cam.sph.theta;
      window.dispatchEvent(KEY('ArrowLeft'));
      out.thL = window.__cam.sph.theta;
      out.leftWorks = Math.abs((out.thL - th0) - 0.12) < 1e-9;
      const th1 = window.__cam.sph.theta;
      window.dispatchEvent(KEY('ArrowRight'));
      out.thR = window.__cam.sph.theta;
      out.rightWorks = Math.abs((out.thR - th1) + 0.12) < 1e-9;

      // TES 2: panah atas/bawah mengubah phi (naik −, turun +).
      const ph0 = window.__cam.sph.phi;
      window.dispatchEvent(KEY('ArrowUp'));
      out.phU = window.__cam.sph.phi;
      out.upWorks = Math.abs((out.phU - ph0) + 0.12) < 1e-9;
      window.dispatchEvent(KEY('ArrowDown'));
      out.phD = window.__cam.sph.phi;
      out.downWorks = Math.abs((out.phD - out.phU) - 0.12) < 1e-9;

      // TES 3: clamp — 30× panah bawah/atas: phi tak pernah menembus batas.
      for (let i = 0; i < 30; i++) window.dispatchEvent(KEY('ArrowDown'));
      out.phiMaxOk = window.__cam.sph.phi <= PHIMAX + 1e-12;
      const phiMaxSeen = window.__cam.sph.phi;
      for (let i = 0; i < 60; i++) window.dispatchEvent(KEY('ArrowUp'));
      out.phiMinOk = window.__cam.sph.phi >= 0.18 - 1e-12;
      out.phiMinSeen = window.__cam.sph.phi;
      out.clamped = Math.abs(phiMaxSeen - PHIMAX) < 1e-9 && Math.abs(out.phiMinSeen - 0.18) < 1e-9;

      // TES 4: Shift+panah = 3× (0.36 eksak).
      const th2 = window.__cam.sph.theta;
      window.dispatchEvent(KEY('ArrowRight', true));
      out.shiftStep = th2 - window.__cam.sph.theta;
      out.shiftFast = Math.abs(out.shiftStep - 0.36) < 1e-9;

      // TES 5: goal follow TETAP hidup saat orbit (kontrak orbitFocusGoal).
      window.__focusAgent(window.__agentData[0].agent.name);
      const gA = window.__dbg().focus;
      window.dispatchEvent(KEY('ArrowLeft'));
      const gB = window.__dbg().focus;
      out.goalKept = !!gA && !!gB && !gB.reset && gA.r === gB.r;

      // TES 6: Escape pasca-orbit tetap mengembalikan kamera (kontrak lama).
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const gC = window.__dbg().focus;
      out.escapeStillWorks = !!gC && gC.reset === true;
      return out;
    })()"""
    res = ev(SCENARIO, wait=40.0, await_promise=True)
    print("hasil:", json.dumps(res)[:600])

    t1 = isinstance(res, dict) and res.get("leftWorks") is True and res.get("rightWorks") is True
    t2 = isinstance(res, dict) and res.get("upWorks") is True and res.get("downWorks") is True
    t3 = isinstance(res, dict) and res.get("phiMaxOk") is True and res.get("phiMinOk") is True and res.get("clamped") is True
    t4 = isinstance(res, dict) and res.get("shiftFast") is True
    t5 = isinstance(res, dict) and res.get("goalKept") is True
    t6 = isinstance(res, dict) and res.get("escapeStillWorks") is True
    pump(4)
    n_err = len([e for e in errs if "init failed" not in e.lower()])
    print(f"TES1 left-right-orbit={t1} TES2 up-down-tilt={t2} TES3 phi-clamped={t3} "
          f"TES4 shift-3x={t4} TES5 goal-kept={t5} TES6 escape-works={t6}")
    print(f"ERRS={n_err} EXCS={len(excs)}")
    ok = t1 and t2 and t3 and t4 and t5 and t6 and n_err == 0 and len(excs) == 0
    print("===> OK" if ok else "===> FAIL")
finally:
    p.kill()
    os.system(f"pkill -f 'remote-debugging-port={PORT}' 2>/dev/null")
