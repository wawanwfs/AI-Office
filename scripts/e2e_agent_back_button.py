#!/usr/bin/env python3
"""e2e_agent_back_button.py — siklus 183: verifikasi live tombol dock MUNDUR
(CDP :99). Paritas Shift+C (181) — pola pasangan Jauh/Dekat & Iso/Depan/Atas;
pola pengujian salinan e2e_agent_button.py (182). Jalur: klik tombol
[aria-label="Agen sebelumnya"] → onCycleAgentBack(true) → sceneControls.
cycleAgent(true) → focusAgentRoot (goal follow r=20 + ring + inspector, TANPA
panel chat — suppressSync). Kontrak wrap: dari tanpa seleksi, mundur → agen
TERAKHIR (RIZKY — nextAgentIndex(-1,true)=len-1; terverifikasi unit 181).
Tes:
(1) tombol MUNDUR ada di dock, tepat SETELAH tombol AGEN (urutan maju→mundur);
(2) klik MUNDUR dari tanpa seleksi → agen TERAKHIR (RIZKY) + goal r=20 + ring +
    inspector + TANPA panel chat (kontrak wrap + suppressSync);
(3) klik AGEN (maju) → BANTUIN AI → MUNDUR lagi → balik ke RIZKY (bolak-balik
    eksak = paritas Shift+C dgn tombol);
(4) Escape → probe null + goal reset r≈42.5 + inspector tutup (kontrak
    resetFocusGoal; bacaan fixed-delay 1,5+3 dtk — pelajaran tooling 182);
(5) error window = 0.
Urutan: state agen disentuh mulai TES2 — sesudah dokumentasi (pola 179/182).
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9478
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

    # TES 1: tombol MUNDUR ada di dock, tepat SETELAH tombol AGEN (urutan
    # maju→mundur; pola pasangan Jauh/Dekat). Dokumentasi dulu (pola 179/182).
    # RETRY 3×: evaluate PERTAMA pasca-navigasi flaky di SwiftShader sibuk
    # (pelajaran tooling 182/183 — TIMEOUT bukan bug produk).
    btn = {"TIMEOUT": True}
    for _ in range(3):
        btn = ev("""(() => {
      const b = document.querySelector('button[aria-label="Agen sebelumnya"]');
      const nx = document.querySelector('button[aria-label="Agen berikutnya"]');
      const pos = (b && nx) ? nx.compareDocumentPosition(b) : 0;
      // Node.DOCUMENT_POSITION_FOLLOWING = 4 → nx mendahului b (b setelah nx)
      return b ? { found: true, title: b.getAttribute('title'), dock: !!b.closest('.dock'),
                   afterNext: !!(pos & 4) } : { found: false };
    })()""", wait=15)
        if isinstance(btn, dict) and not btn.get("TIMEOUT"):
            break
        time.sleep(2)
    check("TES1 tombol MUNDUR ada di dock, tepat SETELAH tombol AGEN (title Shift+C)",
          isinstance(btn, dict) and btn.get("found") and btn.get("dock")
          and btn.get("afterNext") and "Shift+C" in str(btn.get("title", "")), str(btn))

    # TES 2: klik MUNDUR dari tanpa seleksi → agen TERAKHIR (indeks len-1):
    # kontrak wrap nextAgentIndex(-1, true) = len-1 (unit 181). PENTING (pembelajaran
    # run pertama): jumlah agen LIVE = __agentData.length (26), BUKAN 14 di
    # agents_spec.js — nama terakhir = CITRA. Asersi DINAMIS dari __agentData.
    # Goal r=20 + ring + inspector + TANPA panel chat (suppressSync 181).
    r2 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const b = document.querySelector('button[aria-label="Agen sebelumnya"]');
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
      const n = (window.__agentData || []).length;
      // Struktur __agentData[i] = {agent:{name,...},state,...} — nama di .agent.name
      const last = n ? (window.__agentData[n - 1].agent ? window.__agentData[n - 1].agent.name : window.__agentData[n - 1].name) : null;
      return { ok: !!name, before, name, last, ring, goalR: goal ? goal.r : null,
               insp, panel, n };
    })()""", wait=30, await_promise=True)
    check("TES2 klik MUNDUR (dari tanpa seleksi) → agen TERAKHIR (wrap len-1) + ring + inspector, TANPA panel chat",
          isinstance(r2, dict) and r2.get("ok") and r2.get("name") == r2.get("last")
          and r2.get("ring") and r2.get("insp") and r2.get("panel") is False,
          str(r2)[:200])
    check("TES2b goal follow r=20 (paritas fokus eksak Shift+C / klik agen)",
          isinstance(r2, dict) and r2.get("ok") and r2.get("goalR") == 20, str(r2)[:120])

    # TES 3: bolak-balik eksak — AGEN (maju) → agen PERTAMA (indeks 0, wrap dari
    # len-1) → MUNDUR → TERAKHIR lagi → AGEN → PERTAMA (paritas Shift+C 181:
    # mundur dari 0 → len-1). Nama DINAMIS dari __agentData (pembelajaran TES2).
    # Klik berulang meski inspector terbuka (tombol bukan shortcut — tak lewat
    # guard modal).
    r3 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const sel = () => (window.__agentCycle ? window.__agentCycle() : null);
      const bPrev = document.querySelector('button[aria-label="Agen sebelumnya"]');
      const bNext = document.querySelector('button[aria-label="Agen berikutnya"]');
      if (!bPrev || !bNext) return { ok: false };
      const A = window.__agentData;
      // Struktur {agent:{name}} — sama dgn TES2
      const nm = (i) => (A[i].agent ? A[i].agent.name : A[i].name);
      const first = nm(0), last = nm(A.length - 1);
      bNext.click(); await sleep(900);
      const afterNext = sel();
      bPrev.click(); await sleep(900);
      const afterPrev = sel();
      bNext.click(); await sleep(900);
      const again = sel();
      return { ok: true, first, last, afterNext, afterPrev, again,
               fwd: afterNext === first,
               back: afterPrev === last,
               fwd2: again === first };
    })()""", wait=30, await_promise=True)
    check("TES3 bolak-balik eksak: AGEN→pertama, MUNDUR→terakhir, AGEN→pertama (paritas Shift+C)",
          isinstance(r3, dict) and r3.get("ok") and r3.get("fwd") and r3.get("back") and r3.get("fwd2"),
          str(r3)[:200])

    # TES 4: Escape menutup fokus — kontrak resetFocusGoal (pola TES4 siklus
    # 182): bacaan fixed-delay 1,5 dtk + verifikasi kedua +3 dtk (loop polling
    # panjang terbukti flaky di CDP/SwiftShader — pelajaran tooling 182).
    r4 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const gFollow = window.__dbg().focus;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(1500);
      const name = window.__agentCycle();
      const goal = window.__dbg().focus;
      const insp = !!document.querySelector('[aria-label^="Profil"]');
      await sleep(3000);
      const goalLate = window.__dbg().focus;
      const wasFollow = !!(gFollow && gFollow.reset !== true);
      return { wasFollow, gFollowR: gFollow ? gFollow.r : null,
               cleared: name === null,
               isReset: !!(goal && goal.reset === true),
               stillReset: !!(goalLate && goalLate.reset === true),
               inspClosed: !insp };
    })()""", wait=90, await_promise=True)
    check("TES4 Escape → fokus lepas (probe null) + goal reset + inspector tutup (kontrak resetFocusGoal)",
          isinstance(r4, dict) and r4.get("wasFollow") and r4.get("gFollowR") == 20
          and r4.get("cleared") and r4.get("isReset") and r4.get("inspClosed"), str(r4)[:200])

    # TES 5: error window = 0.
    check("TES5 error window = 0", not errs and not excs, f"errs={len(errs)} excs={len(excs)}")

    n_pass = sum(1 for _, c, _ in T if c)
    print(f"\n===> {n_pass}/{len(T)} OK")
    p.terminate()
    raise SystemExit(0 if n_pass == len(T) else 1)
finally:
    p.terminate() if 'p' in dir() else None
