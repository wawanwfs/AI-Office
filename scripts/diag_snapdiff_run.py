#!/usr/bin/env python3
"""Eksperimen diff: snapshot setelah 2 remount vs setelah 6 remount.
Simpan hs_a & hs_b ke scratch. Yang tumbuh ~3x per nama = kelas bocor."""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9465
URL = "http://127.0.0.1:9503/"
SCR = os.path.expanduser("~/.hermes/cache/scratch")

DESTROY_EXPR = ("JSON.stringify((()=>{try{"
                "if(!window.__wfsSceneControls||!window.__wfsSceneControls.destroy)return{ok:false,err:'x'};"
                "window.__wfsSceneControls.destroy();return{ok:true};"
                "}catch(e){return{ok:false,err:String(e&&e.message||e)}}})())")
RECREATE_EXPR_TMPL = ("window.__recreateResult=null;"
                      "import(%s).then(mod=>{"
                      "  try{"
                      "    const host=document.querySelector('#root > div[style*=\\\"z-index: 0\\\"]')"
                      "        ||document.querySelector('#root > div');"
                      "    if(!host)throw new Error('no host');"
                      "    window.__recreated=mod.createOfficeScene(host,{});"
                      "    window.__recreateResult={ok:true};"
                      "  }catch(e){window.__recreateResult={ok:false,err:String(e&&e.message||e)}}"
                      "}).catch(e=>{window.__recreateResult={ok:false,err:String(e&&e.message||e)}});")
STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1})")


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
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionResetError()
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126: n = struct.unpack(">H", rx(2))[0]
        elif n == 127: n = struct.unpack(">Q", rx(8))[0]
        return rx(n).decode("utf-8", "replace")


def jval(v):
    try: return json.loads(v)
    except Exception: return None


def _x99():
    return subprocess.run(["xdpyinfo", "-display", ":99"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def main():
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not _x99():
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
            while True:
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            return ((r or {}).get("result") or {}).get("result", {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable"); cmd("HeapProfiler.enable")
        time.sleep(15)
        mod_url = jval(ev(
            "JSON.stringify((performance.getEntriesByType('resource')"
            ".map(r=>r.name).find(u=>/OfficeScene-.*\\.js$/.test(u)))||null)"))
        if not mod_url:
            print("FAIL chunk"); sys.exit(1)

        def remount():
            d = jval(ev(DESTROY_EXPR))
            assert d and d.get("ok"), d
            time.sleep(1.5)
            ev(RECREATE_EXPR_TMPL % json.dumps(mod_url))
            for _ in range(30):
                time.sleep(2)
                rc = jval(ev("JSON.stringify(window.__recreateResult)"))
                if rc: break
            assert rc and rc.get("ok"), rc
            time.sleep(9)

        def snap(path):
            nonlocal mid
            cmd("HeapProfiler.collectGarbage"); time.sleep(3)
            print("PRE:", ev(STATE_EXPR), flush=True)
            mid += 1
            my = mid
            ws.send(json.dumps({"id": my, "method": "HeapProfiler.takeHeapSnapshot",
                                "params": {"reportProgress": False}}))
            with open(path, "wb") as f:
                while True:
                    r = json.loads(ws.recv())
                    if r.get("method") == "HeapProfiler.addHeapSnapshotChunk":
                        f.write((r.get("params") or {}).get("chunk", "").encode("utf-8", "ignore"))
                    elif r.get("id") == my:
                        break
            print(f"SNAP {path}: {os.path.getsize(path)} B", flush=True)

        remount(); remount()
        snap(os.path.join(SCR, "hs_a.heapsnapshot"))
        remount(); remount(); remount(); remount()
        snap(os.path.join(SCR, "hs_b.heapsnapshot"))
        print("DONE", ev(STATE_EXPR))
        sys.exit(0)
    finally:
        try: p.terminate()
        except Exception: pass
        if xv:
            try: xv.terminate()
            except Exception: pass


if __name__ == "__main__":
    main()
