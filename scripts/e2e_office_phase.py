#!/usr/bin/env python3
"""E2E siklus 141: chip fase kantor live di HUD (scene NYATA).

Langkah:
  1. Muat kantor di Chrome SwiftShader (Xvfb :99), tunggu scene siap (agents>=26).
  2. Tunggu chip fase muncul di HUD (App menerima onStatusUpdate scene).
  3. __setTime(720) (12:00 → "Istirahat makan siang") → chip berubah label & tone
     via update live scene, tanpa reload.
Pemakaian: uv run --with websocket-client python scripts/e2e_office_phase.py
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
PORT = 9463
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
    ok = False
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
            # siklus 199: tries×timeout=20 dtk = worst case 66 MENIT tanpa deadline
            # total (reply hilang tapi socket hidup). Deadline total 60 dtk — reply
            # yang tak datang = None tercatat jujur, bukan cron menggantung.
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
                    # siklus 199: exceptionDetails di-surface (dulu ditelan senyap
                    # → FAIL "chip tidak muncul" tanpa diagnosis; pola 198 log-5-run)
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
        print(f"AGENTS: {agents}")
        if agents < 26:
            print("E2E_OFFICEPHASE: FAIL (scene tidak siap)")
            return 1

        # 1) chip fase muncul di HUD (App menerima onStatusUpdate scene)
        chip = None
        for _ in range(20):
            v = ev("(function(){var c=document.querySelector('.hud .phase-chip');"
                   "return c?{label:c.textContent.trim(),cls:c.className}:null})()").get("value")
            if v:
                chip = v
                break
            time.sleep(0.5)
        print(f"CHIP_INITIAL: {json.dumps(chip, ensure_ascii=False)}")
        if not chip:
            print("E2E_OFFICEPHASE: FAIL (chip fase tidak muncul di HUD)")
            return 1

        # 2) __setTime(720) → 12:00 = "Istirahat makan siang" (tone break)
        ev("window.__setTime && window.__setTime(720)")
        chip2 = None
        for _ in range(20):
            v = ev("(function(){var c=document.querySelector('.hud .phase-chip');"
                   "return c?{label:c.textContent.trim(),cls:c.className}:null})()").get("value")
            if v and 'break' in (v.get('cls') or ''):
                chip2 = v
                break
            time.sleep(0.5)
        print(f"CHIP_LUNCH: {json.dumps(chip2, ensure_ascii=False)}")

        live = bool(chip2) and chip2.get('label') != chip.get('label')
        print("E2E_OFFICEPHASE: " + ("OK" if live else "FAIL (chip tidak berubah ke fase makan siang)"))
        return 0 if live else 1
    finally:
        try:
            p.kill()
        except Exception:
            pass
        if xv:
            try:
                xv.kill()
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
