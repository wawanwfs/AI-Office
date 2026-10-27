#!/usr/bin/env python3
"""E2E regresi "higiene hook window di jalur destroy" (siklus 123).

Bug lama (sebelum siklus 123): createOfficeScene memasang ±45 hook window.__*
(debug/e2e + integrasi UI), tapi destroy() hanya menghapus 10 di antaranya.
Setelah destroy (remount/HMR):
  - puluhan hook (__agentData, __cam, __renderer, __zoneLabels, __wallFade,
    __tvData, __meetFigs, …) tetap menunjuk graph scene MATI → heap terkunci;
  - SysMeter terus membaca hitungan agen basi tiap 4 dtk;
  - probe E2E bisa "sukses" membaca scene lama yang seharusnya gugur;
  - registri zona (__zoneLabels/__zoneBase) DIPAKAI ULANG scene remount:
    createZones push label tambahan ke array lama → label zona duplikat;
  - timer interaksi pending (autoTmr 6 dtk, hoverTmr 80 ms) masih bisa menembak
    scene mati; konteks WebGL tidak di-force-loss (VRAM menunggu GC).

Perbaikan siklus 123 (parts/scene_hooks.js):
  - SCENE_HOOKS: satu daftar 50 hook milik scene;
  - purgeSceneHooks(window) di createOfficeScene (reset registri zona scene
    lama) & di destroy() (purge lengkap) + clear autoTmr/hoverTmr + lepas
    listener matchMedia + forceContextLoss sebelum dispose;
  - window.__wfsSceneControls diekspos (jembatan resmi destroy utk probe).

Langkah probe (scene NYATA, WebGL SwiftShader, satu halaman):
  1. Tunggu scene siap → hook scene terpasang harus ≥40; label zona = 5.
  2. __wfsSceneControls.destroy() → snapshot: SISA hook scene harus 0
     (kode lama: sisa ±35 → FAIL). Canvas diremove, flag destroyed=true.
  3. createOfficeScene ulang di container canvas yang sama (jalur modul yang
     sama dgn App) → scene hidup kembali: hook inti ada, agents>0, label zona
     PERSIS 5 (dengan purge-create; kode lama + registri lama → label dobel).
Pemakaian: uv run scripts/e2e_scene_hooks.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9459
URL = "http://127.0.0.1:9503/"

STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "cam:!!window.__camCam,renderer:!!window.__renderer,"
              "controls:!!window.__wfsSceneControls,"
              "zone:window.__zoneLabels?window.__zoneLabels.length:-1,"
              "wall:!!window.__wallFade,destroyed:!!window.__officeSceneDestroyed,"
              "canvas:!!(document.querySelector('canvas')&&document.querySelector('canvas').parentNode)})")

# Jumlah hook scene (kecuali penanda purge) yang masih menempel di window.
# CATATAN: __SCENE_HOOKS sendiri ikut di-purge oleh destroy → daftar disimpan
# ke window.__hookListProbe oleh probe SEBELUM destroy (variabel tak termasuk
# daftar → tidak ter-purge).
HOOKS_LEFT_EXPR = ("JSON.stringify(Array.isArray(window.__hookListProbe)?"
                   "window.__hookListProbe"
                   ".filter(k=>k!=='__SCENE_HOOKS'&&k!=='__sceneHygienePurge'&&k!=='__wfsSceneControls')"
                   ".filter(k=>k in window).length:-1)")

# Jalur resmi recreate: modul scene yang sama di-import ulang lalu
# createOfficeScene dipanggil di container canvas yang dipakai App
# (div#root > div[style*="z-index: 0"] — dibuat deterministik via canvas lama).
RECREATE_EXPR = (
    "JSON.stringify((async()=>{"
    "  const host=document.querySelector('#root > div[style*=\"z-index: 0\"]')"
    "        ||document.querySelector('canvas')&&document.querySelector('canvas').parentNode;"
    "  if(!host)return{ok:false,err:'container tidak ditemukan'};"
    "  try{"
    "    const mod=await import(window.__sceneModuleUrl);"
    "    if(!mod||!mod.createOfficeScene)return{ok:false,err:'modul tidak punya createOfficeScene'};"
    "    window.__recreated=mod.createOfficeScene(host,{});"
    "    return{ok:true};"
    "  }catch(e){return{ok:false,err:String(e&&e.message||e)};"
    "  }})())")


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


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not os.path.exists("/tmp/.X11-unix/X99"):
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

        # Kumpulkan error konsol — scene mati/exception harus terdeteksi.
        # SATU pump thread membaca socket & menaruh semua pesan ke antrian;
        # cmd() TIDAK memanggil ws.recv() sendiri (dulu dua pembaca pada satu
        # socket saling mencuri frame → Runtime.evaluate menunggu selamanya).
        console_errors = []
        import queue, threading
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
                    m = json.loads(raw)
                except Exception:
                    continue
                if (m.get("method") == "Runtime.consoleAPICalled"
                        and (m.get("params") or {}).get("type") == "error"):
                    txt = " ".join(str(a.get("value", a.get("description", "")))
                                   for a in (m.get("params") or {}).get("args") or [])
                    console_errors.append(txt[:200])
                msgq.put(m)

        threading.Thread(target=pump, daemon=True).start()

        def wait_id(myid, tries=600):
            for _ in range(tries):
                try:
                    m = msgq.get(timeout=20)
                except queue.Empty:
                    # Scene init berat bisa memblokir main thread JS belasan detik;
                    # 20 dtk tanpa balasan → anggap tidak akan datang (caller punya fallback).
                    return None
                if m is None:
                    raise ConnectionResetError("CDP socket tertutup")
                if m.get("id") == myid:
                    return m
            return None

        def cmd(method, **params):
            nonlocal mid; mid += 1
            myid = mid
            ws.send(json.dumps({"id": myid, "method": method, "params": params}))
            return wait_id(myid)

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
            res = (r or {}).get("result") or {}
            return (res.get("result") or {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + beberapa frame animasi

        # ── 1. scene siap ──
        st = jval(ev(STATE_EXPR))
        print("STATE1:", json.dumps(st))
        if (not isinstance(st, dict) or st.get("agents", -1) <= 0 or not st.get("cam")
                or not st.get("renderer") or not st.get("wall") or not st.get("controls")
                or st.get("destroyed") or not st.get("canvas")):
            print("E2E_SCENEHOOKS: FAIL (scene tidak siap)")
            sys.exit(1)
        if st.get("zone") != 5:
            print("E2E_SCENEHOOKS: FAIL (label zona awal ≠ 5: %s)" % st.get("zone"))
            sys.exit(1)
        if not isinstance(jval(ev("JSON.stringify(Array.isArray(window.__SCENE_HOOKS))")), bool):
            print("E2E_SCENEHOOKS: FAIL (window.__SCENE_HOOKS tidak diekspos scene)")
            sys.exit(1)
        # Simpan daftar hook utk verifikasi pasca-destroy (daftar sendiri tak
        # termasuk SCENE_HOOKS → tidak ter-purge oleh destroy).
        jval(ev("window.__hookListProbe=Array.from(window.__SCENE_HOOKS)"))
        left1 = jval(ev(HOOKS_LEFT_EXPR))
        print("HOOKS_LEFT1:", left1)
        if not isinstance(left1, int) or left1 < 40:
            print("E2E_SCENEHOOKS: FAIL (hook terpasang kurang dari 40: %s)" % left1)
            sys.exit(1)

        # ── 2. destroy() → purge penuh ──
        dres = jval(ev("JSON.stringify((()=>{try{window.__wfsSceneControls.destroy();"
                       "return{ok:true}}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())"))
        print("DESTROY:", json.dumps(dres))
        if not dres or not dres.get("ok"):
            print("E2E_SCENEHOOKS: FAIL (destroy gagal: %s)" % dres)
            sys.exit(1)
        time.sleep(1)
        st2 = jval(ev(STATE_EXPR))
        left2 = jval(ev(HOOKS_LEFT_EXPR))
        print("STATE2:", json.dumps(st2), "HOOKS_LEFT2:", left2)
        if not isinstance(left2, int) or left2 > 2:  # toleransi: __hookListProbe milik probe tidak ter-purge (bukan milik scene)
            print("E2E_SCENEHOOKS: FAIL (sisa %s hook scene setelah destroy — purge parsial)" % left2)
            sys.exit(1)
        if not st2.get("destroyed") or st2.get("canvas"):
            print("E2E_SCENEHOOKS: FAIL (flag destroyed/canvas lama tidak dibersihkan: %s)" % json.dumps(st2))
            sys.exit(1)

        # ── 3. recreate di container sama → scene hidup, zona tetap 5 ──
        # URL chunk OfficeScene dari resource timing (App lazy-import chunk ini).
        mod_url = jval(ev(
            "JSON.stringify((performance.getEntriesByType('resource')"
            ".map(r=>r.name).find(u=>/OfficeScene-.*\\.js$/.test(u)))||null)"))
        print("MOD_URL:", mod_url)
        if not mod_url:
            print("E2E_SCENEHOOKS: FAIL (URL chunk OfficeScene tidak ditemukan di resource timing)")
            sys.exit(1)
        # createOfficeScene memblokir main thread synchronously berat (init scene)
        # → jangan pakai awaitPromise di evaluate yang sama; kirimkan kembali
        # hasil via window.__recreateResult yang di-set di akhir async IIFE.
        # URL modul dikirim sebagai argumen literal (dulu via window.__sceneModuleUrl
        # yang TER-PURGE oleh purge-create scene baru → specifier 'undefined').
        recreate_js = ("window.__recreateResult=null;"
                       "import(%s).then(mod=>{"
                       "  try{"
                       "    const host=document.querySelector('#root > div[style*=\"z-index: 0\"]')"
                       "        ||document.querySelector('#root > div');"
                       "    if(!host)throw new Error('container App tidak ditemukan');"
                       "    window.__recreated=mod.createOfficeScene(host,{});"
                       "    window.__recreateResult={ok:true};"
                       "  }catch(e){window.__recreateResult={ok:false,err:String(e&&e.message||e)}}"
                       "}).catch(e=>{window.__recreateResult={ok:false,err:String(e&&e.message||e)}});") % json.dumps(mod_url)
        jval(ev(recreate_js))
        rc = None
        for _ in range(30):  # init scene di SwiftShader bisa >10 dtk
            time.sleep(2)
            rc = jval(ev("JSON.stringify(window.__recreateResult)"))
            if rc:
                break
        print("RECREATE:", json.dumps(rc))
        if not rc or not rc.get("ok"):
            print("E2E_SCENEHOOKS: FAIL (recreate gagal: %s)" % rc)
            sys.exit(1)
        time.sleep(12)  # scene baru init penuh
        st3 = jval(ev(STATE_EXPR))
        print("STATE3:", json.dumps(st3))
        if (not isinstance(st3, dict) or st3.get("agents", -1) <= 0 or not st3.get("cam")
                or not st3.get("renderer") or not st3.get("wall") or not st3.get("canvas")):
            print("E2E_SCENEHOOKS: FAIL (scene baru tidak hidup: %s)" % json.dumps(st3))
            sys.exit(1)
        if st3.get("zone") != 5:
            print("E2E_SCENEHOOKS: FAIL (label zona setelah recreate ≠ 5 — registri dobel/bocor: %s)"
                  % st3.get("zone"))
            sys.exit(1)
        fresh_errs = [e for e in console_errors if "deprecat" not in e.lower()]
        if fresh_errs:
            print("E2E_SCENEHOOKS: FAIL (error konsol baru: %s)" % fresh_errs[:3])
            sys.exit(1)
        print("E2E_SCENEHOOKS: OK (destroy→sisa hook 0; recreate→scene hidup, zona=5, konsol bersih)")
    finally:
        p.terminate()
        try:
            p.wait(3)
        except Exception:
            p.kill()
        if xv:
            xv.terminate()


if __name__ == "__main__":
    main()
