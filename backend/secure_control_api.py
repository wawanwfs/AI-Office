"""Opt-in, real bearer-authenticated, per-project HTTP control API (v4).

The public gateway NEVER gets Docker access or provider keys. Tokens are
created only by an authorized local operator and stored as SHA-256 digests.
No cookie auth, no user identity from request headers, no query-token fallback.
Legacy gateway routes remain separate and are NOT automatically RBAC-protected.
"""
from contextlib import closing
import hashlib
import hmac
from pathlib import Path
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel

try:
    from .project_rbac import AccessDenied, ident
except ImportError:
    from project_rbac import AccessDenied, ident


class TokenStore:
    def __init__(self, path, clock=None):
        self.path=str(Path(path).resolve())
        self.clock=clock or time.time
        Path(self.path).parent.mkdir(parents=True,exist_ok=True)
        with closing(self._db()) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_http_tokens(
                  token_hash TEXT PRIMARY KEY,
                  principal TEXT NOT NULL,
                  expires_at REAL NOT NULL,
                  revoked INTEGER NOT NULL DEFAULT 0,
                  created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS wfs_http_tokens_principal
                  ON wfs_http_tokens(principal,expires_at);
            """)

    def _db(self):
        c=sqlite3.connect(self.path,timeout=20,isolation_level=None)
        c.row_factory=sqlite3.Row
        c.execute("PRAGMA busy_timeout=20000")
        return c

    @staticmethod
    def _hash(token):
        return hashlib.sha256(token.encode("ascii")).hexdigest()

    def mint_local(self, principal, *, ttl_seconds=3600):
        """Local operator only. Never attach this function to an HTTP route."""
        principal=ident(principal)
        if isinstance(ttl_seconds,bool) or not isinstance(ttl_seconds,int) or not 60<=ttl_seconds<=86400:
            raise ValueError("token TTL must be 60..86400 seconds")
        raw=secrets.token_urlsafe(32)
        with closing(self._db()) as c:
            c.execute("INSERT INTO wfs_http_tokens VALUES(?,?,?,0,?)",
                      (self._hash(raw),principal,float(self.clock())+ttl_seconds,float(self.clock())))
        return raw

    def verify(self,raw):
        if not isinstance(raw,str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}",raw):
            return None
        hashed=self._hash(raw)
        with closing(self._db()) as c:
            row=c.execute("SELECT token_hash,principal,expires_at,revoked FROM wfs_http_tokens WHERE token_hash=?",
                          (hashed,)).fetchone()
        if row is None:
            hmac.compare_digest(hashed,"0"*64)
            return None
        if not hmac.compare_digest(row["token_hash"],hashed):
            return None
        return row["principal"] if not row["revoked"] and row["expires_at"]>float(self.clock()) else None

    def revoke_local(self,raw):
        """Operator revocation, never an unauthenticated HTTP endpoint."""
        if not isinstance(raw,str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}",raw):
            raise ValueError("invalid token")
        with closing(self._db()) as c:
            r=c.execute("UPDATE wfs_http_tokens SET revoked=1 WHERE token_hash=?",
                        (self._hash(raw),))
            return r.rowcount==1


class CancelReply(BaseModel):
    job_id:str
    status:str


def create_secure_router(*, queue, rbac, ledger, tokens, taskengine=None):
    """Dependency-injected data sources; no unauthenticated fallback."""
    router=APIRouter(prefix="/api/v4", tags=["WFS Secure Control API"])

    def authenticated(authorization: str | None=Header(default=None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401,"Bearer token required",
                                headers={"WWW-Authenticate":"Bearer"})
        principal=tokens.verify(authorization[7:])
        if principal is None:
            raise HTTPException(401,"Invalid or expired token",
                                headers={"WWW-Authenticate":"Bearer"})
        return principal

    def scoped(project_id,principal,permission):
        try:
            rbac.require(principal,project_id,permission)
        except (AccessDenied,ValueError) as exc:
            raise HTTPException(404,"Project not found") from exc
        return project_id

    def no_cache(response):
        response.headers["Cache-Control"]="no-store"

    @router.get("/me")
    def me(response:Response, principal:str=Depends(authenticated)):
        no_cache(response)
        return {"principal":principal, "authentication":"bearer", "mode":"real"}

    @router.get("/projects/{project_id}/jobs")
    def jobs(project_id:str,response:Response,limit:int=Query(100,ge=1,le=500),
             principal:str=Depends(authenticated)):
        scoped(project_id,principal,"read")
        no_cache(response)
        return {"jobs":queue.list(project_id,limit=limit)}

    @router.get("/projects/{project_id}/events")
    def events(project_id:str,response:Response,limit:int=Query(100,ge=1,le=500),
               principal:str=Depends(authenticated)):
        scoped(project_id,principal,"read")
        no_cache(response)
        return {"events":queue.events(project_id,limit=limit)}

    @router.get("/projects/{project_id}/budget")
    def budget(project_id:str,response:Response,principal:str=Depends(authenticated)):
        scoped(project_id,principal,"read")
        no_cache(response)
        return ledger.summary(project_id)

    @router.get("/projects/{project_id}/usage")
    def usage(project_id:str,response:Response,limit:int=Query(100,ge=1,le=500),
              principal:str=Depends(authenticated)):
        scoped(project_id,principal,"read")
        no_cache(response)
        return {"calls":ledger.history(project_id,limit=limit)}

    @router.get("/projects/{project_id}/members")
    def members(project_id:str,response:Response,principal:str=Depends(authenticated)):
        scoped(project_id,principal,"read")
        no_cache(response)
        return {"members":rbac.members(principal,project_id)}

    @router.post("/projects/{project_id}/tasks/{task_id}/enqueue",status_code=202)
    def enqueue(project_id:str,task_id:int,response:Response,
                principal:str=Depends(authenticated)):
        scoped(project_id,principal,"enqueue")
        if taskengine is None:
            raise HTTPException(503,"Worker intake unavailable")
        if task_id<1:
            raise HTTPException(404,"Task not found")
        task=taskengine.get_task(task_id)
        if task is None or str(task.get("project"))!=project_id:
            raise HTTPException(404,"Task not found")
        if task.get("status") not in ("pending","review","failed"):
            raise HTTPException(409,"Task is not runnable")
        if task.get("role") in ("backend","backend2","frontend","frontend2","devops"):
            raise HTTPException(409,"Code tasks require isolated QA sandbox")
        try:
            taskengine.require_launch_approval(project_id)
            if taskengine.is_paused():
                raise PermissionError("task engine paused")
            current=ledger.summary(project_id)
            if not current["approved"] or current["remaining_microusd"]<=0:
                raise PermissionError("approved spending budget required")
        except PermissionError as exc:
            raise HTTPException(403,"Execution approval or budget not available") from exc
        job_id=queue.submit(project_id,str(task_id),str(task["role"]),max_attempts=2)
        no_cache(response)
        return {"job_id":job_id,"status":queue.get(job_id)["status"],
                "execution_started":False}

    @router.post("/projects/{project_id}/jobs/{job_id}/cancel",
                 response_model=CancelReply)
    def cancel(project_id:str,job_id:str,response:Response,
               principal:str=Depends(authenticated)):
        scoped(project_id,principal,"cancel")
        try:
            job=queue.get(job_id)
        except ValueError as exc:
            raise HTTPException(404,"Job not found") from exc
        if job is None or job["project_id"]!=project_id:
            raise HTTPException(404,"Job not found")
        if not queue.cancel(job_id) and job["status"]!="cancelled":
            raise HTTPException(409,"Job is terminal")
        no_cache(response)
        updated=queue.get(job_id)
        return {"job_id":job_id,"status":updated["status"]}
    return router
