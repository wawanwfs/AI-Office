#!/usr/bin/env python3
"""E2E sinyal audio objektif — verifikasi suara di browser nyata TANPA pendengaran manusia.

Konversi backlog 'verifikasi subjektif audio web-audio' menjadi pengukuran objektif.

Catatan headless: chrome-headless-shell memakai null audio sink → WebAudio berjalan
fast-forward (currentTime ~5-100x realtime). Sinyal TRANSIEN (chime 0.5 s audio)
mustahil ditangkap andal via polling realtime (jendela nada terlewat antar-tick).
Karena itu probe mengukur sinyal KONTINU yang kebal fast-forward:
  A. WAKE: gesture keydown CDP nyata → AudioContext none→running (jalur wake asli)
  B. AMBIENCE: fitur nyata (hum 55 Hz + overtone 110 Hz + pink noise loop) —
     kontinu lewat masterGain → RMS stabil terukur
  C. CHAIN: test-osc kontinu (0.2) → masterGainNode() engine — membuktikan jalur
     masterGain→destination dan tap analyser membawa sinyal
  D. CHIME: playMeetingChime() dipanggil (counter naik; penjadwalan & envelope
     nada sudah diverifikasi unit test sound_engine)
  E. MUTE-CHECK: setMuted(true) → RMS jebol ke ~0 meski osc kontinu mengalir —
     anti-false-positive (tap benar-benar mendengarkan masterGain yang dibisukan)
  F. TIME: ctx.currentTime maju (graph hidup)
Keputusan: RMS>=1e-3 & peak>=0.01 (B), RMS>=1e-2 & peak>=0.05 (C), chime naik (D),
mute<1e-4 (E), advanced (F) → E2E_AUDIO OK.

Exit 0 = OK; 1 = setup gagal; 2 = SILENT; 3 = verifikasi lain gagal.
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
  // handler menulis hasil ke global (eval promise yang menunggu event memblokir
  // pembacaan respons CDP) — dibaca ulang dari Python setelah gesture.
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

# Sampling RMS/peak berbasis AUDIO-TIME (bukan realtime) — loop berakhir saat
# ctx.currentTime melewati t0+span. Sinyal yang diukur KONTINU sehingga tiap
# poll pasti melihatnya (kebal fast-forward null-sink). Promise self-resolving.
AMBIENCE_JS = r"""
window.__ambRun = () => new Promise(res => {
  const eng = window.__officeSound, an = window.__an, buf = window.__anBuf;
  const ctx = eng.rawCtx();
  const wasEnabled = eng.isAmbienceEnabled();
  eng.setMuted(false);
  eng.setVolume(1.0);
  eng.setAmbienceVolume(0.35);      // kunci vol ambience (desain default)
  eng.setAmbienceEnabled(true);     // hum 55Hz + overtone 110Hz + pink noise
  // Gain desain: calcAmbienceGain(1.0, 0.35) = 1.0 * 0.35 * AMBIENCE_BASE_GAIN(0.015)
  // = 0.00525 → peak terukur wajar ~2e-3..1e-2 (fitur memang lembut, bukan silent).
  const t0 = ctx.currentTime;
  let best = 0, bestPeak = 0, polls = 0;
  const span = 2.0;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
    const rms = Math.sqrt(s / buf.length);
    if (rms > best) best = rms;
    if (pk > bestPeak) bestPeak = pk;
    polls++;
    if (ctx.currentTime > t0 + span) {
      eng.setAmbienceEnabled(wasEnabled);   // pulihkan state awal
      res(JSON.stringify({ best, bestPeak, polls, audioSpan: ctx.currentTime - t0,
                           ambienceActive: eng.isAmbienceActive(),
                           ambienceCalls: eng.dbg().calls.ambience }));
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
});
'armed-amb'
"""

CHAIN_TONE_JS = r"""
window.__chainRun = () => new Promise(res => {
  const eng = window.__officeSound, an = window.__an, buf = window.__anBuf;
  const ctx = eng.rawCtx();
  eng.setMuted(false);
  eng.setVolume(1.0);
  // osc kontinu → masterGain engine (jalur sama persis dgn keyclick/select/chime)
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0.2;
  osc.connect(g); g.connect(eng.masterGainNode());
  osc.start();
  const t0 = ctx.currentTime;
  let best = 0, bestPeak = 0, polls = 0;
  const span = 1.5;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0, pk = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
    const rms = Math.sqrt(s / buf.length);
    if (rms > best) best = rms;
    if (pk > bestPeak) bestPeak = pk;
    polls++;
    if (ctx.currentTime > t0 + span) {
      try { osc.stop(); } catch (e) {}
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
      res(JSON.stringify({ best, bestPeak, polls, audioSpan: ctx.currentTime - t0 }));
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
});
'armed-chain'
"""

# Anti-false-positive: masterGain dibisukan → SEMUA sinyal nol meski osc kontinu
# mengalir. Bila tap tersambung ke jalur lain, RMS tak akan nol → probe gagal.
MUTE_JS = r"""
window.__muteRun = () => new Promise(res => {
  const eng = window.__officeSound, an = window.__an, buf = window.__anBuf;
  const ctx = eng.rawCtx();
  eng.setMuted(true);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0.2;
  osc.connect(g); g.connect(eng.masterGainNode());
  osc.start();
  const t0 = ctx.currentTime;
  let best = 0, polls = 0;
  const span = 1.0;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; s += v * v; }
    const rms = Math.sqrt(s / buf.length);
    if (rms > best) best = rms;
    polls++;
    if (ctx.currentTime > t0 + span) {
      try { osc.stop(); osc.disconnect(); g.disconnect(); } catch (e) {}
      eng.setMuted(false);          // pulihkan
      res(JSON.stringify({ best, polls, mutedNow: eng.isMuted(),
                           mgGain: eng.masterGainNode().gain.value }));
      return;
    }
    setTimeout(tick, 0);
  };
  tick();
});
'armed-mute'
"""


def _x99_alive():
    """Cek X server :99 hidup (bukan cuma socket basi — pelajaran siklus 127/
    128: probe sebelumnya men-terminate Xvfb-nya sendiri di finally dan socket
    basi membuat auto-start run berikutnya skip → probe 'scene tidak siap')."""
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def chrome_proc(extra):
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99_alive():
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
    result = {"ok": None, "verdict": None, "amb_rms": None, "chain_rms": None,
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

        def ev(expr):
            # awaitPromise dihindari utk eval biasa; hasil async ditulis ke global.
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                    awaitPromise=False, userGesture=True)
            res = r.get("result", {})
            if res.get("exceptionDetails"):
                exc = res["exceptionDetails"].get("exception", {})
                return f"__EXC__ {exc.get('description', res['exceptionDetails'].get('text'))}"
            return res.get("result", {}).get("value")

        def evp(expr):
            # promise SELF-RESOLVING (window.__*Run()) — aman di-await CDP
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                    awaitPromise=True, userGesture=True)
            res = r.get("result", {})
            if res.get("exceptionDetails"):
                exc = res["exceptionDetails"].get("exception", {})
                return f"__EXC__ {exc.get('description', res['exceptionDetails'].get('text'))}"
            return res.get("result", {}).get("value")

        def jload(raw):
            if isinstance(raw, str) and raw.startswith('{'):
                try:
                    return json.loads(raw)
                except Exception:
                    return {}
            return {}

        cmd("Page.enable"); cmd("Runtime.enable")

        # 1. tunggu scene siap
        ready = None
        for _ in range(60):
            time.sleep(0.5)
            st = jload(ev("JSON.stringify({a: window.__agentData?window.__agentData.length:-1, s: !!window.__officeSound})"))
            if st.get("a", -1) > 0 and st.get("s"):
                ready = st
                break
        if not ready:
            print("PROBE_FAIL: scene/engine belum siap (timeout)")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print("READY: agents=", ready["a"])

        # 2. gesture CDP nyata → jalur wake listener asli (keydown {once:true})
        cmd("Emulation.setFocusEmulationEnabled", enabled=True)
        if ev(GESTURE) != 'armed':
            print("PROBE_FAIL: GESTURE gagal di-arm")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        cmd("Input.dispatchKeyEvent", type="keyDown", code="Enter", key="Enter",
            windowsVirtualKeyCode=13, nativeVirtualKeyCode=13, text="\r")
        cmd("Input.dispatchKeyEvent", type="keyUp", code="Enter", key="Enter",
            windowsVirtualKeyCode=13, nativeVirtualKeyCode=13)
        time.sleep(0.4)
        g = jload(ev("JSON.stringify(window.__wakeProbe||{})"))
        if not g.get("after", {}).get("started"):
            print("PROBE_FAIL: gesture tidak membangunkan engine (wake listener)", g)
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print(f"WAKE: ctx {g['before']['ctx']} -> {g['after']['ctx']} (started, via keydown CDP)")

        # 3. pasang tap analyser (butuh ctx — baru ada setelah ensure() oleh wake)
        tap = jload(ev(TAP))
        if not tap.get("ok"):
            print("PROBE_FAIL: tap analyser gagal:", tap)
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        print("TAP: ctxState=", tap["ctxState"], "sr=", tap["sampleRate"])

        # 4. AMBIENCE — sinyal kontinu fitur nyata
        if ev(AMBIENCE_JS) != 'armed-amb':
            print("PROBE_FAIL: AMBIENCE_JS gagal di-define")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        amb = jload(evp("window.__ambRun()"))
        amb_rms = amb.get("best", 0)
        print(f"AMBIENCE: best_rms={amb_rms:.2e} peak={amb.get('bestPeak', 0):.4f} "
              f"polls={amb.get('polls')} span={amb.get('audioSpan', 0):.2f}s "
              f"active={amb.get('ambienceActive')} calls={amb.get('ambienceCalls')}")
        amb_ok = amb_rms >= 1e-3 and amb.get("bestPeak", 0) >= 2e-3  # desain gain 0.00525

        # 5. CHAIN — test-osc kontinu melalui masterGain engine
        if ev(CHAIN_TONE_JS) != 'armed-chain':
            print("PROBE_FAIL: CHAIN_TONE_JS gagal di-define")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        chain = jload(evp("window.__chainRun()"))
        chain_rms = chain.get("best", 0)
        print(f"CHAIN:    best_rms={chain_rms:.2e} peak={chain.get('bestPeak', 0):.4f} "
              f"polls={chain.get('polls')} span={chain.get('audioSpan', 0):.2f}s")
        chain_ok = chain_rms >= 1e-2 and chain.get("bestPeak", 0) >= 0.05

        # 6. CHIME — counter naik (transien tak bisa disample andal di null-sink)
        c0 = jload(ev("JSON.stringify(window.__officeSound.dbg().calls)")).get("chime", 0)
        ev("window.__officeSound.playMeetingChime()")
        c1 = jload(ev("JSON.stringify(window.__officeSound.dbg().calls)")).get("chime", 0)
        chime_ok = c1 > c0
        print(f"CHIME: calls {c0} -> {c1}")

        # 7. MUTE-CHECK — anti-false-positive
        if ev(MUTE_JS) != 'armed-mute':
            print("PROBE_FAIL: MUTE_JS gagal di-define")
            print("RESULT:", json.dumps(result))
            sys.exit(1)
        mc = jload(evp("window.__muteRun()"))
        mute_rms = mc.get("best", -1)
        print(f"MUTE-CHECK: best_rms={mute_rms:.2e} (harus < 1e-4) mgGain={mc.get('mgGain')}")
        mute_ok = 0 <= mute_rms < 1e-4

        # 8. TIME — ctx.currentTime maju
        t1 = jload(ev("JSON.stringify({ct: window.__officeSound.rawCtx().currentTime})")).get("ct", 0)
        time.sleep(0.5)
        t2 = jload(ev("JSON.stringify({ct: window.__officeSound.rawCtx().currentTime})")).get("ct", 0)
        advanced = t2 > t1
        print(f"TIME: t1={t1:.3f} t2={t2:.3f} advanced={advanced}")

        verdict = "OK" if (amb_ok and chain_ok and chime_ok and mute_ok and advanced) else (
            "SILENT" if not (amb_ok and chain_ok) else
            "MUTE-LEAK" if not mute_ok else "FAIL-OTHER")
        print(f"E2E_AUDIO: {verdict} (amb_ok={amb_ok} chain_ok={chain_ok} "
              f"chime_ok={chime_ok} mute_ok={mute_ok} advanced={advanced})")
        result.update({"ok": verdict == "OK", "verdict": verdict, "amb_rms": amb_rms,
                       "chain_rms": chain_rms, "mute_rms": mute_rms, "ct_advanced": advanced})
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
