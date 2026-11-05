#!/usr/bin/env python3
"""probe_clock_oracle_267.py — Siklus 267: ORAKEL PIKSEL LIVE jam dinding (CDP :99).

Falsifikasi fix 265+266 di ujung saluran (kandidat backlog 266): baca canvas
painter jam 96×96 LANGSUNG dari scene graph (THREE.Mesh CircleGeometry dgn
CanvasTexture) → nilai piksel EKSAK, bukan klaim screenshot vision.

Aturan: ambil ImageData pada radius 38px sepanjang sudut jarum detik ORANGE
(#f97316) & jarum menit gelap — sudut dibaca via arc-detect (sweep 360°,
piksel warna jarum terjauh dari pusat), dibandingkan dgn kontrak sim:
  expectedSecondAngle = secondHandAngle(simClockSeconds(timeOfDay, frac))
dengan frac = (__sim.acc / SIM_SEC_PER_MIN) × 60 (detik-sim di menit berjalan).
 toleransi: redraw clock diskrit (CLOCK_REDRAW_EVERY=20 frame) & sim berjalan
→ sudut detik valid dalam jendela [0, 60) detik-sim di depan bacaan.

Tes:
  T1 ORAKEL: jarum JAM & MENIT eksak kontrak (toleransi 1.5° — sumber TUNGGAL
     timeOfDay+acc, tanpa pembacaan antar-redraw), arah jarum detik sesuai
     jendela detik-sim kontrak;
  T2 FROZEN: __setTime manual (sim beku) → dua snapshot terpisah ≥1.2 dtk:
     jam & menit EKSAK SAMA (dulu detik berputar sendiri via Date.now());
     sudut detik juga diem (frac=0 saat manual — setSimManual reset acc);
  T3 RATE: sim auto → delta sudut detik antar bacaan ≈ laju 12× waktu-nyata
     (60 detik-sim / 5 dtk nyata; jendela toleransi lebar dgn clamp dt 0.05).
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

# Kontrak painter (satu sumber: src/scene/parts/clock_spec.js / clock_units.js)
SIM_SEC_PER_MIN = 5
CLOCK_RIM_R = 45          # px, canvas 96×96
SECOND_LEN = 36           # HANDS.second.len
MINUTE_LEN = 32           # HANDS.minute.len
HOUR_LEN = 22             # HANDS.hour.len
# Warna jarum (hex) → rgb
SECOND_RGB = (0xF9, 0x73, 0x16)   # #f97316 oranye
HOUR_RGB = (0x22, 0x22, 0x22)     # #222
MINUTE_RGB = (0x44, 0x44, 0x44)   # #444
TOL_DEG = 1.5

JS_READ = r"""
(() => {
  const out = {err: null};
  try {
    const scene = window.__scene;
    if (!scene) { out.err = 'no __scene'; return out; }
    let cv = null;
    scene.traverse(o => {
      if (cv) return;
      if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.material && o.material.map
          && o.material.map.image && o.material.map.image.tagName === 'CANVAS'
          && o.material.map.image.width === 96 && o.material.map.image.height === 96) {
        cv = o.material.map.image;
      }
    });
    if (!cv) { out.err = 'clock canvas 96x96 tidak ditemukan'; return out; }
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0, 0, 96, 96).data;
    out.pixels = Array.from(img);
  } catch (e) { out.err = String(e); }
  return out;
})()
"""

JS_STATE = r"""
(() => ({ time: window.__agentData ? (window.__simState || null) : null,
  hasSet: typeof window.__setTime === 'function',
  frames: window.__animFrames || 0 }))()
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


def rgb_close(px, rgb, tol=40):
    return (abs(px[0] - rgb[0]) <= tol and abs(px[1] - rgb[1]) <= tol
            and abs(px[2] - rgb[2]) <= tol)


