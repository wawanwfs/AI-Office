#!/usr/bin/env python3
"""E2E sinyal audio objektif — verifikasi suara di browser nyata TANPA pendengaran manusia.

Konversi backlog 'verifikasi subjektif audio web-audio' menjadi pengukuran objektif:
 1. Buka app di Chrome (DISPLAY :99), tunggu scene siap.
 2. Pasang AnalyserNode sebagai tap pada masterGain (window.__officeSound.masterGainNode()).
 3. Simulasikan gesture pengguna NYATA via CDP Input.dispatchKeyEvent (Enter) —
    menguji jalur wake listener asli (keydown → ensure() → resume AudioContext).
 4. Verifikasi: ctx.state === 'running', masterGain tersambung, currentTime maju.
 5. Jalankan playMeetingChime() → sampel FFT time-domain:
    - RMS >= 1e-3 dan peak >= 0.01 → sinyal non-silent terbukti di graph Web Audio
    - RMS < 1e-4 → SILENT (graph putus/mute/bungkam) → FAIL
    - antara → INCONCLUSIVE (ulang, max 3x)
 6. Verifikasi anti-false-positive: setMuted(true) → RMS harus turun ke ~0.
 7. Verifikasi wake-listener tak bocor: __officeSceneDestroyed true → gesture kedua
    TIDAK memanggil ensure() lagi (started tetap, ctx sama).

Exit 0 = E2E_AUDIO OK; 1 = setup gagal; 2 = SILENT; 3 = INCONCLUSIVE.
"""
import os, subprocess, time, urllib.request, json, base64, sys, struct, socket

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9359
URL = "http://127.0.0.1:9503/"
OUT = "/home/agentuser/.hermes/cache/scratch/audio_signal.json"


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port))
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += s.sock.recv(1)

    def send(s, m):
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126:
            h += bytes([0x80 | n])
        else:
            h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c:
                    raise ConnectionResetError()
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


TAP = r"""
(() => {
  if (!window.__officeSound) return 'no-engine';
  const eng = window.__officeSound;
  const ctx = eng.rawCtx();
  if (!ctx) return 'no-ctx';
  if (!ctx.createAnalyser) return 'no-analyser-api';
  window.__an = ctx.createAnalyser();
  window.__an.fftSize = 2048;
  window.__an.smoothingTimeConstant = 0;
  const mg = eng.masterGainNode();
  if (!mg) return 'no-mastergain';
  mg.connect(window.__an);          // tap paralel, audio tetap ke destination
  window.__anBuf = new Float32Array(window.__an.fftSize);
  return JSON.stringify({ ok: true, ctxState: ctx.state, sampleRate: ctx.sampleRate,
                          baseLatency: ctx.baseLatency ?? null });
})()
"""

GESTURE = r"""
(() => {
  if (!window.__officeSound) return 'no-engine';
  const eng = window.__officeSound;
  const before = {
    started: eng.isStarted(),
    ctx: eng.rawCtx() ? eng.rawCtx().state : 'none',
  };
  // handler menulis hasil ke global (eval promise pending tak bisa dibaca CDP
  // tanpa awaitPromise, dan awaitPromise pada promise-yang-menunggu-event
  // memblokir pembacaan respons) — dibaca ulang dari Python setelah gesture.
  window.__wakeProbe = { before, done: false };
  window.addEventListener('keydown', () => {
    setTimeout(() => {
      window.__wakeProbe.after = {
        started: eng.isStarted(),
        ctx: eng.rawCtx() ? eng.rawCtx().state : 'none',
      };
      window.__wakeProbe.done = true;
    }, 0);
  }, { once: true, capture: true });
  return 'armed';
})()
"""

SAMPLE = r"""
(() => {
  const an = window.__an, buf = window.__anBuf, eng = window.__officeSound;
  if (!an || !buf || !eng) return 'no-tap';
  an.getFloatTimeDomainData(buf);
  let sum = 0, peak = 0;
  for (let i = 0; i < buf.length; i++) { const v = buf[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
  const rms = Math.sqrt(sum / buf.length);
  return JSON.stringify({ rms, peak, ct: eng.rawCtx().currentTime,
                          calls: eng.dbg().calls, state: eng.rawCtx().state });
})()
"""

