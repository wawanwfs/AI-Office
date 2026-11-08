"""Deny-by-default per-project RBAC for the separate WFS worker control plane.

The caller MUST provide a previously authenticated principal. HTTP headers,
form parameters, and LLM output are never authority. Bootstrap requires local
DB write access, not a public endpoint.
"""
from contextlib import contextmanager
from pathlib import Path
import re
import sqlite3
import time

_ID=re.compile(r"[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}\Z")
_ROLES={
    "owner":frozenset(("read","enqueue","run","cancel","approve","budget","grant")),
    "operator":frozenset(("read","enqueue","run","cancel")),
    "worker":frozenset(("read","run")),
    "viewer":frozenset(("read",)),
}


class AccessDenied(PermissionError):
    pass


def ident(value):
    if not isinstance(value,str) or not _ID.fullmatch(value):
        raise ValueError("unsafe RBAC identifier")
    return value


class ProjectRBAC:
    def __init__(self,db_path,clock=None):
        self.path=str(Path(db_path).resolve())
        self.clock=clock or time.time
        Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        con=self._db()
        try:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_project_acl (
                    project_id TEXT NOT NULL,
                    principal TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN
                        ('owner','operator','worker','viewer')),
                    PRIMARY KEY(project_id,principal)
                );
                CREATE TABLE IF NOT EXISTS wfs_rbac_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
            """)
        finally:
            con.close()

    def _db(self):
        con=sqlite3.connect(self.path,timeout=20,isolation_level=None)
        con.row_factory=sqlite3.Row
        con.execute("PRAGMA busy_timeout=20000")
        return con

    @contextmanager
    def _tx(self):
        con=self._db()
        try:
            con.execute("BEGIN IMMEDIATE")
            yield con
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()

    def bootstrap_owner(self,project_id,owner):
        """Local-only initialization. Fails if project already has any ACL."""
        project_id,owner=ident(project_id),ident(owner)
        with self._tx() as con:
            if con.execute("SELECT 1 FROM wfs_project_acl WHERE project_id=? LIMIT 1",
                           (project_id,)).fetchone():
                raise AccessDenied("project ACL is already initialized")
            con.execute("INSERT INTO wfs_project_acl VALUES(?,?,?)",
                        (project_id,owner,"owner"))
            con.execute("INSERT INTO wfs_rbac_audit(project_id,actor,action,subject,created_at) VALUES(?,?,?,?,?)",
                        (project_id,owner,"bootstrap_owner",owner,float(self.clock())))

    @staticmethod
    def _allowed(con,principal,project,action):
        role=con.execute("""SELECT role FROM wfs_project_acl
            WHERE project_id=? AND principal=?""",(project,principal)).fetchone()
        return bool(role and action in _ROLES[role[0]])

    def require(self,principal,project_id,action):
        principal,project_id=ident(principal),ident(project_id)
        if action not in set().union(*_ROLES.values()):
            raise ValueError("unknown RBAC action")
        con=self._db()
        try:
            if not self._allowed(con,principal,project_id,action):
                raise AccessDenied("principal is not authorized for this project")
            return True
        finally:
            con.close()

    def set_role(self,actor,project_id,subject,role):
        actor,project_id,subject=ident(actor),ident(project_id),ident(subject)
        if role not in _ROLES:
            raise ValueError("unknown role")
        with self._tx() as con:
            if not self._allowed(con,actor,project_id,"grant"):
                raise AccessDenied("only project owner can grant permissions")
            con.execute("""INSERT INTO wfs_project_acl VALUES(?,?,?)
                ON CONFLICT(project_id,principal) DO UPDATE SET role=excluded.role""",
                (project_id,subject,role))
            con.execute("INSERT INTO wfs_rbac_audit(project_id,actor,action,subject,created_at) VALUES(?,?,?,?,?)",
                        (project_id,actor,"grant_"+role,subject,float(self.clock())))

    def revoke(self,actor,project_id,subject):
        actor,project_id,subject=ident(actor),ident(project_id),ident(subject)
        with self._tx() as con:
            if not self._allowed(con,actor,project_id,"grant"):
                raise AccessDenied("only project owner can revoke access")
            owners=con.execute("SELECT COUNT(*) FROM wfs_project_acl WHERE project_id=? AND role='owner'",
                               (project_id,)).fetchone()[0]
            subject_role=con.execute("SELECT role FROM wfs_project_acl WHERE project_id=? AND principal=?",
                                     (project_id,subject)).fetchone()
            if subject_role and subject_role[0]=="owner" and owners<=1:
                raise AccessDenied("cannot revoke the last project owner")
            con.execute("DELETE FROM wfs_project_acl WHERE project_id=? AND principal=?",
                        (project_id,subject))
            con.execute("INSERT INTO wfs_rbac_audit(project_id,actor,action,subject,created_at) VALUES(?,?,?,?,?)",
                        (project_id,actor,"revoke",subject,float(self.clock())))

    def members(self,actor,project_id):
        self.require(actor,project_id,"read")
        con=self._db()
        try:
            return [dict(x) for x in con.execute(
                "SELECT principal,role FROM wfs_project_acl WHERE project_id=? ORDER BY principal",
                (project_id,)).fetchall()]
        finally:
            con.close()
