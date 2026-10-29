#!/usr/bin/env python3
"""Apply / verify / rollback endpoint /api/dashboard/stats di gateway produksi :8787.

Siklus 152 — deploy TERKONTROL (server produksi bukan repo git):
- Backup server.py + router lama sebelum menulis (backups/, timestamp).
- Patch idempoten: marker unik disisipkan sebelum anchor '# ---------- orders ----------'.
- Compile-check file hasil patch (venv gateway) SEBELUM restart.
- Setelah restart: health-check + verifikasi field endpoint; gagal → auto-rollback.
- Tanpa --apply: CHECK saja (tidak mengubah apa pun, exit 3 bila belum terpasang).
- --rollback: pulihkan backup server.py TERBARU lalu restart.

Catatan: rollback mengembalikan server.py ke kondisi backup terakhir — patch
siklus lain (bila ada) ikut terpulihkan; jalankan apply-nya ulang bila perlu.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.request

GW = pathlib.Path("/home/agentuser/wfs-office")
REPO = pathlib.Path(__file__).resolve().parent.parent
ROUTER_SRC = REPO / "backend_live" / "wfs_dashboard_stats.py"
ROUTER_DST = GW / "wfs_dashboard_stats.py"
BACKUPS = GW / "backups"
MARK = "# === wfs dashboard/stats (additive, read-only) — siklus 152 ==="
ANCHOR = "# ---------- orders ----------"
NEED_KEYS = ("projects_total", "tasks_total", "agents_count", "logs")


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def health() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/health", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def stats_ok() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/dashboard/stats", timeout=5) as r:
            d = json.loads(r.read())
            return all(k in d for k in NEED_KEYS)
    except Exception:
        return False


def patch_server(txt: str) -> str:
    assert MARK not in txt, "marker sudah ada"
    assert ANCHOR in txt, "anchor '# ---------- orders ----------' tidak ditemukan — server.py berubah, apply DIBATALKAN"
    block = (MARK + "\n"
             "import wfs_dashboard_stats as _wfs_stats\n"
             "app.include_router(_wfs_stats.router)\n\n")
    i = txt.index(ANCHOR)
    return txt[:i] + block + txt[i:]


def compile_check(txt: str, venv_py: pathlib.Path):
    tmp = GW / ".server.py.compiledcheck"
    tmp.write_text(txt)
    try:
        r = sh(str(venv_py), "-c",
               "import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)", str(tmp))
        if r.returncode != 0:
            raise RuntimeError(f"compile gagal: {r.stderr.strip()[:300]}")
    finally:
        tmp.unlink(missing_ok=True)


def restart_and_wait(tries: int = 30) -> bool:
    r = sh("sudo", "systemctl", "restart", "wfs-office")
    if r.returncode != 0:
        print("restart rc:", r.returncode, r.stderr.strip()[:200])
    for _ in range(tries):
        if health():
            return True
        time.sleep(0.5)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    a = ap.parse_args()

    srv = GW / "server.py"
    assert ROUTER_SRC.exists(), f"staging hilang: {ROUTER_SRC}"
    venv_py = GW / ".venv" / "bin" / "python"
    assert venv_py.exists(), "venv gateway hilang"

    deployed = srv.read_text()
    stage_h = hashlib.sha256(ROUTER_SRC.read_bytes()).hexdigest()[:12]
    dst_h = hashlib.sha256(ROUTER_DST.read_bytes()).hexdigest()[:12] if ROUTER_DST.exists() else "-"
    installed = MARK in deployed
    print(f"marker={installed} router stage={stage_h} dst={dst_h} health={health()} stats={stats_ok()}")
    print("backups:", ", ".join(p.name for p in sorted(BACKUPS.glob("server.py.bak-*"))[-3:]) or "-")

    if a.rollback:
        baks = sorted(BACKUPS.glob("server.py.bak-*"))
        if not baks:
            sys.exit("tidak ada backup")
        shutil.copy2(baks[0], srv)  # tertua = kondisi pra-patch pertama
        ok = restart_and_wait()
        print(f"rollback dari {baks[0].name} — health={ok} stats_hadir={stats_ok()}")
        sys.exit(0 if ok else 2)

    need_patch = not installed
    need_router = stage_h != dst_h
    if not a.apply:
        if need_patch:
            print("CHECK: endpoint BELUM terpasang. Jalankan ulang dgn --apply.")
            sys.exit(3)
        print("CHECK: endpoint terpasang — tidak ada yang perlu diubah"
              + ("" if not need_router else " (router stage beda hash)"))
        sys.exit(0)

    if not need_patch and not need_router:
        print("APPLY: sudah terpasang & router sama — verifikasi saja")
        sys.exit(0 if (health() and stats_ok()) else 2)

    if need_patch:
        # Backup hanya saat server.py benar-benar dipatch — salinan selalu
        # kondisi pra-patch, sehingga rollback = pulih ke pra-patch.
        BACKUPS.mkdir(exist_ok=True)
        bak = BACKUPS / f"server.py.bak-{int(time.time())}"
        shutil.copy2(srv, bak)

    if need_patch:
        new_txt = patch_server(deployed)
        compile_check(new_txt, venv_py)  # sebelum menulis — srv belum disentuh
        srv.write_text(new_txt)
        print("server.py dipatch; backup:", bak.name)
    if need_router:
        ROUTER_DST.write_bytes(ROUTER_SRC.read_bytes())
        print(f"router di-stage ({stage_h})")

    ok = restart_and_wait()
    if not ok or not stats_ok():
        print("VERIFIKASI GAGAL — rollback otomatis")
        if need_patch:
            shutil.copy2(bak, srv)
            ok2 = restart_and_wait(20)
            print(f"rollback selesai — health={ok2}")
        else:
            bak_router = BACKUPS / "router.bak"
            if bak_router.exists():
                ROUTER_DST.write_bytes(bak_router.read_bytes())
                print("router dikembalikan dari backup lama")
            else:
                ROUTER_DST.unlink(missing_ok=True)
                print("router dihapus (tidak ada backup router)")
            ok2 = restart_and_wait(20)
            print(f"rollback router selesai — health={ok2}")
        sys.exit(2)
    print("APPLY OK — /api/dashboard/stats 200, field lengkap")


if __name__ == "__main__":
    main()
