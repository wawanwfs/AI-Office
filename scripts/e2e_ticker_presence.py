#!/usr/bin/env python3
"""E2E siklus 149: badge kehadiran agen LIVE di Ticker (scene NYATA).

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Jam simulasi 480 (08:00, semua agen di meja) → pill .ticker-presence
     menampilkan "26 di meja" (semua work, satu item).
  3. __setTime(720) (lunch 12:00) → daycycle mengirim agen ke Executive Cafe
     → pill berubah LIVE: "N makan siang" muncul, total hitungan semua item
     tetap = jumlah agen (setiap agen selalu terwakili satu status).
Pemakaian: uv run --with websocket-client python scripts/e2e_ticker_presence.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading, re

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9465
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

        agents = -1
        for _ in range(40):
            v = ev("window.__agentData?window.__agentData.length:-1").get("value")
            if isinstance(v, (int, float)) and v >= 26:
                agents = int(v)
                break
            time.sleep(1)

        # 08:00 — semua agen duduk di meja → satu item "N di meja" (N = jumlah agen)
        ev("window.__setTime(480)")
        time.sleep(2)
        pill_initial = ev(PILL_EXPR).get("value", "no-pill")
        items_initial = parse_pill(pill_initial)

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
              f"lunch={lunch_n} total={total_final} live_has_presence={'di meja' in live or 'makan siang' in live}")
        ok_initial = agents >= 26 and items_initial == [(agents, "di meja")]
        ok = (ok_initial and lunch_n >= 3 and total_final == agents)
        print("E2E_TICKERPRESENCE: OK" if ok else "E2E_TICKERPRESENCE: FAIL")
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
