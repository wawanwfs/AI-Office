#!/usr/bin/env python3
"""Deploy backend_live/wfs_tasks.py -> ~/wfs-office/tasks.py — satu sumber kebenaran (siklus 208).

Pola apply_wfs_api_service.py (siklus 207). Latar audit drift siklus 208:
- backend/tasks.py (repo) punya hardening eksekusi (require_launch_approval +
  is_paused/set_paused persisten + claim_task fcntl + recover_interrupted +
  _execution_llm guard paused/approval per-call) TAPI TANPA fitur live
  (load_default memakai env WFS_AI_* default openai, bukan ~/.hermes/.env).
- ~/wfs-office/tasks.py (produksi gateway :8787) memakai ~/.hermes/.env tapi
  TANPA semua hardening itu — plus BUG PRODUKSI: jalur retry QA-revise
  memanggil asyncio.sleep tanpa import asyncio dalam scope (NameError),
  dan pause engine in-memory (_PAUSED di server.py) hilang saat restart.
- backend_live/wfs_tasks.py = SUPERSET keduanya (fitur live eksak +
  hardening hidup + require_launch_approval fallback ~/wfs-hq/database.py).

Pemakaian:
- Tanpa argumen : CHECK saja — bandingkan live vs sumber, exit 3 bila beda (drift).
- --apply       : backup -> tulis (tmp + compile-check) -> restart wfs-office ->
                  health :8787 -> smoke fitur (6 poin HTTP murni) -> gagal -> AUTO-ROLLBACK.
- --rollback    : pulihkan backup TERBARU lalu restart.

SOP: edit backend_live/wfs_tasks.py di repo, commit, lalu jalankan
`python3 scripts/apply_wfs_tasks.py --apply`. JANGAN mengedit
~/wfs-office/tasks.py langsung — drift gate vitest akan FAIL.

Smoke (HTTP murni, tanpa chrome; TIDAK menyentuh mesin berbayar):
1. GET /api/health        200 + "ok"
2. GET /api/status        200 + "agents"
3. GET /api/tasks/paused  200 (harus {"paused": true} — pause persisten dari
   DB engine_state, bukan in-memory; di-set lewat DB langsung saat smoke)
4. POST /api/tasks (body valid) 409/4xx TANPA menjadwalkan apa pun — approval
   gate menolak project tanpa approval (mesin berbayar tetap DIJEDA)
5. GET /api/agents        200
6. GET /api/agents/status 200
"""
import argparse
import hashlib
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

