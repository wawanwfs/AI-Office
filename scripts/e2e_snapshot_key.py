#!/usr/bin/env python3
"""e2e_snapshot_key.py — siklus 179: verifikasi live shortcut keyboard G = FOTO (CDP :99).
Paritas tombol dgn tombol FOTO QuickToolbar (siklus 178). Jalur: keydown 'g' di
document → bubble ke window → resolveShortcutAction → TAKE_SNAPSHOT → App delegasi
handleSnapshot (SATU sumber dgn tombol dock) → snapshot PNG + unduh + flash.
Tes:
(1) dokumentasi: dialog Help (H) mencantumkan entri "G = foto kantor (PNG)" di
    grid shortcut langkah terakhir (+1b Escape menutup);
(2) G → Page.downloadWillBegin nyata (unduhan PNG kantor-wfs-*.png) + flash
    "Foto tersimpan" (toast di-poll async — flash hidup 3,5 dtk);
(3) G saat goal follow aktif → snapshot sukses (unduhan nyata) & goal TETAP
    hidup (kontrak: foto tidak mengganggu fokus — jalur keyboard sama persis
    dgn tombol) — dijalankan paling akhir (state agen disentuh terakhir);
(4) error window = 0.
Urutan tes disengaja: state agen (focusAgent/resetFocus) PALING AKHIR —
pelajaran siklus: resetFocus menyisakan flag modal __wfsModalOpen=true yang
mematikan shortcut keyboard untuk tekanan berikutnya (temuan utk siklus depan;
produksi tak terpapar karena resetFocus selalu diikuti Escape/tutup dialog).
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
    # Pelajaran (2) siklus ini: React 18 mem-batch setState dari event native —
    # flush terjadi SETELAH tugas JS sinkron berakhir; busy-loop Date.now()
    # memblokir flush → dialog tak pernah muncul di tengah tari sinkron, dan
    # evaluasi CDP terpisah sering >1-3 dtk (SwiftShader sibuk) → flaky.
    # Solusi: tari ASINKRON dalam SATU evaluate (awaitPromise + await sleep —
    # benar-benar memberi jeda ke event loop antar langkah).
    help_res = ev("""(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const helpDlg = () => Array.from(document.querySelectorAll('[role="dialog"]'))
        .find(x => Array.from(x.querySelectorAll('button'))
          .some(b => (b.textContent || '').includes('Berikutnya')));
      const press = (k) => document.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }));
      let opened = false;
      for (let a = 0; a < 3 && !opened; a++) {
        press('h');
        for (let i = 0; i < 16; i++) { await sleep(150); if (helpDlg()) { opened = true; break; } }
      }
      if (!opened) return { open: false };
      let ncards = 0, hasG = false, gridSeen = false;
      for (let i = 0; i < 14; i++) {
        const g = document.querySelector('.help-shortcut-grid');
        if (g) {
          gridSeen = true;
          const cards = Array.from(g.querySelectorAll('.help-shortcut-card'))
            .map(c => c.textContent || '');
          ncards = cards.length;
          hasG = cards.some(c => c.includes('G') && c.toLowerCase().includes('foto'));
          break;
        }
        const dlg = helpDlg();
        const b = dlg && Array.from(dlg.querySelectorAll('button'))
          .find(x => (x.textContent || '').includes('Berikutnya'));
        if (!b) { await sleep(200); continue; }
        b.click();
        await sleep(150);
      }
      press('Escape');
      let closed = false;
      for (let i = 0; i < 16; i++) { await sleep(150); if (!helpDlg()) { closed = true; break; } }
      return { open: true, gridSeen, ncards, hasG, closed };
    })()""", wait=60, await_promise=True)
    hr = help_res if isinstance(help_res, dict) else {}
    check("TES2 dialog Help mencantumkan shortcut G = foto kantor (PNG)",
          hr.get("open") is True and hr.get("gridSeen") is True and hr.get("hasG") is True,
          str(hr))
    check("TES2b Escape menutup Help (modal guard tetap utuh setelah entri baru)",
          hr.get("open") is True and hr.get("closed") is True, str(hr))

    # TES 3: G → unduhan nyata + flash "Foto tersimpan" (kondisi awal, tanpa
    # menyentuh state agen — pelajaran siklus: resetFocus menyisakan flag modal
    # __wfsModalOpen=true yang mematikan shortcut keyboard untuk tekanan
    # berikutnya; urutan tes disusun agar state agen disentuh PALING AKHIR).
    n0 = len(downloads)
    # Pelajaran (3) siklus ini: flash toast hilang dalam 3,5 dtk — jendela tunggu
    # pasca-tekan (snapshot SwiftShader bisa 15-25 dtk) hampir pasti melewatkannya.
    # Solusi: satu evaluasi ASYNC yang menekan 'g' lalu POLL toast tiap 200ms selama
    # maks 60 dtk — flash tertangkap di momen muncul (bukan setelah fakta).
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
    pump(10)  # beri waktu event Page.downloadWillBegin mengantre & terkirim
    fn = downloads[n0] if len(downloads) > n0 else ""
    check("TES3 G memicu unduhan PNG kantor-wfs-*.png (Page.downloadWillBegin)",
          shot is not None and len(downloads) > n0 and fn.startswith("kantor-wfs-"),
          f"shot={shot} downloads={downloads[n0:n0+2]}")
    check("TES3b flash 'Foto tersimpan: ...' tampil (bukan flash gagal)",
          isinstance(shot, dict) and str(shot.get("toast", "")).startswith("Foto tersimpan: "),
          str(shot))

    # TES 4 (PALING AKHIR — menyentuh state agen): G saat goal follow aktif →
    # snapshot sukses (unduhan nyata) & goal tetap hidup (jalur keyboard identik
    # tombol FOTO; snapshot via SwiftShader bisa >6 dtk → wait panjang, pelajaran
    # 178). Tidak memanggil resetFocus (melihat catatan TES3 di atas).
    n1 = len(downloads)
    goal = ev("""(() => {
      const C = window.__wfsSceneControls; if(!C||!C.focusAgent) return {skip:true};
      const ag = (window.__agentData||[])[0]; if(!ag) return {skip:true};
      const nm = (ag.agent && ag.agent.name) || ag.name; if(!nm) return {skip:true};
      const res0 = C.focusAgent(nm);
      const g0 = window.__dbg && window.__dbg().focus;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
      const g1 = window.__dbg && window.__dbg().focus;
      return { res0, had0: !!g0, had1: !!g1 };
    })()""", wait=90)
    pump(10)  # event unduhan mengantre selama main thread diblokir snapshot
    dl_follow = downloads[n1] if len(downloads) > n1 else ""
    if isinstance(goal, dict) and not goal.get("skip"):
        check("TES4 G saat follow: snapshot sukses (unduhan nyata) & goal TETAP hidup",
              goal.get("res0") is True and goal.get("had0") is True
              and goal.get("had1") is True and dl_follow.startswith("kantor-wfs-"),
              f"{goal} dl={dl_follow}")
    else:
        check("TES4 G saat follow (fokus agen tidak tersedia — skip cek goal)",
              isinstance(goal, dict) and bool(goal.get("skip")), str(goal)[:120])

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
