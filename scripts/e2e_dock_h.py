#!/usr/bin/env python3
"""e2e_dock_h.py — siklus 184: dock mobile ADAPTIF (CDP :99, emulasi HP).
Bug dulu (terukur CDP): tombol dock 24 pasca-siklus 178/182/183 → dock
membungkus 3-4 baris di ≤560px tapi CSS clamp `max-height: 120px` (era 2
baris) → baris terakhir MELUAP keluar kapsul kaca (390px: kapsul berakhir
y=826, tombol sampai y=842) dan di 360px baris ke-4 TERPOTONG viewport
(bottom 842 > vh 800) — tombol tak bisa diklik. Offset HUD/toast statis
148/200px juga tak lagi cocok. Fix: tanpa clamp + App mengukur .dock live
(ResizeObserver, lib/dock_h.js) → CSS var --dock-h → offset HUD/toast
calc(var(--dock-h)+inset).
Tes (emulasi mobile 390x844 & 360x800):
(1) 390px: var --dock-h terpasang & = tinggi dock (ceil, ≥130);
(2) 390px: TIDAK ada tombol dock di luar kapsul (all btn bottom ≤ dock bottom)
    & tidak terpotong viewport (≤ vh);
(3) 390px: HUD berada DI ATAS dock tanpa tumpang tindih (hud.bottom ≤ dock.top);
(4) 360px: baris ke-4 dulu terpotong — kini semua tombol ≤ viewport & bisa
    diklik (elementFromPoint di pusat tombol terakhir = tombol itu sendiri);
(5) klik tombol baris terakhir (Bantuan) berfungsi nyata (dialog Help terbuka);
(6) error window = 0.
Pelajaran tooling (183 tetap berlaku): evaluate pertama pasca-navigasi flaky
→ retry; spread [...] memicu ReferenceError di beberapa build chrome-shell →
pakai Array.from / Object.keys.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9486
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

    def ev(expr, wait=8.0, await_promise=False):
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
        return { lb: (b.querySelector('.lb') || {}).textContent || '', x: r.x, y: r.y,
                 w: r.width, h: r.height, bottom: r.bottom, right: r.right };
      });
      if (!btns.length) return { err: 'no-btns' };
      const varPx = getComputedStyle(document.documentElement).getPropertyValue('--dock-h').trim();
      const hud = document.querySelector('.hud');
      const hudR = hud ? hud.getBoundingClientRect() : null;
      return { vw: innerWidth, vh: innerHeight,
               dockTop: d.top, dockBottom: d.bottom, dockH: d.height,
               varPx, nBtn: btns.length,
               maxBtnBottom: Math.max.apply(null, btns.map(b => b.bottom)),
               maxBtnRight: Math.max.apply(null, btns.map(b => b.right)),
               clippedVp: btns.some(b => b.bottom > innerHeight + 1),
               outsideCapsule: btns.some(b => b.bottom > d.bottom + 1 || b.right > d.right + 1),
               hud: hudR ? { bottom: hudR.bottom, top: hudR.top } : null };
    })()"""

    def mobile(w, h):
        cmd("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=2, mobile=True)
        cmd("Page.navigate", url=APP)
        hooks = False
        for _ in range(12):
            r = ev("!!window.__scene && !!window.__agentData", wait=4)
            if r is True:
                hooks = True
                break
            time.sleep(0.5)
        if not hooks:
            return None
        pump(5)
        return ev_retry(PROBE, wait=15)

    # ── 390x844 (iPhone-ish) ──────────────────────────────────────────────
    r390 = mobile(390, 844)
    check("TES1 390px: var --dock-h terukur & = ceil(tinggi dock), >= 130",
          isinstance(r390, dict) and not r390.get("err")
          and r390.get("varPx") not in (None, "", "130px")
          and abs(float(str(r390.get("varPx", "0")).replace("px", "")) - r390.get("dockH", -1)) <= 1
          and float(str(r390.get("varPx", "0")).replace("px", "")) >= 130,
          str(r390)[:220])
    check("TES2 390px: TIDAK ada tombol di luar kapsul & tak terpotong viewport (dulu meluap 16px)",
          isinstance(r390, dict) and not r390.get("err")
          and r390.get("outsideCapsule") is False and r390.get("clippedVp") is False,
          str(r390)[:220])
    check("TES3 390px: HUD DI ATAS dock (hud.bottom <= dock.top + toleransi)",
          isinstance(r390, dict) and r390.get("hud")
          and r390["hud"]["bottom"] <= r390.get("dockTop", 1e9) + 4,
          str(r390.get("hud")) + " dockTop=" + str(r390.get("dockTop")))

    # ── 360x800 (layar sempit: dulu baris ke-4 TERPOTONG) ─────────────────
    r360 = mobile(360, 800)
    check("TES4 360px: semua tombol <= viewport & baris terakhir benar2 bisa diklik",
          isinstance(r360, dict) and not r360.get("err") and r360.get("clippedVp") is False,
          str(r360)[:220])
    r4 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const btns = Array.from(document.querySelectorAll('.dock .ibtn'));
      if (!btns.length) return { ok: false };
      const last = btns[btns.length - 1];
      const r = last.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitIsBtn = !!(hit && (hit === last || last.contains(hit)));
      if (hitIsBtn) last.click();
      await sleep(700);
      const help = !!document.querySelector('.modal[role="dialog"]');
      return { ok: hitIsBtn, help, label: (last.querySelector('.lb') || {}).textContent,
               cy: Math.round(cy), vh: innerHeight };
    })()""", wait=25, await_promise=True)
    check("TES5 360px: klik tombol baris terakhir (Bantuan) → dialog Help terbuka nyata",
          isinstance(r4, dict) and r4.get("ok") and r4.get("help"), str(r4)[:200])

    # TES 6: error window = 0.
    check("TES6 error window = 0", not errs and not excs, f"errs={len(errs)} excs={len(excs)}")

    n_pass = sum(1 for _, c, _ in T if c)
    print(f"\n===> {n_pass}/{len(T)} OK")
    p.terminate()
    raise SystemExit(0 if n_pass == len(T) else 1)
finally:
    p.terminate() if 'p' in dir() else None
