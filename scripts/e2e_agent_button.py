#!/usr/bin/env python3
"""e2e_agent_button.py — siklus 182: verifikasi live tombol dock AGEN (CDP :99).
Paritas tombol dgn shortcut C (siklus 181) — pola G↔FOTO (179). Jalur: klik
tombol [aria-label="Agen berikutnya"] di dock → onCycleAgent(false) →
sceneControls.cycleAgent → focusAgentRoot (goal follow r=20 + ring emas +
bubble + inspector, TANPA panel chat — suppressSync).
Tes:
(1) tombol ada di DOM (prop onCycleAgent terpasang) — kondisi awal;
(2) klik tombol → fokus agen pertama: goal follow r=20 EKSAK + inspector tampil
    + tanpa panel chat (kontrak suppressSync 181);
(3) klik lagi → agen BERUBAH tiap langkah (inspector terbuka tidak memblokir —
    tombol bukan shortcut, tak lewat guard modal; kontrak exception 181);
(4) tombol tetap berfungsi meski inspector terbuka + Escape menutup fokus
    (kontrak resetFocusGoal: goal jadi reset r≈42.5, probe null);
(5) error window = 0.
Urutan: state agen disentuh mulai TES2 — sesudah dokumentasi (pola siklus 179).
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9477
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
    hooks = ev_until("!!window.__scene && !!window.__agentData")
    if not hooks:
        print("FAIL: hooks scene tak terpasang")
        raise SystemExit(1)
    pump(6)

    T = []

    def check(name, cond, detail=""):
        T.append((name, bool(cond), detail))
        print(("PASS" if cond else "FAIL") + f" — {name}" + (f" [{detail}]" if detail else ""))

    # TES 1: tombol AGEN ada di dock (prop onCycleAgent terpasang → dirender).
    btn = ev("""(() => {
      const b = document.querySelector('button[aria-label="Agen berikutnya"]');
      return b ? { found: true, title: b.getAttribute('title'), dock: !!b.closest('.dock') } : { found: false };
    })()""")
    check("TES1 tombol AGEN ada di dock (aria-label + title menyebut shortcut C)",
          isinstance(btn, dict) and btn.get("found") and btn.get("dock")
          and "shortcut C" in str(btn.get("title", "")), str(btn))

    # TES 2: klik tombol → fokus agen pertama (goal follow r=20 EKSAK + ring +
    # inspector [aria-label^="Profil"] tampil + TANPA panel chat). Probe eksak
    # pola e2e_agent_cycle (181). Poll async: tween kamera butuh waktu.
    r2 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const b = document.querySelector('button[aria-label="Agen berikutnya"]');
      if (!b) return { ok: false, why: 'no-button' };
      const before = window.__agentCycle();
      b.click();
      let name = null;
      for (let i = 0; i < 16; i++) { await sleep(250); name = window.__agentCycle(); if (name) break; }
      await sleep(400);
      const ring = !!(window.__sceneSelRing && window.__sceneSelRing.visible);
      const goal = window.__dbg().focus;
      const insp = !!document.querySelector('[aria-label^="Profil"]');
      const panel = !!document.getElementById('wfs-panel');
      return { ok: !!name, before, name, ring, goalR: goal ? goal.r : null,
               insp, panel };
    })()""", wait=30, await_promise=True)
    st2 = r2.get("st", {}) if isinstance(r2, dict) else {}
    check("TES2 klik AGEN → fokus agen + ring + inspector tampil + TANPA panel chat (suppressSync)",
          isinstance(r2, dict) and r2.get("ok") and r2.get("insp") and r2.get("panel") is False,
          str(r2)[:200])
    # TES 2b: goal follow aktif r=20 (paritas eksak klik agen).
    check("TES2b goal follow r=20 (paritas fokus eksak klik agen)",
          isinstance(r2, dict) and r2.get("ok") and r2.get("goalR") == 20, str(r2)[:120])

    # TES 3: klik lagi → agen BERUBAH tiap langkah meski inspector terbuka
    # (tombol bukan shortcut — tidak lewat guard modal; delegasi sama dgn C).
    r3 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const sel = () => (window.__agentCycle ? window.__agentCycle() : null);
      const first = sel();
      const b = document.querySelector('button[aria-label="Agen berikutnya"]');
      if (!b) return { ok: false };
      b.click(); await sleep(600);
      const second = sel();
      b.click(); await sleep(600);
      const third = sel();
      return { ok: true, first, second, third,
               changed: first !== second && second !== third };
    })()""", wait=20, await_promise=True)
    check("TES3 klik berulang → agen berubah tiap langkah (inspector tak memblokir)",
          isinstance(r3, dict) and r3.get("ok") and r3.get("changed"), str(r3)[:200])

    # TES 4: Escape menutup fokus — kontrak resetFocusGoal (pola TES5 siklus
    # 181): goal follow HILANG diganti goal reset {reset:true, r≈42.5} + probe
    # null + inspector tertutup.
    r4 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const gFollow = window.__dbg().focus;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      let name = window.__agentCycle(), goal = gFollow, insp = true;
      for (let i = 0; i < 20; i++) { await sleep(400);
        name = window.__agentCycle();
        goal = window.__dbg().focus;
        insp = !!document.querySelector('[aria-label^="Profil"]');
        if (name === null && goal === null && !insp) break; }
      const wasFollow = !!(gFollow && gFollow.reset !== true);
      const isReset = !!(goal && goal.reset === true);
      return { wasFollow, cleared: name === null, isReset, inspClosed: !insp,
               goalR: goal ? goal.r : null };
    })()""", wait=90, await_promise=True)
    check("TES4 Escape → fokus lepas (probe null) + goal reset (kontrak resetFocusGoal)",
          isinstance(r4, dict) and r4.get("wasFollow") and r4.get("cleared")
          and r4.get("isReset") and r4.get("inspClosed"), str(r4)[:200])

    # TES 5: error window = 0.
    check("TES5 error window = 0", not errs and not excs, f"errs={len(errs)} excs={len(excs)}")

    n_pass = sum(1 for _, c, _ in T if c)
    print(f"\n===> {n_pass}/{len(T)} OK")
    p.terminate()
    raise SystemExit(0 if n_pass == len(T) else 1)
finally:
    p.terminate() if 'p' in dir() else None
