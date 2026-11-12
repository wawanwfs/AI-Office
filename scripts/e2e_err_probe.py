#!/usr/bin/env python3
"""E2E smoke "e2e_err_probe" — pengganti permanen scratch e2e_err.py (hilang
diprune TMPDIR 24 jam, siklus 185). Smoketest kesehatan scene di browser nyata:

 1. Console error / pageerror / exception = 0 (Runtime + Log domain CDP).
 2. Tanpa 'Scene init failed' di console.
 3. Hook inti scene terpasang: __agentData (agen > 0), __camCam, __renderer,
    __wfsSceneControls, __zoneLabels (5 zona), __wallFade.
 4. Scene HIDUP: gate byte (PNG > ambang) + gate PIKSEL (siklus 194):
    warna unik >= 1500 & nonbg >= 4% via scripts/png_stats.py — byte-size
    hanya proksi; jebakan "langit-saja" (gradien 378 KB) lolos byte tapi
    DEAD piksel.
    (Pola ambang sama dgn e2e_perf_chip siklus 147.)
 5. Mode MOBILE (arg "mobile"): viewport 390x844 dsf=2 (HP umum user) +
    gate tambahan dock: .dock .ibbtn tidak ada yang terpotong viewport —
    kelas bug siklus 184 (dock 3-4 baris meluap kapsul/viewport).
 6. Gate publication: current index/landing/SW dependencies must exist at
    their referenced paths. Retained old hashes are expected for open tabs;
    neither orphan counts nor an asset-count ceiling indicate broken deploys.
    This check is read-only and reports bounded missing-path evidence.

Pemakaian: uv run --with websocket-client scripts/e2e_err_probe.py [mobile] [out.png]
Transport: salinan e2e_perf_chip.py (Xvfb :99 + chrome-headless-shell + CDP WS).
"""
import subprocess, os, time, urllib.request, json, socket, struct, base64, sys
import importlib.util as _ilu  # noqa: E402

# Satu sumber statistik piksel (gate #7, siklus 194): png_stats.py by path —
# pola sama dgn deploy.py di atas (nama generik rawan resolve ke package lain).
_spec_png = _ilu.spec_from_file_location(
    "wfs_png_stats", os.path.join(os.path.dirname(os.path.abspath(__file__)), "png_stats.py"))
assert _spec_png is not None and _spec_png.loader is not None  # file statis repo
png_mod = _ilu.module_from_spec(_spec_png)
_spec_png.loader.exec_module(png_mod)
# Satu sumber HASHED_RE + referenced_assets = scripts/deploy.py (dimuat by path:
# nama generik "deploy" rawan resolve ke package lain di search path Pyright).
_spec_deploy = _ilu.spec_from_file_location(
    "wfs_deploy", os.path.join(os.path.dirname(os.path.abspath(__file__)), "deploy.py"))
assert _spec_deploy is not None and _spec_deploy.loader is not None  # file statis repo
deploy_mod = _ilu.module_from_spec(_spec_deploy)
_spec_deploy.loader.exec_module(deploy_mod)


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
if not os.path.exists(CHROME):  # siklus 467: revision 1248 tak terpasang
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
PORT = 9461
URL = "http://127.0.0.1:9503/app/?mode=office"  # siklus 467: office langsung via argv — rute landing→assign memicu bundle basi

# Ambang "scene hidup": PNG > ambang. Desktop 1366x768 terukur 640-690 KB
# saat sehat; mobile 390x844@2x (780x1688) diukur siklus 186 — dilihat
# MOBILE_MIN_SHOT_BYTES di bawah. Kanvas mati = puluhan KB.
MIN_SHOT_BYTES = 300000
MOBILE_MIN_SHOT_BYTES = 200000
MOBILE_W, MOBILE_H, MOBILE_DSF = 390, 844, 2

HOOKS_EXPECT = ["__agentData", "__camCam", "__renderer", "__wfsSceneControls",
                "__zoneLabels", "__wallFade"]


WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas


class WS:
    def __init__(s, u):
        from urllib.parse import urlparse
        pr = urlparse(u)
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

    def recv(s):
        def rx(n):
            b = b""
            while len(b) < n:
                c = s.sock.recv(n - len(b))
                if not c: raise ConnectionError("ws closed")
                b += c
            return b
        hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
        if n == 126: n = struct.unpack(">H", rx(2))[0]
        elif n == 127: n = struct.unpack(">Q", rx(8))[0]
        return op, rx(n)

    def recv_text(s):
        op, d = s.recv()
        while op == 0:  # continuation
            op, d2 = s.recv(); d += d2
        return d.decode("utf-8", "replace")


