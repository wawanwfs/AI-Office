#!/usr/bin/env python3
"""Deploy backend_live/wfs_hq_server.py → ~/wfs-hq/server.py — satu sumber kebenaran (siklus 206).

Latar belakang (audit drift siklus 206):
- backend/server_proxy.py (repo) punya hardening 2026-10-28 (_parse_content_length
  toleran + MAX_PROXY_BODY 5MB → 413) tapi TANPA fitur live (SSE stream, /app,
  /landing, /admin, /cs-widget, _proxy_bantuin, do_DELETE) → hardening tak pernah
  sampai ke produksi.
- ~/wfs-hq/server.py (produksi) punya semua fitur siklus 154-161 tapi TANPA
  hardening → int() telanjang + rfile.read(ln) tanpa cap di _proxy() dan
  _proxy_bantuin().
- backend_live/wfs_hq_server.py = SUPERSET keduanya (fitur live + hardening),
  ter-track di git, dites backend_live/test_wfs_hq_server.py (10 test) dan
  drift-gate src/__tests__/hq_server_drift.test.js.

Pemakaian:
- Tanpa argumen : CHECK saja — bandingkan live vs sumber, exit 3 bila beda (drift).
- --apply       : backup → tulis (tmp + compile-check) → restart wfs-hq → health
                  :9503 → smoke fitur (/, /app/, /wfs-api/auth 401, hardening CL, header keamanan 212
                  malformed → proxy jalan, CL raksasa → 413) → gagal → AUTO-ROLLBACK.
- --rollback    : pulihkan backup TERBARU lalu restart.

SOP: edit backend_live/wfs_hq_server.py di repo, commit, lalu jalankan
`python3 scripts/apply_wfs_hq_server.py --apply`. JANGAN mengedit
~/wfs-hq/server.py langsung — drift gate vitest akan FAIL.
"""
import argparse
import hashlib
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

SRC = pathlib.Path(__file__).resolve().parent.parent / "backend_live" / "wfs_hq_server.py"
DST = pathlib.Path("/home/agentuser/wfs-hq/server.py")
BACKUPS = pathlib.Path("/home/agentuser/wfs-hq/backups")
TMP = pathlib.Path("/home/agentuser/wfs-hq/.server.py.compiledcheck")
TOKEN_FILE = pathlib.Path("/home/agentuser/wfs-hq/.wfs_ui_token")
BASE = "http://127.0.0.1:9503"


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def health(timeout=4):
    """Health :9503 — GET / 200 dan injeksi token UI ada di HTML."""
    with urllib.request.urlopen(BASE + "/", timeout=timeout) as r:
        body = r.read()
    return r.status == 200 and b"wfs-ui-token" in body


def get(path, timeout=5):
    req = urllib.request.Request(BASE + path)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def post(path, body=b"{}", headers=None, timeout=8):
    req = urllib.request.Request(BASE + path, data=body, method="POST")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()


