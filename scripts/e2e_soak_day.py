#!/usr/bin/env python3
"""E2E siklus 173 — SOAK HARI PENUH (error window ~5 menit, kandidat (c) backlog 172).
Dulu: e2e_err.py hanya memuat singkat — bug kelas "crash di bawah radar" (contoh:
lunch-crash 172, TypeError per-frame saat 2 agen berdekatan) lolos berbulan-bulan.
Kini: satu sesi memaksa SEMUA fase hari + crossing jam kritis + toggle neon,
dengan jebakan error terpasang dari DOCUMENT-START (Page.addScriptToEvaluateOnNewDocument):
window 'error' + 'unhandledrejection' + console.error → window.__errs.
Invariant tiap tahap: frame terus bertambah (animate hidup), 0 error.
Fase: 478→arrive(480) → 598→rapat AM(600) → 718→lunch(720) → 838→rapat PM(840)
      → 1078→pulang(1080) → 1438→tengah malam(+wrap 1440) + NEON ON/OFF → 478→fajar ke-2.
Exit non-zero bila ada error/exception/frame beku/scene mati."""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9475
APP = "http://127.0.0.1:9503/app/"
SCRATCH = os.path.expanduser("~/.hermes/cache/scratch")

# Jebakan error dari document-start — menangkap SEMUA error sejak baris pertama.
TRAP = """
window.__errs = [];
window.addEventListener('error', function(e){
  try {
    var er = e.error || e;
    window.__errs.push(String((er && er.stack) ? er.stack : (e.message || er)).slice(0, 300));
  } catch (_) {}
});
window.addEventListener('unhandledrejection', function(e){
  try {
    var r = e.reason || {};
    window.__errs.push('unhandledrejection: ' + String((r && r.stack) ? r.stack : r).slice(0, 300));
  } catch (_) {}
});
(function(){
  var ce = console.error;
  console.error = function(){
    try {
      var a = Array.prototype.slice.call(arguments);
      window.__errs.push('console.error: ' + a.map(function(x){ return String((x && x.stack) ? x.stack : x); }).join(' ').slice(0, 300));
    } catch (_) {}
    return ce.apply(console, arguments);
  };
})();
"""