def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def published_asset_status(root):
    """Read current entry references without pruning or scanning retained hashes.

    Preserve paths (not just basenames), strip query/fragment URL suffixes, and
    resolve Workbox's extensionless sibling module to .js. Optional landing/SW
    files are checked when present; index.html is always required. This is a
    local publication check, not an HTTP/service-worker lifecycle substitute.
    """
    import re
    from pathlib import Path
    from urllib.parse import unquote, urlsplit

    root = Path(root).resolve()
    required = {"index.html"}
    for entry in ("index.html", "landing.html", "sw.js"):
        source = root / entry
        if not source.is_file():
            continue
        body = source.read_text(encoding="utf-8", errors="replace")
        # Quoted HTML URLs, JS imports, and Workbox precache url fields.
        urls = re.findall(r'''["']([^"'<>\s]+)["']''', body)
        precache = set(re.findall(r'''["']?\burl["']?\s*:\s*["']([^"']+)["']''', body))
        urls += sorted(precache)
        for url in urls:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc:
                continue
            path = unquote(parsed.path).removeprefix("/")
            while path.startswith("./"):
                path = path[2:]
            if not path or path in ('.js', '.css'):
                continue
            if re.fullmatch(r"workbox-[A-Za-z0-9_-]{8,}", path):
                path += ".js"
            elif not (path.startswith("assets/") or
                      path.endswith((".js", ".css")) or
                      url in precache):
                continue
            required.add(path)
    missing = []
    for path in sorted(required):
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            missing.append(path)
    return {"ok": not missing, "refs": len(required),
            "missing_count": len(missing),
            "missing": [p[:200] for p in missing[:20]]}


