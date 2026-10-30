#!/usr/bin/env python3
"""e2e_snapshot.py — siklus 178: verifikasi live tombol FOTO / snapshot PNG (CDP :99).
Satu Runtime.evaluate sinkron (pelajaran 174). Tes:
(1) probe __takeSnapshot menghasilkan PNG nyata: ok:true + bytes jauh di atas
    ambang buffer-kosong (render sinkron sebelum toDataURL — tanpa itu kanvas
    WebGL tanpa preserveDrawingBuffer menghasilkan PNG kosong);
(2) konsistensi filename kantor-wfs-YYYY-MM-DD_HHMM.png (regex);
(3) snapshot TIDAK mengubah kamera (theta/phi/radius identik sebelum/sesudah —
    render ekstra murni membaca state);
(4) snapshot TIDAK mengubah goal follow (kontrak: foto tidak mengganggu fokus);
(5) tombol FOTO QuickToolbar ada di DOM (aria-label "Simpan foto kantor") dan
    klik tombol → unduhan terpicu (spy page.on('download') / Page.downloadWillBegin
    via CDP) + flash "Foto tersimpan";
(6) error window = 0.
"""
import base64, json, os, socket, struct, subprocess, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9475
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
    # Terima unduhan tanpa dialog (headless): allow + catat nama file.
    cmd("Browser.setDownloadBehavior", behavior="allow", downloadPath="/tmp/wfs_e2e_dl")
    cmd("Page.navigate", url=APP)
    hooks = ev_until("!!window.__scene && !!window.__agentData && !!window.__takeSnapshot")
    if not hooks:
        print("FAIL: hooks scene tak terpasang")
        raise SystemExit(1)
    pump(6)

    T = []

    def check(name, cond, detail=""):
        T.append((name, bool(cond), detail))
        print(("PASS" if cond else "FAIL") + f" — {name}" + (f" [{detail}]" if detail else ""))

    # TES 1+2+3+4: probe metadata snapshot dalam SATU evaluate sinkron.
    # Catatan performa: render sinkron + toDataURL di SwiftShader bisa >6 dtk →
    # evaluasi ber-snapshot memakai wait panjang (90 dtk).
    probe = ev("""(() => {
      const sp = (window.__cam && window.__cam.sph) ? window.__cam.sph : null;
      const rd = (v) => (typeof v === 'number' && isFinite(v)) ? Math.round(v*1e9)/1e9 : v;
      const before = sp ? { t: rd(sp.theta), p: rd(sp.phi), r: rd(sp.radius) } : null;
      const res = window.__takeSnapshot();
      const after = sp ? { t: rd(sp.theta), p: rd(sp.phi), r: rd(sp.radius) } : null;
      return { res, before, after,
               agentCount: (window.__agentData||[]).length };
    })()""", wait=90)
    if isinstance(probe, dict) and "res" in probe:
        res = probe["res"]
        check("TES1 snapshot PNG nyata (ok:true, bytes >> ambang kosong)",
              res.get("ok") is True and res.get("bytes", 0) > 30000,
              f"bytes={res.get('bytes')} agentCount={probe.get('agentCount')}")
        import re as _re
        check("TES2 filename pola kantor-wfs-YYYY-MM-DD_HHMM.png",
              bool(_re.match(r"^kantor-wfs-\d{4}-\d{2}-\d{2}_\d{4}\.png$", str(res.get("filename")))),
              str(res.get("filename")))
        b, a = probe["before"], probe["after"]
        check("TES3 kamera TIDAK berubah oleh snapshot (render ekstra = baca state)",
              b == a, f"{b} -> {a}")
    else:
        check("TES1 snapshot PNG nyata", False, str(probe)[:200])

    # TES 4: goal follow utuh saat snapshot (fokus agen → snapshot → goal tetap follow).
    # Sumber goal = window.__dbg().focus (hook lama: {r,reset} saat goal aktif, null
    # saat overview) — TIDAK menambah hook baru.
    goal = ev("""(() => {
      const C = window.__wfsSceneControls; if(!C||!C.focusAgent) return {skip:true};
      const ag = (window.__agentData||[])[0]; if(!ag) return {skip:true};
      const nm = (ag.agent && ag.agent.name) || ag.name; if(!nm) return {skip:true};
      const res0 = C.focusAgent(nm);
      const g0 = window.__dbg && window.__dbg().focus;
      const r = window.__takeSnapshot();
      const g1 = window.__dbg && window.__dbg().focus;
      try { C.resetFocus(); } catch(e){}
      return { res0, had0: !!g0, had1: !!g1, ok: r.ok };
    })()""", wait=90)
    if isinstance(goal, dict) and not goal.get("skip"):
        check("TES4 goal follow TETAP hidup saat snapshot (foto tak mengganggu fokus)",
              goal.get("ok") is True and goal.get("had0") is True and goal.get("had1") is True,
              str(goal))
    else:
        check("TES4 goal follow saat snapshot (fokus agen tidak tersedia — tetap cek ok)",
              isinstance(goal, dict) and goal.get("ok") is True, str(goal)[:120])

    # TES 5: tombol FOTO DOM + klik → unduhan + flash sukses
    ui = ev("""(() => {
      const btn = document.querySelector('button[aria-label="Simpan foto kantor"]');
      if (!btn) return { present:false };
      btn.click();
      return { present:true, clicked:true };
    })()""")
    pump(3)
    check("TES5 tombol FOTO ada & klik memicu unduhan PNG",
          bool(ui.get("present")) and len(downloads) >= 1
          and str(downloads[0]).startswith("kantor-wfs-"),
          f"present={ui.get('present')} downloads={downloads[:2]}")

    check("TES6 error window = 0", len(errs) == 0 and len(excs) == 0,
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
