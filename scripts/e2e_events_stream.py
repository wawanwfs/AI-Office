#!/usr/bin/env python3
"""E2E siklus 154: SSE /wfs-api/events streaming ujung-ke-ujung di produksi.

Rantai yang diuji: EventSource UI (ShConsole) → proxy :9503 (harus streaming,
bukan buffered) → gateway :8787 /api/events (SSE turunan tasks.db).

Diskriminator SSE-murni (bisa dibingung overview poll 10 dtk):
  1. EventSource in-page (CDP) → frame `connected` harus tiba < 4 dtk (bukti
     byte mengalir TANPA menunggu EOF — proxy buffered = 0 frame).
  2. Task demo di-INSERT langsung ke tasks.db (bukan via API — engine tidak
     disentuh, pola seed siklus 150) SETELAH jeda 10,5 dtk pasca-load overview
     (poll 10 dtk baru saja lewat → poll berikutnya ≥ 9 dtk lagi).
  3. Judul task demo harus muncul di drawer ≤ 5 dtk (SSE 1 dtk + render) dan
     frame log dgn judul itu terlihat oleh EventSource in-page — poll overview
     tidak bisa menjelaskan kemunculan lebih cepat itu.
  4. Tanpa banner error; tanpa "Memuat statistik…" eternal.
Pemakaian: uv run --with websocket-client python scripts/e2e_events_stream.py
"""
import subprocess, os, re, time, urllib.request, json, socket, struct, base64, sys, queue, threading, sqlite3

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9469
URL = "http://127.0.0.1:9503/"
DB = os.path.expanduser("~/wfs-office/tasks.db")
DEMO_TITLE = f"Uji SSE siklus 154"


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


SSE_ATTACH = ("window.__sseFrames=[]; window.__sseErr=0;"
              "window.__es=new EventSource('/wfs-api/events');"
              "window.__es.onmessage=(e)=>window.__sseFrames.push(e.data);"
              "window.__es.onerror=()=>window.__sseErr++;"
              "'attached'")
SSE_FRAMES = "JSON.stringify(window.__sseFrames||[])"
SSE_ERR = "window.__sseErr||0"
SSE_CLOSE = "(()=>{try{window.__es&&window.__es.close()}catch(e){}})()"


def insert_demo_task() -> int:
    """Seed 1 task demo (pola siklus 150) — TIDAK via API, engine tidak disentuh."""
    conn = sqlite3.connect(DB, timeout=5)
    try:
        cur = conn.execute(
            "INSERT INTO tasks(project,title,role,agent_id,status,prompt,created,updated)"
            " VALUES('proj-demo',?,'qa','sse154','pending','e2e sse',?,?)",
            (DEMO_TITLE, time.time(), time.time()))
        conn.commit()
        rid = int(cur.lastrowid or 0)
        return rid
    finally:
        conn.close()


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

        # ── 1. SSE in-page: frame connected harus tiba < 4 dtk ──
        ev(SSE_ATTACH)
        frames = []
        for _ in range(8):  # cek tiap 0.5 s sampai 4 dtk
            time.sleep(0.5)
            frames = json.loads(ev(SSE_FRAMES).get("value", "[]"))
            if frames:
                break
        connected_fast = bool(frames) and '"connected"' in frames[0]
        sse_err = ev(SSE_ERR).get("value", -1)

        # ── 2. buka drawer ShConsole (tab Overview default) ──
        opened = ev("(()=>{const b=[...document.querySelectorAll('button')]"
                    ".find(x=>(x.getAttribute('aria-label')||'')==='Konsol Software House');"
                    "if(!b)return 'no-btn'; b.click(); return 'clicked'})()").get("value")
        drawer_txt = ""
        for _ in range(60):
            time.sleep(3)
            drawer_txt = ev("(()=>{const d=[...document.querySelectorAll('div')]"
                            ".find(x=>x.style.borderLeft&&x.style.position==='fixed');"
                            "return d?d.innerText:''})()").get("value", "")
            if "Task total" in drawer_txt:
                break
        err_expr = ("(()=>{const es=[...document.querySelectorAll('[role=\"alert\"]')];"
                    "return es.length?'ERR-BANNER':'no-err'})()")
        err_after_load = ev(err_expr).get("value", "-")

        # ── 3. alignment fase poll: overview poll terakhir ~baru saja (10 dtk) ──
        time.sleep(10.5)
        pre_has_demo = DEMO_TITLE in ev(
            "(()=>{const d=[...document.querySelectorAll('div')]"
            ".find(x=>x.style.borderLeft&&x.style.position==='fixed');"
            "return d?d.innerText:''})()").get("value", "")

        # ── 4. INSERT task demo → judul harus muncul ≤ 5 dtk (jalur SSE) ──
        tid = insert_demo_task()
        t0 = time.time()
        appear_s, title_in_drawer = None, False
        while time.time() - t0 < 5.0:
            time.sleep(0.3)
            txt = ev("(()=>{const d=[...document.querySelectorAll('div')]"
                     ".find(x=>x.style.borderLeft&&x.style.position==='fixed');"
                     "return d?d.innerText:''})()").get("value", "")
            if DEMO_TITLE in txt:
                appear_s = round(time.time() - t0, 2)
                title_in_drawer = True
                break
        frames_after = json.loads(ev(SSE_FRAMES).get("value", "[]"))
        log_frame = any(DEMO_TITLE in f for f in frames_after)
        err_final = ev(err_expr).get("value", "-")
        ev(SSE_CLOSE)

        print(f"E2E_EVENTS: agents={agents} open={opened} connected_fast={connected_fast} "
              f"sse_err={sse_err} nframes0={len(frames)} tid={tid} pre_has_demo={pre_has_demo} "
              f"title_drawer={title_in_drawer} appear_s={appear_s} log_frame={log_frame} "
              f"err_load={err_after_load} err_final={err_final}")

        ok = (agents >= 26 and opened == "clicked" and connected_fast
              and sse_err == 0 and pre_has_demo is False and title_in_drawer
              and appear_s is not None and appear_s <= 5.0 and log_frame
              and err_after_load == "no-err" and err_final == "no-err")
        print("E2E_EVENTS: OK" if ok else "E2E_EVENTS: FAIL")
    finally:
        p.terminate()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
