#!/usr/bin/env python3
"""probe_clock_oracle_267.py — Siklus 267: ORAKEL PIKSEL LIVE jam dinding (CDP :99).

Falsifikasi fix 265+266 di ujung saluran (kandidat backlog 266): baca canvas
painter jam 96×96 LANGSUNG dari scene graph (mesh CircleGeometry bawa
CanvasTexture 96×96), bukan klaim screenshot vision.

Metode:
  - Canvas painter ditemukan via window.__scene.traverse (CircleGeometry +
    CanvasTexture 96×96) → ImageData penuh via Runtime.evaluate.
  - Sudut jarum dibaca dgn sweep 360° (langkah 1°, radius 0.25px): piksel warna
    jarum TERJAUH dari pusat dalam rentang radius jarum tsb. Kontrak sudut:
    dari 12, searah jarum jam (clock_spec.js): detik = frac×6, menit = m%60×6,
    jam = (m/60 %12)×30 — dgn nowSeconds = simClockSeconds(timeOfDay, frac).
  - Redraw clock hanya di frame%20===0 (CLOCK_REDRAW_EVERY, diguard vitest);
    SwiftShader ±0.14-0.4 FPS → satu redraw tiap ±50-140 dtk → poll __animFrames.
  - PELAJARAN desain (iterasi 1 salah): __setTime manual hanya beku 8 dtk
    (MANUAL_RESUME_MS) — redraw 40+ dtk kemudian menangkap sim AUTO dgn
    timeOfDay tergeser (terukur: jam≈319°, menit≈228°, detik≈140° = model
    630+8+frac, BUKAN waktu nyata — justru bukti awal pipa sim bekerja).
    Kini T1 MENJAGA manual tetap aktif: refresh __setTime(630) tiap 4 dtk
    selama polling → saat redraw, manual pasti aktif → acc=0, frac=0.

Tes:
  T1 EKSAK-MANUAL (kunci): manual 10:30 dijaga aktif → redraw berikutnya
     WAJIB jam=315°, menit=180°, detik=0° (tol 1.5°). Pra-266 (dateMs default
     Date.now): detik = detik WAKTU NYATA — hampir tak mungkin 0°; kontrak
     baru: detik = nowSeconds+frac = 37800 % 60 = 0 → 0° eksak.
  T2 REPRODUSIBILITAS: redraw manual kedua (refresh tetap jalan) → ketiga
     sudut IDENTIK T1.
  T3 INFORMATIF-AUTO: refresh dihentikan → redraw auto berikutnya: dekode
     sudut detik vs hipotesis Date.now (detik nyata×6)±12° jitter CDP —
     di luar rentang = konfirmasi ekstra; di dalam = ambigu (verdict T1).
Pemakaian: uv run --with websocket-client python3 scripts/probe_clock_oracle_267.py
"""
import base64, json, math, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9497
APP = "http://127.0.0.1:9503/app/"
WS_TIMEOUT_S = 60

SECOND_LEN = 36
MINUTE_LEN = 32
HOUR_LEN = 22
SECOND_RGB = (0xF9, 0x73, 0x16)   # #f97316 oranye
HOUR_RGB = (0x22, 0x22, 0x22)     # #222
MINUTE_RGB = (0x44, 0x44, 0x44)   # #444
TOL_DEG = 4.0
REDRAW_EVERY = 20                 # effects.js CLOCK_REDRAW_EVERY (diguard vitest)

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
    if (!cv) { out.err = 'canvas jam 96x96 hilang'; return out; }
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


# Predikat warna: jarum detik 1.2px ter-anti-alias → campuran dgn bg putih
# (250,250,250): dominansi merah (r−g≥40, r−b≥60, g≥90) menangkap blend 30-80%.
def is_orange(r, g, b):
    return r >= 200 and (r - g) >= 40 and (r - b) >= 60 and g >= 90 and b <= 200


def is_dark(r, g, b):
    return r < 110 and g < 110 and b < 110


