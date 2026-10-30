#!/usr/bin/env python3
"""e2e_dtap.py — siklus 175: verifikasi live double-tap zoom mobile + gerbang
klik pinch (CDP :99). Seluruh skenario dalam SATU Runtime.evaluate sinkron
(eval terpisah kelaparan oleh SwiftShader ~0.3fps — pelajaran 174).
Tes: (1) double-tap → zoom IN ×0.82; (2) double-tap saat follow → goal
dipertahankan, radius goal ikut (zoom jujur 121); (3) angkat jari-1 dari pinch
TIDAK lagi memicu klik hantu (goal tak reset ke rumah — dulu bug); (4) dua tap
lambat (>350ms) = BUKAN double-tap (radius diam); (5) touchcancel mereset
state gestur → pinch & double-tap berikutnya tetap hidup; (6) error window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9473
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
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      // satu tap: touchstart 1 jari + touchend (changedTouches = jari itu)
      const tap = (x, y) => {
        const t1 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [t1], targetTouches: [t1], changedTouches: [t1], bubbles: true, cancelable: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t1], bubbles: true, cancelable: true }));
      };
      const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };

      // TES 1: double-tap → zoom IN (radius ×0.82 per pasangan)
      out.r0 = window.__cam.sph.radius;
      tap(500, 300); tap(504, 302);
      out.r1 = window.__cam.sph.radius;

      // TES 4 (dulu, saat radius masih bersih): dua tap LAMBAT bukan double-tap
      tap(500, 300); busy(420); tap(500, 300);
      out.r2 = window.__cam.sph.radius;

      // TES 2: double-tap saat follow → goal dipertahankan, radius goal ikut
      const nm = window.__agentData && window.__agentData[0] && window.__agentData[0].agent.name;
      window.__focusAgent(nm);
      out.goalA = window.__dbg().focus;
      tap(500, 300); tap(504, 302);
      out.goalB = window.__dbg().focus;
      out.r3 = window.__cam.sph.radius;

      // TES 3: angkat jari-1 dari pinch TIDAK memicu klik hantu (dulu: goal
      // di-reset ke rumah — kamera melompat tepat setelah user selesai mencubit).
      // pointerup dikirim ke CANVAS (target produksi; bubble ke window sesudahnya)
      // agar gerbang pinchGuard di listener canvas benar-benar diuji.
      const goalBefore = window.__dbg().focus;
      const pd = (x, y) => el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
      const pu = (x, y) => el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
      const mk = (id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      pd(300, 300); // jari-1 turun (pointerdown → downXY)
      let tA = mk(1, 300, 300), tB = mk(2, 500, 300);
      let tt = [tA, tB];
      el.dispatchEvent(new TouchEvent('touchstart', { touches: tt, targetTouches: tt, changedTouches: tt, bubbles: true, cancelable: true }));
      tt = [tB]; // jari-2 menempel, jari-1 naik
      el.dispatchEvent(new TouchEvent('touchend', { touches: tt, targetTouches: tt, changedTouches: [tA], bubbles: true, cancelable: true }));
      pu(300, 300); // pointerup jari-1 — dulu: klik hantu → goal reset
      tt = [];
      el.dispatchEvent(new TouchEvent('touchend', { touches: tt, targetTouches: tt, changedTouches: [tB], bubbles: true, cancelable: true }));
      out.goalAfterPinch = window.__dbg().focus;

      // TES 5: touchcancel mereset state → double-tap berikutnya tetap hidup
      tt = [mk(1, 300, 300), mk(2, 500, 300)];
      el.dispatchEvent(new TouchEvent('touchstart', { touches: tt, targetTouches: tt, changedTouches: tt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchcancel', { touches: [], targetTouches: [], changedTouches: tt, bubbles: true, cancelable: true }));
      out.r4 = window.__cam.sph.radius;
      tap(500, 300); tap(504, 302);
      out.r5 = window.__cam.sph.radius;

      // SANITAS: klik biasa (pointerdown+up ke canvas, tanpa pinch) tetap hidup
      // — goal BERUBAH (bila kosong → reset ke rumah; bila kena agen → fokus
      // baru): bukti pinchGuard tidak membekukan klik normal.
      window.__focusAgent(nm);
      const gHas = !!window.__dbg().focus;
      const gBeforeClick = window.__dbg().focus;
      pd(700, 690); pu(700, 690);
      out.clickRestored = gHas; // goal ada sebelum klik biasa (dipakai utk konteks)
      out.goalAfterClick = window.__dbg().focus;
      out.goalChangedByClick = !!gBeforeClick && !!out.goalAfterClick &&
        (out.goalAfterClick.r !== gBeforeClick.r || out.goalAfterClick.reset !== gBeforeClick.reset);
      return out;
    })()"""
    res = ev(SCENARIO, wait=40.0, await_promise=True)
    print("hasil:", json.dumps(res)[:700])

    t1 = isinstance(res, dict) and not res.get("fatal") and \
        res.get("r1") is not None and res["r1"] < res["r0"] * 0.9
    ga, gb = (res or {}).get("goalA"), (res or {}).get("goalB")
    t2 = bool(ga) and bool(gb) and ga.get("r") is not None and gb.get("r") is not None \
        and gb.get("reset") == False and gb["r"] < ga["r"]
    gp = (res or {}).get("goalAfterPinch")
    t3 = isinstance(res, dict) and bool(gp) and gp.get("reset") != True and \
        gp.get("r") is not None and (ga or {}).get("r") is not None and \
        abs(gp["r"] - gb["r"]) < 1.0  # goal pinch TIDAK di-reset ke rumah (r rumah jauh lebih besar)
    t4 = isinstance(res, dict) and res.get("r2") is not None and \
        abs(res["r2"] - res["r1"]) < 0.01  # dua tap lambat → radius diam
    t5 = isinstance(res, dict) and res.get("r5") is not None and \
        res["r5"] < res["r4"] * 0.9  # pasca-touchcancel double-tap tetap berfungsi
    t6 = isinstance(res, dict) and res.get("goalChangedByClick") is True  # klik normal hidup
    pump(4)
    n_err = len([e for e in errs if "init failed" not in e.lower()])
    print(f"TES1 dtap-zoomIN={t1} TES2 goal-preserved={t2} TES3 no-phantom-click={t3} "
          f"TES4 slow-taps-no-op={t4} TES5 cancel-then-dtap={t5} TES6 click-alive={t6}")
    print(f"ERRS={n_err} EXCS={len(excs)}")
    ok = t1 and t2 and t3 and t4 and t5 and t6 and n_err == 0 and len(excs) == 0
    print("===> OK" if ok else "===> FAIL")
finally:
    p.kill()
    os.system(f"pkill -f 'remote-debugging-port={PORT}' 2>/dev/null")
