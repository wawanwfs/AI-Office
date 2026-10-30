#!/usr/bin/env python3
"""e2e_dock_wrap.py — siklus 185: dock WRAP universal + offset era-eksak (CDP :99).

Bug dulu (terukur CDP): konten dock 24 tombol berlabel ~1498px tapi `.dock`
global flex-wrap:nowrap → SEMUA viewport <1520px menyunat kanan: di 1366/1440
(laptop umum) tombol Chat…Bantuan DI LUAR viewport — tak terlihat & tak bisa
diklik (600/680/760/800/900/1000/1366/1440 terukur clippedRight=true).
Bonus: panel chat #wfs-panel kini bisa berada DI BAWAH HUD (z 20 < 25) →
tombol header panel tertutup HUD.

Tes:
  T1  lebar 600..1440: TIDAK ada tombol di luar kapsul & luar viewport (kanan);
  T2  1366px: tombol Bantuan (terakhir) terlihat & elementFromPoint = tombol itu;
  T3  1366px: klik Bantuan → dialog Help TERBUKA nyata; Escape tutup;
  T4  viewport lebar 1600: dock SATU baris (rows=1) & tak terpotong (persis dulu);
  T5  760px: HUD offset adaptif era-eksak — dock 1 baris → hud.bottom == dock.bottom+3 (±1);
  T6  760px: klik Chat → panel .panel terbuka; TIDAK ada tombol header panel
      yang tertutup HUD (elementFromPoint di pusat tombol ✕ panel = tombol ✕);
  T7  760px: saat panel terbuka, .hud ber-inert (pointer/Tab ke HUD diblokir);
      Escape tutup panel → .hud bebas inert;
  T8  error window = 0.
Pelajaran 182-184 tetap berlaku: evaluate pertama flaky → retry; Array.from
(bukan spread); getBoundingClientRect (bukan clientHeight).
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9488
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
            elif n2 == 127:
                n2 = struct.unpack(">Q", rx(8))[0]
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

    def ev(expr, wait=8.0):
        mid[0] += 1
        myid = mid[0]
        send_raw(json.dumps({"id": myid, "method": "Runtime.evaluate",
                             "params": {"expression": expr, "returnByValue": True}}).encode())
        r = pump(wait, want_id=myid)
        if r is None:
            return {"TIMEOUT": True}
        r = r.get("result", {})
        if "exceptionDetails" in r:
            return {"EXC": json.dumps(r["exceptionDetails"])[:400]}
        return r.get("result", {}).get("value")

    def ev_retry(expr, wait=8.0, n=3):
        for i in range(n):
            r = ev(expr, wait=wait)
            if not (isinstance(r, dict) and (r.get("TIMEOUT") or r.get("EXC"))):
                return r
            time.sleep(0.6)
        return r

    def cmd(method, wait=3.0, **params):
        mid[0] += 1
        myid = mid[0]
        send_raw(json.dumps({"id": myid, "method": method, "params": params}).encode())
        return pump(wait, want_id=myid)

    def wait_hooks():
        for _ in range(14):
            r = ev("!!window.__scene && !!window.__agentData", wait=4)
            if r is True:
                return True
            time.sleep(0.5)
        return False

    cmd("Runtime.enable")
    cmd("Page.enable")

    T = []

    def check(name, cond, detail=""):
        T.append((name, bool(cond), detail))
        print(("PASS" if cond else "FAIL") + f" — {name}" + (f" [{detail}]" if detail else ""))

    PROBE = """(() => {
      const dock = document.querySelector('.dock');
      if (!dock) return { err: 'no-dock' };
      const d = dock.getBoundingClientRect();
      const btns = Array.from(dock.querySelectorAll('.ibtn')).map(b => {
        const r = b.getBoundingClientRect();
        return { lb: (b.querySelector('.lb') || {}).textContent || '', x: Math.round(r.x),
                 y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                 bottom: Math.round(r.bottom), right: Math.round(r.right),
                 cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      });
      if (!btns.length) return { err: 'no-btns' };
      const hud = document.querySelector('.hud');
      const hudR = hud ? hud.getBoundingClientRect() : null;
      const rawVar = getComputedStyle(document.documentElement).getPropertyValue('--dock-h-raw').trim();
      return { vw: innerWidth, vh: innerHeight,
               dockLeft: Math.round(d.left), dockRight: Math.round(d.right),
               dockTop: Math.round(d.top), dockBottom: Math.round(d.bottom), dockH: Math.round(d.height),
               rawVar, nBtn: btns.length,
               maxBtnRight: Math.max.apply(null, btns.map(b => b.right)),
               maxBtnBottom: Math.max.apply(null, btns.map(b => b.bottom)),
               rows: Array.from(new Set(btns.map(b => b.y))).length,
               clippedRight: btns.some(b => b.right > innerWidth + 1),
               clippedVp: btns.some(b => b.bottom > innerHeight + 1 || b.right > innerWidth + 1),
               outsideCapsule: btns.some(b => b.right > d.right + 1 || b.bottom > d.bottom + 1),
               last: btns[btns.length - 1],
               hud: hudR ? { top: Math.round(hudR.top), bottom: Math.round(hudR.bottom) } : null,
               hudInert: hud ? hud.hasAttribute('inert') : null };
    })()"""

    CLICK_LAST = """(async () => {
      const btns = Array.from(document.querySelectorAll('.dock .ibtn'));
      const last = btns[btns.length - 1];
      if (!last) return { err: 'no-btn' };
      const r = last.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      let node = hit;
      while (node && node !== last && node !== document.body) node = node.parentElement;
      return { lb: (last.querySelector('.lb') || {}).textContent || '',
               cx: Math.round(cx), cy: Math.round(cy),
               hitIsBtn: node === last,
               hitTag: hit ? hit.tagName + '.' + (hit.className && hit.className.baseVal !== undefined ? hit.className.baseVal : hit.className) : null };
    })()"""

    def load_at(w, h, settle=5.0):
        cmd("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=w <= 760)
        cmd("Page.navigate", url=APP)
        wait_hooks()
        time.sleep(settle)
        r = ev_retry(PROBE, wait=15)
        if not isinstance(r, dict):
            r = {"err": "probe-failed", "raw": str(r)[:100]}
        return r

    # ── T1: lebar 600..1440 — tak ada tombol terpotong/luar kapsul ─────────
    widths = [(600, 900), (760, 900), (1000, 800), (1366, 768), (1440, 900)]
    all_ok = True
    det = []
    for w, h in widths:
        r = load_at(w, h)
        good = isinstance(r, dict) and not r.get("err") and \
            not r.get("clippedRight") and not r.get("outsideCapsule") and not r.get("clippedVp")
        all_ok = all_ok and good
        det.append(f"{w}:{'OK' if good else json.dumps(r)[:150]}")
    check("T1 600/760/1000/1366/1440px: semua tombol di dalam kapsul & viewport (dulu terpotong kanan)", all_ok, " ".join(det))

    # ── T2+T3 @1366: tombol terakhir terlihat, klik → Help terbuka ─────────
    r = load_at(1366, 768)
    last = r.get("last") or {}
    in_vp = last and last.get("right", 9e9) <= 1366 and last.get("bottom", 9e9) <= 768
    check("T2 1366px: tombol terakhir (Bantuan) sepenuhnya di viewport", bool(in_vp), json.dumps(last)[:120])
    c = ev_retry(CLICK_LAST, wait=8)
    check("T2b elementFromPoint di pusat tombol terakhir = tombol itu sendiri",
          isinstance(c, dict) and c.get("hitIsBtn") is True, json.dumps(c)[:160])
    ev("Array.from(document.querySelectorAll('.dock .ibtn')).pop().click()")
    time.sleep(1.2)
    help_open = ev("""(() => {
      const dlg = Array.from(document.querySelectorAll('[role="dialog"]'))
        .find(d => (d.textContent || '').includes('Panduan') || (d.textContent || '').includes('Bantuan') || d.getAttribute('aria-label') === 'Bantuan');
      return { open: !!dlg, vis: dlg ? dlg.getClientRects().length > 0 : false };
    })()""")
    check("T3 klik Bantuan → dialog Help TERBUKA nyata",
          isinstance(help_open, dict) and help_open.get("open") and help_open.get("vis"),
          json.dumps(help_open)[:120])
    ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(0.8)

    # ── T4 @1600: satu baris, persis dulu ───────────────────────────────────
    r = load_at(1600, 900)
    check("T4 1600px: dock SATU baris & tak terpotong (viewport lebar tak berubah perilaku)",
          not r.get("err") and r.get("rows") == 1 and
          not r.get("clippedRight") and not r.get("outsideCapsule"), json.dumps(r)[:180])

    # ── T5+T6+T7 @760: offset era-eksak + panel vs HUD ─────────────────────
    r = load_at(760, 900)
    dock_bottom = r.get("dockBottom")
    hud_bottom = (r.get("hud") or {}).get("bottom")
    era_ok = dock_bottom and hud_bottom is not None and abs((hud_bottom - dock_bottom) - 3) <= 1
    check("T5 760px dock 1 baris: HUD tepat 3px di atas dock (era-eksak 88px, nol lompatan)",
          bool(era_ok), f"dockBottom={dock_bottom} hudBottom={hud_bottom} rawVar={r.get('rawVar')}")
    # buka panel Chat (tombol kedua dari belakang)
    ev("""(() => {
      const btns = Array.from(document.querySelectorAll('.dock .ibtn'));
      const b = btns.find(x => (x.querySelector('.lb') || {}).textContent === 'Chat');
      if (b) b.click();
      return !!b;
    })()""")
    time.sleep(1.2)
    panel_probe = ev_retry("""(() => {
      const panel = document.querySelector('.dock .panel');
      if (!panel) return { open: false };
      const pr = panel.getBoundingClientRect();
      const xbtn = panel.querySelector('.ph .x, .x');
      const hud = document.querySelector('.hud');
      let out = { open: true, panelTop: Math.round(pr.top), panelBottom: Math.round(pr.bottom),
                  panelRight: Math.round(pr.right), hudInert: hud ? hud.hasAttribute('inert') : null };
      if (xbtn) {
        const br = xbtn.getBoundingClientRect();
        const hit = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
        let node = hit;
        while (node && node !== xbtn && node !== document.body) node = node.parentElement;
        out.xCoveredByHud = node !== xbtn;
        out.xTop = Math.round(br.top);
      }
      return out;
    })()""", wait=8)
    pp = panel_probe if isinstance(panel_probe, dict) else {}
    check("T6 760px panel chat DI ATAS dock & DI BAWAH HUD; tombol ✕ TIDAK tertutup HUD",
          pp.get("open") and pp.get("xCoveredByHud") is False,
          json.dumps(pp)[:200])
    check("T7 saat panel terbuka .hud ber-inert (pointer/Tab ke HUD diblokir)",
          pp.get("hudInert") is True, f"hudInert={pp.get('hudInert')}")
    ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))")
    time.sleep(1.0)
    after = ev("""(() => {
      const hud = document.querySelector('.hud');
      const panel = document.querySelector('.dock .panel');
      return { hudInert: hud ? hud.hasAttribute('inert') : null, panelGone: !panel };
    })()""")
    check("T7b Escape tutup panel → .hud bebas inert kembali",
          isinstance(after, dict) and after.get("hudInert") is False,
          json.dumps(after)[:120])

    # ── T8: error window ────────────────────────────────────────────────────
    time.sleep(1.5)
    check("T8 error window = 0", len(errs) == 0 and len(excs) == 0,
          f"errs={errs[:2]} excs={excs[:1]}")

    n_pass = sum(1 for _, c, _ in T if c)
    print(f"\n===> {n_pass}/{len(T)} OK")
    ok = n_pass == len(T)
finally:
    try:
        p.terminate()
    except Exception:
        pass
raise SystemExit(0 if ok else 1)
