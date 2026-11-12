#!/usr/bin/env python3
"""E2E siklus 149: badge kehadiran agen LIVE di Ticker (scene NYATA).

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. NORMALISASI JAM SIM ke 480 (08:00) via setTime resmi + guard bacaan VALID
     (siklus 277, paritas fix 276) → pill .ticker-presence baseline: total
     semua item == jumlah agen, NOL "makan siang", ≥1 "di meja". Kontrak lama
     "26 di meja (satu item)" adalah artefak dunia pra-fix-274 (walker beku di
     SwiftShader); pasca-fix fisika jalan waktu-nyata sebagian agen sah
     berstatus berjalan — di GPU pun identik (by design).
  3. __setTime(720) (lunch 12:00) → daycycle mengirim agen ke Executive Cafe
     → pill berubah LIVE: "N makan siang" muncul (≥3), total hitungan semua
     item tetap = jumlah agen (setiap agen selalu terwakili satu status).
Pemakaian: uv run --with websocket-client python scripts/e2e_ticker_presence.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading, re


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
PORT = 9465
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


PILL_EXPR = ("(()=>{const p=document.querySelector('.ticker-presence');"
             "return p?p.textContent:'no-pill'})()")
# Parse item pill: "26 di meja", "5 makan siang", dst.
ITEM_RE = re.compile(r"(\d+)\s+(di meja|rapat|makan siang|berjalan|pulang/offsite)")


def parse_pill(txt):
    return [(int(n), lbl) for n, lbl in ITEM_RE.findall(txt or "")]


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

        # Siklus 284: landing default route (6230629) — paksa mode office
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

        # ── NORMALISASI JAM SIM (siklus 277, paritas fix 276 di floor_occupancy) ──
        # timeOfDay awal = jam NYATA load (OfficeScene.js:1476). Load di window
        # lunch sim 12:00–13:00 → baseline terbaca "0 di meja · 26 makan siang"
        # → ok_initial mustahil — FAIL deterministik-by-jam yang sama dengan
        # siklus 276. setTime(480) = jalur resmi slider HUD (updateTime →
        # applySimTime + lighting → autoplay dari 08:00).
        #
        # Kontrak tunggu KETAT (pelajaran 276): di bawah beban SwiftShader
        # `Runtime.evaluate` bisa timeout → ev() = {} → json.loads("{}")
        # menghasilkan {lunch:0,...} → guard "0" MENYALA PALSU pada bacaan
        # GAGAL. Maka: (1) setTime diulang sampai __dbg().t terkonfirmasi masuk
        # jam kerja; (2) settled hanya bila kedua kunci BENAR-BENAR ada.
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
        # Tunggu walker lunch benar-benar pulang (endLunch/working_am) sebelum
        # baseline: kedua kunci nol DAN bacaan valid.
        for _ in range(30):
            s = sim_state()
            if s and s["lunch"] == 0 and s["lunchWalk"] == 0:
                break
            time.sleep(1.5)
        time.sleep(1)

        # 08:00 — baseline (siklus 277: kontrak lama items_initial ==
        # [(agents,"di meja")] adalah artefak dunia PRA-fix-274: walker dulu
        # BEKU di SwiftShader (delta clamp 0.05) sehingga tak pernah ada yang
        # berjalan → "26 di meja" kebetulan selalu benar. Pasca-fix 274 fisika
        # jalan WAKTU-NYATA (sit timer 10–28 dtk + trip lintas lantai via
        # tangga): sebagian agen memang sah berstatus berjalan — di GPU pun
        # identik (fraksi duduk steady-state ~20–30%). Kontrak baru = invarian
        # inti pill: SEMUA agen terwakili (total == jumlah agen), NOL "makan
        # siang" di jam 08:00 (konsisten dgn guard lunch==0), dan ≥1 di meja.
        pill_initial = ev(PILL_EXPR).get("value", "no-pill")
        items_initial = parse_pill(pill_initial)
        desk_initial = sum(n for n, lbl in items_initial if lbl == "di meja")
        lunch_initial = sum(n for n, lbl in items_initial if lbl == "makan siang")
        total_initial = sum(n for n, _ in items_initial)

        # 12:00 — lunch: pill berubah LIVE, item "makan siang" muncul (≥3 —
        # daycycle mengirim kelompok, flag lunch terpasang saat berangkat),
        # total semua item tetap = jumlah agen (tiap agen selalu terwakili).
        ev("window.__setTime(720)")
        pill_final = None
        lunch_n = 0
        total_final = -1
        for _ in range(50):
            time.sleep(1.5)
            pill_final = ev(PILL_EXPR).get("value", "no-pill")
            items = parse_pill(pill_final)
            lunch_n = sum(n for n, lbl in items if lbl == "makan siang")
            total_final = sum(n for n, _ in items)
            if lunch_n >= 3 and total_final == agents:
                break

        # Region aria-live ikut membawa kehadiran (screen reader)
        live = ev("document.querySelector('#ticker-live')?.textContent||''").get("value", "")

        print(f"E2E_TICKERPRESENCE: agents={agents} initial={pill_initial!r} final={pill_final!r} "
              f"desk0={desk_initial} total0={total_initial} lunch={lunch_n} total={total_final} "
              f"live_has_presence={'di meja' in live or 'makan siang' in live}")
        # Kontrak baseline (277): total konservatif == jumlah agen (semua
        # agen terwakili), nol lunch di 08:00, ≥1 di meja.
        ok_initial = agents >= 26 and desk_initial >= 1 and lunch_initial == 0 and total_initial == agents
        ok = (ok_initial and lunch_n >= 3 and total_final == agents)
        print("E2E_TICKERPRESENCE: OK" if ok else "E2E_TICKERPRESENCE: FAIL")
        # Siklus 277: exit code JUJUR (kelas 276 — dulu FAIL dicetak tapi
        # sys.exit(None) == 0, cron tak bisa membedakan hijau vs merah).
        return 0 if ok else 1
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    sys.exit(main())
