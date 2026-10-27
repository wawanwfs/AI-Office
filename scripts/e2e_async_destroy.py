#!/usr/bin/env python3
"""E2E regresi "fetch async in-flight saat destroy → hook window bangkit" (siklus 125).

Bug (pola siklus 124 — pollStatus sudah diguard, tapi dua jalur async lain BELUM):
  - parts/lounge.js::tvPull — fetch /wfs-project in-flight saat destroy() →
    SETELAH purge hook, await selesai → menulis window.__tvData /
    __lastTvDrawAt / __tvPullErr kembali ke window (hook menunjuk data scene
    mati) + drawTv() pada canvas scene mati.
  - parts/projectboard.js::pull — sama, menggambar data task pada canvas
    papan scene mati + update tracker koneksi.

Perbaikan siklus 125: guard flag stopped (tvStopped / pollStopped) SETELAH
tiap await + di catch — destroy men-set flag via tvDestroy()/destroy() yang
sudah dipanggil OfficeScene.destroy().

Langkah probe (scene NYATA di :9503, chrome-headless-shell + Xvfb :99):
  1. STATE0: scene hidup (agents>0, __tvData ada dari pull awal — bukti jalur TV pernah sukses).
  2. Pasang interceptor fetch: SEMUA /wfs-project digantung (promise manual),
     sisanya diteruskan ke fetch asli.
  3. Picu tvPull (event visibilitychange) & pull (visibilityState hidden→visible)
     → keduanya in-flight pada fetch palsu.
  4. destroy() resmi via __wfsSceneControls → purge jalan → sanity: __tvData HILANG.
  5. Resolve semua fetch palsu dgn payload valid → await selesai.
  6. Cek: __tvData / __lastTvDrawAt / __tvPullErr TIDAK BOLEH bangkit;
     sisa hook scene ≤1. Kode lama → hook bangkit → FAIL (diskriminasi bug).
Pemakaian: uv run --with websocket-client python scripts/e2e_async_destroy.py
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9470
URL = "http://127.0.0.1:9503/"

STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "cam:!!window.__camCam,renderer:!!window.__renderer,"
              "tvData:Object.prototype.hasOwnProperty.call(window,'__tvData'),"
              "controls:!!(window.__wfsSceneControls&&window.__wfsSceneControls.destroy)})")

INTERCEPT_EXPR = ("JSON.stringify((()=>{try{"
                  "const orig=window.fetch.bind(window);window.__origFetch=orig;"
                  "window.__pendingFetches=[];window.__pendingResolvers=[];"
                  "window.fetch=(input,init)=>{"
                  "  const url=typeof input==='string'?input:((input&&input.url)||String(input));"
                  "  if(String(url).includes('/wfs-project')){"
                  "    return new Promise((resolve,reject)=>{"
                  "      window.__pendingFetches.push(String(url));"
                  "      window.__pendingResolvers.push({resolve,reject});"
                  "    });"
                  "  }"
                  "  return orig(input,init);"
                  "};"
                  "return{ok:true};"
                  "}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())")

TRIGGER_EXPR = ("JSON.stringify((()=>{try{"
                "document.dispatchEvent(new Event('visibilitychange'));"  # tvPull (visibilityState=visible)
                "Object.defineProperty(document,'visibilityState',{get:()=> 'hidden',configurable:true});"
                "document.dispatchEvent(new Event('visibilitychange'));"  # board onVis → pageHidden=true
                "Object.defineProperty(document,'visibilityState',{get:()=> 'visible',configurable:true});"
                "document.dispatchEvent(new Event('visibilitychange'));"  # board onVis → pull()
                "return{pending:window.__pendingFetches.length};"
                "}catch(e){return{pending:-1,err:String(e&&e.message||e)}}})())")

DESTROY_EXPR = ("JSON.stringify((()=>{try{"
                "if(!window.__wfsSceneControls||!window.__wfsSceneControls.destroy)return{ok:false,err:'controls tidak ada'};"
                "window.__wfsSceneControls.destroy();return{ok:true};"
                "}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())")

POST_DESTROY_EXPR = ("JSON.stringify({tvPurged:!Object.prototype.hasOwnProperty.call(window,'__tvData'),"
                     "destroyedFlag:window.__officeSceneDestroyed===true})")

RESOLVE_EXPR = ("JSON.stringify((()=>{try{"
                "const n=(window.__pendingResolvers||[]).length;"
                "const body=JSON.stringify({project:'WFS PROJECT',"
                "tasks:{total:3,done:1,pending:1,running:1,failed:0,review:0,"
                "recent:[{id:21,title:'task jalan A',status:'running'}]}});"
                "(window.__pendingResolvers||[]).forEach(p=>p.resolve("
                "new Response(body,{status:200,headers:{'content-type':'application/json'}})));"
                "window.__pendingResolvers=[];"
                "return{resolved:n};"
                "}catch(e){return{resolved:-1,err:String(e&&e.message||e)}}})())")

CHECK_EXPR = ("JSON.stringify({"
              "tvData:Object.prototype.hasOwnProperty.call(window,'__tvData'),"
              "tvDraw:Object.prototype.hasOwnProperty.call(window,'__lastTvDrawAt'),"
              "tvErr:Object.prototype.hasOwnProperty.call(window,'__tvPullErr'),"
              "hooksLeft:(window.__hookListProbe||[]).filter(k=>"
              "!['__SCENE_HOOKS','__sceneHygienePurge','__wfsSceneControls','__lastSceneDispose'].includes(k)"
              "&&Object.prototype.hasOwnProperty.call(window,k)).length})")


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
            return (res.get("result") or {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable")
        time.sleep(15)  # scene init + pull awal TV/papan (real fetch) selesai

        st = jval(ev(STATE_EXPR))
        print("STATE0:", json.dumps(st))
        if not isinstance(st, dict) or st.get("agents", -1) <= 0 or not st.get("cam") or not st.get("renderer"):
            print("E2E_ASYNCDESTROY: FAIL (scene tidak siap)")
            sys.exit(1)
        if not st.get("tvData"):
            print("E2E_ASYNCDESTROY: FAIL (pull awal TV belum sukses — __tvData harus ada sebelum uji)")
            sys.exit(1)
        if not st.get("controls"):
            print("E2E_ASYNCDESTROY: FAIL (jembatan __wfsSceneControls tidak ada)")
            sys.exit(1)

        # daftar hook utk verifikasi purge (mirror probe siklus 123/124)
        ev("window.__hookListProbe=Array.from(window.__SCENE_HOOKS||[])")

        ic = jval(ev(INTERCEPT_EXPR))
        if not ic or not ic.get("ok"):
            print(f"E2E_ASYNCDESTROY: FAIL (interceptor gagal: {ic})")
            sys.exit(1)
        tg = jval(ev(TRIGGER_EXPR))
        print("TRIGGER:", json.dumps(tg))
        if not tg or tg.get("pending", -1) < 1:
            print(f"E2E_ASYNCDESTROY: FAIL (tidak ada fetch /wfs-project in-flight: {tg})")
            sys.exit(1)

        d = jval(ev(DESTROY_EXPR))
        if not d or not d.get("ok"):
            print(f"E2E_ASYNCDESTROY: FAIL (destroy gagal: {d})")
            sys.exit(1)
        time.sleep(0.5)
        pd = jval(ev(POST_DESTROY_EXPR))
        print("POST-DESTROY:", json.dumps(pd))
        if not pd or not pd.get("destroyedFlag") or not pd.get("tvPurged"):
            print(f"E2E_ASYNCDESTROY: FAIL (purge destroy tidak jalan: {pd})")
            sys.exit(1)

        rs = jval(ev(RESOLVE_EXPR))
        print("RESOLVE:", json.dumps(rs))
        if not rs or rs.get("resolved", -1) < 1:
            print(f"E2E_ASYNCDESTROY: FAIL (resolve fetch in-flight gagal: {rs})")
            sys.exit(1)
        time.sleep(1.0)  # microtask await + draw pada kode lama sempat menulis

        ck = jval(ev(CHECK_EXPR))
        print("CHECK:", json.dumps(ck))
        if not isinstance(ck, dict):
            print("E2E_ASYNCDESTROY: FAIL (cek akhir tidak terbaca)")
            sys.exit(1)
        raised = [k for k, v in (("window.__tvData", ck.get("tvData")),
                                 ("window.__lastTvDrawAt", ck.get("tvDraw")),
                                 ("window.__tvPullErr", ck.get("tvErr"))) if v]
        if raised:
            print(f"E2E_ASYNCDESTROY: FAIL (hook bangkit setelah destroy+resolve — jalur async belum diguard: {raised})")
            sys.exit(1)
        if ck.get("hooksLeft", 99) > 1:
            print(f"E2E_ASYNCDESTROY: FAIL (sisa {ck.get('hooksLeft')} hook scene setelah destroy+resolve)")
            sys.exit(1)
        fresh_errs = [e for e in console_errors if "deprecat" not in e.lower()]
        if fresh_errs:
            print("E2E_ASYNCDESTROY: FAIL (error konsol:", fresh_errs[:3], ")")
            sys.exit(1)
        print("E2E_ASYNCDESTROY: OK (fetch in-flight saat destroy tidak menghidupkan hook window — guard async tvPull/pull jalan)")
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
