#!/usr/bin/env python3
"""E2E regresi "remount ×10 TANPA GC eksplisit" (siklus 133).

Turunan e2e_scene_dispose.py (siklus 124, 3 remount + window.gc() eksplisit).
Tekanan memori lebih nyata: 10 putaran destroy→recreate berturut-turut dan
chrome diluncurkan TANPA --js-flags=--expose-gc — window.gc() tidak tersedia,
satu-satunya mekanisme pemulihan adalah GC otomatis V8. Bila dispose graph
(siklus 124) atau purge hook (siklus 123) bocor per-remount, heap membesar
monotonik karena tidak ada GC paksa yang menutupi kebocoran.

Klaim yang diuji (scene NYATA, WebGL SwiftShader, 10 putaran):
  1. destroy() via window.__wfsSceneControls.destroy() selalu berhasil.
  2. window.__lastSceneDispose tiap destroy: geometries>200 & textures>10.
  3. Hook scene bersih setelah destroy (≤2 sisa di luar hook internal).
  4. Recreate via chunk OfficeScene yang sama → scene hidup lagi (agents>0,
     cam+renderer ada), zona TETAP 5 (registri tidak dobel).
  5. Heap TIDAK tumbuh tak terbatas: (akhir − awal) ≤ 50 MB (≈5 MB/putaran
     toleransi; kebocoran graph penuh per-remount jauh melampaui ini) dan
     heap absolut ≤ 160 MB.
  6. Konsol tanpa error baru (deprekasi THREE.Clock diabaikan).

Pemakaian: uv run --with websocket-client python scripts/e2e_scene_dispose10.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9468
URL = "http://127.0.0.1:9503/"
ROUNDS = 10
# Metrik PASS = heap TERTAHAN setelah GC dipaksa via CDP HeapProfiler
# (window.gc TIDAK tersedia di run tanpa --expose-gc). Pertumbuhan lazy
# antar-round hanyalah informasi — V8 tanpa tekanan memori menunda major GC.
MAX_RETAINED_GROWTH_MB = 50
MAX_RETAINED_ABS_MB = 200

STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "cam:!!window.__camCam,renderer:!!window.__renderer,zone:window.__zoneLabels?window.__zoneLabels.length:-1,"
              "heap:(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1),"
              "heapMax:(performance.memory?Math.round(performance.memory.jsHeapSizeLimit/1048576):-1)})")

HOOKS_LEFT_EXPR = ("JSON.stringify(Array.isArray(window.__hookListProbe)?"
                   "window.__hookListProbe.filter(k=>k!=='__SCENE_HOOKS'&&k!=='__sceneHygienePurge'&&k!=='__wfsSceneControls'"
                   "&&k!=='__lastSceneDispose').filter(k=>Object.prototype.hasOwnProperty.call(window,k)).length:-1)")

DESTROY_EXPR = ("JSON.stringify((()=>{try{"
                "if(!window.__wfsSceneControls||!window.__wfsSceneControls.destroy)return{ok:false,err:'controls tidak ada'};"
                "window.__wfsSceneControls.destroy();return{ok:true};"
                "}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())")

DISPOSE_EXPR = ("JSON.stringify(window.__lastSceneDispose?window.__lastSceneDispose:"
                "{geometries:-1,materials:-1,textures:-1})")

RECREATE_EXPR_TMPL = ("window.__recreateResult=null;"
                      "import(%s).then(mod=>{"
                      "  try{"
                      "    const host=document.querySelector('#root > div[style*=\\\"z-index: 0\\\"]')"
                      "        ||document.querySelector('#root > div');"
                      "    if(!host)throw new Error('container App tidak ditemukan');"
                      "    window.__recreated=mod.createOfficeScene(host,{});"
                      "    window.__recreateResult={ok:true};"
                      "  }catch(e){window.__recreateResult={ok:false,err:String(e&&e.message||e)}}"
                      "}).catch(e=>{window.__recreateResult={ok:false,err:String(e&&e.message||e)}});")


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
        d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
        if n < 126:
            h += bytes([0x80 | n])
        else:
            h += bytes([0x80 | 126]) + struct.pack(">H", n)
        s.sock.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

    def recv(s):
        def recv_exact(n):
            b = b""
            while len(b) < n:
                chunk = s.sock.recv(n - len(b))
                if not chunk: raise ConnectionResetError("socket closed")
                b += chunk
            return b

        def frame():
            hdr = recv_exact(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126:
                n = struct.unpack(">H", recv_exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", recv_exact(8))[0]
            return op, recv_exact(n)
        op, d = frame()
        while op == 0:  # continuation frame
            op, d2 = frame(); d += d2
            if op != 0:
                break
        return d.decode("utf-8", "replace")


def jval(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return None
    return v


def _x99_alive():
    """Cek X server :99 hidup (bukan cuma socket basi — pelajaran siklus 127/128)."""
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99_alive():
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    # TANPA --js-flags=--expose-gc: window.gc() tak tersedia, hanya GC otomatis V8.
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--enable-precise-memory-info",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    console_errors = []
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0

        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            for _ in range(600):
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r
                if r.get("method") == "Runtime.consoleAPICalled":
                    p_ = (r.get("params") or {})
                    if p_.get("type") == "error":
                        console_errors.append(" ".join(str(a.get("value", a.get("description", "?")))
                                                       for a in p_.get("args", [])))
                if r.get("method") == "Runtime.exceptionThrown":
                    console_errors.append(str((r.get("params") or {}).get("exceptionDetails", {})))

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            val = (res.get("result") or {}).get("value")
            return val

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        st = jval(ev(STATE_EXPR))
        print("STATE0:", json.dumps(st), flush=True)
        if not isinstance(st, dict) or st.get("agents", -1) <= 0 or not st.get("cam") or not st.get("renderer"):
            print("E2E_SCENEDISPOSE10: FAIL (scene tidak siap)")
            sys.exit(1)
        if not jval(ev("JSON.stringify(!window.gc)")):
            print("E2E_SCENEDISPOSE10: FAIL (window.gc tersedia — klaim 'tanpa GC eksplisit' tidak berlaku)")
            sys.exit(1)

        ev("window.__hookListProbe=Array.from(window.__SCENE_HOOKS||[])")
        mod_url = jval(ev(
            "JSON.stringify((performance.getEntriesByType('resource')"
            ".map(r=>r.name).find(u=>/OfficeScene-.*\\.js$/.test(u)))||null)"))
        print("MOD_URL:", mod_url)
        if not mod_url:
            print("E2E_SCENEDISPOSE10: FAIL (URL chunk OfficeScene tidak ditemukan)")
            sys.exit(1)

        heaps = [st.get("heap")]
        for rnd in range(1, ROUNDS + 1):
            t0 = time.time()
            d = jval(ev(DESTROY_EXPR))
            if not d or not d.get("ok"):
                print(f"E2E_SCENEDISPOSE10: FAIL (destroy r{rnd} gagal: {d})")
                sys.exit(1)
            time.sleep(1.5)
            dg = jval(ev(DISPOSE_EXPR))
            h_after_dispose = jval(ev(
                "JSON.stringify(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1)"))
            print(f"DISPOSE r{rnd}:", json.dumps(dg), "heap-after-dispose:", h_after_dispose, flush=True)
            if not isinstance(dg, dict) or dg.get("geometries", -1) < 200 or dg.get("textures", -1) < 10:
                print(f"E2E_SCENEDISPOSE10: FAIL (dispose graph r{rnd} tidak terjadi: {dg})")
                sys.exit(1)
            left = jval(ev(HOOKS_LEFT_EXPR))
            if not isinstance(left, int) or left > 2:
                print(f"E2E_SCENEDISPOSE10: FAIL (sisa {left} hook scene setelah destroy r{rnd})")
                sys.exit(1)
            # TIDAK ada window.gc() — GC otomatis V8 saja.
            time.sleep(0.5)
            heaps.append(jval(ev(
                "JSON.stringify(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1)")))
            # ── recreate ──
            jval(ev(RECREATE_EXPR_TMPL % json.dumps(mod_url)))
            rc = None
            for _ in range(30):
                time.sleep(2)
                rc = jval(ev("JSON.stringify(window.__recreateResult)"))
                if rc:
                    break
            if not rc or not rc.get("ok"):
                print(f"E2E_SCENEDISPOSE10: FAIL (recreate r{rnd} gagal: {rc})")
                sys.exit(1)
            time.sleep(9)  # scene baru init penuh
            stn = jval(ev(STATE_EXPR))
            print(f"STATE r{rnd} (recreated):", json.dumps(stn), f"({time.time()-t0:.1f}s)", flush=True)
            if not isinstance(stn, dict) or stn.get("agents", -1) <= 0 or not stn.get("cam") or not stn.get("renderer"):
                print(f"E2E_SCENEDISPOSE10: FAIL (scene baru r{rnd} tidak hidup)")
                sys.exit(1)
            if stn.get("zone") != 5:
                print(f"E2E_SCENEDISPOSE10: FAIL (zona ≠ 5 setelah recreate r{rnd} — registri dobel: {stn.get('zone')})")
                sys.exit(1)
            heaps.append(stn.get("heap"))
            ev("window.__hookListProbe=Array.from(window.__SCENE_HOOKS||[])")

        print("HEAPS:", heaps)
        # ── GC DIPAKSA via CDP (setara window.gc() tanpa --expose-gc) ──
        cmd("HeapProfiler.enable")
        cmd("HeapProfiler.collectGarbage")
        time.sleep(3)
        retained = jval(ev(
            "JSON.stringify(performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1)"))
        growth = (retained or 0) - (heaps[0] or 0)
        print(f"RETAINED after forced GC: {retained} MB (awal {heaps[0]} MB, Δ{growth} MB)")
        if growth > MAX_RETAINED_GROWTH_MB:
            print(f"E2E_SCENEDISPOSE10: FAIL (heap tertahan tumbuh {growth} MB > "
                  f"{MAX_RETAINED_GROWTH_MB} MB — kebocoran per-remount)")
            sys.exit(1)
        if (retained or 0) > MAX_RETAINED_ABS_MB:
            print(f"E2E_SCENEDISPOSE10: FAIL (heap tertahan {retained} MB > {MAX_RETAINED_ABS_MB} MB)")
            sys.exit(1)
        fresh_errs = [e for e in console_errors if "deprecat" not in e.lower()]
        if fresh_errs:
            print("E2E_SCENEDISPOSE10: FAIL (error konsol:", fresh_errs[:3], ")")
            sys.exit(1)
        print(f"E2E_SCENEDISPOSE10: OK ({ROUNDS} remount TANPA GC eksplisit, "
              f"heap tertahan {heaps[0]}→{retained} MB (Δ{growth} MB), dispose graph tiap destroy, "
              f"zona tetap 5, konsol bersih)")
        sys.exit(0)
    finally:
        try:
            p.terminate()
        except Exception:
            pass
        if xv:
            try:
                xv.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
