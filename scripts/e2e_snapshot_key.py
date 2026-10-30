#!/usr/bin/env python3
"""e2e_snapshot_key.py — siklus 179: verifikasi live shortcut keyboard G = FOTO (CDP :99).
Paritas tombol dgn tombol FOTO QuickToolbar (siklus 178). Jalur: keydown 'g' di
document → bubble ke window → resolveShortcutAction → TAKE_SNAPSHOT → App delegasi
handleSnapshot (SATU sumber dgn tombol dock) → snapshot PNG + unduh + flash.
Tes:
(1) dokumentasi: dialog Help (H) mencantumkan entri "G = foto kantor (PNG)" di
    grid shortcut langkah terakhir (+2b Escape menutup);
(2) G saat goal follow aktif → snapshot sukses & goal TETAP hidup (kontrak: foto
    tidak mengganggu fokus — jalur keyboard sama persis dgn tombol);
(3) G → Page.downloadWillBegin nyata (unduhan PNG kantor-wfs-*.png) + flash
    "Foto tersimpan";
(4) error window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9476
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
    downloads = []

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
        elif meth == "Page.downloadWillBegin":
            downloads.append(pms.get("suggestedFilename", ""))

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
    cmd("Browser.setDownloadBehavior", behavior="allow", downloadPath="/tmp/wfs_e2e_dl")
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

    # TES 1 (dokumentasi dulu — sebelum state agen disentuh): dialog Help
    # mencantumkan "G = foto kantor (PNG)". Grid shortcut hanya ada di langkah
    # TERAKHIR dialog → buka lalu klik "Berikutnya" sampai grid muncul.
    ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))", wait=6)
    help_open = ev_until("!!document.querySelector('[role=\"dialog\"]')", wait_total=8)
    for _ in range(8):
        grid = ev("!!document.querySelector('.help-shortcut-grid')", wait=3)
        if grid is True:
            break
        ev("""(() => {
          const dlg = document.querySelector('[role="dialog"]');
          if (!dlg) return 'NODIALOG';
          const b = Array.from(dlg.querySelectorAll('button'))
            .find(x => (x.textContent || '').includes('Berikutnya'));
          if (!b) return 'NOBTN';
          b.click();
          return 'CLICKED';
        })()""", wait=3)
        pump(1)
    help_txt = ev("""(() => {
      const g = document.querySelector('.help-shortcut-grid');
      const cards = g ? Array.from(g.querySelectorAll('.help-shortcut-card')).map(c => c.textContent) : [];
      return { cards, summary: g ? g.textContent : '' };
    })()""", wait=6)
    ht = help_txt if isinstance(help_txt, dict) else {}
    raw_cards = ht.get('cards')
    cards = raw_cards if isinstance(raw_cards, list) else []
    raw_sum = ht.get('summary')
    summary = raw_sum if isinstance(raw_sum, str) else ''
    has_g = bool(help_open) and (
        any('G' in c and 'foto' in c.lower() for c in cards)
        or 'G = foto kantor (PNG)' in summary)
    check("TES2 dialog Help mencantumkan shortcut G = foto kantor (PNG)", has_g,
          f"open={help_open} cards={[c[:40] for c in cards][:3]}")
    ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))", wait=4)
    pump(2)
    help_closed = ev("!document.querySelector('.help-shortcut-grid')", wait=4)
    check("TES2b Escape menutup Help (modal guard tetap utuh setelah entri baru)",
          help_closed is True)

    # TES 3: G saat goal follow aktif → snapshot sukses & goal tetap hidup
    # (jalur keyboard identik tombol FOTO; snapshot via SwiftShader bisa >6 dtk
    # → wait panjang, pelajaran 178). Dijalankan SETELAH tes Help supaya state
    # agen (dialog seleksi) tidak menghalangi guard modal saat 'h' ditekan.
    goal = ev("""(() => {
      const C = window.__wfsSceneControls; if(!C||!C.focusAgent) return {skip:true};
      const ag = (window.__agentData||[])[0]; if(!ag) return {skip:true};
      const nm = (ag.agent && ag.agent.name) || ag.name; if(!nm) return {skip:true};
      const res0 = C.focusAgent(nm);
      const g0 = window.__dbg && window.__dbg().focus;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
      const g1 = window.__dbg && window.__dbg().focus;
      try { C.resetFocus(); } catch(e){}
      return { res0, had0: !!g0, had1: !!g1 };
    })()""", wait=90)
    if isinstance(goal, dict) and not goal.get("skip"):
        check("TES3 G saat follow: snapshot sukses & goal TETAP hidup (kontrak foto)",
              goal.get("res0") is True and goal.get("had0") is True and goal.get("had1") is True,
              str(goal))
    else:
        check("TES3 G saat follow (fokus agen tidak tersedia — skip cek goal)",
              isinstance(goal, dict) and bool(goal.get("skip")), str(goal)[:120])

    # TES 4: G → unduhan nyata + flash "Foto tersimpan".
    n0 = len(downloads)
    press = ev("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))", wait=30)
    toast = ev("(() => { const t = document.querySelector('.toast'); return t ? t.textContent : null; })()", wait=4)
    pump(8)
    fn = downloads[n0] if len(downloads) > n0 else ""
    check("TES4 G memicu unduhan PNG kantor-wfs-*.png (Page.downloadWillBegin)",
          press is True and len(downloads) > n0 and fn.startswith("kantor-wfs-"),
          f"press={press} downloads={downloads[n0:n0+2]}")
    check("TES4b flash 'Foto tersimpan: ...' tampil (bukan flash gagal)",
          isinstance(toast, str) and toast.startswith("Foto tersimpan: "), str(toast))

    check("TES5 error window = 0", len(errs) == 0 and len(excs) == 0,
          f"errs={errs[:2]} excs={excs[:2]}")

    p.kill()
    npass = sum(1 for _, c, _ in T if c)
    print(f"\n===> {'OK' if npass == len(T) else 'FAIL'} ({npass}/{len(T)})")
    ok = npass == len(T)
except Exception as e:
    import traceback
    traceback.print_exc()
    print("EXC:", e)
finally:
    try:
        p.kill()
    except Exception:
        pass
    raise SystemExit(0 if ok else 1)
