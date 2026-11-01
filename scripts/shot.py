#!/usr/bin/env python3
"""shot.py — pengganti permanen scratch shot.sh (hilang diprune TMPDIR 24 jam,
siklus 185). Screenshot halaman :9503 via CDP chrome-headless-shell di Xvfb :99.

Pemakaian: python3 scripts/shot.py W H out.png [mobile]
  W/H  ukuran window (mis. 1366 768; mobile: 390 844)
  out  path PNG keluaran
  mobile  viewport HP 390x844 dsf=2 dari awal init scene (siklus 187 —
          paritas mode mobile e2e_err_probe.py 186): dulu "screenshot mobile"
          cuma window-size kecil TANPA device-metrics override, jadi layout/
          dsf berbeda dari HP nyata (tes visual dock/HUD mobile menyesatkan).

Ambang kesehatan scene kini OTOMATIS (siklus 194 — dulu "PEMAKAI harus cek
file > 500 KB"): statistik piksel via scripts/png_stats.py — warna unik
>= 1500 & nonbg >= 4% = ALIVE (exit 0); kanvas polos/langit-saja = DEAD
(exit 1, JANGAN push). Jebakan kalibrasi: gradien 378 KB lolos cek byte
tapi DEAD piksel (616 warna). Untuk gate otomatis penuh (0 error + hooks +
ambang + gate dock + hygiene) pakai scripts/e2e_err_probe.py.
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys
import importlib.util as _ilu

# Statistik piksel (gate ALIVE/DEAD, siklus 194): png_stats.py by path —
# pola e2e_err_probe.py (nama generik rawan resolve ke package lain).
_spec_png = _ilu.spec_from_file_location(
    "wfs_png_stats", os.path.join(os.path.dirname(os.path.abspath(__file__)), "png_stats.py"))
assert _spec_png is not None and _spec_png.loader is not None  # file statis repo
png_stats_mod = _ilu.module_from_spec(_spec_png)
_spec_png.loader.exec_module(png_stats_mod)

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9462
URL = "http://127.0.0.1:9503/"
# Mode mobile (siklus 187, paritas e2e_err_probe.py): viewport HP 390x844 dsf=2
# diterapkan SEBELUM init scene via Emulation.setDeviceMetricsOverride + reload.
MOBILE_W, MOBILE_H, MOBILE_DSF = 390, 844, 2


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
        WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas
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
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126: h += bytes([0x80 | n])
        else: h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv_text(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionError("ws closed")
                b += c
            return b

        def frame():
            hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126: n = struct.unpack(">H", rx(2))[0]
            elif n == 127: n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)

        op, d = frame()
        while op == 0:  # continuation frame
            op, d2 = frame(); d += d2
            if op != 0: break
        return d.decode("utf-8", "replace")


def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    args = [a for a in sys.argv[1:] if a != "-"]
    mobile = "mobile" in args
    args = [a for a in args if a != "mobile"]
    W = int(args[0]) if len(args) > 0 else (MOBILE_W if mobile else 1366)
    H = int(args[1]) if len(args) > 1 else (MOBILE_H if mobile else 768)
    out = args[2] if len(args) > 2 else "ck.png"
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        try:
            if os.path.exists("/tmp/.X11-unix/X99") and not x99_alive():
                os.remove("/tmp/.X11-unix/X99")
        except OSError:
            pass
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", f"{max(W, 1366)}x{max(H, 768)}x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", f"--window-size={W},{H}",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
                except socket.timeout:
                    return None  # siklus 197: reply macet/hilang -> None tercatat (bukan hang)
                if r.get("id") == mid[0]: return r
            return None  # siklus 197: batas loop habis -> None tercatat
        cmd("Page.enable")
        if mobile:
            # Viewport HP dari AWAL init scene (paritas e2e_err_probe.py 186):
            # override metrik + reload — bukan cuma window-size kecil.
            cmd("Emulation.setDeviceMetricsOverride", width=MOBILE_W, height=MOBILE_H,
                deviceScaleFactor=MOBILE_DSF, mobile=True)
            cmd("Page.reload", ignoreCache=False)
        time.sleep(18)  # scene init + settle visual (paritas shot.sh)
        shot = cmd("Page.captureScreenshot", format="png")
        data = base64.b64decode(str((shot.get("result") or {}).get("data") or ""))
        open(out, "wb").write(data)
        mode = f"mobile {MOBILE_W}x{MOBILE_H}@{MOBILE_DSF}x" if mobile else "desktop"
        # Gate piksel (siklus 194): ALIVE/DEAD dari ISI gambar, bukan byte.
        try:
            px = png_stats_mod.png_stats(data)
            alive, why = png_stats_mod.alive_verdict(px)
        except Exception as e:  # decode gagal = scene tidak terbukti hidup
            px, alive, why = {"err": str(e)}, False, "decode gagal"
        print(f"SHOT {out}: {len(data)} bytes ({mode}) "
              f"{'ALIVE' if alive else 'DEAD'} [px: {why}]")
        sys.exit(0 if (len(data) > 0 and alive) else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()


if __name__ == "__main__":
    main()