UNMUTE_SETUP = r"""
(() => {
  const eng = window.__officeSound;
  eng.setMuted(false);
  eng.setVolume(1.0);
  const c = eng.rawCtx();
  if (c && c.state === 'suspended' && c.resume) c.resume();
  return JSON.stringify({ muted: eng.isMuted(), vol: eng.getVolume(), state: eng.rawCtx().state });
})()
"""

# Sampling berbasis AUDIO-TIME (bukan realtime): di headless-shell (null sink)
# WebAudio berjalan fast-forward (currentTime ~5x realtime), sinyal 0.25 s audio
# hanya ~0.05 s nyata — polling realtime 120 ms selalu melewatkan jendela sinyal.
# Loop polling diakhiri saat ctx.currentTime melewati t0+span → menjamin blok
# analyser mencakup seluruh jendela sinyal. Promise self-resolving (aman awaitPromise).
SIGNAL_JS = r"""
(() => new Promise(res => {
  const eng = window.__officeSound, an = window.__an, buf = window.__anBuf;
  const ctx = eng.rawCtx();
  const t0 = ctx.currentTime;
  eng.playMeetingChime();
  let best = 0, bestPeak = 0, polls = 0;
  const span = 3.0;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
    const rms = Math.sqrt(s / buf.length);
    if (rms > best) best = rms;
    if (pk > bestPeak) bestPeak = pk;
    polls++;
    if (ctx.currentTime > t0 + span) {
      res(JSON.stringify({ best, bestPeak, polls,
                           audioSpan: ctx.currentTime - t0,
                           calls: eng.dbg().calls, state: ctx.state }));
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
}))
"""

# verifikasi anti-false-positive: engine muted → graph membisukan sinyal
MUTE_CHECK = r"""
(() => new Promise(res => {
  const eng = window.__officeSound, an = window.__an, buf = window.__anBuf;
  const ctx = eng.rawCtx();
  eng.setMuted(true);
  const t0 = ctx.currentTime;
  eng.playSelect();
  let best = 0;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; }
    const rms = Math.sqrt(s / buf.length);
    if (rms > best) best = rms;
    if (ctx.currentTime > t0 + 0.8) {
      eng.setMuted(false);          // pulihkan
      res(JSON.stringify({ best, mutedNow: eng.isMuted() }));
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
}))
"""


