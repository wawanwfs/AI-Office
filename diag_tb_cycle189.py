import json, urllib.request, subprocess, time, socket, base64, os, struct
CHROME = os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9478
p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}", "--enable-unsafe-swiftshader",
                      "--window-size=1366,768", "--disable-dev-shm-usage", "http://127.0.0.1:9503/"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
pages = []
for i in range(15):
    time.sleep(1)
    try:
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        pages = [t for t in tabs if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
        if pages:
            break
    except Exception:
        pass
u = pages[0]["webSocketDebuggerUrl"]
pr = u.replace("ws://", "")
hp, path = pr.split("/", 1)
host, port = hp.split(":")
port = int(port)
path = "/" + path
s = socket.create_connection((host, port), timeout=5)
s.settimeout(5)
key = base64.b64encode(os.urandom(16)).decode()
s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
buf = b""
while b"\r\n\r\n" not in buf:
    buf += s.recv(1)

def send(m):
    d = m.encode(); h = b"\x81"; n = len(d); mask = os.urandom(4)
    if n < 126:
        h += bytes([0x80 | n])
    else:
        h += bytes([0x80 | 126]) + struct.pack(">H", n)
    s.sendall(h + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(d)))

def rxt(n):
    b = b""
    while len(b) < n:
        c = s.recv(n - len(b))
        if not c:
            raise ConnectionResetError()
        b += c
    return b

def recv():
    hdr = rxt(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
    if n == 126:
        n = struct.unpack(">H", rxt(2))[0]
    elif n == 127:
        n = struct.unpack(">Q", rxt(8))[0]
    return op, rxt(n)

def cmd(mid, method, **params):
    send(json.dumps({"id": mid, "method": method, "params": params}))
    t0 = time.time()
    while time.time() - t0 < 10:
        op, d = recv()
        r = json.loads(d)
        if r.get("id") == mid:
            return r

cmd(1, "Runtime.enable")
cmd(2, "Page.enable")
time.sleep(18)
q = ("""JSON.stringify({
  entries: performance.getEntriesByType('resource').filter(e => /TaskBoard/.test(e.name))
    .map(e => ({ init: e.initiatorType, name: e.name.split('/').pop(), dur: Math.round(e.duration) })),
  nodes: Array.from(document.querySelectorAll('script[src],link[href]'))
    .map(n => n.tagName + ':' + (n.src || n.href).split('/').pop()).filter(x => /TaskBoard/i.test(x))
})""")
r = cmd(10, "Runtime.evaluate", expression=q, returnByValue=True)
print("PRE-OPEN:", json.loads(r["result"]["result"]["value"]))
cmd(11, "Runtime.evaluate", expression="window.__openTaskBoard({view:'kanban'}); 1")
time.sleep(4)
r = cmd(12, "Runtime.evaluate", expression=q, returnByValue=True)
print("POST-OPEN:", json.loads(r["result"]["result"]["value"]))
p.terminate()
print("DONE")
