#!/usr/bin/env python3
"""E2E siklus 150: kehadiran LIVE anggota tim di kartu TeamStats (scene NYATA).

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Jam simulasi 480 (08:00, semua di meja) → buka panel Statistik
     (window.__wfsToggleTeamStats? tak ada — panel dibuka via klik tombol dock;
     lebih stabil: React mount panel via klik tombol aria-label 'Statistik tim')
     → kartu Backend & Data membawa chip "N/4 di pod" (N=4 anggota, semua work
     di lantai pod masing-masing).
  3. __setTime(720) (lunch 12:00) → daycycle kirim agen ke kafe L3 → chip
     berubah LIVE: "0/4 di pod · 4 makan siang" (atau sebagian, total tetap 4).
Pemakaian: uv run --with websocket-client python scripts/e2e_team_presence.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading, re

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9466
URL = "http://127.0.0.1:9503/"


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


CHIP_EXPR = ("(()=>{const cards=[...document.querySelectorAll('.team-card')];"
             "const c=cards.find(x=>x.textContent.includes('Backend & Data'));"
             "if(!c)return 'no-card';"
             "const p=c.querySelector('.team-presence');"
             "return p?p.textContent:'no-chip'})()")

MAIN_RE = re.compile(r"(\d+)/(\d+) di pod")
AWAY_RE = re.compile(r"(\d+) (di rapat|makan siang|berjalan|pulang/offsite)")


def parse_chip(txt):
    if not txt or txt in ("no-card", "no-chip"):
        return None
    m = MAIN_RE.search(txt)
    if not m:
        return None
    away = AWAY_RE.search(txt)
    return (int(m.group(1)), int(m.group(2)), away.group(2) if away else "")


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
            for _ in range(tries):
                try:
                    m = msgq.get(timeout=20)
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
                    return (r.get("result", {}).get("result", {}) or {})
                time.sleep(0.5)
            return {}

        cmd("Runtime.enable")
        time.sleep(1)
        # Sinkron jam dulu: probe nyata memakan ~30 dtk dari page-load; jam
        # simulasi berjalan dgn wall-clock (tambah 1 menit/dtk) → saat probe
        # sampai jam sudah lunch/sore. Set 480 (08:00) SEBELUM pengukuran.
        ev("window.__setTime&&window.__setTime(480)")

        agents = -1
        for _ in range(40):
            v = ev("window.__agentData?window.__agentData.length:-1").get("value")
            if isinstance(v, (int, float)) and v >= 26:
                agents = int(v)
                break
            time.sleep(1)

        # 08:00 — set jam lalu TUNGGU semua agen duduk kembali di pod (transisi
        # walking_back→sitting makan beberapa detik sim; gate kartu tim butuh
        # task di DB — telah di-seed 4 demo task read-only di tasks.db gateway).
        ev("window.__setTime(480)")
        time.sleep(2)
        # buka panel Statistik (klik tombol dock 'Statistik tim')
        opened = ev("(()=>{const b=[...document.querySelectorAll('.dock button')]"
                    ".find(x=>(x.getAttribute('aria-label')||'')==='Statistik tim');"
                    "if(!b)return 'no-btn'; b.click(); return 'clicked'})()").get("value")
        # tunggu panel memuat task & agen kembali duduk: atDesk penuh (4/4)
        chip_initial_raw, chip_initial = "no-chip", None
        for _ in range(40):
            time.sleep(1.5)
            chip_initial_raw = ev(CHIP_EXPR).get("value", "no-chip")
            chip_initial = parse_chip(chip_initial_raw)
            if chip_initial and chip_initial[0] >= 3 and chip_initial[1] == 4:
                break

        # 12:00 — lunch: anggota berangkat ke kafe L3 → chip berubah LIVE
        ev("window.__setTime(720)")
        chip_final_raw = chip_initial_raw
        chip_final = chip_initial
        for _ in range(40):
            time.sleep(1.5)
            chip_final_raw = ev(CHIP_EXPR).get("value", "no-chip")
            chip_final = parse_chip(chip_final_raw)
            if chip_final and chip_final[2] in ("makan siang", "di rapat"):
                break

        print(f"E2E_TEAMPRES: agents={agents} open={opened} initial={chip_initial_raw!r} final={chip_final_raw!r}")
        ok = (agents >= 26 and opened == "clicked"
              and chip_initial is not None and chip_initial[0] >= 3 and chip_initial[1] == 4
              and chip_final is not None and chip_final[2] in ("makan siang", "di rapat"))
        print("E2E_TEAMPRES: OK" if ok else "E2E_TEAMPRES: FAIL")
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
