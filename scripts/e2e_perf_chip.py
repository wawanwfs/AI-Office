#!/usr/bin/env python3
"""E2E siklus 147 (hardened siklus 195): chip kualitas render GPU di HUD +
recovery tangga adaptif — kini SATU LEVEL dgn probe wajib e2e_err_probe.py.

Verifikasi di browser nyata (SwiftShader — GPU selalu masuk tangga degradasi,
jadi recovery bisa dipicu deterministik):
 1. window.__perf live: fps > 0, pixelRatio tercatat.
 2. Chip .perf-chip ADA di HUD setelah sampel pertama (polling App 2 dtk),
    label "GPU N FPS", bukan angka karangan.
 3. Degradasi nyata di SwiftShader: shadowLevel naik (map 1024 / bayangan mati)
    — dibaca dari state __perf (sun scene tak diekspos langsung; sun TIDAK
    diubah oleh probe — fungsi murni diuji di unit test perf_quality.test.js).
 4. PARITY console error (janji docstring sejak 147, baru benar-benar
    dieksekusi di 195): Runtime+Log enable SEBELUM scene init, drain event
    consoleAPICalled/exceptionThrown/Log.entryAdded (net::ERR diabaikan)
    — console_errors & page_errors kosong wajib untuk verdict OK.
 5. GATE PIKSEL scene-alive (siklus 194): warna unik >= 1500 & nonbg >= 4%
    via scripts/png_stats.py (dimuat by path, pola deploy.py) — byte-size
    hanya proksi: jebakan "langit-saja" (gradien 378 KB) lolos byte tapi
    DEAD piksel. Byte gate tetap berlapis.
 6. Transport anti-hang (195): socket timeout 60 dtk — dulu TANPA settimeout,
    satu-satunya probe e2e yang bisa menggantung tanpa batas saat chrome
    hidup tapi tak menjawab; reply CDP gagal = None tercatat, run tetap
    berakhir dengan verdict jujur.

Pemakaian: python3 scripts/e2e_perf_chip.py [out.png]
Transport: Xvfb :99 + chrome-headless-shell + CDP WS (asal siklus 147).
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys
import importlib.util as _ilu  # noqa: E402

# Satu sumber statistik piksel (gate #5, siklus 195): png_stats.py by path —
# nama generik rawan resolve ke package lain (pola e2e_err_probe.py 191).
_spec_png = _ilu.spec_from_file_location(
    "wfs_png_stats", os.path.join(os.path.dirname(os.path.abspath(__file__)), "png_stats.py"))
assert _spec_png is not None and _spec_png.loader is not None  # file statis repo
png_mod = _ilu.module_from_spec(_spec_png)
_spec_png.loader.exec_module(png_mod)

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9455
URL = "http://127.0.0.1:9503/"
WS_TIMEOUT_S = 60  # siklus 195: tanpa ini probe bisa menggantung tanpa batas


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
        s.sock.settimeout(WS_TIMEOUT_S)  # v1 hardening 195: anti-hang

    def send(s, m):
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126: h += bytes([0x80 | n])
        else: h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionError("ws closed")
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126: n = struct.unpack(">H", rx(2))[0]
        elif n == 127: n = struct.unpack(">Q", rx(8))[0]
        return op, rx(n)

    def recv_text(s):
        op, d = s.recv()
        while op == 0:  # continuation
            op, d2 = s.recv(); d += d2
        return d.decode("utf-8", "replace")


def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        try:
            if os.path.exists("/tmp/.X11-unix/X99") and not x99_alive():
                os.remove("/tmp/.X11-unix/X99")
        except OSError:
            pass
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {"mode": "desktop", "console_errors": [], "page_errors": []}
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            for _ in range(600):
                try:
                    r = json.loads(ws.recv_text())
                except (socket.timeout, ConnectionError):
                    return None  # v1: reply hilang/macet = None tercatat, run tetap berakhir
                if r.get("id") == mid[0]: return r
            return None

        cmd("Page.enable"); cmd("Runtime.enable"); cmd("Log.enable")
        time.sleep(30)  # scene init + sampling FPS (2 dtk) + polling chip (2 dtk)
        # 4) drain event console/pageerror yang menumpuk selama init (parity 195)
        ws.send(json.dumps({"id": 10 ** 6, "method": "Runtime.evaluate",
                            "params": {"expression": "1", "returnByValue": True}}))
        for _ in range(4000):
            try:
                r = json.loads(ws.recv_text())
            except (socket.timeout, ConnectionError):
                break
            if not isinstance(r, dict):
                continue  # siklus 197: event malformed diabaikan
            m = r.get("method", "")
            if m == "Runtime.consoleAPICalled" and r["params"].get("type") == "error":
                for a in r["params"].get("args", []):
                    t = a.get("value") or a.get("description") or ""
                    res["console_errors"].append(str(t)[:200])
            elif m == "Runtime.exceptionThrown":
                e = r["params"].get("exceptionDetails", {})
                res["page_errors"].append(str(e.get("exception", {}).get("description", e.get("text", "")))[:200])
            elif m == "Log.entryAdded" and r["params"].get("entry", {}).get("level") == "error":
                src = r["params"]["entry"]
                if "net::ERR" not in src.get("text", ""):  # favicon dkk diabaikan
                    res["console_errors"].append(str(src.get("text", ""))[:200])
            elif r.get("id") == 10 ** 6:
                break
        res["clean"] = not res["console_errors"] and not res["page_errors"]
        # 1) __perf live
        r = cmd("Runtime.evaluate", expression="JSON.stringify(window.__perf||null)", returnByValue=True)
        perf = json.loads((((r or {}).get("result") or {}).get("result") or {}).get("value", "null") or "null")
        results = res
        results["perf_live"] = bool(perf and perf.get("fps", 0) > 0)
        results["perf_fps"] = round(perf.get("fps", 0), 1) if perf else 0
        results["perf_pr"] = perf.get("pixelRatio") if perf else None
        results["perf_shadowLevel"] = perf.get("shadowLevel") if perf else None
        # 2) chip HUD
        r = cmd("Runtime.evaluate", expression="""(() => {
          const c = document.querySelector('.perf-chip');
          if (!c) return null;
          return { cls: c.className, label: c.textContent.trim(), title: c.getAttribute('title') };
        })()""", returnByValue=True)
        chip = ((r or {}).get("result") or {}).get("result", {}).get("value")
        results["chip"] = chip
        results["chip_ok"] = bool(chip and "GPU" in chip.get("label", "") and "FPS" in chip.get("label", ""))
        # 3) degradasi SwiftShader: dibaca dari state __perf (shadowLevel>0 atau
        #    downgraded) — sun scene TIDAK diubah oleh probe (fungsi murni diuji
        #    di unit test; dulu ada blok evaluate hook sun yang SELALU return
        #    null = kode mati, dihapus siklus 195).
        results["degraded_seen"] = bool(perf and (perf.get("shadowLevel", 0) > 0 or perf.get("downgraded")))
        results["chip_state"] = (chip or {}).get("cls", "").replace("perf-chip ", "")
        # 5) scene hidup: screenshot → byte gate (berlapis) + GATE PIKSEL 194
        shot = cmd("Page.captureScreenshot", format="png")
        data = base64.b64decode(((shot or {}).get("result") or {}).get("data", "") or "")
        out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/perf147.png"
        if data:
            open(out, "wb").write(data)
        results["shot_bytes"] = len(data)
        results["shot_ok"] = results["shot_bytes"] > 300000
        try:
            px = png_mod.png_stats(data)
            px_ok, px_why = png_mod.alive_verdict(px)
        except Exception as e:  # decode gagal = verdict DEAD (bukan crash probe)
            px, px_ok, px_why = {"err": str(e)}, False, "decode gagal"
        results["pixels"] = px
        results["pixels_ok"] = px_ok
        results["pixels_why"] = px_why
        ok = (results["perf_live"] and results["chip_ok"] and results["shot_ok"]
              and results["pixels_ok"] and results["clean"])
        print("E2E_PERF_CHIP:", "OK" if ok else "FAIL", json.dumps(results, ensure_ascii=False))
        if not ok:
            print("E2E_PERF_CHIP_DETAIL:", json.dumps({
                "perf_live": results["perf_live"], "chip_ok": results["chip_ok"],
                "shot_ok": results["shot_ok"], "pixels_ok": results["pixels_ok"],
                "pixels_why": px_why, "clean": results["clean"],
                "console_errors": results["console_errors"][:3],
                "page_errors": results["page_errors"][:3]}, ensure_ascii=False), flush=True)
        sys.exit(0 if ok else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()


if __name__ == "__main__":
    main()