env = dict(os.environ, DISPLAY=":99")
xv = None
if subprocess.run(["xdpyinfo", "-display", ":99"], stdout=subprocess.DEVNULL,
                  stderr=subprocess.DEVNULL).returncode != 0:
    xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                      "--enable-unsafe-swiftshader", "--window-size=1366,768",
                      "--disable-dev-shm-usage", "about:blank"],
                     env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

    def cmd(method, wait=60.0, **params):
        mid[0] += 1
        d = json.dumps({"id": mid[0], "method": method, "params": params}).encode()
        h = b"\x81"; n = len(d); mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))
        s.settimeout(wait)

        def rx(k):
            b = b""
            while len(b) < k:
                c = s.recv(k - len(b))
                if not c:
                    raise ConnectionResetError()
                b += c
            return b

        while True:
            hdr = rx(2); op = hdr[0] & 0xF; n = hdr[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", rx(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", rx(8))[0]
            d2 = rx(n)
            while op == 0:
                h2 = rx(2); op2 = h2[0] & 0xF; n2 = h2[1] & 0x7F
                if n2 == 126:
                    n2 = struct.unpack(">H", rx(2))[0]
                d2 += rx(n2)
                break
            r = json.loads(d2)
            if r.get("id") == mid[0]:
                return r

    def ev(expr):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        res = r.get("result", {}).get("result", {})
        if "exceptionDetails" in r.get("result", {}):
            raise RuntimeError(f"eval gagal: {json.dumps(r['result']['exceptionDetails'])[:600]}")
        return res.get("value")

    def shot(out):
        r = cmd("Page.captureScreenshot", format="png")
        if "result" not in r:
            raise RuntimeError(f"captureScreenshot gagal: {json.dumps(r)[:200]}")
        open(out, "wb").write(base64.b64decode(r["result"]["data"]))
        return os.path.getsize(out)

    def n_errs():
        """Error ter-filter: 'deprecated' diabaikan (aturan siklus)."""
        raw = ev("window.__errs.slice()") or []
        return [e for e in raw if "deprecated" not in e.lower()]

    fails = []
    rec = []

    cmd("Runtime.enable")
    cmd("Page.enable")
    cmd("Page.addScriptToEvaluateOnNewDocument", source=TRAP)
    cmd("Page.navigate", url=APP)
    time.sleep(15)
    ok_trap = ev("Array.isArray(window.__errs) && !!window.__scene && !!window.__agentData && !!window.__toggleNeon")
    if not ok_trap:
        # Fallback: injeksi trap pasca-load (cakupan load tetap dijaga e2e_err.py).
        print("trap doc-start tidak aktif → fallback injeksi pasca-load")
        ev(TRAP)
        ok_trap = ev("Array.isArray(window.__errs) && !!window.__scene && !!window.__agentData && !!window.__toggleNeon")
    print(f"load: trap+hooks={ok_trap} errs0={len(n_errs())}")
    if not ok_trap:
        print("===> FAIL: trap/hooks tidak terpasang"); sys.exit(1)

    def dwell(label, seconds, checks=None):
        """Poll tiap 5 dtk: frame wajib bertambah, error wajib 0. checks(last) → bool opsional."""
        fr_prev = ev("window.__animFrames")
        mx = {"bubbles": 0, "fps": 0.0}
        for i in range(max(1, seconds // 5)):
            time.sleep(5)
            errs = n_errs()
            fr = ev("window.__animFrames")
            t = ev("window.__dbg().t")
            fps = (ev("window.__perf.fps") or 0)
            nb = ev("window.__bubbleCount") or 0
            mx["bubbles"] = max(mx["bubbles"], nb)
            mx["fps"] = max(mx["fps"], float(fps))
            extra = ""
            if checks:
                extra = " " + json.dumps(checks())
            print(f"[{label}] +{(i+1)*5}s errs={len(errs)} sim={t} frames={fr}(+{fr-fr_prev}) fps={fps}{extra}")
            if fr <= fr_prev:
                fails.append(f"{label}:frame-beku({fr_prev}->{fr})")
            if errs:
                fails.append(f"{label}:error x{len(errs)}: {errs[0][:120]}")
                ev("window.__errs.length = 0")  # lanjut soak, error sudah dicatat
            fr_prev = fr
        return mx

    # ── S1: fajar → auto-cross 480 (arrive, agen masuk) ──
    ev("window.__setTime(478)")
    time.sleep(0.5)
    m1 = dwell("S1_arrive", 40, lambda: {"phase": ev("window.__dbg().ph")})
    _ = m1

    # ── S2: rapat pagi → auto-cross 600 (MEETING_WINDOWS[0]) ──
    ev("window.__setTime(598)")
    time.sleep(0.5)
    m2 = dwell("S2_meet_am", 40, lambda: {"meet": ev("window.__meet()")})
    if not (ev("window.__meet().vis") or 0) and not (ev("window.__meet().active") if True else False):
        pass  # vis dicatat sbg bukti; kegagalan fitur rapat bukan kriteria error-crash
    meet_am_vis = ev("window.__meet().vis")

    # ── S3: lunch → auto-cross 720 (bug fatal 172) ──
    ev("window.__setTime(718)")
    time.sleep(0.5)
    m3 = dwell("S3_lunch", 50, lambda: {"atCafe": ev("window.__lunch().atCafe")})
    at_cafe = ev("window.__lunch().atCafe")
    sz_lunch = shot(f"{SCRATCH}/ck173_lunch.png")
    print(f"shot lunch: {sz_lunch}B atCafe={at_cafe} maxBubbles={m3['bubbles']}")
    if at_cafe <= 0: fails.append("lunch:atCafe=0")
    if m3["bubbles"] < 1: fails.append("lunch:no-bubble")
    if sz_lunch < 500_000: fails.append("lunch:scene-dead")

    # ── S4: rapat sore → auto-cross 840 (MEETING_WINDOWS[1]) ──
    ev("window.__setTime(838)")
    time.sleep(0.5)
    dwell("S4_meet_pm", 40, lambda: {"meet": ev("window.__meet()")})

    # ── S5: pulang → auto-cross 1080 (LEAVE_FROM, agen keluar) ──
    ev("window.__setTime(1078)")
    time.sleep(0.5)
    dwell("S5_leave", 40, lambda: {"phase": ev("window.__dbg().ph")})

    # ── S6: tengah malam + wrap 1440→0 + NEON ON/OFF (resync 171) ──
    ev("window.__setTime(1438)")
    time.sleep(0.5)
    dwell("S6_night", 25, lambda: {"phase": ev("window.__dbg().ph")})
    neon_on = ev("window.__toggleNeon()")
    print(f"neon ON → {neon_on}")
    dwell("S6_neon_on", 25, lambda: {"neon": ev("window.__toggleNeon") and None})
    neon_off = ev("window.__toggleNeon()")
    print(f"neon OFF → {neon_off}")
    dwell("S6_neon_off_resync", 25, lambda: {"neon": neon_off})

    # ── S7: fajar kedua → auto-cross 480 lagi (dawn pasca-malam) ──
    ev("window.__setTime(478)")
    time.sleep(0.5)
    dwell("S7_dawn2", 35, lambda: {"phase": ev("window.__dbg().ph")})

    # ── Verdict ──
    t_end = ev("window.__dbg().t")
    fr_end = ev("window.__animFrames")
    n_final = len(n_errs())
    sz_fin = shot(f"{SCRATCH}/ck173_final.png")
    print(f"akhir: sim={t_end} frames={fr_end} errs={n_final} shot={sz_fin}B meetAMvis={meet_am_vis}")
    if sz_fin < 500_000: fails.append("final:scene-dead")
    if fr_end < 50: fails.append(f"final:frame-sedikit({fr_end})")
    if fails:
        print(f"===> FAIL ({len(fails)}): {fails}")
        sys.exit(1)
    print("===> OK — hari penuh ~5.5 menit tanpa error, animate hidup terus")
finally:
    try:
        p.kill()
    except Exception:
        pass
    if xv:
        try:
            xv.kill()
        except Exception:
            pass
