#!/usr/bin/env python3
"""cleanup_task_locks.py — hapus file lock task yatim di ~/wfs-office.

tasks.py claim_task() membuat tasks.db.<tid>.lock per-task dan menutupnya saat
proses mati, tapi file-nya tidak pernah dihapus. Menumpuk tidak berbahaya
(functional lock, bukan data), namun memenuhi direktori produksi (24 file ditemukan
2026-11-13). Skrip ini menghapus file lock yang:
  - tidak sedang di-hold (flock LOCK_EX|LOCK_NB gagal bebas => tidak ada proses),
  - task-nya sudah tidak berstatus running/assigned di tasks.db (atau sudah hilang).

File yang di-hold proses hidup TIDAK disentuh. Aman dijalankan kapan pun,
termasuk saat gateway aktif.

Pemakaian:
  python3 scripts/cleanup_task_locks.py [--db /home/agentuser/wfs-office/tasks.db]
"""
import argparse
import fcntl
import glob
import os
import sqlite3
import sys

DEFAULT_DB = "/home/agentuser/wfs-office/tasks.db"
ACTIVE_STATUSES = {"running", "assigned"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=DEFAULT_DB, help="path tasks.db produksi")
    args = ap.parse_args()

    db_dir = os.path.dirname(os.path.abspath(args.db)) or "."
    con = sqlite3.connect(args.db, timeout=10)
    status = dict(con.execute("SELECT id, status FROM tasks"))
    con.close()

    removed, held, active_kept = 0, 0, 0
    for f in sorted(glob.glob(os.path.join(db_dir, "tasks.db.*.lock"))):
        stem = os.path.basename(f)  # tasks.db.<tid>.lock
        try:
            tid = int(stem.split(".")[2])
        except (IndexError, ValueError):
            print(f"SKIP malformed: {stem}")
            continue

        fd = open(f, "a")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fd.close()
            held += 1
            print(f"KEEP held by live process: {stem}")
            continue
        fcntl.flock(fd, fcntl.LOCK_UN)
        fd.close()

        if status.get(tid) in ACTIVE_STATUSES:
            active_kept += 1
            print(f"KEEP task {tid} masih {status[tid]}: {stem}")
            continue

        os.unlink(f)
        removed += 1
        print(f"RM orphan: {stem}")

    print(f"removed={removed} held={held} active_kept={active_kept}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
