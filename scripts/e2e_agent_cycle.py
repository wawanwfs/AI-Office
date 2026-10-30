#!/usr/bin/env python3
"""e2e_agent_cycle.py — siklus 181: verifikasi live shortcut C/Shift+C (siklus
fokus agen, CDP :99). Transport salinan e2e_modal_flag.py (terbukti).
Tes: (1) C pertama dari tanpa seleksi → agen pertama terfokus: goal follow
r=20, ring emas tampil, inspector agen muncul, PANEL CHAT TIDAK terbuka
(kontrak suppressSync — panel modal mematikan C berikutnya); (2) C kedua &
ketiga → nama agen BERUBAH tiap langkah meski inspector terbuka (kontrak
EXCEPTION agentCycleBlocked — dulu pola guard modal akan memblokir), panel
chat tetap tak terbuka; (3) Shift+C mundur → kembali ke agen sebelumnya, C
maju lagi → kembali (bolak-balik eksak); (4) dialog Help mencantumkan kartu
"C / Siklus Fokus Agent" + C saat Help terbuka TIDAK memutar agen (guard
modal) + pasca-Escape orbit panah tetap hidup (regresi 180); (5) Escape
menutup fokus agen: probe null + goal follow hilang (kontrak lama); (6)
error window = 0.
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

    def check(name, cond, detail=""):
        print(("PASS — " if cond else "FAIL — ") + name + (f" [{detail}]" if detail else ""))
        return (name, bool(cond), detail)

    cmd("Runtime.enable")
    cmd("Page.enable")
    cmd("Page.navigate", url=APP)
    hooks = ev_until("!!window.__scene && !!window.__agentCycle && !!window.__agentData")
    if not hooks:
        print("FAIL: hooks scene tak terpasang (perlu __agentCycle siklus 181)")
        raise SystemExit(1)
    pump(6)

    T = []

    # Pastikan mulai dari keadaan tanpa seleksi.
    ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
    pump(1)

    # TES 1: C pertama → agen pertama; panel chat TIDAK terbuka (suppressSync).
    t1 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k, sh) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true, cancelable: true }));
      const before = window.__agentCycle();
      press('c');
      let name = null, ring = false, goal = null, insp = false, panel = false;
      for (let i = 0; i < 16; i++) { await sleep(200);
        name = window.__agentCycle();
        if (name) break; }
      await sleep(400);
      ring = !!(window.__sceneSelRing && window.__sceneSelRing.visible);
      goal = window.__dbg().focus;
      const el = document.querySelector('[aria-label^="Profil"]');
      insp = !!el;
      panel = !!document.getElementById('wfs-panel');
      return { before, name, ring, goalR: goal ? goal.r : null,
               insp, panel, escAfter: window.__escModalAtDispatch };
    })()""", wait=40, await_promise=True)
    r1 = t1 if isinstance(t1, dict) else {}
    T.append(check("TES1 C pertama: agen terfokus + goal follow r=20 + ring + inspector, TANPA panel chat",
                   r1.get("before") is None and r1.get("name") is not None
                   and r1.get("ring") is True and r1.get("goalR") == 20
                   and r1.get("insp") is True and r1.get("panel") is False,
                   json.dumps(r1)[:220]))

    # TES 2: C kedua & ketiga → nama berubah tiap langkah MESKI inspector terbuka
    # (exception agentCycleBlocked); panel chat tetap tak terbuka.
    t2 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k, sh) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true, cancelable: true }));
      const n0 = window.__agentCycle();
      const modal0 = window.__wfsModalOpen;
      press('c');
      let n1 = n0;
      for (let i = 0; i < 16; i++) { await sleep(200); n1 = window.__agentCycle(); if (n1 !== n0) break; }
      press('c');
      let n2 = n1;
      for (let i = 0; i < 16; i++) { await sleep(200); n2 = window.__agentCycle(); if (n2 !== n1) break; }
      await sleep(300);
      const panel = !!document.getElementById('wfs-panel');
      const el = document.querySelector('[aria-label^="Profil"]');
      const inspName = el ? el.textContent.slice(0, 40) : null;
      const goal = window.__dbg().focus;
      return { n0, n1, n2, modal0, panel, inspName,
               goalR: goal ? goal.r : null, moved: n1 !== n0 && n2 !== n1 && n2 !== n0 };
    })()""", wait=40, await_promise=True)
    r2 = t2 if isinstance(t2, dict) else {}
    T.append(check("TES2 C kedua & ketiga: nama agen berubah tiap langkah (exception inspector) + tanpa panel chat",
                   r2.get("moved") is True and r2.get("panel") is False
                   and r2.get("goalR") == 20,
                   json.dumps(r2)[:220]))

    # TES 3: Shift+C mundur → agen sebelumnya; C maju → kembali (bolak-balik eksak).
    t3 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k, sh) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true, cancelable: true }));
      const n2 = window.__agentCycle();
      press('C', true);
      let back = n2;
      for (let i = 0; i < 16; i++) { await sleep(200); back = window.__agentCycle(); if (back !== n2) break; }
      press('c');
      let fwd = back;
      for (let i = 0; i < 16; i++) { await sleep(200); fwd = window.__agentCycle(); if (fwd !== back) break; }
      return { n2, back, fwd, roundTrip: fwd === n2 && back !== n2 };
    })()""", wait=40, await_promise=True)
    r3 = t3 if isinstance(t3, dict) else {}
    T.append(check("TES3 Shift+C mundur lalu C maju: bolak-balik ke agen yang sama",
                   r3.get("roundTrip") is True, json.dumps(r3)[:200]))

    # TES 4: Help mencantumkan kartu C; C saat Help terbuka TIDAK memutar (guard);
    # pasca-Escape orbit panah tetap hidup (regresi siklus 180).
    t4 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      press('h');
      let card = null;
      for (let i = 0; i < 20; i++) { await sleep(200);
        const grids = Array.from(document.querySelectorAll('h3'));
        if (grids.length) {
          const txt = document.body.textContent || '';
          if (txt.includes('Siklus Fokus Agent')) { card = true; break; }
        } }
      const nBefore = window.__agentCycle();
      press('c');
      await sleep(400);
      const nGuard = window.__agentCycle();
      press('Escape');
      let closed = false;
      for (let i = 0; i < 16; i++) { await sleep(150);
        if (window.__wfsModalOpen === false) { closed = true; break; } }
      const cam0 = JSON.stringify(window.__dbg());
      for (let i = 0; i < 5; i++) { press('ArrowLeft'); await sleep(80); }
      const cam1 = JSON.stringify(window.__dbg());
      return { card, guarded: nGuard === nBefore, closed, orbitMoved: cam0 !== cam1 };
    })()""", wait=50, await_promise=True)
    r4 = t4 if isinstance(t4, dict) else {}
    T.append(check("TES4 Help tampil kartu C + guard modal + pasca-Escape orbit panah hidup",
                   r4.get("card") is True and r4.get("guarded") is True
                   and r4.get("closed") is True and r4.get("orbitMoved") is True,
                   json.dumps(r4)[:220]))

    # TES 5: Escape menutup fokus agen — probe null + goal follow hilang.
    t5 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      const n0 = window.__agentCycle();
      press('Escape');
      let name = n0, goal = window.__dbg().focus, insp = true;
      for (let i = 0; i < 20; i++) { await sleep(200);
        name = window.__agentCycle();
        goal = window.__dbg().focus;
        insp = !!document.querySelector('[aria-label^="Profil"]');
        if (name === null && goal === null && !insp) break; }
      return { n0, cleared: name === null, goalCleared: goal === null, inspClosed: !insp };
    })()""", wait=40, await_promise=True)
    r5 = t5 if isinstance(t5, dict) else {}
    T.append(check("TES5 Escape menutup fokus agen: probe null + goal follow hilang + inspector tertutup",
                   r5.get("cleared") is True and r5.get("goalCleared") is True
                   and r5.get("inspClosed") is True, json.dumps(r5)[:200]))

    pump(2)
    T.append(check("TES6 error window = 0 (console error & exception)", len(errs) == 0 and len(excs) == 0,
                   f"errs={errs[:2]} excs={excs[:2]}"))

    npass = sum(1 for _, okk, _ in T if okk)
    print(f"===> {'OK' if npass == len(T) else 'GAGAL'} {npass}/{len(T)}")
    ok = npass == len(T)
    for name, okk, d in T:
        if not okk:
            print(f"  GAGAL: {name} {d}")
finally:
    try:
        p.kill()
    except Exception:
        pass
raise SystemExit(0 if ok else 1)
