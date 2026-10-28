#!/usr/bin/env python3
"""Diagnostik #2: heap snapshot CDP → agregasi self_size per nama konstruktor.

2× destroy→recreate (garbage dead-graph menumpuk bila bocor), GC dipaksa,
lalu HeapProfiler.takeHeapSnapshot. Snapshot disimpan ke /tmp dan di-parse
streaming (ijson) — agregasi count & self_size per nama node. Tipe dominan
menunjukkan sumber kebocoran (Scene/Mesh duplikat = graph mati tertahan,
Float32Array = atribut geometri, AudioBuffer = audio, dst).
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9466
URL = "http://127.0.0.1:9503/"
ROUNDS = 2
SNAP_PATH = os.path.expanduser("~/.hermes/cache/scratch/hs.heapsnapshot")

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

STATE_EXPR = ("JSON.stringify({agents:window.__agentData?window.__agentData.length:-1,"
              "cam:!!window.__camCam,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):-1})")


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


def take_snapshot(cmd):
    done = {"flag": False}
    f = open(SNAP_PATH, "wb")

    def pump():
        # baca event stream sampai snapshot selesai; cmd() handle id-nya
        while True:
            r = json.loads(ws.recv())
            m = r.get("method")
            if m == "HeapProfiler.addHeapSnapshotChunk":
                f.write((r.get("params") or {}).get("chunk", "").encode("utf-8", "ignore"))
            elif m == "HeapProfiler.reportHeapSnapshotProgress" and (r.get("params") or {}).get("finished"):
                done["flag"] = True
                return
            elif "id" in r:
                cmd.last = r
                if done.get("want_id") == r["id"]:
                    return

    return done, f, pump


def main():
    os.makedirs(os.path.dirname(SNAP_PATH), exist_ok=True)
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
        global ws
        ws = WS([t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page"][0])
        mid = 0

        def cmd(method, **params):
            nonlocal mid; mid += 1
            ws.send(json.dumps({"id": mid, "method": method, "params": params}))
            if method == "HeapProfiler.takeHeapSnapshot":
                return None  # ditangani pump
            while True:
                r = json.loads(ws.recv())
                if r.get("id") == mid:
                    return r

        def ev(expr):
            r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
            res = (r or {}).get("result") or {}
            return (res.get("result") or {}).get("value")

        cmd("Page.enable"); cmd("Runtime.enable"); cmd("HeapProfiler.enable")
        time.sleep(15)
        print("STATE0:", ev(STATE_EXPR), flush=True)
        mod_url = jval(ev(
            "JSON.stringify((performance.getEntriesByType('resource')"
            ".map(r=>r.name).find(u=>/OfficeScene-.*\\.js$/.test(u)))||null)"))
        if not mod_url:
            print("FAIL: chunk tak ditemukan"); sys.exit(1)

        for rnd in range(1, ROUNDS + 1):
            d = jval(ev(DESTROY_EXPR))
            assert d and d.get("ok"), f"destroy r{rnd}: {d}"
            time.sleep(1.5)
            ev(RECREATE_EXPR_TMPL % json.dumps(mod_url))
            rc = None
            for _ in range(30):
                time.sleep(2)
                rc = jval(ev("JSON.stringify(window.__recreateResult)"))
                if rc: break
            assert rc and rc.get("ok"), f"recreate r{rnd}: {rc}"
            time.sleep(9)
            print(f"r{rnd} ok:", ev(STATE_EXPR), flush=True)

        cmd("HeapProfiler.collectGarbage"); time.sleep(3)
        print("SEBELUM snapshot:", ev(STATE_EXPR), flush=True)

        # ── snapshot: satu loop — tulis chunk, selesai pada response id ──
        mid += 1
        ws.send(json.dumps({"id": mid, "method": "HeapProfiler.takeHeapSnapshot",
                            "params": {"reportProgress": True}}))
        with open(SNAP_PATH, "wb") as f:
            while True:
                r = json.loads(ws.recv())
                m = r.get("method")
                if m == "HeapProfiler.addHeapSnapshotChunk":
                    f.write((r.get("params") or {}).get("chunk", "").encode("utf-8", "ignore"))
                elif r.get("id") == mid:
                    break
        sz = os.path.getsize(SNAP_PATH)
        print(f"SNAPSHOT tersimpan: {SNAP_PATH} ({sz} B)")
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
