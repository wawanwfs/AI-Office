#!/usr/bin/env python3
"""Deploy backend_live/wfs_server.py → ~/wfs-office/server.py — satu sumber kebenaran (siklus 209).

Pola apply_wfs_tasks.py (siklus 208) / apply_wfs_hq_server.py (206). Latar audit
drift siklus 209 (drift ekstrem dua arah, terbesar):
- backend/server.py (repo, 972 baris) = generasi hardened (approval-gate,
  pause PERSISTEN via engine, _schedule claim fcntl, parser /proc toleran,
  workspace hardening) TAPI TANPA fitur live (env WFS_AI_* default openai,
  tanpa router wfs_events/sh_console/dashboard_stats, root static).
- ~/wfs-office/server.py (produksi :8787, 484 baris) = fitur-rich live
  (~/.hermes/.env, ai-cs Bantuin AI, redirect :9503, routers live) TAPI pause
  in-memory hilang saat restart + TANPA approval-gate/pause-persisten di
  server + parser /proc telanjang.
- backend_live/wfs_server.py = SUPERSET keduanya (fitur live eksak + hardening
  hidup + mode ganda guarded database.py).

Pemakaian:
- Tanpa argumen : CHECK saja — bandingkan live vs sumber, exit 3 bila beda (drift).
- --apply       : backup -> tulis (tmp + compile-check) -> restart wfs-office ->
                  health :8787 -> smoke 2 fase (HTTP murni) -> gagal -> AUTO-ROLLBACK.
- --rollback    : pulihkan backup TERBARU lalu restart.

SOP: edit backend_live/wfs_server.py di repo, commit, lalu jalankan
`python3 scripts/apply_wfs_server.py --apply`. JANGAN mengedit
~/wfs-office/server.py langsung — drift gate vitest akan FAIL.

Smoke (HTTP murni, tanpa chrome; TIDAK menyentuh mesin berbayar):
1. Prakondisi: pause persisten ON via DB engine_state (kunci pengaman smoke).
2. GET /api/health         200 + "ok"
3. GET /api/status         200 + "agents"
4. GET /api/agents         200
5. [fase-2] GET /api/tasks/paused HARUS {"paused": true} — pause PERSISTEN dari
   DB dibaca server via taskengine.is_paused() (server lama: in-memory false ->
   smoke GAGAL -> rollback; bukti FIX #2 via HTTP).
6. [fase-2] POST /api/tasks/1/run saat paused -> 409 (ditolak SEBELUM jadwal;
   server lama: 200 ok {"started":1} -> smoke GAGAL -> rollback). Task 1 sengaja
   di luar id nyata (25-28).
7. [fase-2] GET / -> 307 redirect :9503 (fitur live root) + /api/sh/overview 200
   + /api/orders 200 (routers live hidup).
"""
import argparse
import hashlib
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

SRC = pathlib.Path(__file__).resolve().parent.parent / "backend_live" / "wfs_server.py"
DST = pathlib.Path("/home/agentuser/wfs-office/server.py")
BACKUPS = pathlib.Path("/home/agentuser/wfs-office/backups")
TMP = pathlib.Path("/home/agentuser/wfs-office/.server.compiledcheck")
TASKS_DB = pathlib.Path("/home/agentuser/wfs-office/tasks.db")
BASE = "http://127.0.0.1:8787"


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Opener tanpa follow-redirect — GET / harus dibaca 307 EKSAK.

    urllib.urlopen default MENGIKUTI redirect: probe root jadi 200 final dari
    kantor :9503 dan lokasi hilang (bug probe fase-2 pertama, rollback salah
    server yang benar). Root wajib diverifikasi mentah: 307 + Location.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def get(path, timeout=6):
    try:
        with _OPENER.open(BASE + path, timeout=timeout) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except Exception as e:
        return None, str(e).encode(), {}


def post(path, payload, timeout=8):
    data = (payload if isinstance(payload, bytes) else payload.encode())
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()


def set_pause_db(on: bool):
    """Tulis engine_state.paused langsung ke tasks.db (pause persisten)."""
    conn = sqlite3.connect(TASKS_DB)
    conn.execute("CREATE TABLE IF NOT EXISTS engine_state (key TEXT PRIMARY KEY, value INTEGER)")
    conn.execute("INSERT OR REPLACE INTO engine_state VALUES ('paused', ?)", (int(on),))
    conn.commit()
    conn.close()


