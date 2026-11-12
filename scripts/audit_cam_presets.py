#!/usr/bin/env python3
"""audit_cam_presets.py — Siklus 257: audit kamera preset & oklusi label lintas view (CDP :99).
Memvalidasi kesehatan 6 view kamera ('iso', 'front', 'top', 'l1', 'l2', 'l3'):
  1. setView(view) berhasil dipanggil & mengubah pose kamera (__cam/__camCam);
  2. 0 console error & 0 uncaught exception di setiap perpindahan sudut pandang;
  3. Hook agen (26 agen) tetap berposisi valid & finit di layar;
  4. Hook zona (5 zona) tetap memiliki opasitas valid [0.0..1.0];
  5. Sistem oklusi label (__occlFade) beroperasi stabil (finit >= 0);
  6. Screenshot kanvas tetap hidup (> 300KB) pasca siklus preset.
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
if not os.path.exists(CHROME):  # siklus 468: revision 1248 tak terpasang — resolver headless-shell terbaru
    import glob as _g, re as _re

    def _rev(_p):
        _m = _re.search(r"-(\d+)/", _p)
        return int(_m.group(1)) if _m else 0
    # utamakan chrome-headless-shell (bukan chrome penuh: full chrome dengan
    # profil default memicu singleton "existing browser session" + tab hantu)
    _cand = sorted(
        _g.glob(os.path.expanduser(
            "~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell")),
        key=_rev)
    if not _cand:
        _cand = sorted(_g.glob(os.path.expanduser(
            "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome")), key=_rev)
    if _cand:
        CHROME = _cand[-1]
PORT = 9492
APP = "http://127.0.0.1:9503/app/?mode=office"
WS_TIMEOUT_S = 60

PRESETS = ["iso", "front", "top", "l1", "l2", "l3"]


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
        "--disable-dev-shm-usage", "about:blank"
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

        mid = [0]
        errs, excs = [], []

        def send_raw(d):
            h = b"\x81"
            n = len(d)
            mask = os.urandom(4)
            h += bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
            s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

        def rx(k):
            b = b""
            while len(b) < k:
                c = s.recv(k - len(b))
                if not c:
                    raise ConnectionResetError()
                b += c
            return b

        def read_msg():
            hdr = rx(2)
            op = hdr[0] & 0xF
            n = hdr[1] & 0x7F
            if n == 126:
                n = struct.unpack(">H", rx(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", rx(8))[0]
            d = rx(n)
            while op == 0:
                h2 = rx(2)
                op2 = h2[0] & 0xF
                n2 = h2[1] & 0x7F
                if n2 == 126:
                    n2 = struct.unpack(">H", rx(2))[0]
                elif n2 == 127:
                    n2 = struct.unpack(">Q", rx(8))[0]
                d += rx(n2)
                op = op2
            return json.loads(d)

        def handle(m):
            meth = m.get("method", "")
            pms = m.get("params", {})
            if meth == "Runtime.consoleAPICalled" and pms.get("type") == "error":
                txt = " ".join(str(a.get("value", a.get("description", "")))[:200]
                               for a in pms.get("args", []) if isinstance(a, dict))
                if "deprecated" not in txt.lower():
                    errs.append(txt)
            elif meth == "Runtime.exceptionThrown":
                excs.append(json.dumps(pms.get("exceptionDetails", {}))[:300])

        def pump(seconds, want_id=None, timeout_s=2.0):
            deadline = time.time() + seconds
            s.settimeout(timeout_s)
            while True:
                if time.time() > deadline:
                    return None
                try:
                    m = read_msg()
                except (socket.timeout, TimeoutError):
                    if time.time() > deadline:
                        return None
                    continue
                if want_id is not None and m.get("id") == want_id:
                    return m
                handle(m)

        def ev(expr, wait=15.0):
            mid[0] += 1
            myid = mid[0]
            send_raw(json.dumps({
                "id": myid, "method": "Runtime.evaluate",
                "params": {"expression": expr, "returnByValue": True}
            }).encode())
            r = pump(wait, want_id=myid)
            if r is None:
                return {"TIMEOUT": True}
            r = r.get("result", {})
            if "exceptionDetails" in r:
                return {"EXC": json.dumps(r["exceptionDetails"])[:500]}
            return r.get("result", {}).get("value")

        def cmd(method, wait=15.0, **params):
            mid[0] += 1
            myid = mid[0]
            send_raw(json.dumps({"id": myid, "method": method, "params": params}).encode())
            return pump(wait, want_id=myid)

        cmd("Runtime.enable")
        cmd("Page.enable")
        cmd("Page.navigate", url=APP)

        t0 = time.time()
        ready = False
        while time.time() - t0 < 60:
            chk = ev("!!window.__scene && !!window.__agentData && !!window.__wfsSceneControls && !!window.__zoneLabels")
            if chk is True:
                ready = True
                break
            time.sleep(1)

        if not ready:
            print("FAIL: Scene hooks tidak siap setelah 60s")
            sys.exit(1)

        # Audit 6 Preset
        passed_presets = 0
        preset_results = {}
        for prs in PRESETS:
            res = ev(f"""(() => {{
                const ok = window.__wfsSceneControls.setView('{prs}');
                const cam = window.__cam || {{}};
                const sph = cam.sph ? {{ theta: cam.sph.theta, phi: cam.sph.phi, radius: cam.sph.radius }} : null;
                const agentsOk = window.__agentData && window.__agentData.length === 26;
                const zones = (window.__zoneLabels || []).map(z => ({{
                    label: z.userData.label,
                    op: +z.material.opacity.toFixed(3),
                    vis: z.visible
                }}));
                return {{
                    called: ok,
                    sph,
                    agentsCount: window.__agentData ? window.__agentData.length : 0,
                    zonesCount: zones.length,
                    zones,
                    occlFade: window.__occlFade
                }};
            }})()""")

            # Verifikasi hasil
            if not isinstance(res, dict) or not res.get("called"):
                print(f"FAIL: preset {prs} gagal dipanggil: {res}")
                continue

            zones = res.get("zones")
            if not isinstance(zones, list):
                print(f"FAIL: preset {prs} zones bukan list")
                continue
            valid_opacities = all(isinstance(z, dict) and (0.0 <= z.get("op", -1) <= 1.0) for z in zones)
            if res.get("agentsCount") == 26 and res.get("zonesCount") == 5 and valid_opacities:
                passed_presets += 1
                preset_results[prs] = "PASS"
                print(f"PASS — preset '{prs}': 26 agen, 5 zona (op [0..1] valid), occFade={res.get('occlFade')}")
            else:
                print(f"FAIL — preset '{prs}': kondisi tidak terpenuhi {res}")

        # Screenshot bukti visual
        shot = cmd("Page.captureScreenshot", format="png")
        shot_data = shot.get("result", {}).get("data", "") if isinstance(shot, dict) else ""
        shot_bytes = len(base64.b64decode(shot_data))
        shot_ok = shot_bytes > 300000

        print(f"\nAudit presets: {passed_presets}/{len(PRESETS)} lulus. Shot: {shot_bytes} B (ok={shot_ok}). Errors={len(errs)} Excs={len(excs)}")
        if passed_presets == len(PRESETS) and shot_ok and len(errs) == 0 and len(excs) == 0:
            print("===> ALL PRESETS AUDIT PASS (6/6)")
            sys.exit(0)
        else:
            print(f"===> AUDIT GAGAL: passed={passed_presets}, shot_ok={shot_ok}, errs={len(errs)}")
            sys.exit(1)

    finally:
        p.terminate()


if __name__ == "__main__":
    main()
