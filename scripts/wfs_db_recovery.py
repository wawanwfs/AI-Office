#!/usr/bin/env python3
"""Explicit local backup and create-only restore for WFS SQLite control DBs.

No remote server, no auto-deploy, no in-place overwrite. NEVER run against
active multi-database production writers without a coordinated shutdown.
"""
import argparse
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from recovery_snapshot import backup_sqlite,restore_sqlite


def main():
    parser=argparse.ArgumentParser(description="WFS offline SQLite backup/restore")
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--backup",action="store_true")
    group.add_argument("--restore",type=str,metavar="SNAPSHOT_DIRECTORY")
    parser.add_argument("--database",action="append",default=[],metavar="NAME=PATH")
    parser.add_argument("--destination",required=True)
    parser.add_argument("--approved",action="store_true",help="Explicit operator approval")
    args=parser.parse_args()
    if args.backup:
        db={}
        for raw in args.database:
            name,sep,path=raw.partition("=")
            if not sep or name in db or not path:
                parser.error("--database must be distinct NAME=PATH")
            db[name]=path
        result=backup_sqlite(db,args.destination,approved=args.approved)
        print("Snapshot verified (names only):",", ".join(sorted(result["files"])))
    else:
        if args.database:
            parser.error("restore does not accept --database; only signed-off snapshot files")
        result=restore_sqlite(args.restore,args.destination,approved=args.approved)
        print("Create-only restore verified:",", ".join(result["restored"]))
    print("No running service was restarted or overwritten.")


if __name__=="__main__":
    main()
