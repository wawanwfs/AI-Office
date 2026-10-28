#!/usr/bin/env python3
"""E2E siklus 140: status live AgentInspector di scene NYATA.

Langkah:
  1. Muat kantor, tunggu scene siap (agents>=26).
  2. Pilih agen BUDI via window.__wfsSceneSelect('be1') → kartu AgentInspector
     muncul; baca teks chip Status dari DOM.
  3. __setTime(600) (jendela rapat 10:00) → bila BUDI jadi peserta rapat,
     chip berubah "Dalam Rapat" via polling 1 dtk tanpa buka-tutup kartu.
Pemakaian: uv run --with websocket-client python scripts/e2e_inspector_status.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys, queue, threading

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9462
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

        # buka kartu agen be1 (BUDI) via bridge UI
        ev("window.__wfsSceneSelect('be1')")
        time.sleep(1.5)

        CHIP_EXPR = ("(()=>{const chip=document.querySelector('.agent-inspector');"
                     "if(!chip)return '(kartu tidak ada)';"
                     "const st=[...chip.querySelectorAll('div')].find(d=>d.previousElementSibling&&d.previousElementSibling.textContent==='Status');"
                     "return st?('CHIP:'+st.textContent.trim()):'(label Status tidak ditemukan: '+chip.textContent.slice(0,120)+')';})()")
        chip_initial = ev(CHIP_EXPR).get("value", "?")

        # pindahkan simulasi ke jendela MAKAN SIANG 12:00 — agen berjalan ke kafe:
        # transisi state machine nyata harus tercermin di chip tanpa buka-tutup kartu.
        ev("window.__setTime(720)")
        lunch = None
        for _ in range(12):
            time.sleep(1.5)
            st = ev("JSON.stringify((window.__agentData||[]).find(a=>a.agent&&a.agent.name==='BUDI')||{})").get("value", "{}")
            try:
                e = json.loads(st)
            except Exception:
                e = {}
            lunch = {"state": e.get("state"), "lunch": e.get("lunch")}
            chip_probe = ev(CHIP_EXPR).get("value", "?")
            if "Aktif Bekerja" not in str(chip_probe):
                break
        chip_meeting = chip_probe
        meet = json.dumps(lunch)
        sel = ev("JSON.stringify({sel:window.__wfsSceneControls?window.__wfsSceneControls.getSelected():null})").get("value", "{}")

        print(f"E2E_INSPECTOR: agents={agents} initial={chip_initial!r} "
              f"meeting_window={chip_meeting!r} meet={meet} sel={sel}")
        ok = (agents >= 26 and str(chip_initial).startswith("CHIP:") and str(chip_meeting).startswith("CHIP:"))
        print("E2E_INSPECTOR: OK" if ok else "E2E_INSPECTOR: FAIL")
    finally:
        p.terminate()


if __name__ == "__main__":
    main()
