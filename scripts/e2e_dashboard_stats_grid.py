#!/usr/bin/env python3
"""E2E siklus 152: grid Dashboard produksi kini BERASAL DARI SERVER.

Sebelum siklus ini :8787 tak punya /api/dashboard/stats → frontend memakai
fallback derived (siklus 151). Sekarang endpoint server LIVE → probe:
  1. Muat kantor (scene nyata, agents>=26), klik dock 'Dashboard'.
  2. Ground truth = fetch('/wfs-api/dashboard/stats') DARI DALAM halaman.
  3. .dash-grid muncul (>=6 kartu) TANPA banner .msg.err; kartu 'Proyek',
     'Task', 'Agen' bernilai SAMA dgn server; .dash-log-row muncul (logs
     nyata — fallback 151 selalu logs:[] → "Belum ada log").
  4. Guard regresi 151: .dash-presence tetap ada (paragraf kehadiran live).
Pemakaian: uv run --with websocket-client python scripts/e2e_dashboard_stats_grid.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9468
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


CARDS_EXPR = ("(()=>{const g=document.querySelector('.dash-grid');"
              "if(!g)return 'no-grid';"
              "return JSON.stringify([...g.querySelectorAll('.dash-card')]"
              ".map(c=>[c.querySelector('span')?.textContent||'',c.querySelector('b')?.textContent||'']))})()")
ERR_EXPR = ("(()=>{const e=document.querySelector('#dashboard .msg.err');"
            "return e?'ERR-BANNER':'no-err'})()")
LOGS_EXPR = ("(()=>document.querySelectorAll('.dash-log-row').length)()")
PRESENCE_EXPR = ("(()=>{const p=document.querySelector('.dash-presence');"
                 "return p?'presence-ok':'no-presence'})()")
TRUTH_FETCH = ("fetch('/wfs-api/dashboard/stats').then(r=>r.json())"
               ".then(d=>JSON.stringify({pt:d.projects_total,tt:d.tasks_total,ac:d.agents_count,lg:(d.logs||[]).length}))")


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
                r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
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

        opened = ev("(()=>{const b=[...document.querySelectorAll('.dock button')]"
                    ".find(x=>(x.getAttribute('aria-label')||'')==='Dashboard');"
                    "if(!b)return 'no-btn'; b.click(); return 'clicked'})()").get("value")

        # Tunggu grid + ambil ground truth dari server (fetch in-page)
        cards_raw, truth_raw, err_raw, logs_n, presence_raw = "no-grid", "-", "-", -1, "no-presence"
        for _ in range(40):
            time.sleep(1.5)
            cards_raw = ev(CARDS_EXPR).get("value", "no-grid")
            if isinstance(cards_raw, str) and cards_raw.startswith("["):
                truth_raw = ev(TRUTH_FETCH).get("value", "-")
                err_raw = ev(ERR_EXPR).get("value", "-")
                logs_n = ev(LOGS_EXPR).get("value", -1)
                presence_raw = ev(PRESENCE_EXPR).get("value", "no-presence")
                break

        print(f"E2E_STATSGRID: agents={agents} open={opened} cards={cards_raw} truth={truth_raw} "
              f"err={err_raw} logrows={logs_n} presence={presence_raw}")

        ok = agents >= 26 and opened == "clicked"
        try:
            cards = dict(json.loads(cards_raw))
            truth = json.loads(truth_raw)
            ok = ok and int(cards.get("Proyek", "-1")) == truth["pt"] \
                and int(cards.get("Task", "-1")) == truth["tt"] \
                and int(cards.get("Agen", "-1")) == truth["ac"] \
                and err_raw == "no-err" and int(logs_n) == truth["lg"] and int(logs_n) > 0 \
                and presence_raw == "presence-ok"
        except Exception as e:
            print("parse fail:", e)
            ok = False
        print("E2E_STATSGRID: OK" if ok else "E2E_STATSGRID: FAIL")
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