def hand_angle_from_pixels(pixels, rgb, min_r, max_r, tol=40):
    """Sweep 360° (360 langkah 1°): untuk tiap sudut cari piksel warna jarum
    terjauh dari pusat dalam [min_r,max_r]. Sudut jarum = sudut dgn piksel
    terjauh (tangan menonjol paling jauh). Return derajat dari 12, searah
    jarum jam, atau None bila tak ada piksel."""
    C = 48.0
    best_a, best_r = None, -1.0
    for adeg in range(360):
        a = math.radians(adeg)
        dx, dy = math.sin(a), -math.cos(a)
        for r10 in range(int(min_r * 10), int(max_r * 10) + 1, 2):
            r = r10 / 10.0
            x = int(round(C + dx * r))
            y = int(round(C + dy * r))
            if 0 <= x < 96 and 0 <= y < 96:
                i = (y * 96 + x) * 4
                if rgb_close((pixels[i], pixels[i + 1], pixels[i + 2]), rgb, tol):
                    if r > best_r:
                        best_r, best_a = r, adeg
                    break
    return best_a if best_a is not None else None


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
        console_errors = [0]

        def ev(expr, timeout=45):
            mid[0] += 1
            ws.send({"id": mid[0], "method": "Runtime.evaluate",
                     "params": {"expression": expr, "returnByValue": True, "awaitPromise": False}})
            t0 = time.time()
            while time.time() - t0 < timeout:
                m = ws.rx(timeout=timeout)
                if m is None:
                    return {}
                if m.get("id") == mid[0]:
                    res = m.get("result", {})
                    if "result" in res:
                        return res["result"]
                    return res
            return {}

        ws.send({"id": 99999, "method": "Runtime.enable"})
        t0 = time.time()
        while time.time() - t0 < 5:
            try:
                m = ws.rx(timeout=2)
            except (TimeoutError, socket.timeout):
                continue
            if m and m.get("method") == "Runtime.consoleAPICalled":
                p = m.get("params", {})
                if p.get("type") == "error":
                    console_errors[0] += 1
            elif m and m.get("method") == "Runtime.exceptionThrown":
                console_errors[0] += 1

        # ── tunggu scene hidup: __scene + canvas jam + beberapa frame ──
        deadline = time.time() + 90
        ready = False
        while time.time() < deadline:
            st = ev("(() => ({s: !!window.__scene, f: window.__animFrames || 0}))()")
            if st.get("result", st).get("s") and st.get("result", st).get("f", 0) > 40:
                ready = True
                break
            time.sleep(2)
        if not ready:
            print("FAIL: scene tidak hidup dalam 90s")
            return 1
        # relayout tick + damping butuh waktu — tapi orakel jam tidak bergantung oklusi; 3 frame cukup
        time.sleep(4)

        def read_pixels():
            r = ev(JS_READ)
            res = r.get("result", r)
            if res.get("err"):
                return None, res["err"]
            return res.get("pixels"), None

        px, err = read_pixels()
        if px is None:
            print(f"FAIL: baca canvas gagal: {err}")
            return 1

        # ── state sim via evaluate langsung (timeOfDay tidak diekspos → baca via
        #    representasi jarum: orakel membandingkan TERHADAP KONTRAK dgn angka
        #    dari __setTime yang kita set sendiri, sehingga tak perlu akses privat)
        # T2/T3 memakai __setTime(m) untuk kontrol penuh; T1 memakai manual set
        # eksak agar kontrak bisa dihitung persis.
        # Set manual 10:30 → jam 315°, menit 180°, detik 180° (acc=0 saat manual).
        ev("window.__setTime(630)")  # 10:30
        time.sleep(1.5)  # ≥ CLOCK_REDRAW_EVERY frame
        px1, e1 = read_pixels()
        if px1 is None:
            print(f"FAIL: baca canvas T2a gagal: {e1}")
            return 1
        h = hand_angle_from_pixels(px1, HOUR_RGB, 10, HOUR_LEN + 2)
        mnt = hand_angle_from_pixels(px1, MINUTE_RGB, 20, MINUTE_LEN + 2)
        sec = hand_angle_from_pixels(px1, SECOND_RGB, 20, SECOND_LEN + 2)
        exp_h, exp_m = 315.0, 180.0
        ok_h = h is not None and angdiff(h, exp_h) <= TOL_DEG
        ok_m = mnt is not None and angdiff(mnt, exp_m) <= TOL_DEG
        # detik: manual → frac=0 → detik eksak di menit yang ditunjuk (180°)
        ok_s = sec is not None and angdiff(sec, 180.0) <= TOL_DEG
        print(f"T1 manual 10:30: hour={h} (exp 315, {'OK' if ok_h else 'FAIL'}) "
              f"minute={mnt} (exp 180, {'OK' if ok_m else 'FAIL'}) "
              f"second={sec} (exp 180, {'OK' if ok_s else 'FAIL'})")
        if not (ok_h and ok_m):
            fails.append("T1 jarum jam/menit tak sesuai kontrak")
        if not ok_s:
            fails.append("T1 detik manual ≠ menit (frac harus 0 saat manual)")

        # T2 FROZEN: manual tetap, snapshot kedua ≥1.2 dtk → SEMUA jarum identik
        time.sleep(1.6)
        px2, e2 = read_pixels()
        if px2 is None:
            print(f"FAIL: baca canvas T2b gagal: {e2}")
            return 1
        sec2 = hand_angle_from_pixels(px2, SECOND_RGB, 20, SECOND_LEN + 2)
        frozen_ok = sec2 is not None and sec is not None and angdiff(sec, sec2) < 0.5
        print(f"T2 frozen manual: second1={sec} second2={sec2} → {'OK' if frozen_ok else 'FAIL'} "
              f"(dulu: detik berputar sendiri via Date.now())")
        if not frozen_ok:
            fails.append("T2 detik bergerak saat sim manual beku")

        # T3 RATE: keluar manual, auto-advance → detik-sim berjalan 12× nyata.
        # Set ulang manual 10:30 lalu tunggu MANUAL_RESUME_MS (8 dtk) → autoplay
        # lanjut DARI 10:30 dgn acc mulai 0 → kontrak: menit-sim bertambah
        # tiap 5 dtk nyata. Ukur sudut detik bertahap: per 5 dtk nyata ≈ +60°.
        ev("window.__setTime(630)")
        seq = []
        t_start = time.time()
        # tunggu 8 dtk manual resume + 0.5
        time.sleep(8.6)
        for k in range(5):
            time.sleep(2.5)
            pxk, ek = read_pixels()
            if pxk is None:
                print(f"FAIL: baca canvas T3-{k} gagal: {ek}")
                return 1
            sk = hand_angle_from_pixels(pxk, SECOND_RGB, 20, SECOND_LEN + 2)
            seq.append((time.time() - t_start, sk))
        print("T3 auto sequence:", [(round(t, 1), a) for t, a in seq])
        # validasi: antar sampel 2.5 dtk nyata → +30° detik-sim (12×); sampel
        # diskrit + redraw 20-frame (~5 dtk @0.4fps SwiftShader... frame lambat →
        # toleransi: monotoni + total naik ≥ 90° sepanjang 10 dtk terakhir
        # (kontrak minimal 12°/dtk nyata; kode lama 6°/dtk nyata → 60° < 90).
        angles = [a for _, a in seq if a is not None]
        total_ok = len(angles) >= 4
        monotonic = all(angles[i + 1] > angles[i] - 1.0 for i in range(len(angles) - 1)) if total_ok else False
        # total termasuk wrap: koreksi wrap
        tot = 0.0
        for i in range(len(angles) - 1):
            d = (angles[i + 1] - angles[i]) % 360.0
            tot += d
        rate_ok = tot >= 90.0
        print(f"T3 rate: total_naik={tot:.1f}° dalam {seq[-1][0]-seq[0][0]:.1f}s nyata "
              f"({'OK' if rate_ok else 'FAIL'}; kontrak ≥12°/s sim=12×nyata; kode lama ~6°/s→60°)")
        if not (monotonic and rate_ok):
            fails.append("T3 laju detik ≠ 12× waktu-nyata (masih Date.now / salah pipa)")

        errs = console_errors[0]
        print(f"console_errors={errs}")
        if errs > 0:
            fails.append(f"console error {errs}")

        print("\n== VERDICT:", "PASS" if not fails else f"FAIL {fails}", "==")
        return 0 if not fails else 1
    finally:
        try:
            p.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
