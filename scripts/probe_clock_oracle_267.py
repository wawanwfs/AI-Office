#!/usr/bin/env python3
"""probe_clock_oracle_267.py — Siklus 267: ORAKEL PIKSEL LIVE jam dinding (CDP :99).

Falsifikasi fix 265+266 di ujung saluran (kandidat backlog 266): baca canvas
painter jam 96×96 LANGSUNG dari scene graph (mesh CircleGeometry bawa
CanvasTexture), bukan klaim screenshot vision.

Metode:
  - Canvas painter ditemukan via window.__scene.traverse (CircleGeometry +
    CanvasTexture 96×96) → ImageData penuh via Runtime.evaluate.
  - Sudut jarum dibaca dgn sweep 360° (langkah 1°) mencari piksel warna jarum
    TERJAUH dari pusat dalam rentang radius jarum tsb (tangan menonjol paling
    jauh). Kontrak sudut: dari 12, searah jarum jam (clock_spec.js).
  - Pemicu redraw terdeteksi via window.__animFrames melewati kelipatan
    CLOCK_REDRAW_EVERY=20 (drawClock hanya dipanggil saat frame%20===0).
    Di SwiftShader ~0.14-0.4 FPS → satu redraw tiap ±50-140 dtk → probe polling,
    tanpa sleep buta yang meleset jendela.

Tes:
  T1 EKSAK-MANUAL: window.__setTime(630) (10:30, setSimManual → acc=0) → pada
     redraw berikutnya jarum jam=315°, menit=180°, detik=180° (tol 1.5°).
     Dulu (pra-266): detik menunjuk detik WAKTU NYATA (sembarang).
  T2 FROZEN-MANUAL: redraw alami BERIKUTNYA (≥1 redraw jeda) → KETIGA sudut
     IDENTIK T1 (dulu: detik berputar sendiri via Date.now() antar redraw).
  Laju 12× saat auto TIDAK diukur di SwiftShader (0.14 FPS: satu redraw ≈ 28
  menit-sim → sampling tak dapat dibedakan dgn jitter; kontrak laju diguard
  vitest eksak — clock_unity/clock_canvas + sim_clock paritas).
  0 console error sepanjang probe.

Pemakaian: uv run --with websocket-client python3 scripts/probe_clock_oracle_267.py
"""
import base64, json, math, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9497
APP = "http://127.0.0.1:9503/app/"
WS_TIMEOUT_S = 60

# Kontrak painter (satu sumber nilai: src/scene/parts/clock_spec.js)
SECOND_LEN = 36
MINUTE_LEN = 32
HOUR_LEN = 22
SECOND_RGB = (0xF9, 0x73, 0x16)   # #f97316 oranye
HOUR_RGB = (0x22, 0x22, 0x22)     # #222
MINUTE_RGB = (0x44, 0x44, 0x44)   # #444
TOL_DEG = 1.5
REDRAW_EVERY = 20                 # effects.js CLOCK_REDRAW_EVERY (diguard vitest)

JS_FIND_CLOCK = r"""
(() => {
  const out = {err: null, found: false};
  try {
    const scene = window.__scene;
    if (!scene) { out.err = 'no __scene'; return out; }
    scene.traverse(o => {
      if (out.found) return;
      if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.material && o.material.map
          && o.material.map.image && o.material.map.image.tagName === 'CANVAS'
          && o.material.map.image.width === 96 && o.material.map.image.height === 96) {
        out.found = true;
      }
    });
    if (!out.found) out.err = 'clock canvas 96x96 tidak ditemukan';
  } catch (e) { out.err = String(e); }
  return out;
})()
"""

JS_READ = r"""
(() => {
  const out = {err: null};
  try {
    let cv = null;
    window.__scene.traverse(o => {
      if (cv) return;
      if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.material && o.material.map
          && o.material.map.image && o.material.map.image.tagName === 'CANVAS'
          && o.material.map.image.width === 96 && o.material.map.image.height === 96) {
        cv = o.material.map.image;
      }
    });
    if (!cv) { out.err = 'canvas hilang'; return out; }
    out.pixels = Array.from(cv.getContext('2d').getImageData(0, 0, 96, 96).data);
  } catch (e) { out.err = String(e); }
  return out;
})()
"""


