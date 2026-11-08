"""Offline SQLite WAL backup, tamper, create-only rollback and fail-close."""
import os
import sqlite3
from pathlib import Path
import pytest
from recovery_snapshot import backup_sqlite,restore_sqlite,SnapshotDenied


@pytest.fixture
def sample(tmp_path):
    p=tmp_path/"queue.db"
    con=sqlite3.connect(p)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("CREATE TABLE jobs(id INTEGER PRIMARY KEY,value TEXT)")
    con.execute("INSERT INTO jobs(value) VALUES(?)",("real queue record",))
    con.commit()
    return tmp_path,p,con


def test_real_wal_snapshot_then_restore_without_touching_live_db(sample):
    root,source,con=sample
    try:
        manifest=backup_sqlite({"queue":source},root/"snap",approved=True)
        assert manifest["format"]=="wfs-sqlite-snapshot-v1"
        assert manifest["files"]["queue"]["bytes"]>0
        con.execute("INSERT INTO jobs(value) VALUES('newer record')")
        con.commit()
        result=restore_sqlite(root/"snap",root/"restore",approved=True)
        assert result["restored"]==["queue"]
        with sqlite3.connect(root/"restore/queue.sqlite3") as db:
            rows=db.execute("SELECT value FROM jobs ORDER BY id").fetchall()
        assert rows==[("real queue record",)]
        with sqlite3.connect(source) as live:
            assert live.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]==2
        assert (root/"snap/manifest.json").is_file()
    finally:
        con.close()


def test_operator_approval_and_non_overwriting_guards(sample):
    root,source,con=sample
    try:
        with pytest.raises(SnapshotDenied,match="operator approval"):
            backup_sqlite({"queue":source},root/"snap")
        backup_sqlite({"queue":source},root/"snap",approved=True)
        with pytest.raises(SnapshotDenied,match="exists"):
            backup_sqlite({"queue":source},root/"snap",approved=True)
        with pytest.raises(SnapshotDenied,match="exists"):
            restore_sqlite(root/"snap",root,approved=True)
        with pytest.raises(SnapshotDenied,match="operator approval"):
            restore_sqlite(root/"snap",root/"restore")
    finally:
        con.close()


def test_corrupt_backup_cannot_restore_or_create_target(sample):
    root,source,con=sample
    try:
        backup_sqlite({"queue":source},root/"snap",approved=True)
        backup=root/"snap/queue.sqlite3"
        with open(backup,"ab") as file:
            file.write(b"tampered")
        with pytest.raises(SnapshotDenied,match="checksum"):
            restore_sqlite(root/"snap",root/"restore",approved=True)
        assert not (root/"restore").exists()
    finally:
        con.close()


def test_symlink_alias_and_path_traversal_denied(sample):
    root,source,con=sample
    try:
        with pytest.raises(SnapshotDenied,match="name"):
            backup_sqlite({"../queue":source},root/"snap",approved=True)
        assert not (root/"snap").exists()
        alias=root/"alias.db"
        try:
            alias.symlink_to(source)
        except OSError as exc:
            if os.name=="nt":
                pytest.skip("Windows host disallows unprivileged symlink creation")
            raise
        with pytest.raises(SnapshotDenied,match="ordinary"):
            backup_sqlite({"queue":alias},root/"snap",approved=True)
    finally:
        con.close()


def test_two_real_databases_back_up_to_independent_files(sample):
    root,source,con=sample
    other=root/"cost.db"
    with sqlite3.connect(other) as db:
        db.execute("CREATE TABLE budget(cap INTEGER NOT NULL)")
        db.execute("INSERT INTO budget VALUES(10000)")
    try:
        result=backup_sqlite({"queue":source,"cost":other},root/"snapshot",approved=True)
        assert sorted(result["files"])==["cost","queue"]
        restored=restore_sqlite(root/"snapshot",root/"new-dbs",approved=True)
        assert sorted(restored["restored"])==["cost","queue"]
        with sqlite3.connect(root/"new-dbs/cost.sqlite3") as db:
            assert db.execute("SELECT cap FROM budget").fetchone()[0]==10000
    finally:
        con.close()


def test_sqlite_uri_paths_with_spaces_query_and_hash_are_portable(tmp_path):
    directory=tmp_path/"Windows Data & Project"
    directory.mkdir()
    # '?' is forbidden in native Windows filenames; '#' and spaces remain URI-sensitive.
    source=directory/("finance 2026#source.db" if os.name=="nt" else "finance?2026#source.db")
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE audit(value TEXT)")
        db.execute("INSERT INTO audit VALUES(?)",("persisted",))
    backup_sqlite({"source":source},tmp_path/"snapshot",approved=True)
    restore_sqlite(tmp_path/"snapshot",tmp_path/"recovered",approved=True)
    with sqlite3.connect(tmp_path/"recovered/source.sqlite3") as db:
        assert db.execute("SELECT value FROM audit").fetchone()[0]=="persisted"