def smoke(strict: bool = False):
    """Verifikasi gateway pasca-restart. Return (ok, [reason...]).

    strict=False (fase 1): kompatibilitas — health/status/agents 200 + paused
    endpoint merespons (isi bebas: server lama in-memory, baru persisten).

    strict=True (fase 2, live == sumber superset): FIX #2 dibuktikan via HTTP —
    pause persisten dari DB engine_state terbaca endpoint ({"paused": true})
    dan POST /run saat paused ditolak 409 SEBELUM menjadwal (mesin berbayar
    tetap DIJEDA) + fitur live (redirect :9503, routers sh_console/orders).
    """
    why = []
    # 0. Prakondisi: pause persisten ON (kunci pengaman selama smoke).
    try:
        set_pause_db(True)
    except Exception as e:
        why.append(f"set pause db exc: {e}")
    # 1. Health.
    st, body, _ = get("/api/health")
    if st != 200 or b'"ok"' not in body:
        why.append(f"/api/health status {st} body {body[:80]!r}")
    # 2. Status (AGENTS_META parity + anti-poisoning parser).
    st, body, _ = get("/api/status")
    if st != 200 or b'"agents"' not in body:
        why.append(f"/api/status status {st}")
    # 3. Agents list.
    st, body, _ = get("/api/agents")
    if st != 200:
        why.append(f"/api/agents status {st}")
    if strict:
        # 4. FIX #2: pause persisten terbaca endpoint (bukan in-memory).
        st, body, _ = get("/api/tasks/paused")
        if st != 200 or body.strip() != b'{"paused":true}':
            why.append(f"/api/tasks/paused status {st} body {body[:60]!r} (harus persisten true)")
        # 5. Run saat paused -> 409 SEBELUM jadwal (mesin berbayar aman).
        st, body = post("/api/tasks/1/run", "{}")
        if st != 409:
            why.append(f"POST /api/tasks/1/run saat paused: {st} {body[:60]!r} (harus 409)")
        # 6. Fitur live: redirect root + routers read-only hidup.
        st, body, hdr = get("/")
        if st != 307 or "9503" not in (hdr.get("Location") or hdr.get("location") or ""):
            why.append(f"GET / status {st} location {hdr.get('Location')!r} (harus 307 -> :9503)")
        st, body, _ = get("/api/sh/overview")
        if st != 200:
            why.append(f"/api/sh/overview status {st}")
        st, body, _ = get("/api/orders")
        if st != 200:
            why.append(f"/api/orders status {st}")
    if why:
        return False, why
    return True, []


def latest_backup():
    cands = sorted(BACKUPS.glob("server.py.bak-*")) if BACKUPS.is_dir() else []
    return cands[-1] if cands else None


def restart_and_check():
    r = sh("sudo", "systemctl", "restart", "wfs-office")
    if r.returncode != 0:
        return False, [f"systemctl restart rc={r.returncode} {r.stderr[-200:]}"]
    for _ in range(30):
        time.sleep(0.5)
        try:
            st, body, _ = get("/api/health", timeout=3)
            if st == 200 and b'"ok"' in body:
                return True, []
        except Exception:
            pass
    return False, ["health tidak hijau 15 dtk pasca restart"]


def _rollback_to(bak):
    if bak and bak.is_file():
        shutil.copy2(bak, DST)
        ok, why = restart_and_check()
        print("rollback:", "OK" if ok else f"GAGAL {why}")


def do_apply():
    if not SRC.is_file():
        print(f"SUMBER TIDAK ADA: {SRC}")
        return 2
    if sha(SRC) == sha(DST):
        ok, why = smoke(strict=True)
        print("live == sumber (idempoten); smoke strict:", "OK" if ok else f"GAGAL {why}")
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
    ok, why = smoke(strict=False)
    if not ok:
        print("smoke fase-1 GAGAL — rollback:", why)
        _rollback_to(bak)
        return 2
    # Fase 2: FIX #2 + fitur live wajib hidup pada live yang kini == sumber.
    ok2, why2 = smoke(strict=True)
    if not ok2:
        print("smoke fase-2 (persisten+fitur live) GAGAL — rollback:", why2)
        _rollback_to(bak)
        return 2
    print("DEPLOY OK — live == sumber", sha(SRC)[:12], "; smoke fase-1+fase-2 OK (pause tetap ON)")
    return 0


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
        ok, why = smoke(strict=True)
        print("IDENTIK; smoke strict:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    print("DRIFT: live != sumber — jalankan scripts/apply_wfs_server.py --apply")
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