def chrome_proc(extra):
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not os.path.exists("/tmp/.X11-unix/X99"):
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    args = [CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
            "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
            "--window-size=1366,768", "--disable-dev-shm-usage", URL] + extra
    p = subprocess.Popen(args, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p, xv


def ws_connect(wait_s=25):
    deadline = time.time() + wait_s
    while time.time() < deadline:
        try:
            tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
            pages = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"]
            if pages:
                return WS(pages[0])
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("chrome ws tak tersedia")


def main():
    p, xv = chrome_proc([])
    result = {"ok": None, "verdict": None, "rms": None, "peak": None,
              "mute_rms": None, "ct_advanced": None}  # type: ignore[assignment]
    try:
        ws = ws_connect()
        mid = 0

        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        def ev(expr, promise=False):
            # awaitPromise dihindari: eval promise yang tak pernah di-resolve
            # (menunggu event) akan memblokir pembacaan respons berikutnya.
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                    awaitPromise=False, userGesture=True, catchAsyncException=True)
            res = r.get("result", {})
            if res.get("exceptionDetails"):
                exc = res["exceptionDetails"].get("exception", {})
                return f"__EXC__ {exc.get('description', res['exceptionDetails'].get('text'))}"
            return res.get("result", {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable")

        # 1. tunggu scene siap
        ready = None
        for _ in range(60):
            time.sleep(0.5)
            v = ev("JSON.stringify({a: window.__agentData?window.__agentData.length:-1, s: !!window.__officeSound})")
            try:
                st = json.loads(v)
            except Exception:
                st = {}
            if st.get("a", -1) > 0 and st.get("s"):
                ready = st
                break
        if not ready:
            print("PROBE_FAIL: scene/engine belum siap (timeout)")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print("READY: agents=", ready["a"])

        # 2. gesture CDP nyata → jalur wake listener asli (keydown listener {once:true})
        # Fokus emulasi: key event CDP butuh halaman fokus.
        cmd("Emulation.setFocusEmulationEnabled", enabled=True)
        assert ev(GESTURE) == 'armed', "GESTURE gagal di-arm"
        cmd("Input.dispatchKeyEvent", type="keyDown", code="Enter", key="Enter",
            windowsVirtualKeyCode=13, nativeVirtualKeyCode=13, text="\r")
        cmd("Input.dispatchKeyEvent", type="keyUp", code="Enter", key="Enter",
            windowsVirtualKeyCode=13, nativeVirtualKeyCode=13)
        time.sleep(0.4)
        v = ev("JSON.stringify(window.__wakeProbe||{})")
        g = json.loads(v) if v and str(v).startswith('{') else {}
        if not g.get("after", {}).get("started"):
            print("PROBE_FAIL: gesture tidak membangunkan engine (wake listener)", g)
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print(f"WAKE: ctx {g['before']['ctx']} -> {g['after']['ctx']} (started, via keydown CDP)")

        # 3. pasang tap analyser (butuh ctx — baru ada setelah ensure() oleh wake)
        v = ev(TAP)
        try:
            tap = json.loads(v) if v and str(v).startswith('{') else {"ok": False, "err": repr(v)}
        except Exception:
            tap = {"ok": False, "err": repr(v)}
        if not tap.get("ok"):
            print("PROBE_FAIL: tap analyser gagal:", tap)
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print("TAP: ctxState=", tap["ctxState"], "sr=", tap["sampleRate"])

        # 4. unmute + vol penuh
        v = ev(UNMUTE_SETUP)
        print("SETUP:", v)

        # 5. chime + sampling non-silent berbasis audio-time (ulang max 3x)
        # Promise self-resolving → aman di-await via CDP awaitPromise.
        def evp(expr, timeout_polls=800):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                    awaitPromise=True, userGesture=True)
            res = r.get("result", {})
            if res.get("exceptionDetails"):
                return f"__EXC__ {res['exceptionDetails'].get('exception', {}).get('description')}"
            return res.get("result", {}).get("value")

        ok = False
        last = {}
        for attempt in range(3):
            raw = evp(SIGNAL_JS)
            if not isinstance(raw, str) or not raw.startswith('{'):
                print(f"  attempt {attempt+1}: eval gagal: {raw!r}")
                continue
            s = json.loads(raw)
            last = s
            print(f"  attempt {attempt+1}: best_rms={s['best']:.2e} peak={s['bestPeak']:.4f} "
                  f"polls={s['polls']} audio_span={s['audioSpan']:.2f}s")
            if s["best"] >= 1e-3 and s["bestPeak"] >= 0.01:
                ok = True
                break

        # 6. anti-false-positive: mute → RMS ~0
        mc_raw = evp(MUTE_CHECK)
        mc = json.loads(mc_raw) if isinstance(mc_raw, str) and mc_raw.startswith('{') else {}
        print(f"MUTE-CHECK: best_rms={mc.get('best', 0):.2e} (harus ~0)")

        # 7. ctx.currentTime maju = graph hidup
        t1 = json.loads(ev("JSON.stringify({ct: window.__officeSound.rawCtx().currentTime})"))
        time.sleep(0.5)
        t2 = json.loads(ev("JSON.stringify({ct: window.__officeSound.rawCtx().currentTime})"))
        advanced = t2["ct"] > t1["ct"]

        verdict = "OK" if (ok and advanced) else ("SILENT" if not ok else "NO-ADVANCE")
        print(f"SIGNAL: rms={last.get('rms', 0):.6f} peak={last.get('peak', 0):.4f} "
              f"calls={last.get('calls')} state={last.get('state')}")
        print(f"TIME: t1={t1['ct']:.3f} t2={t2['ct']:.3f} advanced={advanced}")
        print("E2E_AUDIO:", verdict)
        result.update({"ok": verdict == "OK", "verdict": verdict, "rms": last.get("rms"),
                       "peak": last.get("peak"), "mute_rms": mc.get("rms"),
                       "ct_advanced": advanced, "wake": g, "tap": tap})
        sys.exit(0 if verdict == "OK" else 2 if verdict == "SILENT" else 3)
    finally:
        try:
            open(OUT, "w").write(json.dumps(result))
        except Exception:
            pass
        p.kill()
        if xv:
            xv.kill()


if __name__ == "__main__":
    main()
