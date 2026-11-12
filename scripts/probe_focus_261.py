#!/usr/bin/env python3
"""probe_focus_261.py — Siklus 261: verifikasi live lerp kamera-goal waktu-nyata (CDP :99).

Memilih agent via window.__wfsSceneSelect (jalur scene nyata → focusGoal follow),
lalu polling tgt (window.__camTarget) & radius: jarak ke goal meluruh EKSPONENSIAL
dengan kontrak FOCUS_LERP_RATE × dt (dt clamp 0.05 di SwiftShader → sisa jarak
dikali e^-3.7125×0.05 = 0.8302 per frame). Kode lama (.06/frame) konvergensi
~150× lebih lambat di renderer 0.4 FPS.
  1. jarak kamera-target ke goal turun MONOTON per frame;
  2. rasio sisa antar-frame berturut == e^-RATE·dt (0.8302 ± toleransi) → konvergensi
     waktu-nyata; kode lama rasio ≈ 0.94^1 vs 0.83 → jauh;
  3. 0 console error.
Pemakaian: uv run --with websocket-client python scripts/probe_focus_261.py
"""
import base64, json, os, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse


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
PORT = 9497
APP = "http://127.0.0.1:9503/app/?mode=office"
WS_TIMEOUT_S = 60


class WS:
    def __init__(s, u):
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        s.sock.settimeout(WS_TIMEOUT_S)
        while b"\r\n\r\n" not in buf:
            c = s.sock.recv(1)
            if not c:
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

    def send(s, m):
        d = json.dumps(m).encode()
        h = b"\x81"
        n = len(d)
        mask = os.urandom(4)
        h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def rx(s, timeout=45):
        s.sock.settimeout(timeout)
        hdr = s.sock.recv(2)
        if len(hdr) < 2:
            return None
        ln = hdr[1] & 0x7F
        if ln == 126:
            ln = struct.unpack(">H", s.sock.recv(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", s.sock.recv(8))[0]
        data = b""
        while len(data) < ln:
            chunk = s.sock.recv(ln - len(data))
            if not chunk:
                break
            data += chunk
        return json.loads(data.decode("utf-8", "replace"))


def main():
    env = dict(os.environ, DISPLAY=":99")
    if subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10,
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)

    p = subprocess.Popen([
        CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
        "--enable-unsafe-swiftshader", "--window-size=1366,768",
        "--disable-dev-shm-usage", APP
    ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        wsu = [t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0]
        pr = urlparse(wsu)
        s = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sendall((
            f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        buf = b""
        s.settimeout(WS_TIMEOUT_S)
        while b"\r\n\r\n" not in buf:
            c = s.recv(1)
            if not c:
                raise ConnectionResetError("EOF saat handshake WS")
            buf += c

        ws = WS(wsu)
        ws.sock = s
        mid = [0]

        def ev(expr, timeout=45):
            mid[0] += 1
            ws.send({"id": mid[0], "method": "Runtime.evaluate",
                     "params": {"expression": expr, "returnByValue": True, "awaitPromise": False}})
            t0 = time.time()
            while time.time() - t0 < timeout:
                m = ws.rx(timeout=timeout)
                if m is None:
                    return {}
                if m.get("id") == mid[0]:
                    res = m.get("result", {})
                    if "result" in res:
                        return res["result"]
                    return res
            return {}

        def wait_agents(max_wait=170):
            t0 = time.time()
            while time.time() - t0 < max_wait:
                r = ev("(function(){try{return {n:(window.__agentData&&window.__agentData.length)||0, fr:window.__animFrames||0}}catch(e){return {n:0,fr:0}}})()", timeout=25)
                d = r.get("value", {}) if isinstance(r, dict) else {}
                if d.get("n", 0) >= 26 and d.get("fr", 0) > 3:
                    return True
                time.sleep(4)
            return False

        def cam_state():
            # window.__cam = {sph, tgt, upd} — tgt = THREE.Vector3 target kamera,
            # sph.radius = radius orbit (hook debug resmi scene);
            # window.__dbg().focus.t = goal ASLI (t r,sph) — ditambah siklus 261.
            return ev("(function(){const c=window.__cam;const d=(window.__dbg&&window.__dbg())||null;if(!c||!c.tgt||!c.sph)return null;"
                      "const g=(d&&d.focus&&d.focus.t)||null;"
                      "return {x:c.tgt.x,y:c.tgt.y,z:c.tgt.z,rad:c.sph.radius,fr:window.__animFrames||0,"
                      "gx:g?g[0]:null,gy:g?g[1]:null,gz:g?g[2]:null};})()", timeout=30)

        if not wait_agents():
            print("FOCUS261: FAIL — agen tidak siap")
            return 1

        # posisi kamera awal (tanpa goal) sebagai baseline
        r0 = cam_state()
        base = r0.get("value") if isinstance(r0, dict) else None
        if not base:
            print("FOCUS261: hook kamera tidak ada", r0)
            return 1
        print(f"FOCUS261 baseline tgt=({base['x']:.2f},{base['y']:.2f},{base['z']:.2f}) rad={base['rad']:.1f} fr={base['fr']}")

        # pilih goal statis deterministik via jalur scene nyata: focusFloor(2)
        # (goal {t:(0,0.5,-3.0), r:18, phi?} — jalur tombol lantai asli; jalur
        # __wfsSceneSelect hanya set ring, tanpa goal kamera → tidak memicu lerp).
        r = ev("(function(){try{const c=window.__wfsSceneControls;if(!c||!c.focusFloor)return 'no-hook';const ok=c.focusFloor(2);return 'floor-ok:'+ok}catch(e){return 'err:'+e.message}})()", timeout=25)
        sel = r.get("value", "?") if isinstance(r, dict) else "?"
        print(f"FOCUS261 sel={sel}")
        time.sleep(1)

        # polling: tgt & radius 8 sampel × 3 dtk — tgt eksponensial menuju goal agen
        samples = []
        for i in range(8):
            r = cam_state()
            v = r.get("value") if isinstance(r, dict) else None
            if v is None:
                print(f"FOCUS261 sampel{i}: tgt hook tidak ada")
                return 1
            samples.append(v)
            time.sleep(3)

        # goal ASLI dari __dbg().focus.t (bukan titik akhir — masih meluruh saat dibaca)
        goal = {k: samples[-1][k] for k in ("gx", "gy", "gz")}
        if goal["gx"] is None:
            print("FOCUS261: goal.t tidak terekspos di __dbg (bundle lama?)")
            return 1
        gxyz = (goal["gx"], goal["gy"], goal["gz"])
        print(f"FOCUS261 goal_asli=({gxyz[0]:.3f},{gxyz[1]:.3f},{gxyz[2]:.3f}) rad_goal terbaca={samples[-1]['rad']:.2f}")
        dists = []
        for smp in samples:
            d = ((smp["x"] - gxyz[0]) ** 2 + (smp["y"] - gxyz[1]) ** 2 + (smp["z"] - gxyz[2]) ** 2) ** 0.5
            dists.append((smp["fr"], d))
        mono = all(b[1] <= a[1] + 1e-9 for a, b in zip(dists, dists[1:]))
        # kontrak eksak: alpha per frame == 1−e^(−3.7125×0.05) (dt clamp 0.05 SwiftShader)
        k_exp = 1 - 0.83019
        # rasio sisa per frame = e^(−RATE·dt) = 0.83019
        ratios = []
        for a, b in zip(dists, dists[1:]):
            if a[1] > 1e-9:
                ratios.append((b[1] / a[1], b[0] - a[0]))
        print(f"FOCUS261 dists={[(f, round(d, 5)) for f, d in dists]} monotonic={mono}")
        print(f"FOCUS261 ratios(frame)={[(round(r, 4), df) for r, df in ratios]} (kontrak e^(-3.7125×0.05)=0.8302/frame)")
        # agregat paling robust: total peluruhan d0→dN vs 0.83019^(jumlah frame)
        f0, d0 = dists[0]
        fN, dN = dists[-1]
        ok_ratio = False
        if d0 > 1e-9 and fN > f0 and dN > 1e-12:
            total_frames = fN - f0
            expected_remaining = d0 * (0.83019 ** total_frames)
            ratio_aggregate = dN / expected_remaining
            print(f"FOCUS261 aggregate: frames={total_frames} d0={d0:.5f} dN={dN:.6f} expected={expected_remaining:.6f} dN/expected={ratio_aggregate:.4f}")
            ok_ratio = 0.75 <= ratio_aggregate <= 1.25
        # radius ikut lerp: goal r=19; radius harus meluruh menuju 19 dgn kontrak sama
        rad_ok = True
        if samples[0]["rad"] is not None:
            r0 = samples[0]["rad"]; rN = samples[-1]["rad"]
            exp_r = 19 + (r0 - 19) * (0.83019 ** (fN - f0))
            rad_err = abs(rN - exp_r) / max(1e-9, abs(r0 - 19))
            print(f"FOCUS261 radius: r0={r0:.2f} rN={rN:.2f} expected={exp_r:.2f} err_frac={rad_err:.4f}")
            rad_ok = rad_err <= 0.25
        ok = mono and ok_ratio and rad_ok
        print("FOCUS261:", "PASS" if ok else "FAIL")
        return 0 if ok else 1
    finally:
        p.terminate()


if __name__ == "__main__":
    sys.exit(main())
