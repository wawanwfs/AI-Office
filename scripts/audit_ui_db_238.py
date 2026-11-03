#!/usr/bin/env python3
"""Siklus 238 — AUDIT DB UI (read-only default) + purge eksplisit ber-opt-in.

Latar (bukti live, bukan asumsi): siklus 237 mengklaim "DB live dibersihkan eksak
by-id (12 task/16 subtask/14 log)" & "sisa = 55 task produksi + 56 log". Verifikasi
siklus 238 terhadap file nyata ~/wfs-projects/wfs_software_house.db:

  - mtime file = 11:51 WIB, sedangkan commit 237 = 12:42 WIB → file TIDAK pernah
    ditulis oleh pembersihan itu;
  - log id 135–144 yang diklaim dihapus MASIH ADA (isi "planned for 'New Project'
    with 8 subtasks");
  - hanya log 133–134 (E-Commerce) yang benar-benar hilang;
  - isi nyata = 65 task (59 'Develop: New Project' + 6 'Develop: E-Commerce API'),
    semuanya status 'ready', 520 subtask, 66 log, 2 proyek auto-generate.

Jadi pembersihan 237 tidak terverifikasi; angka "55" bukan state file. Script ini
membuat kondisi itu TERUKUR kapan pun (audit) dan menyediakan purge yang eksplisit
(`--purge`), ber-backup, dan menolak jalan bila ada task NON-junk (data user).

Pemakaian:
  python3 scripts/audit_ui_db_238.py            # audit read-only (exit 2 = ada junk)
  python3 scripts/audit_ui_db_238.py --purge    # backup + hapus junk saja
"""
import argparse
import os
import shutil
import sqlite3
import sys
import time

DB = os.path.expanduser("~/wfs-projects/wfs_software_house.db")

# Pola judul artefak uji (orchestrator plan_task menamai task "Develop: <nama proyek>").
JUNK_LIKE = ("%New Project%", "%E-Commerce API%")


def _count(con, sql, args=()):
    return con.execute(sql, args).fetchone()[0]


def audit(dbp):
    if not os.path.exists(dbp):
        print(f"FAIL db tidak ada: {dbp}")
        return 1
    con = sqlite3.connect(f"file:{dbp}?mode=ro", uri=True)
    try:
        tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        if "tasks" not in tables:
            print(f"FAIL skema tak dikenal (tabel: {tables})")
            return 1
        total = _count(con, "SELECT COUNT(*) FROM tasks")
        where = " OR ".join("title LIKE ?" for _ in JUNK_LIKE)
        junk = _count(con, f"SELECT COUNT(*) FROM tasks WHERE {where}", JUNK_LIKE)
        other = total - junk
        subs = _count(con, "SELECT COUNT(*) FROM subtasks") if "subtasks" in tables else 0
        logs = _count(con, "SELECT COUNT(*) FROM execution_logs") if "execution_logs" in tables else 0
        projs = _count(con, "SELECT COUNT(*) FROM projects") if "projects" in tables else 0
        agents = _count(con, "SELECT COUNT(*) FROM agents") if "agents" in tables else 0
        status = con.execute(
            f"SELECT status, COUNT(*) FROM tasks GROUP BY status ORDER BY 2 DESC").fetchall()
        mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(dbp)))
        print(f"db      : {dbp}")
        print(f"mtime   : {mtime}  (size {os.path.getsize(dbp)} B)")
        print(f"tasks   : total={total} junk={junk} non-junk={other}")
        print(f"status  : {status}")
        print(f"lain    : subtasks={subs} logs={logs} projects={projs} agents={agents}")
        if total == 0:
            print("BERSIH — DB kosong (pasca-purge); tidak ada junk tersisa")
            return 0
        if other:
            print("OK — ada task non-junk (data user); purge akan MENOLAK bila diminta")
            return 0
        print("JUNK — 100% task berjudul artefak uji; purge --purge aman (dengan backup)")
        return 2
    finally:
        con.close()


def purge(dbp):
    con = sqlite3.connect(f"file:{dbp}?mode=ro", uri=True)
    try:
        total = _count(con, "SELECT COUNT(*) FROM tasks")
        where = " OR ".join("title LIKE ?" for _ in JUNK_LIKE)
        junk = _count(con, f"SELECT COUNT(*) FROM tasks WHERE {where}", JUNK_LIKE)
    finally:
        con.close()
    if total != junk:
        print(f"BATAL — {total - junk} task non-junk ada; purge ditolak (data user aman)")
        return 1
    bak = f"{dbp}.bak-238-{int(time.time())}"
    shutil.copy2(dbp, bak)
    print(f"backup  : {bak}")
    con = sqlite3.connect(dbp)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("DELETE FROM execution_logs")
        con.execute("DELETE FROM subtasks")
        con.execute("DELETE FROM tasks")
        con.execute("DELETE FROM projects")
        con.commit()
        n = _count(con, "SELECT COUNT(*) FROM tasks")
        print(f"purged  : tasks tersisa = {n} (agents dipertahankan = seed UI)")
        return 0
    finally:
        con.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=DB)
    ap.add_argument("--purge", action="store_true", help="backup + hapus junk (menolak bila ada data user)")
    a = ap.parse_args()
    return purge(a.db) if a.purge else audit(a.db)


if __name__ == "__main__":
    sys.exit(main())