def main():
    args = [a for a in sys.argv[1:] if a != "-"]
    mobile = "mobile" in args
    out = args[0] if args and args[0] != "mobile" else (
        args[1] if len(args) > 1 and args[1] != "mobile" else "/tmp/e2e_err_probe.png")
    w, h = (MOBILE_W, MOBILE_H) if mobile else (1366, 768)
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        try:
            if os.path.exists("/tmp/.X11-unix/X99") and not x99_alive():
                os.remove("/tmp/.X11-unix/X99")
        except OSError:
            pass
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    # Siklus 467: tanpa --user-data-dir segar — profil segar menggantung semua
    # fetch (REQ tanpa RESP); profil default sehat. Chunk scene basi dari
    # cache/SW lama ditangani blok "clear + reload" di bawah (terbukti:
    # sesudahnya a=26, canvas=True, pageerror kosong).
    p = subprocess.Popen([CHROME, "--no-sandbox",
                          f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", f"--window-size={w},{h}",
                          "--disable-dev-shm-usage", URL],
                         env=env, stdout=open("/tmp/eep_chrome.log","w"), stderr=subprocess.STDOUT)
    res = {"mode": "mobile" if mobile else "desktop",
           "console_errors": [], "page_errors": [], "init_failed": False}
    try:
        time.sleep(2)
        tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
        # siklus 467: pilih tab app yang benar (bukan about:blank sisa) —
        # target salah membuat semua evaluate mengenai halaman kosong.
        _pages = [t for t in tabs if t.get("type") == "page"
                  and "127.0.0.1:9503" in t.get("url", "")]
        ws = WS((_pages or [t for t in tabs if t.get("type") == "page"])[0]["webSocketDebuggerUrl"])
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
        cmd("Runtime.enable"); cmd("Log.enable"); cmd("Page.enable")
        # Siklus 282: landing kini default route (6230629) — paksa masuk mode
        # office jika probe mendarat di landing (__agentData tetap kosong).
        _r0 = cmd("Runtime.evaluate", expression="window.__agentData?window.__agentData.length:0",
                  returnByValue=True)
        _v0 = (((_r0 or {}).get("result") or {}).get("result") or {}).get("value")
        if _v0 in (0, None):
            cmd("Runtime.evaluate", expression="location.assign('http://127.0.0.1:9503/app/?mode=office')")
            time.sleep(3)
        if mobile:
            # Viewport HP dari awal init scene (bukan emulasi setelahnya):
            # override metrik + reload, error console tetap terkumpul di socket.
            cmd("Emulation.setDeviceMetricsOverride", width=MOBILE_W, height=MOBILE_H,
                deviceScaleFactor=MOBILE_DSF, mobile=True)
            cmd("Page.reload", ignoreCache=False)
        # Kumpulkan console/pageerror SELAMA scene init + beberapa detik hidup.
        # Bacaan non-blocking: kirim evaluate setelah 22 dtk, console menumpuk
        # di socket dan dibaca di loop cmd berikutnya (paritas e2e lain).
        time.sleep(22)
        # drain event console/pageerror yang menumpuk
        drain = mid[0]
        ws.send(json.dumps({"id": 10 ** 6, "method": "Runtime.evaluate",
                            "params": {"expression": "1", "returnByValue": True}}))
        for _ in range(4000):
            try:
                r = json.loads(ws.recv_text())
            except (socket.timeout, ConnectionError):
                break
            if not isinstance(r, dict):
                continue  # siklus 197: event malformed diabaikan
            m = r.get("method", "")
            if m == "Runtime.consoleAPICalled" and r["params"].get("type") == "error":
                for a in r["params"].get("args", []):
                    t = a.get("value") or a.get("description") or ""
                    res["console_errors"].append(str(t)[:200])
            elif m == "Runtime.exceptionThrown":
                e = r["params"].get("exceptionDetails", {})
                res["page_errors"].append(str(e.get("exception", {}).get("description", e.get("text", "")))[:200])
            elif m == "Log.entryAdded" and r["params"].get("entry", {}).get("level") == "error":
                src = r["params"]["entry"]
                if "net::ERR" not in src.get("text", ""):  # favicon dkk diabaikan
                    res["console_errors"].append(str(src.get("text", ""))[:200])
            elif r.get("id") == 10 ** 6:
                break
        res["init_failed"] = any("Scene init failed" in e for e in res["console_errors"] + res["page_errors"])
        # 3) hook inti
        r = cmd("Runtime.evaluate", expression="""JSON.stringify({
          agents: window.__agentData ? window.__agentData.length : -1,
          cam: !!window.__camCam, renderer: !!window.__renderer,
          controls: !!window.__wfsSceneControls,
          zone: window.__zoneLabels ? window.__zoneLabels.length : -1,
          wall: !!window.__wallFade })""", returnByValue=True)
        st = json.loads((((r or {}).get("result") or {}).get("result") or {}).get("value", "{}"))
        res["hooks"] = st
        res["hooks_ok"] = bool(st.get("agents", -1) > 0 and st.get("cam") and st.get("renderer")
                               and st.get("controls") and st.get("zone", -1) == 5 and st.get("wall"))
        # 4) scene hidup: gate byte (desktop 300KB / mobile 200KB) + gate PIKSEL
        #    (siklus 194, png_stats.py): warna unik >= 1500 DAN nonbg >= 4% —
        #    byte-size hanya proksi: jebakan "langit-saja" (gradien 378 KB,
        #    616 warna) lolos byte tapi DEAD piksel. Keduanya wajib lolos.
        shot = cmd("Page.captureScreenshot", format="png")
        data = base64.b64decode(((shot or {}).get("result") or {}).get("data", ""))
        open(out, "wb").write(data)
        res["shot_bytes"] = len(data)
        res["shot_ok"] = res["shot_bytes"] > (MOBILE_MIN_SHOT_BYTES if mobile else MIN_SHOT_BYTES)
        try:
            px = png_mod.png_stats(data)
            px_ok, px_why = png_mod.alive_verdict(px)
        except Exception as e:  # decode gagal = verdict DEAD (bukan crash probe)
            px, px_ok, px_why = {"err": str(e)}, False, "decode gagal"
        res["pixels"] = px
        res["pixels_ok"] = px_ok
        res["pixels_why"] = px_why
        # 5) gate mobile: dock tak menyunat tombol (kelas bug siklus 184) —
        #    label + kotak tombol terakhir dinilai LIVE dari DOM, bukan tebak.
        if mobile:
            r = cmd("Runtime.evaluate", expression="""JSON.stringify((() => {
              const dock = document.querySelector('.dock');
              if (!dock) return { err: 'no-dock' };
              const btns = Array.from(dock.querySelectorAll('.ibtn'));
              if (!btns.length) return { err: 'no-btns' };
              const d = dock.getBoundingClientRect();
              const r = btns[btns.length - 1].getBoundingClientRect();
              return { nBtn: btns.length, vw: innerWidth, vh: innerHeight,
                       dockRight: Math.round(d.right), dockBottom: Math.round(d.bottom),
                       lastRight: Math.round(r.right), lastBottom: Math.round(r.bottom) };
            })())""", returnByValue=True)
            dk = json.loads((((r or {}).get("result") or {}).get("result") or {}).get("value", "{}"))
            res["dock"] = dk
            res["dock_ok"] = (not dk.get("err")
                              and dk.get("lastRight", 9e9) <= dk.get("vw", 0) + 1
                              and dk.get("lastBottom", 9e9) <= dk.get("vh", 0) + 1
                              and dk.get("lastRight", 0) <= dk.get("dockRight", -1) + 1
                              and dk.get("lastBottom", 0) <= dk.get("dockBottom", -1) + 1)
        clean = (not res["console_errors"] and not res["page_errors"]
                 and not res["init_failed"] and res["hooks_ok"] and res["shot_ok"]
                 and res["pixels_ok"]
                 and (res.get("dock_ok", True)))
        # 6) Read-only publication health: retained chunks are not orphans to
        # delete. Only missing dependencies of current entries fail this gate.
        try:
            res["hygiene"] = published_asset_status(deploy_mod.DST_HQ)
            res["hygiene_ok"] = res["hygiene"]["ok"]
        except Exception as e:  # fail closed with bounded evidence
            res["hygiene"] = {"err": str(e)[:200]}
            res["hygiene_ok"] = False
        clean = clean and res["hygiene_ok"]
        print("E2E_ERR_PROBE:", "OK" if clean else "FAIL", json.dumps(res, ensure_ascii=False))
        sys.exit(0 if clean else 1)
    finally:
        p.terminate()
        try: p.wait(3)
        except Exception: p.kill()
        if xv: xv.terminate()


if __name__ == "__main__":
    main()
