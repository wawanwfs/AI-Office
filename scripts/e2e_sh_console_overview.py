#!/usr/bin/env python3
"""E2E siklus 153: tab Overview & Approvals ShConsole produksi kini LIVE dari server.

Sebelum siklus ini gateway :8787 tak punya /api/sh/overview & /api/approvals →
drawer ShConsole: tab Overview "Memuat statistik…" selamanya + banner err,
tab Approvals "Memuat approval…" selamanya. Kini keduanya 200 dari server:
  1. Muat kantor (scene nyata, agents>=26), klik tombol aria-label
     'Konsol Software House' → drawer ShConsole terbuka di tab Overview.
  2. Ground truth = fetch('/wfs-api/sh/overview') DARI DALAM halaman.
  3. Kartu grid overview muncul TANPA banner err; 'Projects', 'Task total',
     'Agent total' = nilai server; baris log muncul (data nyata, bukan
     "Belum ada log").
  4. Klik tab Approvals → status "Tidak ada approval pending." (jujur kosong,
     bukan "Memuat…" selamanya / banner err).
Pemakaian: uv run --with websocket-client python scripts/e2e_sh_console_overview.py
"""
import subprocess, os, re, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9469
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


TRUTH_FETCH = ("fetch('/wfs-api/sh/overview').then(r=>r.json())"
               ".then(d=>JSON.stringify({p:d.projects,t:d.tasks,a:d.agents,"
               "lg:(d.recent_logs||[]).length}))")
ERR_EXPR = "(()=>{const es=[...document.querySelectorAll('[role=\"alert\"]')];return es.length?'ERR-BANNER':'no-err'})()"


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

        opened = ev("(()=>{const b=[...document.querySelectorAll('button')]"
                    ".find(x=>(x.getAttribute('aria-label')||'')==='Konsol Software House');"
                    "if(!b)return 'no-btn'; b.click(); return 'clicked'})()").get("value")

        # Tunggu kartu overview (signal: innerText drawer berisi 'Task total')
        # + ambil ground truth dari server (fetch in-page). SwiftShader di VM
        # 2 vCPU bikin render & fetch lambat di menit pertama — toleran.
        drawer_txt, truth_raw, err_raw = "", "-", "-"
        for _ in range(60):
            time.sleep(3)
            drawer_txt = ev("(()=>{const d=[...document.querySelectorAll('div')]"
                            ".find(x=>x.style.borderLeft&&x.style.position==='fixed');"
                            "return d?d.innerText:''})()").get("value", "")
            if "Task total" in drawer_txt:
                truth_raw = ev(TRUTH_FETCH).get("value", "-")
                err_raw = ev(ERR_EXPR).get("value", "-")
                break
        nums = {}
        for key, pat in (("p", r"Projects\n(\d+)"), ("t", r"Task total\n(\d+)"),
                         ("a", r"Agent total\n(\d+)"), ("lg", r"Log event\n(\d+)")):
            m = re.search(pat, drawer_txt)
            nums[key] = int(m.group(1)) if m else -1
        log_rows = len(re.findall(r"info ·", drawer_txt))

        # Tab Approvals: klik tab 'Approvals' → status jujur kosong
        appr = "not-tested"
        apclk = ev("(()=>{const b=[...document.querySelectorAll('button')]"
                   ".find(x=>(x.getAttribute('aria-label')||'')==='Tab Approvals');"
                   "if(!b)return 'no-tab'; b.click(); return 'clicked'})()").get("value", "no-tab")
        if apclk == "clicked":
            for _ in range(15):
                time.sleep(1)
                t = ev("(()=>{const d=document.body.innerText;"
                       "if(d.includes('Memuat approval'))return 'loading';"
                       "if(d.includes('Tidak ada approval pending'))return 'honest-empty';"
                       "return 'unexpected'})()").get("value", "unexpected")
                if t != "loading":
                    appr = t
                    break
        err_after = ev(ERR_EXPR).get("value", "-")

        print(f"E2E_SHCONSOLE: agents={agents} open={opened} nums={nums} "
              f"truth={truth_raw} err={err_raw} logrows={log_rows} "
              f"approvals={appr} err_after={err_after}")

        ok = agents >= 26 and opened == "clicked"
        try:
            truth = json.loads(truth_raw)
            ok = ok and all(v >= 0 for v in nums.values()) \
                and nums["p"] == truth["p"] and nums["t"] == truth["t"] \
                and nums["a"] == truth["a"] and nums["lg"] == truth["lg"] \
                and err_raw == "no-err" and int(log_rows) > 0 \
                and appr == "honest-empty" and err_after == "no-err"
        except Exception as e:
            print("parse fail:", e)
            ok = False
        print("E2E_SHCONSOLE: OK" if ok else "E2E_SHCONSOLE: FAIL")
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