def smoke():
    """Verifikasi fitur live + hardening pada server yang baru restart.

    Return (ok, [reason...]) — satu saja gagal = rollback.
    """
    why = []
    # 1. Health dasar: index + token injeksi.
    try:
        if not health():
            why.append("health / gagal (200+token)")
    except Exception as e:
        why.append(f"health / exc: {e}")
    # 2. /app/ hidup (fitur siklus 159).
    try:
        st, _ = get("/app/")
        if st != 200:
            why.append(f"/app/ status {st}")
    except Exception as e:
        why.append(f"/app/ exc: {e}")
    # 3. Proxy gateway GET: /wfs-api/agents/status harus 200 (gateway jalan).
    try:
        st, body = get("/wfs-api/agents/status")
        if st != 200:
            why.append(f"/wfs-api/agents/status status {st} body {body[:80]!r}")
    except Exception as e:
        why.append(f"/wfs-api/agents/status exc: {e}")
    # 4. POST tanpa token → 401 (otentikasi proxy utuh).
    try:
        st, body = post("/wfs-api/__smoke206")
        if st != 401:
            why.append(f"POST tanpa token status {st} (harap 401)")
    except Exception as e:
        why.append(f"POST tanpa token exc: {e}")
    # 5. Hardening live: POST + token + Content-Length malformed "abc" →
    #    request diteruskan (gateway balas JSON apa pun kodenya); dulu ValueError
    #    tidak tertangani → koneksi mati/500.
    try:
        tok = TOKEN_FILE.read_text().strip()
        st, body = post("/wfs-api/__smoke206cl", b"x",
                        headers={"X-WFS-Token": tok, "Content-Length": "abc"})
        if st is None:
            why.append(f"POST CL-malformed koneksi mati (hardening tidak hidup): {body[:120]!r}")
        elif st == 500:
            why.append(f"POST CL-malformed 500: {body[:120]!r}")
    except Exception as e:
        why.append(f"POST CL-malformed exc: {e}")
    # 6. Hardening cap: POST + token + Content-Length raksasa → 413 JSON,
    #    TANPA membaca body ke RAM (dulu: baca 1TB → gantung/OOM).
    try:
        tok = TOKEN_FILE.read_text().strip()
        st, body = post("/wfs-api/__smoke206cap", b"x",
                        headers={"X-WFS-Token": tok, "Content-Length": str(5 * 1024 * 1024 + 1)})
        if st != 413 or b"payload terlalu besar" not in body:
            why.append(f"POST CL-raksasa status {st} body {body[:80]!r} (harap 413)")
    except Exception as e:
        why.append(f"POST CL-raksasa exc: {e}")
    # 7. Siklus 212: header keamanan di SEMUA respons (diserap dari hq_proxy —
    #    fitur repo yang dulu TIDAK PERNAH sampai produksi).
    try:
        req = urllib.request.Request(BASE + "/")
        with urllib.request.urlopen(req, timeout=5) as r:
            hdrs = {k.lower(): v for k, v in r.headers.items()}
        if hdrs.get("x-content-type-options") != "nosniff" or \
                hdrs.get("referrer-policy") != "same-origin":
            why.append(f"security headers hilang: { {k: hdrs.get(k) for k in ('x-content-type-options','referrer-policy')} }")
    except Exception as e:
        why.append(f"security headers exc: {e}")
    # 8. SIKLUS 222a: proxy admin TANPA Access-Control-Allow-Origin lagi —
    #    konsumen semuanya same-origin; ACAO * hanya memperluas permukaan
    #    baca lintas-origin. Regresi (header kembali) = rollback.
    try:
        req = urllib.request.Request(BASE + "/api/admin/__smoke222")
        with urllib.request.urlopen(req, timeout=8) as r:
            acao = r.headers.get("Access-Control-Allow-Origin")
        if acao is not None:
            why.append(f"ACAO wildcard kembali muncul di proxy admin: {acao!r}")
    except urllib.error.HTTPError as e:
        # Status apa pun (termasuk 401/404) sah — yang dicek hanya header CORS.
        if e.headers.get("Access-Control-Allow-Origin") is not None:
            why.append(f"ACAO wildcard kembali muncul di proxy admin: {e.headers.get('Access-Control-Allow-Origin')!r}")
    except Exception as e:
        why.append(f"smoke ACAO exc: {e}")
    # 9. SIKLUS 222b: HEAD /, /app/, /landing harus 200 (konsisten GET) —
    #    dulu 404; monitor uptime berbasis HEAD menerima jawaban palsu.
    for hp in ("/", "/app/", "/landing"):
        try:
            req = urllib.request.Request(BASE + hp, method="HEAD")
            with urllib.request.urlopen(req, timeout=5) as r:
                st, ln = r.status, r.headers.get("Content-Length")
            if st != 200:
                why.append(f"HEAD {hp} status {st} (harap 200, konsisten GET)")
            elif not ln or int(ln) <= 0:
                why.append(f"HEAD {hp} Content-Length {ln!r} (harap panjang GET)")
        except Exception as e:
            why.append(f"HEAD {hp} exc: {e}")
    # 10. SIKLUS 223: HEAD aset statis = metadata GET — cache policy immutable
    #     (bukan no-store stdlib) dan, bila client kirim Accept-Encoding gzip,
    #     Content-Encoding: gzip + Content-Length = payload TERKOMPRES
    #     (dulu CL = ukuran mentah file). Aset dipilih dari GET /app/.
    try:
        app_html = get("/app/")[1].decode("utf-8", "replace")
        m = re.search(r'/assets/[A-Za-z0-9._-]+\.js', app_html)
        asset = m.group(0) if m else None
        if not asset:
            why.append("smoke 223: tidak menemukan aset JS di /app/")
        else:
            req = urllib.request.Request(BASE + asset, method="HEAD",
                                         headers={"Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=5) as r:
                h = {k.lower(): v for k, v in r.headers.items()}
            if r.status != 200:
                why.append(f"HEAD {asset} status {r.status}")
            if h.get("cache-control") != "public, max-age=31536000, immutable":
                why.append(f"HEAD {asset} cache-control {h.get('cache-control')!r} "
                           f"(harap immutable — stdlib no-store berarti regresi)")
            if h.get("content-encoding") != "gzip":
                why.append(f"HEAD {asset} content-encoding {h.get('content-encoding')!r} (harap gzip)")
            elif not h.get("content-length") or int(h["content-length"]) <= 0:
                why.append(f"HEAD {asset} content-length {h.get('content-length')!r}")
    except urllib.error.HTTPError as e:
        why.append(f"HEAD aset statis HTTP {e.code}")
    except Exception as e:
        why.append(f"HEAD aset statis exc: {e}")
    # 11. SIKLUS 224: HEAD jalur proxy mirror GET — dulu 404 stdlib palsu:
    #     HEAD /admin/ (GET = 200 HTML) dan HEAD /api/admin/stats (GET = 401
    #     JSON tanpa CT). Status wajib sama GET; CT + CL wajib ada.
    try:
        import http.client as _hc
        for pp, want in (("/admin/", 200), ("/api/admin/stats", 401)):
            c = _hc.HTTPConnection("127.0.0.1", 9503, timeout=8)
            c.request("HEAD", pp)
            r = c.getresponse()
            r.read()
            ct, cl = r.getheader("Content-Type"), r.getheader("Content-Length")
            c.close()
            if r.status != want:
                why.append(f"HEAD {pp} status {r.status} (harap {want}, konsisten GET)")
            elif not ct:
                why.append(f"HEAD {pp} tanpa Content-Type (stdlib 404 palsu?)")
            elif not cl or int(cl) <= 0:
                why.append(f"HEAD {pp} Content-Length {cl!r} (harap panjang GET)")
    except Exception as e:
        why.append(f"HEAD jalur proxy exc: {e}")
    return (not why), why


def latest_backup():
    cands = sorted(BACKUPS.glob("server.py.bak-*")) if BACKUPS.is_dir() else []
    return cands[-1] if cands else None


def restart_and_check():
    r = sh("sudo", "systemctl", "restart", "wfs-hq")
    if r.returncode != 0:
        return False, [f"systemctl restart rc={r.returncode} {r.stderr[-200:]}"]
    for _ in range(20):
        time.sleep(0.5)
        try:
            if health():
                return True, []
        except Exception:
            pass
    return False, ["health tidak hijau 10 dtk pasca restart"]


def do_apply():
    if not SRC.is_file():
        print(f"SUMBER TIDAK ADA: {SRC}")
        return 2
    if sha(SRC) == sha(DST):
        ok, why = smoke()
        print("live == sumber (idempoten); smoke:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    BACKUPS.mkdir(exist_ok=True)
    bak = BACKUPS / f"server.py.bak-{int(time.time())}"
    shutil.copy2(DST, bak)
    print("backup:", bak)
    # Compile-check SEBELUM menyentuh produksi.
    TMP.write_bytes(SRC.read_bytes())
    r = sh(sys.executable, "-m", "py_compile", str(TMP))
    TMP.unlink(missing_ok=True)
    if r.returncode != 0:
        print("compile-check GAGAL — deploy dibatalkan:", r.stderr[-300:])
        return 2
    shutil.copy2(SRC, DST)
    ok, why = restart_and_check()
    if not ok:
        print("pasca-restart GAGAL — rollback:", why)
        _rollback_to(bak)
        return 2
    ok, why = smoke()
    if not ok:
        print("smoke GAGAL — rollback:", why)
        _rollback_to(bak)
        return 2
    print("DEPLOY OK — live == sumber", sha(SRC)[:12], "; smoke 11/11 (keamanan 212 + CORS/HEAD 222 + HEAD aset 223 + HEAD proxy 224)")
    return 0


def _rollback_to(bak):
    if bak and bak.is_file():
        shutil.copy2(bak, DST)
        ok, why = restart_and_check()
        print("rollback:", "OK" if ok else f"GAGAL {why}")


def do_rollback():
    bak = latest_backup()
    if not bak:
        print("tidak ada backup")
        return 2
    print("rollback ke:", bak)
    _rollback_to(bak)
    return 0


def do_check():
    if not DST.is_file():
        print("live TIDAK ADA:", DST)
        return 2
    same = sha(SRC) == sha(DST)
    print("sumber :", sha(SRC)[:12], SRC)
    print("live   :", sha(DST)[:12], DST)
    if same:
        ok, why = smoke()
        print("IDENTIK; smoke 11/11:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    print("DRIFT: live != sumber — jalankan scripts/apply_wfs_hq_server.py --apply")
    return 3


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    args = ap.parse_args()
    if args.rollback:
        sys.exit(do_rollback())
    if args.apply:
        sys.exit(do_apply())
    sys.exit(do_check())