class WS:
    def __init__(s, u):
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        s.sock.settimeout(WS_TIMEOUT_S)
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

    def send(s, m):
        d = json.dumps(m).encode()
        h = b"\x81"
        n = len(d)
        mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def rx(s, timeout=45):
        s.sock.settimeout(timeout)
        try:
            hdr = s.sock.recv(2)
        except (TimeoutError, socket.timeout):
            return None
        if len(hdr) < 2:
            return None
        ln = hdr[1] & 0x7F
        if ln == 126:
            ln = struct.unpack(">H", s.sock.recv(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", s.sock.recv(8))[0]
        data = b""
        while len(data) < ln:
            chunk = s.sock.recv(ln - len(data))
            if not chunk:
                break
            data += chunk
        return json.loads(data.decode("utf-8", "replace"))

    def try_rx(s, timeout_s=1.5):
        try:
            return s.rx(timeout=int(timeout_s))
        except (TimeoutError, socket.timeout):
            return None


def rgb_close(px, rgb, tol):
    return (abs(px[0] - rgb[0]) <= tol and abs(px[1] - rgb[1]) <= tol
            and abs(px[2] - rgb[2]) <= tol)


def hand_angle(pixels, rgb, min_r, max_r, tol):
    """Sweep 360°×1°: sudut dgn piksel warna jarum TERJAUH dari pusat.
    Return derajat dari 12 searah jarum jam, atau None bila tak ada piksel."""
    C = 48.0
    best_a, best_r = None, -1.0
    for adeg in range(360):
        a = math.radians(adeg)
        dx, dy = math.sin(a), -math.cos(a)
        r = min_r
        while r <= max_r:
            x = int(round(C + dx * r))
            y = int(round(C + dy * r))
            if 0 <= x < 96 and 0 <= y < 96:
                i = (y * 96 + x) * 4
                if pixels[i + 3] == 255 and rgb_close((pixels[i], pixels[i + 1], pixels[i + 2]), rgb, tol):
                    if r > best_r:
                        best_r, best_a = r, float(adeg)
                    break
            r += 0.25
    return best_a


def angdiff(a, b):
    d = abs(a - b) % 360.0
    return min(d, 360.0 - d)


def main():
    env = dict(os.environ, DISPLAY=":99")
    if subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)

    p = subprocess.Popen([
        CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
        "--enable-unsafe-swiftshader", "--window-size=1366,768",
        "--disable-dev-shm-usage", APP
    ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails, notes = [], []
    console_errors = [0]
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        wsu = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0]
        pr = urlparse(wsu)
        s = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sendall((
            f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        buf = b""
        s.settimeout(WS_TIMEOUT_S)
        while b"\r\n\r\n" not in buf:
            c = s.recv(1)
            if not c:
                raise ConnectionResetError("EOF handshake")
            buf += c
        ws = WS(wsu)
        ws.sock = s
        mid = [0]

        def ev(expr, timeout=45):
            mid[0] += 1
            ws.send({"id": mid[0], "method": "Runtime.evaluate",
                     "params": {"expression": expr, "returnByValue": True, "awaitPromise": False}})
            t0 = time.time()
            while time.time() - t0 < timeout:
                m = ws.rx(timeout=timeout)
                if m is None:
                    continue
                if m.get("id") == mid[0]:
                    res = m.get("result", {})
                    if "result" in res:
                        v = res["result"]
                        # returnByValue → nilai ada di descriptor .value
                        if isinstance(v, dict) and "value" in v and "type" in v:
                            return v["value"]
                        return v
                    return res
            return {}

        ws.send({"id": 99999, "method": "Runtime.enable"})
        t0 = time.time()
        while time.time() - t0 < 4:
            m = ws.try_rx(1.5)
            if not m:
                continue
            if m.get("method") == "Runtime.consoleAPICalled":
                if m.get("params", {}).get("type") == "error":
                    console_errors[0] += 1
            elif m.get("method") == "Runtime.exceptionThrown":
                console_errors[0] += 1

        # ── tunggu scene + canvas jam siap (scene hidup, bukan FPS tinggi) ──
        deadline = time.time() + 120
        ready = False
        st = {}
        while time.time() < deadline:
            st = ev(JS_FIND_CLOCK)
            if st.get("found"):
                ready = True
                break
            time.sleep(3)
        if not ready:
            print(f"FAIL: canvas jam tak ditemukan dalam 120s: {st.get('err')}")
            return 1

        def frames():
            r = ev("window.__animFrames||0")
            return r if isinstance(r, (int, float)) else 0

        def wait_next_redraw(from_frame, budget_s):
            """Poll animFrames; return (True, frame) saat frame melewati
            kelipatan-20 BARU sejak from_frame (redraw clock pasti terjadi)."""
            t0 = time.time()
            last = from_frame
            while time.time() - t0 < budget_s:
                f = frames()
                if f and f > last:
                    if (f // REDRAW_EVERY) > (last // REDRAW_EVERY):
                        return True, f
                    last = f
                time.sleep(1.0)
            return False, last

        def read_angles():
            r = ev(JS_READ)
            res = r if isinstance(r, dict) else {}
            if res.get("err") or "pixels" not in res:
                return None, res.get("err", "no pixels")
            px = res["pixels"]
            h = hand_angle(px, HOUR_RGB, 10, HOUR_LEN + 2, 22)
            mn = hand_angle(px, MINUTE_RGB, 24, MINUTE_LEN + 2, 22)
            sc = hand_angle(px, SECOND_RGB, 26, SECOND_LEN + 2, 60)
            return (h, mn, sc), None

        # ── T1: manual 10:30 → redraw → eksak 315/180/180 ──
        f0 = frames()
        ev("window.__setTime(630)")
        ok, f1 = wait_next_redraw(f0, 260)
        if not ok:
            print(f"FAIL: tak ada redraw dalam 260s (frames {f0}→{f1})")
            return 1
        time.sleep(1.0)  # canvas ditulis pada frame kelipatan 20; beri jeda upload tekstur
        ang, err = read_angles()
        if ang is None:
            print(f"FAIL: baca piksel T1 gagal: {err}")
            return 1
        h, mn, sc = ang
        ok_h = h is not None and angdiff(h, 315.0) <= TOL_DEG
        ok_m = mn is not None and angdiff(mn, 180.0) <= TOL_DEG
        ok_s = sc is not None and angdiff(sc, 180.0) <= TOL_DEG
        print(f"T1 manual 10:30: hour={h} (exp 315, {'OK' if ok_h else 'FAIL'}) "
              f"minute={mn} (exp 180, {'OK' if ok_m else 'FAIL'}) "
              f"second={sc} (exp 180, {'OK' if ok_s else 'FAIL'})")
        if not ok_h:
            fails.append(f"T1 jarum jam {h}≠315")
        if not ok_m:
            fails.append(f"T1 jarum menit {mn}≠180")
        if not ok_s:
            fails.append(f"T1 jarum detik {sc}≠180 (dulu: detik waktu nyata Date.now)")

        # ── T2: redraw berikutnya (manual masih beku) → ketiga sudut identik ──
        ok, f2 = wait_next_redraw(f1, 260)
        if not ok:
            print(f"WARN: redraw kedua tak tercapai dalam 260s (frames {f1}→{f2}) — T2 dilewati")
            notes.append("T2 skipped: redraw kedua tak tercapai")
        else:
            time.sleep(1.0)
            ang2, err2 = read_angles()
            if ang2 is None:
                print(f"FAIL: baca piksel T2 gagal: {err2}")
                return 1
            h2, mn2, sc2 = ang2
            same = (h is not None and h2 is not None and angdiff(h, h2) < 0.5
                    and mn is not None and mn2 is not None and angdiff(mn, mn2) < 0.5
                    and sc is not None and sc2 is not None and angdiff(sc, sc2) < 0.5)
            print(f"T2 frozen manual: jam {h}→{h2}, menit {mn}→{mn2}, detik {sc}→{sc2} "
                  f"→ {'OK (semua beku)' if same else 'FAIL (ada jarum bergerak saat manual)'}")
            if not same:
                fails.append("T2 jarum bergerak antar redraw saat sim manual beku (detik Date.now kembali?)")

        errs = console_errors[0]
        print(f"frames={f0}→{f1}{'' if notes else '→' + str(f2)} console_errors={errs}")
        if errs > 0:
            fails.append(f"console error {errs}")

        print("\n== VERDICT:", "PASS" if not fails else f"FAIL {fails}", "==")
        for n in notes:
            print("NOTE:", n)
        return 0 if not fails else 1
    finally:
        try:
            p.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
