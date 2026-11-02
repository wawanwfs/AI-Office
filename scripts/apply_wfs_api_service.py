#!/usr/bin/env python3
"""Deploy backend_live/wfs_api_service.py -> ~/wfs-hq/api_service.py — satu sumber kebenaran (siklus 207).

Pola apply_wfs_hq_server.py (siklus 206). Latar audit drift siklus 207:
- backend/api_service.py (repo) punya hardening 2026-10-28 (_content_length
  toleran + MAX_API_BODY 5MB -> 413) TAPI TANPA fitur live DELETE tasks/reset.
- ~/wfs-hq/api_service.py (produksi) punya fitur DELETE TANPA hardening.
- backend_live/wfs_api_service.py = SUPERSET keduanya; test superset:
  backend_live/test_wfs_api_service.py; drift-gate:
  src/__tests__/hq_api_service_drift.test.js.

Pemakaian:
- Tanpa argumen : CHECK saja — bandingkan live vs sumber, exit 3 bila beda (drift).
- --apply       : backup -> tulis (tmp + compile-check) -> restart wfs-hq ->
                  health :9503 -> smoke fitur (GET /api/agents 200, GET
                  /api/dashboard/stats 200, POST CL "abc" koneksi hidup,
                  POST CL raksasa -> 413 tanpa baca RAM) -> gagal -> AUTO-ROLLBACK.
- --rollback    : pulihkan backup TERBARU lalu restart.

SOP: edit backend_live/wfs_api_service.py di repo, commit, lalu jalankan
`python3 scripts/apply_wfs_api_service.py --apply`. JANGAN mengedit
~/wfs-hq/api_service.py langsung — drift gate vitest akan FAIL.

Catatan: smoke hardening HTTP murni (tanpa chrome). CL "abc": server lama
(int() telanjang) memutus koneksi = gagal; superset meneruskan body={}
(lalu 404 path smoke) = koneksi hidup. CL raksasa: superset 413 SEBELUM
read(ln) — bukti cap tidak membaca RAM.
"""
import argparse
import hashlib
import pathlib
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

SRC = pathlib.Path(__file__).resolve().parent.parent / "backend_live" / "wfs_api_service.py"
DST = pathlib.Path("/home/agentuser/wfs-hq/api_service.py")
BACKUPS = pathlib.Path("/home/agentuser/wfs-hq/backups")
TMP = pathlib.Path("/home/agentuser/wfs-hq/.api_service.compiledcheck")
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


def ui_token():
    """SIKLUS 218: token UI untuk smoke POST/DELETE (gerbang token legacy /api/*)."""
    return TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else ""


def post_raw(path, body=b"x", cl_header=None, timeout=6, token=None):
    """POST HTTP murni dgn Content-Length yang KITA kontrol (bisa malformed).

    Return (status|None, body) — status None = koneksi mati/timeout.
    SIKLUS 218: header X-WFS-Token opsional — smoke hardening wajib pakai
    token sah agar menguji jalur hardening, bukan ditolak 401 di gerbang.
    """
    try:
        s = socket.create_connection(("127.0.0.1", 9503), timeout=timeout)
        s.settimeout(timeout)
        hdrs = [
            f"POST {path} HTTP/1.1",
            "Host: 127.0.0.1:9503",
            "Connection: close",
        ]
        if token:
            hdrs.append(f"X-WFS-Token: {token}")
        if cl_header is not None:
            hdrs.append(f"Content-Length: {cl_header}")
        else:
            hdrs.append(f"Content-Length: {len(body)}")
        req = ("\r\n".join(hdrs) + "\r\n\r\n").encode() + body
        s.sendall(req)
        buf = b""
        try:
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                buf += chunk
                if len(buf) > 65536:
                    break
        except socket.timeout:
            pass
        s.close()
        if not buf:
            return None, b""
        line = buf.split(b"\r\n", 1)[0].decode("latin-1")
        parts = line.split(" ")
        return (int(parts[1]) if len(parts) > 1 else None), buf
    except Exception as e:
        return None, str(e).encode()


