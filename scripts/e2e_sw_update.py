#!/usr/bin/env python3
"""E2E siklus 192: alur pembaruan PWA (mode prompt) — banner + Muat ulang.

Skenario mengikuti perjalanan pengguna nyata, di browser CDP nyata (Xvfb :99,
transport salinan e2e_lazy_modals.py — fixed-delay dari Python):
  TES1  Kunjungan pertama (profil sekali-pakai): SW terpasang aktif, TIDAK ada
        waiting, TIDAK ada banner (jebakan #2 — install pertama tak menaikkan).
  TES1b Reload → halaman kini TERKONTROL SW (prompt-mode tanpa clientsClaim:
        kontrol baru efektif setelah reload).
  TES2  Versi baru: register skrip fake berbeda utk scope yang sama (= update
        nyata: install → statechange installed → controller ada) → banner
        'Versi baru kantor tersedia' MUNCUL (jebakan #1 — updatefound jalan).
  TES3  Klik 'Muat ulang' → postMessage SKIP_WAITING → fake aktif →
        controllerchange → app me-reload diri → controller baru = skrip fake.
  TES4  0 console/page error sepanjang seluruh alur (termasuk reload).
  TES5  Hooks inti utuh pasca reload (26 agen) — scene tak terganggu.
  Cleanup: SW di-unregister + file fake dihapus (profil sekali-pakai = tanpa
        efek ke pengguna nyata; sw.js produksi TIDAK disentuh).
Exit non-zero bila ada bukti yang gagal.
"""
# Siklus 279 (census lanjutan kelas b1 siklus 200 — probe ini TERTINGGAL dari
# sensus 14-probe): dulu `main()` telanjang + `cmd()` tanpa deadline total —
# reply CDP hilang saat reload (context destroyed) membuat recv_text retry
# 30×10 dtk = 300 dtk PER evaluate; TES3 (20 poll × 1.5 dtk + klik tiap poll)
# bisa menggantung >5 menit → cron timeout 124 tanpa verdict (terukur live 3×
# beruntun di siklus ini: PROG berhenti di tes2, exit=124 di 170–280 dtk).
# Fix kelas b1: deadline TOTAL 60 dtk di cmd() — `recv_text` dipanggil dengan
# timeout sisa (`min(10, remaining)`), `remaining <= 0` → TimeoutError jujur
# (ditangkap jalur poll TES3 yang sudah try/except — kriteria inti TIDAK
# berubah); verdict dipropagasi `sys.exit(main())`.
import base64, json, os, shutil, socket, struct, subprocess, sys, time, urllib.request
from urllib.parse import urlparse

CHROME = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9495
URL = "http://127.0.0.1:9503/app/"
PROFILE = "/tmp/wfs-e2e-swu-profile"
FAKE_SRC = os.path.expanduser("~/wfs-hq/e2e-sw-fake.js")
FAKE_URL = "/e2e-sw-fake.js"
FAKE_JS = """// Fake SW e2e siklus 192 — perilaku persis sw.js mode prompt:
// menunggu sampai pesan SKIP_WAITING (TIDAK auto-skip di install).
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', () => {})  // passthrough — jangan ganggu app
"""

WS_TIMEOUT_S = 60  # siklus 197: tanpa timeout koneksi bisa menggantung tanpa batas


