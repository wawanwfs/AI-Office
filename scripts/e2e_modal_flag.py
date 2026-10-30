#!/usr/bin/env python3
"""e2e_modal_flag.py — siklus 180: verifikasi live pembersihan flag modal basi.
Bug (pelajaran 179, dianalisis tuntas siklus ini): window.__escModalAtDispatch
ditulis listener capture Escape TAPI TIDAK PERNAH dibersihkan pada event lain —
setelah Escape menutup modal, flag tetap true ("sticky") → guard keyboard scene
(OfficeScene __onOrbitKey / onKey) memblokir ORBIT PANAH sampai Escape berikutnya
(hanya Escape yang menulis ulang). Ditambah __wfsModalOpen yang tak menyentuh
panel internal live (count useModalFlag berubah di effect tanpa re-render App).
Perbaikan 180: listener capture App utk keydown/pointerdown/mousedown/pointerup
men-REFRESH __wfsModalOpen (base App-state + count live) & membersihkan
__escModalAtDispatch pada event non-Escape (hanya bermakna selama dispatch Escape).
Transport: salinan e2e_snapshot_key.py (terbukti) — jangan reinvent WebSocket.
Tes:
(1) Help dibuka (h) → Escape menutup → ARROW KIRI menggerakkan kamera
    (dulu: GAGAL — escModal sticky true memblokir orbit sampai Escape berikutnya);
(2) G setelah Escape-profil → unduhan nyata + flash tersimpan (shortcut hidup);
(3) fokus agen (profil modal) → scene.resetFocus() langsung → flag tidak basi,
    orbit panah tetap hidup (tekanan berikutnya);
(4) Escape tanpa modal → kamera tetap reset (kontrak lama utuh);
(5) error window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9479
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
    errs, excs, downloads = [], [], []

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

    def check(name, cond, detail=""):
        print(("PASS — " if cond else "FAIL — ") + name + (f" [{detail}]" if detail else ""))
        return (name, bool(cond), detail)

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

    # TES 1: Help (h) → Escape menutup → ARROW KIRI menggerakkan kamera.
    # Dulu: GAGAL — escModal sticky true pasca-Escape memblokir orbit panah
    # sampai Escape berikutnya (satu-satunya penulis lama). Kini event
    # non-Escape (keydown panah) membersihkannya di capture SEBELUM guard scene.
    orb1 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const press = (k) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      press('h');
      let opened = false;
      for (let i = 0; i < 16; i++) { await sleep(150);
        if (window.__wfsModalOpen === true) { opened = true; break; } }
      press('Escape');
      let closed = false;
      for (let i = 0; i < 16; i++) { await sleep(150);
        if (window.__wfsModalOpen === false) { closed = true; break; } }
      const cam0 = JSON.stringify(window.__dbg());
      for (let i = 0; i < 5; i++) { press('ArrowLeft'); await sleep(80); }
      const cam1 = JSON.stringify(window.__dbg());
      return { opened, closed,
        escAfter: window.__escModalAtDispatch,
        flagAfter: window.__wfsModalOpen,
        orbitMoved: cam0 !== cam1 };
    })()""", wait=60, await_promise=True)
    r1 = orb1 if isinstance(orb1, dict) else {}
    T.append(check("TES1 Help→Escape→orbit panah HIDUP (anti escModal sticky)",
                   r1.get("opened") is True and r1.get("closed") is True
                   and r1.get("orbitMoved") is True and r1.get("escAfter") is False,
                   str(orb1)[:180]))

    # TES 2: G pasca-Escape → unduhan nyata + flash tersimpan (shortcut hidup).
    n0 = len(downloads)
    shot = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
      const t0 = Date.now();
      let toast = null;
      while (Date.now() - t0 < 60000) {
        const t = document.querySelector('.toast');
        if (t && t.textContent) { toast = t.textContent; break; }
        await sleep(200);
      }
      return { toast };
    })()""", wait=70, await_promise=True)
    pump(10)
    fn0 = downloads[n0] if len(downloads) > n0 else ""
    T.append(check("TES2 G pasca-Escape → unduhan PNG nyata (shortcut tak mati)",
                   len(downloads) > n0 and fn0.startswith("kantor-wfs-")
                   and isinstance(shot, dict) and str(shot.get("toast", "")).startswith("Foto tersimpan: "),
                   f"shot={shot} dl={fn0}"))

    # TES 3: fokus agen (profil modal via onSelectAgent) → scene.resetFocus()
    # langsung → profil tertutup (base false), panel chat internal (wfs-panel,
    # role=dialog) mungkin TETAP terbuka = modal sah (flag true benar!) → tutup
    # via tombol ✕ → flag false + orbit panah tetap hidup (tekanan berikutnya).
    orb3 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const C = window.__wfsSceneControls; if (!C || !C.focusAgent || !C.resetFocus) return {skip:true};
      const ag = (window.__agentData || []).find(a => a && a.agent && a.agent.name);
      if (!ag) return {skip:true};
      const focused = C.focusAgent(ag.agent.name) === true;
      let modalSeen = false;
      for (let i = 0; i < 12; i++) { await sleep(120);
        if (window.__wfsModalOpen === true) { modalSeen = true; break; } }
      C.resetFocus();
      await sleep(700);
      const baseAfterReset = window.__wfsAppModalBase;
      const panelOpen = !!document.getElementById('wfs-panel');
      const x = document.querySelector('#wfs-panel button[aria-label*="Tutup panel chat"]');
      if (x) x.click();
      let flagClean = false;
      for (let i = 0; i < 16; i++) { await sleep(150);
        if (window.__wfsModalOpen === false) { flagClean = true; break; } }
      const cam0 = JSON.stringify(window.__dbg());
      const press = (k) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      for (let i = 0; i < 5; i++) { press('ArrowLeft'); await sleep(80); }
      const cam1 = JSON.stringify(window.__dbg());
      return { skip: false, focused, modalSeen,
        baseAfterReset, panelOpen, flagClean,
        escAfter: window.__escModalAtDispatch,
        orbitMoved: cam0 !== cam1 };
    })()""", wait=60, await_promise=True)
    r3 = orb3 if isinstance(orb3, dict) else {}
    T.append(check("TES3 focusAgent→resetFocus→tutup panel chat→flag bersih & orbit hidup",
                   r3.get("skip") is False and r3.get("focused") is True
                   and r3.get("modalSeen") is True and r3.get("baseAfterReset") is False
                   and r3.get("flagClean") is True and r3.get("escAfter") is False
                   and r3.get("orbitMoved") is True,
                   str(orb3)[:200]))

    # TES 4: Escape tanpa modal terbuka saat dispatch → kamera tetap reset
    # (kontrak 176/lama — pola TES6 e2e_orbit_keys): focusAgent disinkron lalu
    # Escape SEBELUM React selesai render profil → snapshot escModal=false →
    # scene me-reset kamera; flag esc bersih (false) sesudahnya.
    orb4 = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const C = window.__wfsSceneControls;
      if (!C || !C.focusAgent) return {skip:true};
      const ag = (window.__agentData || []).find(a => a && a.agent && a.agent.name);
      if (!ag) return {skip:true};
      C.focusAgent(ag.agent.name);
      const g0 = window.__dbg && window.__dbg().focus;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const g1 = window.__dbg && window.__dbg().focus;
      await sleep(700);
      return { had0: !!g0, reset: !!(g1 && g1.reset),
        esc: window.__escModalAtDispatch };
    })()""", wait=40, await_promise=True)
    r4 = orb4 if isinstance(orb4, dict) else {}
    T.append(check("TES4 Escape tanpa modal tetap reset kamera (kontrak 176 utuh)",
                   r4.get("had0") is True and r4.get("reset") is True and r4.get("esc") is False,
                   str(orb4)[:180]))

    T.append(check("TES5 error window = 0", len(errs) == 0 and len(excs) == 0,
                   f"errs={errs[:2]} excs={excs[:2]}"))

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