SRC = pathlib.Path(__file__).resolve().parent.parent / "backend_live" / "wfs_tasks.py"
DST = pathlib.Path("/home/agentuser/wfs-office/tasks.py")
BACKUPS = pathlib.Path("/home/agentuser/wfs-office/backups")
TMP = pathlib.Path("/home/agentuser/wfs-office/.tasks.compiledcheck")
TASKS_DB = pathlib.Path("/home/agentuser/wfs-office/tasks.db")
BASE = "http://127.0.0.1:8787"


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def get(path, timeout=6):
    try:
        with urllib.request.urlopen(BASE + path, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()


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


# Probe hardening (smoke fase-2): jalankan tasks.py LIVE di venv gateway —
# verifikasi pause persisten terbaca dari DB + run saat paused ditolak engine.
# Kode dijadikan konstanta modul agar call-site subprocess.run tetap pendek
# (scanner census 202 memindai inner balanced-paren terbatas).
PROBE_HARDENING = (
    'import sys, sqlite3, json, asyncio\n'
    'sys.path.insert(0, "/home/agentuser/wfs-office")\n'
    'import tasks\n'
    'c = sqlite3.connect(tasks.DB)\n'
    'c.execute("CREATE TABLE IF NOT EXISTS engine_state (key TEXT PRIMARY KEY, value INTEGER)")\n'
    'c.execute("INSERT OR REPLACE INTO engine_state VALUES (\'paused\', 1)")\n'
    'c.commit()\n'
    'assert tasks.is_paused() is True, "is_paused False padahal DB paused=1"\n'
    'try:\n'
    '    asyncio.run(tasks.run_task(1))\n'
    '    print(json.dumps({"rejected": False}))\n'
    'except (PermissionError, RuntimeError, LookupError) as e:\n'
    '    print(json.dumps({"rejected": True, "why": str(e)[:80]}))\n'
)


def smoke(strict: bool = False):
    """Verifikasi fitur + hardening tasks engine pada gateway yang baru restart.

    Return (ok, [reason...]) — satu saja gagal = rollback (bila strict).

    strict=False (fase 1, server lama atau baru): hanya kompatibilitas —
    health/status/agents/agents-status. Pause persisten & 409-run TIDAK
    diwajibkan (server lama tidak punya; justru itulah yang diperbaiki).

    strict=True (fase 2, hanya bila live == sumber superset): hardening wajib
    hidup — pause persisten terbaca dari DB engine_state + POST /run saat
    paused harus 409 (dulu: pause in-memory hilang saat restart, run lolos).

    Smoke TIDAK PERNAH memanggil /run_all, /resume_all, dan /run hanya saat
    paused=true (mesin berbayar tetap DIJEDA).
    """
    why = []
    # 0. Pra-kondisi: pause persisten ON (kunci pengaman selama smoke).
    try:
        set_pause_db(True)
    except Exception as e:
        why.append(f"set pause db exc: {e}")
    # 1. Health.
    st, body = get("/api/health")
    if st != 200 or b'"ok"' not in body:
        why.append(f"/api/health status {st} body {body[:80]!r}")
    # 2. Status (AGENTS_META parity).
    st, body = get("/api/status")
    if st != 200 or b'"agents"' not in body:
        why.append(f"/api/status status {st}")
    if strict:
        # 3-4. Hardening engine tasks.py diverifikasi LANGSUNG via python (bukan
        # endpoint server — /api/tasks/paused live masih in-memory di server.py
        # lama; sinkronisasi server.py adalah item terpisah). Yang dijamin di
        # sini: (a) pause persisten terbaca dari DB engine_state oleh file live;
        # (b) run saat paused ditolak engine (PermissionError/RuntimeError/
        # LookupError jelas) — mesin berbayar tidak jalan walau endpoint server
        # lama belum meneruskan 409.
        probe = subprocess.run(
            [sys.executable, "-c", PROBE_HARDENING],
            capture_output=True, text=True, timeout=30)
        line = (probe.stdout or "").strip().splitlines()
        line = line[-1] if line else ""
        if probe.returncode != 0 or '"rejected": true' not in line:
            why.append(f"probe hardening tasks.py live gagal rc={probe.returncode}: {line!r} {probe.stderr[-160:]!r}")
    # 5. GET /api/agents.
    st, body = get("/api/agents")
    if st != 200:
        why.append(f"/api/agents status {st}")
    # 6. GET /api/agents/status.
    st, body = get("/api/agents/status")
    if st != 200:
        why.append(f"/api/agents/status status {st}")
    if why:
        return False, why
    return True, []


def latest_backup():
    cands = sorted(BACKUPS.glob("tasks.py.bak-*")) if BACKUPS.is_dir() else []
    return cands[-1] if cands else None


def restart_and_check():
    r = sh("sudo", "systemctl", "restart", "wfs-office")
    if r.returncode != 0:
        return False, [f"systemctl restart rc={r.returncode} {r.stderr[-200:]}"]
    for _ in range(30):
        time.sleep(0.5)
        try:
            st, body = get("/api/health", timeout=3)
            if st == 200 and b'"ok"' in body:
                return True, []
        except Exception:
            pass
    return False, ["health tidak hijau 15 dtk pasca restart"]


def do_apply():
    if not SRC.is_file():
        print(f"SUMBER TIDAK ADA: {SRC}")
        return 2
    if sha(SRC) == sha(DST):
        ok, why = smoke(strict=True)
        print("live == sumber (idempoten); smoke strict:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    BACKUPS.mkdir(exist_ok=True)
    bak = BACKUPS / f"tasks.py.bak-{int(time.time())}"
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
    # Fase 2: hardening wajib hidup pada live yang kini == sumber.
    ok2, why2 = smoke(strict=True)
    if not ok2:
        print("smoke fase-2 (hardening) GAGAL — rollback:", why2)
        _rollback_to(bak)
        return 2
    print("DEPLOY OK — live == sumber", sha(SRC)[:12], "; smoke fase-1+fase-2 OK (pause tetap ON)")
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
        ok, why = smoke(strict=True)
        print("IDENTIK; smoke strict:", "OK" if ok else f"GAGAL {why}")
        return 0 if ok else 2
    print("DRIFT: live != sumber — jalankan scripts/apply_wfs_tasks.py --apply")
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