class WS:
    def __init__(s, u):
        pr = urlparse(u)
        s.sock = socket.create_connection((pr.hostname, pr.port), timeout=WS_TIMEOUT_S)
        s.sock.settimeout(10)  # berlaku SEJAK handshake — pelajaran 183
        s.sock.sendall((f"GET {pr.path} HTTP/1.1\r\nHost: {pr.hostname}:{pr.port}\r\n"
                        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {base64.b64encode(os.urandom(16)).decode()}\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
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
                if not c: raise ConnectionResetError()
                b += c
            return b
        def frame():
            hdr = rx(2); op = hdr[0] & 0xf; n = hdr[1] & 0x7f
            if n == 126: n = struct.unpack(">H", rx(2))[0]
            elif n == 127: n = struct.unpack(">Q", rx(8))[0]
            return op, rx(n)
        op, d = frame()
        while op == 0:
            op, d2 = frame(); d += d2
            if op != 0: break
        return d.decode("utf-8", "replace")
    def recv_text(s):
        return s.recv()

def x99_alive():
    return subprocess.run(["xdpyinfo", "-display", ":99"], timeout=10,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

def main():
    shutil.rmtree(PROFILE, ignore_errors=True)
    with open(FAKE_SRC, "w") as f:
        f.write(FAKE_JS)
    env = dict(os.environ, DISPLAY=":99")
    xv = None
    if not x99_alive():
        xv = subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x768x24"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    p = subprocess.Popen([CHROME, "--no-sandbox", f"--remote-debugging-port={PORT}",
                          "--enable-unsafe-swiftshader", "--window-size=1366,768",
                          "--disable-dev-shm-usage", f"--user-data-dir={PROFILE}", URL],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {"errors": [], "tests": {}}
    try:
        tabs = []
        for _ in range(20):
            time.sleep(1)
            try:
                tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=5).read())
                pages = [t for t in tabs if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
                if pages:
                    tabs = pages
                    break
            except Exception:
                continue
        if not tabs:
            print("E2E_SW_UPDATE: FAIL {\"error\": \"chrome-no-page-tab\"}", flush=True)
            sys.exit(1)
        print("PROG: chrome-ready", flush=True)
        time.sleep(2)
        ws = WS(tabs[0]["webSocketDebuggerUrl"])
        mid = [0]
        def on_exc(params):
            d = params.get("exceptionDetails") or {}
            res["errors"].append(str(d.get("exception", {}).get("description") or d.get("text")))

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            deadline = time.time() + 60  # siklus 279: deadline total kelas b1 200
            for _ in range(60):
                remaining = deadline - time.time()
                if remaining <= 0:
                    raise TimeoutError(f"no CDP reply dalam 60 dtk: {method}")
                try:
                    ws.sock.settimeout(min(10, remaining))
                    r = json.loads(ws.recv_text())
                except (socket.timeout, TimeoutError):
                    continue
                except (ConnectionError, OSError):
                    continue
                if not isinstance(r, dict): continue  # siklus 197: event malformed diabaikan
                if r.get("method") == "Runtime.exceptionThrown":
                    on_exc(r.get("params") or {})
                if r.get("id") == mid[0]: return r
            raise TimeoutError(f"no CDP reply: {method}")

        def ev(expr, await_p=False):
            try:
                r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                        awaitPromise=await_p)
            except TimeoutError:
                time.sleep(2)
                try:
                    r = cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                            awaitPromise=await_p)
                except TimeoutError:
                    return None
            v = ((r.get("result") or {}).get("result") or {}).get("value")
            try: return json.loads(v) if isinstance(v, str) else v
            except Exception: return v

        cmd("Runtime.enable"); cmd("Page.enable")
        # Siklus 289: URL /app/ TANPA ?mode=office → profil sekali-pakai
        # (localStorage kosong) default viewMode '2d' (Dashboard) — scene 3D
        # tidak pernah init, __agentData tidak pernah diisi (tes5 agents=0).
        # Fallback sama dgn siklus 281: paksa entry /app/?mode=office.
        if ev("window.__agentData?window.__agentData.length:0") in (0, None):
            ev("location.assign('http://127.0.0.1:9503/app/?mode=office')")
            time.sleep(3)
            cmd("Runtime.enable")
        # Pemungut exception sederhana: interleave recv di antara cmd via polling
        def drain_events(sec):
            end = time.time() + sec
            ws.sock.settimeout(0.3)
            while time.time() < end:
                try:
                    r = json.loads(ws.recv_text())
                    if not isinstance(r, dict): continue
                    if r.get("method") == "Runtime.exceptionThrown":
                        on_exc(r.get("params") or {})
                except (socket.timeout, OSError):
                    pass
                except Exception:
                    pass
            ws.sock.settimeout(10)

        time.sleep(18)  # scene init (SwiftShader lambat)
        print("PROG: settled-1", flush=True)

        # TES1: kunjungan pertama — SW aktif, tanpa waiting, tanpa banner
        t1 = ev("""(async () => {
          const rs = await navigator.serviceWorker.getRegistrations()
          const r = rs[0]
          return JSON.stringify({
            count: rs.length,
            scope: r ? r.scope : null,
            active: !!(r && r.active),
            waiting: !!(r && r.waiting),
            controlled: !!navigator.serviceWorker.controller,
            banner: !!document.querySelector('[data-testid="sw-update-banner"]')
          })
        })()""", await_p=True)
        res["tests"]["tes1_first_visit"] = t1
        print("PROG: tes1", flush=True)
        ok1 = (t1 or {}).get("count") == 1 and (t1 or {}).get("active") \
            and not (t1 or {}).get("waiting") and not (t1 or {}).get("banner")

        # TES1b: reload → halaman terkontrol (prompt-mode: kontrol efektif pasca reload)
        # Siklus 279 (bukti diagnostik /tmp/swdiag10): PASCA-NAVIGASI Runtime domain
        # di-reset — Runtime.evaluate TANPA Runtime.enable ulang tak pernah dibalas
        # (try1/try2 None; setelah enable ulang → reply normal). Dulu ini penyebab
        # penggantungan TES2/TES3 bila reply hilang juga. Kontrak: Page.reload +
        # Runtime.enable ulang setiap kali setelah navigasi.
        cmd("Page.reload")
        cmd("Runtime.enable")
        time.sleep(15)
        t1b = ev("JSON.stringify({ controlled: !!navigator.serviceWorker.controller,"
                 "  banner: !!document.querySelector('[data-testid=\"sw-update-banner\"]') })")
        res["tests"]["tes1b_controlled"] = t1b
        print("PROG: tes1b", flush=True)
        ok1b = bool((t1b or {}).get("controlled")) and not (t1b or {}).get("banner")

        # TES2: versi baru (skrip fake, scope sama) → banner naik
        ev(f"navigator.serviceWorker.register('{FAKE_URL}', {{ scope: '/' }}); 1")
        t2 = {"ok": False}
        for i in range(10):
            time.sleep(1.5)
            t2 = ev("JSON.stringify({ banner: !!document.querySelector('[data-testid=\"sw-update-banner\"]'),"
                    "  txt: (document.querySelector('.sw-update-msg')||{}).textContent || null })") or {}
            if t2.get("banner"):
                t2["ok"] = True; t2["ms"] = (i + 1) * 1500
                break
        res["tests"]["tes2_banner"] = t2
        print("PROG: tes2", flush=True)
        ok2 = bool(t2.get("ok")) and (t2 or {}).get("txt") == "Versi baru kantor tersedia"

        # TES3: klik 'Muat ulang' → SKIP_WAITING → aktivasi → controllerchange → reload
        # Hardening 193 (flaky ~1/run di 192): tiga vektor ditutup, kriteria sukses
        # TIDAK diubah (ctrlUrl = skrip fake):
        #  v1 reply CDP bisa hilang saat navigasi reload (evaluate awaitPromise vs
        #     context destroyed) → TimeoutError membunuh seluruh run → poll body
        #     dibungkus try/except; bacaan gagal = inkonklusif, loop lanjut.
        #  v2 klik dibuang diam-diam ('no-btn' tak tercatat) → hasil klik dicatat
        #     + klik diulang sampai terkonfirmasi 'clicked' (maks 8 poll / 12 dtk;
        #     applyUpdate tanpa reg.waiting = no-op aman, idempoten).
        #  v3 bacaan transien pra-claim (ctrl masih sw.js) adalah NORMAL → loop
        #     hanya sukses saat ctrlUrl fake yang bertahan pasca claim+reload.
        # Pola fixed-delay 182/183 dipertahankan (sleep di Python, tanpa polling
        # loop di evaluate). Setiap poll dicatat (t3["polls"]) — auditability pola
        # mgMin 188: flake berikutnya terdiagnosis dari output, bukan teori.
        # Selector tanpa tanda kutip ([data-testid=...]) setara — bebas escape.
        CLICK_JS = """(() => { const b = [...document.querySelectorAll('.sw-update button')]
          .find(x => x.textContent.trim() === 'Muat ulang')
          if (!b) return 'no-btn'; b.click(); return 'clicked' })()"""
        T3_JS = """(async () => {
          const r = (await navigator.serviceWorker.getRegistrations())[0]
          const url = r && r.active ? r.active.scriptURL : null
          return JSON.stringify({
            ctrlUrl: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
            activeUrl: url,
            banner: !!document.querySelector('[data-testid=sw-update-banner]')
          })
        })()"""
        t3 = {"ok": False}
        clicks, last_click, polls = 0, None, []
        for i in range(20):
            time.sleep(1.5)
            if clicks == 0 and i < 18:
                try:
                    last_click = ev(CLICK_JS)
                except Exception as e:
                    last_click = "ev-err:" + type(e).__name__
                if last_click == "clicked":
                    clicks += 1
            try:
                r3 = ev(T3_JS, await_p=True) or {}
            except Exception as e:
                r3 = {"ev_err": type(e).__name__}
            polls.append(str(r3.get("ctrlUrl") or r3.get("ev_err") or "?"))
            if str(r3.get("ctrlUrl", "")).endswith("e2e-sw-fake.js"):
                t3["ok"] = True; t3["ms"] = (i + 1) * 1500
                t3["ctrlUrl"] = r3.get("ctrlUrl")
                break
        t3["clicks"] = clicks; t3["last_click"] = last_click; t3["polls"] = polls
        res["tests"]["tes3_reload_to_new"] = t3
        print("PROG: tes3", flush=True)
        ok3 = bool(t3.get("ok"))

        # TES4+TES5: pasca reload — scene hidup (hooks 26) + ringkas error
        time.sleep(15)
        # Hardening 193: TES3 bisa sukses PERSIS di jendela navigasi (claim
        # mendahului reload) → evaluate di sini bisa kehilangan reply (context
        # destroyed) → crash mematikan run padahal alur benar. Satu retry
        # setelah 5 dtk; bacaan tetap gagal = FAIL bersih, bukan traceback.
        t5 = None
        for attempt in range(2):
            try:
                t5 = ev("""(async () => {
                  const t0 = performance.now()
                  let n = 0, path = location.pathname
                  while (performance.now() - t0 < 10000) {
                    n = (window.__agentData || []).length
                    path = location.pathname
                    if (n > 0) break
                    await new Promise(r => setTimeout(r, 500))
                  }
                  return JSON.stringify({ agents: n, path,
                    banner2: !!document.querySelector('[data-testid=sw-update-banner]') })
                })()""", await_p=True)
                break
            except Exception:
                if attempt == 0:
                    time.sleep(5)
        res["tests"]["tes5_hooks_after"] = t5
        print("PROG: tes5", flush=True)
        ok5 = (t5 or {}).get("agents") == 26

        drain_events(2)
        res["tests"]["tes4_errors"] = {"count": len(res["errors"]), "first": res["errors"][:2]}
        ok4 = len(res["errors"]) == 0

        # Cleanup: unregister + hapus fake (profil sekali-pakai; produksi utuh)
        ev("(async () => { const rs = await navigator.serviceWorker.getRegistrations();"
           " await Promise.all(rs.map(r => r.unregister())); return 'cleaned' })()", await_p=True)

        verdict = all([ok1, ok1b, ok2, ok3, ok4, ok5])
        print("E2E_SW_UPDATE:", "OK" if verdict else "FAIL",
              json.dumps({"tes1": ok1, "tes1b": ok1b, "tes2": ok2, "tes3": ok3,
                          "tes4_errors": len(res["errors"]), "tes5_agents": (t5 or {}).get("agents")},
                         ensure_ascii=False), flush=True)
        if not verdict:
            # Hardening 193b: diagnosis dari DATA (pola mgMin 188), bukan teori —
            # detail tes3 (clicks/last_click/polls) + tes5 tercetak saat FAIL.
            print("E2E_SW_UPDATE_DETAIL:", json.dumps(
                {"tes3": res["tests"].get("tes3_reload_to_new"),
                 "tes2": res["tests"].get("tes2_banner"),
                 "tes5": res["tests"].get("tes5_hooks_after"),
                 "errors": res["errors"][:3]}, ensure_ascii=False), flush=True)
        return 0 if verdict else 1
    finally:
        try: p.kill()
        except Exception: pass
        shutil.rmtree(PROFILE, ignore_errors=True)
        try: os.remove(FAKE_SRC)
        except Exception: pass
if __name__ == "__main__":
    sys.exit(main())