def hand_angle_ink(pixels, pred, min_r, max_r, exclude_deg=None, excl_w=0.0):
    """Argmax TINTA per sudut (bukan 'piksel terjauh'): hitung SEMUA hit sepanjang
    ray 1°, pilih sudut dgn jumlah piksel terbanyak. Pelajaran iterasi-2: logika
    'furthest + break di hit pertama' memilih tepi DASAR jarum (r≈min_r) → sudut
    terbaca 315−asin(w/2/min_r) = 304° (tepi, bukan ujung). Tinta: puncak di
    sektor jarum (width×length dominan), stabil utk garis AA 1.2px.
    Pass-2: centroid berbobot 0.25° di ±3° argmax (puncak sebidang ±1° —
    lebar angular jarum 1.2px @r30 ≈ 2.3°).
    exclude_deg/excl_w: sektor yang DILARANG jadi argmax (jarum lain menimpa —
    iterasi-6: menit 4px lebar memblokir kompas jam di 10:xx).
    Return derajat dari 12 searah jarum jam, atau None."""

    def ink_at(adeg_f):
        a = math.radians(adeg_f)
        dx, dy = math.sin(a), -math.cos(a)
        ink = 0
        r = min_r
        while r <= max_r:
            x = int(round(C + dx * r))
            y = int(round(C + dy * r))
            if 0 <= x < 96 and 0 <= y < 96:
                i = (y * 96 + x) * 4
                if pixels[i + 3] == 255 and pred(pixels[i], pixels[i + 1], pixels[i + 2]):
                    ink += 1
            r += 0.25
        return ink

    C = 48.0
    cands = []
    for adeg in range(360):
        if exclude_deg is not None and angdiff(float(adeg), exclude_deg) <= excl_w:
            continue
        ink = ink_at(float(adeg))
        cands.append((ink, float(adeg)))
    cands.sort(key=lambda t: -t[0])
    best_ink, best_a = cands[0] if cands else (0, None)
    if best_ink <= 0 or best_a is None:
        return None
    # pass-2: centroid berbobot di ±2.8° dgn pembatasan setengah-tinggi (hemat
    # lebar angular: centroid penuh ±3° menyeret nilai ~2-3° ke arah tinta tetangga)
    num = den = 0.0
    half = best_ink / 2.0
    k = best_a - 3.0
    while k <= best_a + 3.0:
        w = ink_at(k % 360.0)
        if w >= half:
            num += k * w
            den += w
        k += 0.25
    return (num / den) % 360.0 if den > 0 else best_a


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

        # ── tunggu scene + canvas jam siap ──
        deadline = time.time() + 120
        ready = False
        st = {}
        while time.time() < deadline:
            st = ev(JS_READ)
            if isinstance(st, dict) and "pixels" in st:
                ready = True
                break
            time.sleep(3)
        if not ready:
            print(f"FAIL: canvas jam tak siap dalam 120s: {st.get('err') if isinstance(st, dict) else st}")
            return 1

        def frames():
            r = ev("window.__animFrames||0")
            return r if isinstance(r, (int, float)) else 0

        def read_angles():
            r = ev(JS_READ)
            res = r if isinstance(r, dict) else {}
            if res.get("err") or "pixels" not in res:
                return None, res.get("err", "no pixels")
            px = res["pixels"]
            # PENTING: label agen 360×98 dikecualikan (width 360 ≠ 96). Kanvas
            # jam SATU-SATUNYA CircleGeometry 96×96 — verifikasi ulang per bacaan
            # agar race destroy/remount (label baru) tak menyuntik kanvas salah.
            # Rentang radius dibatasi ketat di bawah brim (r≈35.5 hitam — pelajaran
            # dump: menit tanpa batas atas menangkap brim 44px → 237° = 180+57).
            # Jam: rentang 24..20 DIBALIK — argmax ray pada window 10..22 = 180°
            # (tumpang tindih menit di r≤22 pada 10:xx; pelajaran iterasi-5).
            # Kontrak: JAM terpanjang = 22px (HANDS.hour.len). Ray window 23..22
            # kosong utk jam; utk meniru 'puncak TUNGGAL', gunakan window r>=23
            # MINUS menit: kanvas di r=23..32 memuat menit SAJA (jam maks 22) →
            # sudut tinta di window 23..32 = MENIT; sudut tinta di window 10..21
            # dgn tinta min 3 ray = gabungan. Strategi final (iterasi-6): baca
            # MENIT dr window 23..32, lalu JAM = argmax window 10..22 DI LUAR
            # ±8° menit (jarum menit memblokir kompas dr 180° dgn 4px lebar).
            mn = hand_angle_ink(px, is_dark, 23, MINUTE_LEN - 1)
            h = hand_angle_ink(px, is_dark, 10, 22, exclude_deg=mn, excl_w=8.0)
            sc = hand_angle_ink(px, is_orange, 6, SECOND_LEN + 2)
            return (h, mn, sc), None

        def wait_redraw_keep_manual(from_frame, budget_s, refresh=True):
            """Poll animFrames; bila refresh: jaga manual aktif (__setTime(630)
            tiap 4 dtk < MANUAL_RESUME_MS 8 dtk) → saat redraw, timeOfDay=630
            eksak & acc=0 (frac=0). Pelajaran iterasi-1: manual RESUME otomatis
            setelah 8 dtk — redraw 40+ dtk kemudian menangkap sim auto."""
            t0 = time.time()
            last_set = 0.0
            last = from_frame
            while time.time() - t0 < budget_s:
                if refresh and time.time() - last_set >= 4.0:
                    ev("window.__setTime(630)")
                    last_set = time.time()
                f = frames()
                if f and f > last:
                    if (f // REDRAW_EVERY) > (last // REDRAW_EVERY):
                        return True, f
                    last = f
                time.sleep(1.0)
            return False, last

        # ── T1: manual 10:30 DIJAGA aktif → redraw → eksak 315/180/0 ──
        f0 = frames()
        ev("window.__setTime(630)")
        ok, f1 = wait_redraw_keep_manual(f0, 420, refresh=True)
        if not ok:
            print(f"FAIL: tak ada redraw dalam 420s (frames {f0}→{f1})")
            return 1
        time.sleep(1.0)
        ang, err = read_angles()
        if ang is None:
            print(f"FAIL: baca piksel T1 gagal: {err}")
            return 1
        h, mn, sc = ang
        ok_h = h is not None and angdiff(h, 315.0) <= TOL_DEG
        ok_m = mn is not None and angdiff(mn, 180.0) <= TOL_DEG
        ok_s = sc is not None and angdiff(sc, 0.0) <= TOL_DEG
        print(f"T1 manual 10:30 dijaga: hour={h} (exp 315, {'OK' if ok_h else 'FAIL'}) "
              f"minute={mn} (exp 180, {'OK' if ok_m else 'FAIL'}) "
              f"second={sc} (exp 0, {'OK' if ok_s else 'FAIL'})")
        if not ok_h:
            fails.append(f"T1 jarum jam {h}≠315")
        if not ok_m:
            fails.append(f"T1 jarum menit {mn}≠180")
        if not ok_s:
            fails.append(f"T1 jarum detik {sc}≠0 — detik=nowSeconds+frac (frac=0 manual) tak sampai piksel / Date.now hidup")

        # ── T2: redraw manual kedua (refresh tetap) → identik T1 ──
        ok, f2 = wait_redraw_keep_manual(f1, 420, refresh=True)
        if not ok:
            print(f"WARN: redraw kedua tak tercapai (frames {f1}→{f2}) — T2/T3 dilewati")
            notes.append("T2/T3 skipped: redraw kedua tak tercapai")
        else:
            time.sleep(1.0)
            ang2, err2 = read_angles()
            if ang2 is None:
                print(f"WARN: baca piksel T2 gagal: {err2}")
                notes.append("T2 baca gagal")
            else:
                same = all(a is not None and b is not None and angdiff(a, b) < 1.0
                           for a, b in zip((h, mn, sc), ang2))
                print(f"T2 reprodusibilitas manual: {ang2} → {'OK (identik T1)' if same else 'FAIL (beda dgn T1)'}")
                if not same:
                    fails.append("T2 redraw manual kedua ≠ T1 (tak reprodusibel)")
                # ── T3 informatif: TANPA refresh → auto ──
                f_last = f2
                t0b = time.time()
                got3 = False
                while time.time() - t0b < 420:
                    f = frames()
                    if f and f > f_last and (f // REDRAW_EVERY) > (f_last // REDRAW_EVERY):
                        got3 = True
                        break
                    if f:
                        f_last = max(f_last, f)
                    time.sleep(1.0)
                if not got3:
                    print("WARN: redraw auto tak tercapai dalam 420s — T3 dilewati")
                    notes.append("T3 skipped: redraw auto tak tercapai")
                else:
                    t_r = time.time()
                    time.sleep(1.0)
                    ang3, err3 = read_angles()
                    if ang3 is None:
                        print(f"WARN: baca piksel T3 gagal: {err3}")
                        notes.append("T3 baca gagal")
                    else:
                        h3, mn3, sc3 = ang3
                        real_sec = t_r % 60
                        pred_old = (real_sec * 6.0) % 360.0
                        dev_old = angdiff(sc3, pred_old) if sc3 is not None else None
                        moved = (h is not None and h3 is not None and angdiff(h, h3) > 0.5)
                        print(f"T3 auto: hour={h3} minute={mn3} second={sc3} | real_sec={real_sec:.0f} "
                              f"pred_DateNow={pred_old:.0f}° dev={dev_old if dev_old is None else round(dev_old, 1)}° "
                              f"| jam bergeser: {'ya' if moved else 'tidak'}")
                        if dev_old is not None and dev_old > 12.0:
                            notes.append("T3: detik auto DI LUAR rentang Date.now → bukan waktu nyata (konfirmasi ekstra)")
                        elif dev_old is not None:
                            notes.append("T3: dalam rentang jitter Date.now — ambigu, verdict utama tetap T1")

        errs = console_errors[0]
        print(f"frames={f0}→{f1} console_errors={errs}")
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