def smoke():
    """Verifikasi fitur + hardening api_service pada server yang baru restart.

    Return (ok, [reason...]) — satu saja gagal = rollback.
    """
    why = []
    # 1. Health dasar: index + token injeksi.
    try:
        if not health():
            why.append("health / gagal (200+token)")
    except Exception as e:
        why.append(f"health / exc: {e}")
    # 2. GET /api/agents 200 (REST API jalan; tidak menyentuh task engine).
    try:
        st, body = get("/api/agents")
        if st != 200 or b'"agents"' not in body:
            why.append(f"/api/agents status {st} body {body[:80]!r}")
    except Exception as e:
        why.append(f"/api/agents exc: {e}")
    # 3. GET /api/dashboard/stats 200.
    try:
        st, body = get("/api/dashboard/stats")
        if st != 200:
            why.append(f"/api/dashboard/stats status {st}")
    except Exception as e:
        why.append(f"/api/dashboard/stats exc: {e}")
    # 4. Hardening live: POST + Content-Length "abc" -> handler TIDAK mati:
    #    koneksi tetap hidup (superset parse toleran -> body={} -> 404 path
    #    smoke). Server LAMA: ValueError int() -> koneksi putus.
    #    SIKLUS 218: kirim token sah — poin ini menguji hardening CL, bukan
    #    gerbang token (tanpa token kini 401 sebelum jalur hardening).
    TOK = ui_token()
    try:
        st, body = post_raw("/api/__smoke207cl", cl_header="abc", token=TOK)
        if st is None:
            why.append(f"POST CL-malformed koneksi mati (hardening tidak hidup): {body[:120]!r}")
        elif st == 500:
            why.append(f"POST CL-malformed 500: {body[:120]!r}")
        elif st == 401:
            why.append("POST CL-malformed 401 — gerbang token 218 menolak smoke (token salah/hilang)")
    except Exception as e:
        why.append(f"POST CL-malformed exc: {e}")
    # 5. Hardening cap: POST + Content-Length raksasa -> 413 JSON TANPA
    #    membaca body ke RAM (dulu: read(1TB) -> gantung/OOM).
    try:
        st, body = post_raw("/api/__smoke207cap", cl_header=str(5 * 1024 * 1024 + 1), token=TOK)
        if st != 413 or b"payload terlalu besar" not in body:
            why.append(f"POST CL-raksasa status {st} (harap 413): {body[:80]!r}")
    except Exception as e:
        why.append(f"POST CL-raksasa exc: {e}")
    # 6. DELETE path yang TIDAK match tak boleh merusak data (404 handler
    #    produksi menangkap do_DELETE -> handle_api_request False).
    #    SIKLUS 218: token sah via header standar (urllib) — dulu tanpa token.
    try:
        req = urllib.request.Request(BASE + "/api/__smoke207del", method="DELETE",
                                     headers={"X-WFS-Token": TOK} if TOK else {})
        with urllib.request.urlopen(req, timeout=5) as r:
            st = r.status
    except urllib.error.HTTPError as e:
        st = e.code
    except Exception as e:
        why.append(f"DELETE smoke exc: {e}")
        st = None
    if st not in (200, 404):
        why.append(f"DELETE path tidak-dikenal status {st} (harap 200/404)")
    return (not why), why


def latest_backup():
    cands = sorted(BACKUPS.glob("api_service.py.bak-*")) if BACKUPS.is_dir() else []
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
    bak = BACKUPS / f"api_service.py.bak-{int(time.time())}"
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
    print("DEPLOY OK — live == sumber", sha(SRC)[:12], "; smoke 6/6")
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
        print("IDENTIK; smoke:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    print("DRIFT: live != sumber — jalankan scripts/apply_wfs_api_service.py --apply")
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
