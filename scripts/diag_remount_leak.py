#!/usr/bin/env python3
"""Diagnostik sumber kebocoran heap per-remount (siklus 133).

3× destroy→recreate dengan GC dipaksa tiap putaran (HeapProfiler.collectGarbage),
lalu bandingkan: jumlah node DOM, anak host, kanvas, properti window, hook scene,
dan heap tertahan. Pembeda: DOM tumbuh = leak overlay DOM; window keys tumbuh =
hook bocor; DOM/hook stabil tapi heap naik = objek JS tertahan (registry/closure).
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9467
URL = "http://127.0.0.1:9503/"
ROUNDS = 3

COUNTS_EXPR = ("JSON.stringify({"
               "dom:document.getElementsByTagName('*').length,"
               "hostKids:(document.querySelector('#root > div[style*=\"z-index: 0\"]')||document.querySelector('#root > div')||document.body).children.length,"
               "hostAll:(document.querySelector('#root > div[style*=\"z-index: 0\"]')||document.querySelector('#root > div')||document.body).querySelectorAll('*').length,"
               "canvases:document.querySelectorAll('canvas').length,"
               "bodyKids:document.body.children.length,"
               "winKeys:Object.keys(window).length,"
               "hooks:window.__SCENE_HOOKS?window.__SCENE_HOOKS.length:-1,"
               "heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1})")

STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "cam:!!window.__camCam,renderer:!!window.__renderer})")

DESTROY_EXPR = ("JSON.stringify((()=>{try{"
                "if(!window.__wfsSceneControls||!window.__wfsSceneControls.destroy)return{ok:false,err:'controls tidak ada'};"
                "window.__wfsSceneControls.destroy();return{ok:true};"
                "}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())")

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
        while op == 0:
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
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99_alive():
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--enable-precise-memory-info",
                          "--window-size=1366,768", "--disable-dev-shm-usage", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            return (res.get("result") or {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable"); cmd("HeapProfiler.enable")
        time.sleep(15)

        print("STATE0:", ev(STATE_EXPR))
        mod_url = jval(ev(
            "JSON.stringify((performance.getEntriesByType('resource')"
            ".map(r=>r.name).find(u=>/OfficeScene-.*\\.js$/.test(u)))||null)"))
        if not mod_url:
            print("DIAG: FAIL (chunk OfficeScene tak ditemukan)"); sys.exit(1)

        def gc():
            cmd("HeapProfiler.collectGarbage"); time.sleep(2)

        def snap(label):
            gc()
            c = jval(ev(COUNTS_EXPR))
            print(f"{label}:", json.dumps(c), flush=True)
            return c

        s0 = snap("SNAP0")
        for rnd in range(1, ROUNDS + 1):
            d = jval(ev(DESTROY_EXPR))
            if not d or not d.get("ok"):
                print(f"DIAG: FAIL destroy r{rnd}: {d}"); sys.exit(1)
            time.sleep(1.5)
            snap(f"SNAP-after-destroy-r{rnd}")
            jval(ev(RECREATE_EXPR_TMPL % json.dumps(mod_url)))
            rc = None
            for _ in range(30):
                time.sleep(2)
                rc = jval(ev("JSON.stringify(window.__recreateResult)"))
                if rc:
                    break
            if not rc or not rc.get("ok"):
                print(f"DIAG: FAIL recreate r{rnd}: {rc}"); sys.exit(1)
            time.sleep(9)
            print(f"STATE r{rnd}:", ev(STATE_EXPR))
            snap(f"SNAP-after-recreate-r{rnd}")

        # Detail: jenis node anak host yang tersisa + properti window milik scene
        detail = jval(ev(
            "JSON.stringify((()=>{const host=document.querySelector('#root > div[style*=\"z-index: 0\"]')"
            "||document.querySelector('#root > div')||document.body;"
            "const tags={};host.querySelectorAll('*').forEach(e=>{tags[e.tagName]=(tags[e.tagName]||0)+1});"
            "const sceneKeys=Object.keys(window).filter(k=>k.startsWith('__')).sort();"
            "return{hostTags:tags,sceneKeys:sceneKeys}})())"))
        print("DETAIL:", json.dumps(detail))
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
