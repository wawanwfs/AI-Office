#!/usr/bin/env python3
"""E2E siklus 143: badge okupansi lantai LIVE di tombol FloorNavigator (scene NYATA).

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Jam simulasi 480 (08:00, semua agen di meja) → tiap tombol lantai
     menampilkan badge jumlah agen (total badge = 26, distribusi 3 lantai).
  3. __setTime(720) (lunch 12:00) → daycycle mengirim agen ke Executive Cafe
     L3 (z≈5.6) → distribusi berubah LIVE: L3 naik, L1 turun — tanpa reload.
Pemakaian: uv run --with websocket-client python scripts/e2e_floor_occupancy.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading


def __wfs_pick_chrome():
    """Siklus 469: resolver browser revision-agnostik (dulu hardcode 1248)."""
    import glob as _g, os as _o, re as _re
    def _rev(p):
        m = _re.search(r"-(\d+)/", p)
        return int(m.group(1)) if m else 0
    base = _o.path.expanduser("~/.cache/ms-playwright")
    cand = sorted(_g.glob(base + "/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"), key=_rev)
    if not cand:
        cand = sorted(_g.glob(base + "/chromium-*/chrome-linux*/chrome"), key=_rev)
    return cand[-1] if cand else ""

CHROME = __wfs_pick_chrome()
PORT = 9464
URL = "http://127.0.0.1:9503/"


WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        s.sock.settimeout(WS_TIMEOUT_S)  # d1: handshake tanpa deadline = hang selamanya
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:  # chrome mati di tengah handshake -> EOF, dulu loop selamanya
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

    def send(s, m):
        d = json.dumps(m).encode()
        h = b"\x81"
        n = len(d)
        mask = os.urandom(4)
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
                    raise ConnectionResetError("socket closed")
                b += c
            return b
        hdr = rx(2)
        op = hdr[0] & 0xf
        n = hdr[1] & 0x7f
        if n == 126:
            n = struct.unpack(">H", rx(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


def _x99_alive():
    return os.path.exists("/tmp/.X11-unix/X99")


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99_alive():
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0
        msgq = queue.Queue()

        def pump():
            while True:
                try:
                    raw = ws.recv()
                except Exception:
                    msgq.put(None)
                    return
                if not raw:
                    msgq.put(None)
                    return
                try:
                    msgq.put(json.loads(raw))
                except Exception:
                    continue

        threading.Thread(target=pump, daemon=True).start()

        def wait_id(myid, tries=200):
            # siklus 200: tries×timeout=20 dtk = worst case 66 MENIT TANPA deadline
            # total (reply hilang tapi socket tetap hidup) → probe/cron menggantung.
            # Kelas cacat sama dgn office_phase di 199, tersisa di 13 probe lain.
            # Deadline TOTAL 60 dtk: reply yang tak datang = None tercatat jujur.
            deadline = time.time() + 60
            for _ in range(tries):
                remaining = deadline - time.time()
                if remaining <= 0:
                    return None
                try:
                    m = msgq.get(timeout=min(20, remaining))
                except queue.Empty:
                    return None
                if m is None:
                    raise ConnectionResetError("CDP socket tertutup")
                if m.get("id") == myid:
                    return m
            return None

        def cmd(method, **params):
            nonlocal mid
            mid += 1
            myid = mid
            ws.send({"id": myid, "method": method, "params": params})
            return wait_id(myid)

        def ev(expr, tries=3):
            for _ in range(tries):
                r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
                if r:
                    res = (r.get("result", {}).get("result", {}) or {})
                    # siklus 200: exceptionDetails di-surface (dulu ditelan senyap
                    # → FAIL tanpa diagnosis; pola b2 office_phase 199)
                    if r.get("result", {}).get("exceptionDetails"):
                        res["_exc"] = json.dumps(
                            r["result"]["exceptionDetails"])[:300]
                    return res
                time.sleep(0.5)
            return {}

        cmd("Runtime.enable")
        time.sleep(1)
        # Siklus 282: landing kini default route (6230629) — paksa masuk mode
        # office jika probe mendarat di landing (__agentData tetap kosong).
        if ev("window.__agentData?window.__agentData.length:0").get("value") in (0, None):
            ev("location.assign('http://127.0.0.1:9503/app/?mode=office')")
            time.sleep(3)

        agents = -1
        for _ in range(40):
            v = ev("window.__agentData?window.__agentData.length:-1").get("value")
            if isinstance(v, (int, float)) and v >= 26:
                agents = int(v)
                break
            time.sleep(1)

        # ── Siklus 276: NORMALISASI JAM SIM ke jam kerja SEBELUM baseline ──
        # timeOfDay awal = jam NYATA load (OfficeScene.js:1476). Load di dalam
        # window lunch 12:00–13:00 → shiftStep langsung lunch_start → semua
        # agen berjalan ke kafe sebelum baseline → base L3:26 → syarat
        # L3>=base+3 mustahil (akar FAIL deterministik-by-jam, bukan regresi
        # produk). setTime(480) = jalur resmi slider HUD (updateTime →
        # applySimTime + lighting → sim lanjut autoplay dari 08:00).
        #
        # Kontrak tunggu yang KETAT (pelajaran penting siklus 276): di bawah
        # beban SwiftShader `Runtime.evaluate` bisa timeout → ev() = {} dan
        # json.loads("{}") menghasilkan {lunch:0,lunchWalk:0} → guard lama
        # "break bila 0" MENYALA PALSU pada bacaan GAGAL (terbukti live: probe
        # diagnostik semua trace = {}). Karena itu: (1) setTime diulang sampai
        # TERKONFIRMASI lewat __dbg().t masuk jam kerja; (2) settled hanya bila
        # kedua kunci BENAR-BENAR ada di payload.
        def sim_state():
            raw = ev("(()=>{const d=window.__agentData||[],dbg=window.__dbg?window.__dbg():null;"
                     "if(!dbg)return 'NO_DBG';"
                     "return JSON.stringify({t:dbg.t,lunch:d.filter(e=>e.lunch).length,"
                     "lunchWalk:d.filter(e=>e.state==='walking_out'&&e.lunch).length})})()"
                     ).get("value")
            if not isinstance(raw, str) or not raw.startswith("{"):
                return None            # bacaan GAGAL — bukan "settled"
            try:
                s = json.loads(raw)
            except Exception:
                return None
            if not isinstance(s, dict) or "lunch" not in s or "lunchWalk" not in s or "t" not in s:
                return None
            return s

        for _ in range(12):
            ev("window.__setTime(480)")
            time.sleep(1.5)
            s = sim_state()
            if s and isinstance(s.get("t"), (int, float)) and 480 <= s["t"] < 720:
                break
        # Tunggu walker lunch benar-benar pulang (endLunch/working_am): kedua
        # kunci nol DAN bacaan valid.
        for _ in range(30):
            s = sim_state()
            if s and s["lunch"] == 0 and s["lunchWalk"] == 0:
                break
            time.sleep(1.5)
        time.sleep(1)

        # Baca badge okupansi tiap tombol lantai dari DOM
        OCC_EXPR = ("(()=>{const nav=document.querySelector('.floor-nav');"
                    "if(!nav)return 'no-nav';"
                    "const btns=[...nav.querySelectorAll('.floor-nav-btn')];"
                    "const out={};"
                    "btns.forEach(b=>{const m=b.querySelector('.floor-nav-occ');"
                    "const lbl=(b.textContent.match(/L([123])/)||[])[1];"
                    "out['L'+lbl]=m?parseInt(m.textContent,10):-1});"
                    "return JSON.stringify(out)})()")

        # 08:00 — semua agen di meja (bukan lunch/rapat)
        occ_initial = ev(OCC_EXPR).get("value", "?")

        # 12:00 — lunch window: agen berjalan ke kafe L3 via tangga nyata (rute
        # koridor + Grand Staircase) — di SwiftShader ~1.5 FPS perjalanan bisa
        # >60 dtk. Break saat badge L3 naik ≥3 dari baseline (walker benar-benar
        # menyeberang), BUKAN sekadar hitungan absolut (baseline L3 sudah 8).
        ev("window.__setTime(720)")
        occ_final = None
        cafe = {}
        base_l3 = json.loads(occ_initial).get("L3", 0)
        for _ in range(50):
            time.sleep(1.5)
            cafe = ev("(()=>{const d=window.__agentData||[];"
                      "const c=d.filter(e=>e.lunch).length;"
                      "const at3=d.filter(e=>{const z=e.walker&&e.walker.visible?e.walker.position.z:(e.sittingChar?e.sittingChar.position.z:null);return typeof z==='number'&&z>4.5}).length;"
                      "return JSON.stringify({lunch:c,atZ3:at3})})()").get("value", "{}")
            occ_final = ev(OCC_EXPR).get("value", "?")
            try:
                f = json.loads(occ_final)
                if f.get("L3", 0) >= base_l3 + 3:
                    break
            except Exception:
                pass

        print(f"E2E_FLOORSOCC: agents={agents} initial={occ_initial} final={occ_final} scene={json.dumps(cafe)}")
        try:
            i = json.loads(occ_initial); f = json.loads(occ_final)
            ok = (agents >= 26 and sum(i.values()) == agents and sum(f.values()) >= 1
                  and f.get("L3", 0) >= i.get("L3", 0) + 3 and f.get("L3", 0) <= agents)
        except Exception:
            ok = False
        print("E2E_FLOORSOCC: OK" if ok else "E2E_FLOORSOCC: FAIL")
        # Siklus 276: exit code JUJUR — dulu selalu 0 walau FAIL (verdict tak
        # dipropagasi) sehingga cron tidak bisa membedakan hijau vs merah.
        return 0 if ok else 1
    finally:
        p.terminate()


if __name__ == "__main__":
    sys.exit(main())
