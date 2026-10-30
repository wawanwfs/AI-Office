#!/usr/bin/env python3
"""e2e_input_edges.py — siklus 176: verifikasi live tepi input pointer (CDP :99).
Satu Runtime.evaluate sinkron (pelajaran 174: eval terpisah kelaparan oleh
SwiftShader). Tes: (1) contextmenu kanvas dicegah (defaultPrevented, tanpa
menu — event cukup); (2) klik KANAN (button=2) TIDAK mengubah goal kamera
(dulu dihitung klik raycast — kamera reset/fokus tanpa niat); (3) klik TENGAH
(button=1) dicegah + tak mengubah goal (autoscroll Chrome); (4) pointercancel
setelah pointerdown → drag BERIKUTNYA mati (dulu isDrag basi = drag hantu) dan
drag valid SETELAH cancel tetap hidup; (5) pointermove buttons=0 tidak memutar
kamera (tombol dilepas di luar window); (6) tombol Rumah HUD ada & bekerja:
goal aktif → klik Rumah → goal reset ke rumah (padanan Escape mobile);
(7) klik kiri normal tetap hidup; (8) error window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9474
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
      const out = {};
      const dbg = () => window.__dbg();
      const PE = (type, x, y, btn, btns) => new PointerEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true,
        button: btn, buttons: btns, pointerId: 1, pointerType: 'mouse', isPrimary: true });

      // TES 1: contextmenu dicegah — listener preventDefault di canvas.
      let prevented = null;
      const cmProbe = (e) => { prevented = e.defaultPrevented; };
      el.addEventListener('contextmenu', cmProbe, { once: true });
      el.dispatchEvent(new MouseEvent('contextmenu', { clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
      el.removeEventListener('contextmenu', cmProbe);
      out.ctxMenuPrevented = prevented === true;

      // TES 2: klik KANAN (button=2) TIDAK mengubah goal — dulu jalur klik
      // raycast menghitungnya (kamera reset/fokus tanpa niat user).
      window.__focusAgent(window.__agentData[0].agent.name);
      const gA = dbg().focus;
      el.dispatchEvent(PE('pointerdown', 700, 690, 2, 2));  // tombol kanan turun
      el.dispatchEvent(PE('pointerup', 700, 690, 2, 0));    // tombol kanan naik
      const gB = dbg().focus;
      out.rightNoGoalChange = !!gA && !!gB &&
        gA.r === gB.r && gA.reset === gB.reset;

      // TES 3: klik TENGAH (button=1) dicegah (autoscroll) & tak mengubah goal.
      let midPrev = null;
      const midProbe = (e) => { midPrev = e.defaultPrevented; };
      el.addEventListener('pointerdown', midProbe, { once: true });
      el.dispatchEvent(PE('pointerdown', 500, 300, 1, 4));
      el.removeEventListener('pointerdown', midProbe);
      el.dispatchEvent(PE('pointerup', 500, 300, 1, 0));
      out.midPrevented = midPrev === true;
      const gC = dbg().focus;
      out.midNoGoalChange = gC.r === gB.r && gC.reset === gB.reset;

      // TES 4: pointercancel mereset drag — dulu isDrag basi: pointermove
      // SETELAH cancel (buttons=0) tetap memutar kamera ("drag hantu").
      out.th0 = window.__cam.sph.theta;
      el.dispatchEvent(PE('pointerdown', 600, 300, 0, 1));  // kiri turun → isDrag
      el.dispatchEvent(new PointerEvent('pointercancel', { clientX: 600, clientY: 300, bubbles: true, cancelable: true, pointerId: 1 }));
      out.th1 = window.__cam.sph.theta;                     // cancel: tak berubah
      window.dispatchEvent(PE('pointermove', 850, 300, 0, 0)); // dulu: memutar (drag hantu)
      out.th2 = window.__cam.sph.theta;
      out.ghostDead = Math.abs(out.th2 - out.th1) < 1e-9;   // kamera DIAM
      // drag VALID setelah cancel tetap hidup (buttons=1)
      el.dispatchEvent(PE('pointerdown', 600, 300, 0, 1));
      window.dispatchEvent(PE('pointermove', 700, 300, 0, 1));
      out.th3 = window.__cam.sph.theta;
      out.validDragAlive = Math.abs(out.th3 - out.th2) > 1e-6;
      window.dispatchEvent(PE('pointerup', 700, 300, 0, 0));
      // cursor tak terkunci 'grabbing' setelah cancel (drag sebelumnya di-reset)
      out.cursorFree = el.style.cursor !== 'grabbing';

      // TES 5: tombol Rumah HUD — ada & bekerja: goal aktif → klik → reset rumah.
      const homeBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Kembali ke tampilan awal');
      out.homeBtnExists = !!homeBtn;
      if (homeBtn) {
        window.__focusAgent(window.__agentData[0].agent.name);
        const gBefore = dbg().focus;
        homeBtn.click();
        const gAfter = dbg().focus;
        out.homeResetsGoal = !!gBefore && !!gAfter && gAfter.reset === true;
        out.homeClearsSel = (window.__sceneSelRing ? window.__sceneSelRing.visible : false) === false;
      }

      // TES 6: klik kiri normal tetap hidup (goal berubah bila kena agen /
      // reset bila kosong — bukan dibekukan oleh guard baru).
      window.__focusAgent(window.__agentData[0].agent.name);
      const gD = dbg().focus;
      el.dispatchEvent(PE('pointerdown', 700, 690, 0, 1));
      el.dispatchEvent(PE('pointerup', 700, 690, 0, 0));
      const gE = dbg().focus;
      out.leftClickAlive = !!gD && !!gE && (gE.r !== gD.r || gE.reset !== gD.reset);
      return out;
    })()"""
    res = ev(SCENARIO, wait=40.0, await_promise=True)
    print("hasil:", json.dumps(res)[:700])

    t1 = isinstance(res, dict) and res.get("ctxMenuPrevented") is True
    t2 = isinstance(res, dict) and res.get("rightNoGoalChange") is True
    t3 = isinstance(res, dict) and res.get("midPrevented") is True and res.get("midNoGoalChange") is True
    t4 = isinstance(res, dict) and res.get("ghostDead") is True and res.get("validDragAlive") is True \
        and res.get("cursorFree") is True
    t5 = isinstance(res, dict) and res.get("homeBtnExists") is True and \
        res.get("homeResetsGoal") is True and res.get("homeClearsSel") is True
    t6 = isinstance(res, dict) and res.get("leftClickAlive") is True
    pump(4)
    n_err = len([e for e in errs if "init failed" not in e.lower()])
    print(f"TES1 contextmenu-blocked={t1} TES2 right-click-inert={t2} TES3 middle-blocked={t3} "
          f"TES4 cancel-kills-ghost-drag={t4} TES5 home-button-works={t5} TES6 left-click-alive={t6}")
    print(f"ERRS={n_err} EXCS={len(excs)}")
    ok = t1 and t2 and t3 and t4 and t5 and t6 and n_err == 0 and len(excs) == 0
    print("===> OK" if ok else "===> FAIL")
finally:
    p.kill()
    os.system(f"pkill -f 'remote-debugging-port={PORT}' 2>/dev/null")
