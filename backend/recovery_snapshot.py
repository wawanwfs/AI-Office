"""Offline, explicitly approved SQLite snapshot/restore for WFS control DBs.

No network, Docker, credentials or production host access. Restore is
create-only: the tool NEVER overwrites a running or existing database.
SQLite's backup API preserves one database-consistent WAL snapshot per file.
For a multi-database coherent checkpoint the operator MUST stop workers,
gateway and other writers before backing up and before cutover.
"""
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import time

_NAME = re.compile(r"[a-z][a-z0-9_-]{0,31}\Z")
_FORMAT = "wfs-sqlite-snapshot-v1"


class SnapshotDenied(PermissionError):
    pass


def _digest(path):
    value=hashlib.sha256()
    with open(path,"rb") as stream:
        for chunk in iter(lambda:stream.read(1048576),b""):
            value.update(chunk)
    return value.hexdigest()


def _safe_dir(path):
    p=Path(path).absolute()
    if p.is_symlink() or p.resolve()!=p:
        raise SnapshotDenied("symlinked snapshot path denied")
    parent=p.parent
    if not parent.is_dir() or parent.is_symlink():
        raise SnapshotDenied("create parent outside this tool first")
    if p.exists():
        raise SnapshotDenied("destination exists; in-place restore is forbidden")
    return p


def _db_valid(path):
    try:
        # sqlite3.Connection context manager commits; it DOES NOT close.
        # Explicit closing is required on Windows to release file handles.
        with closing(sqlite3.connect(path.as_uri()+"?mode=ro",uri=True,timeout=5)) as db:
            if db.execute("PRAGMA quick_check").fetchone()[0]!="ok":
                raise SnapshotDenied("SQLite integrity check failed")
    except sqlite3.DatabaseError as exc:
        raise SnapshotDenied("invalid SQLite database") from exc


def backup_sqlite(sources,destination,*,approved=False):
    """Snapshot 1..8 named SQLite files to a private, create-only directory."""
    if approved is not True:
        raise SnapshotDenied("operator approval required for backup")
    if not isinstance(sources,dict) or not 1<=len(sources)<=8:
        raise SnapshotDenied("expected 1..8 explicitly named SQLite databases")
    final=_safe_dir(destination)
    checked={}
    for name,raw in sources.items():
        if not isinstance(name,str) or not _NAME.fullmatch(name):
            raise SnapshotDenied("invalid SQLite name")
        p=Path(raw).absolute()
        if p.is_symlink() or p.resolve()!=p or not p.is_file():
            raise SnapshotDenied("source not an ordinary existing SQLite file")
        if p in checked.values():
            raise SnapshotDenied("duplicate database source")
        checked[name]=p
    stage=Path(tempfile.mkdtemp(prefix=".wfs-snapshot-",dir=final.parent))
    try:
        os.chmod(stage,0o700)
        files={}
        for name,source in sorted(checked.items()):
            target=stage/(name+".sqlite3")
            with closing(sqlite3.connect(source.as_uri()+"?mode=ro",uri=True,timeout=10)) as inp:
                with closing(sqlite3.connect(str(target),timeout=10)) as out:
                    inp.backup(out)
                    out.commit()
            os.chmod(target,0o600)
            _db_valid(target)
            with open(target,"rb") as stream:
                os.fsync(stream.fileno())
            files[name]={"file":name+".sqlite3","sha256":_digest(target),
                         "bytes":target.stat().st_size}
        manifest={"format":_FORMAT,"created_at_epoch":int(time.time()),
                  "files":files,
                  "consistency":"per-database; stop writers for multi-DB checkpoint"}
        meta=stage/"manifest.json"
        with open(meta,"w",encoding="utf-8") as out:
            json.dump(manifest,out,sort_keys=True,indent=2)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(meta,0o600)
        stage.rename(final)
        return manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def restore_sqlite(snapshot,destination,*,approved=False):
    """Verify all checksums and quick_check before create-only restore."""
    if approved is not True:
        raise SnapshotDenied("operator approval required for restore")
    root=Path(snapshot).absolute()
    if root.is_symlink() or root.resolve()!=root or not root.is_dir():
        raise SnapshotDenied("snapshot must be an ordinary directory")
    meta=root/"manifest.json"
    if meta.is_symlink() or not meta.is_file() or meta.stat().st_size>65536:
        raise SnapshotDenied("snapshot manifest unavailable")
    try:
        manifest=json.loads(meta.read_text(encoding="utf-8"))
    except (OSError,ValueError) as exc:
        raise SnapshotDenied("invalid snapshot manifest") from exc
    files=manifest.get("files") if isinstance(manifest,dict) else None
    if (not isinstance(manifest,dict) or manifest.get("format")!=_FORMAT
            or not isinstance(files,dict) or not 1<=len(files)<=8):
        raise SnapshotDenied("unsupported snapshot format")
    final=_safe_dir(destination)
    verified={}
    for name,entry in files.items():
        if not isinstance(name,str) or not _NAME.fullmatch(name):
            raise SnapshotDenied("invalid snapshot entry name")
        if (not isinstance(entry,dict) or entry.get("file")!=name+".sqlite3"
                or not isinstance(entry.get("sha256"),str)
                or not re.fullmatch(r"[a-f0-9]{64}",entry["sha256"])):
            raise SnapshotDenied("invalid snapshot entry")
        source=root/entry["file"]
        if source.is_symlink() or not source.is_file() or source.resolve()!=source:
            raise SnapshotDenied("unsafe backup file")
        if source.stat().st_size!=entry.get("bytes") or _digest(source)!=entry["sha256"]:
            raise SnapshotDenied("snapshot checksum mismatch")
        _db_valid(source)
        verified[name]=source
    stage=Path(tempfile.mkdtemp(prefix=".wfs-restore-",dir=final.parent))
    try:
        os.chmod(stage,0o700)
        for name,source in verified.items():
            target=stage/(name+".sqlite3")
            shutil.copyfile(source,target)
            os.chmod(target,0o600)
            with open(target,"rb") as stream:
                os.fsync(stream.fileno())
            if _digest(target)!=files[name]["sha256"]:
                raise SnapshotDenied("copy checksum mismatch")
        shutil.copyfile(meta,stage/"manifest.json")
        os.chmod(stage/"manifest.json",0o600)
        stage.rename(final)
        return {"restored":sorted(verified),"path":str(final),"overwrote":False}
    finally:
        if stage.exists():
            shutil.rmtree(stage)
