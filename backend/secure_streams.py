"""Scoped SSE and WebSocket queue-event streams using one-time tickets.

SSE uses Authorization: Bearer via fetch() (not unauthenticated EventSource).
Browsers cannot send bearer headers to WebSocket, so websocket tickets use
Sec-WebSocket-Protocol, NOT query parameters/cookies. Tickets expire in 30s,
are one use and bound to the project and the issuing bearer digest.
Authorization and project ACL are rechecked while the stream is open.
"""
import asyncio
from contextlib import closing
import hashlib
import json
import re
import secrets
import time

from fastapi import APIRouter, Header, HTTPException, Query, Response, WebSocket
from fastapi.responses import StreamingResponse
from project_rbac import AccessDenied, ident

_TICKET_RE=re.compile(r"[A-Za-z0-9_-]{43}\Z")


class StreamTickets:
    def __init__(self,tokens):
        self.tokens=tokens
        with closing(tokens._db()) as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS wfs_stream_tickets(
                  ticket_hash TEXT PRIMARY KEY,
                  token_hash TEXT NOT NULL,
                  principal TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  expires_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS wfs_stream_tickets_expiry
                  ON wfs_stream_tickets(expires_at);
            """)

    def issue(self,bearer,project):
        principal=self.tokens.verify(bearer)
        project=ident(project)
        if principal is None:
            raise PermissionError("bearer token not authenticated")
        raw=secrets.token_urlsafe(32)
        digest=hashlib.sha256(raw.encode("ascii")).hexdigest()
        now=float(self.tokens.clock())
        with closing(self.tokens._db()) as db:
            db.execute("INSERT INTO wfs_stream_tickets VALUES(?,?,?,?,?)",
                       (digest,self.tokens._hash(bearer),principal,project,now+30))
        return {"ticket":raw,"expires_in_seconds":30,
                "transport":"Sec-WebSocket-Protocol: wfs.v4, <ticket>"}

    def take(self,raw,project):
        if not isinstance(raw,str) or not _TICKET_RE.fullmatch(raw):
            return None
        project=ident(project)
        digest=hashlib.sha256(raw.encode("ascii")).hexdigest()
        db=self.tokens._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("""SELECT token_hash,principal,project_id,expires_at
                               FROM wfs_stream_tickets WHERE ticket_hash=?""",
                           (digest,)).fetchone()
            db.execute("DELETE FROM wfs_stream_tickets WHERE ticket_hash=?",(digest,))
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()
        if row is None or row["project_id"]!=project or row["expires_at"]<=float(self.tokens.clock()):
            return None
        return dict(row)

    def token_active(self,digest):
        with closing(self.tokens._db()) as db:
            row=db.execute("""SELECT principal FROM wfs_http_tokens
                  WHERE token_hash=? AND revoked=0 AND expires_at>?""",
                  (digest,float(self.tokens.clock()))).fetchone()
        return row["principal"] if row else None


def create_event_stream_router(*,queue,rbac,tokens):
    router=APIRouter(prefix="/api/v4",tags=["WFS Scoped Event Streams"])
    tickets=StreamTickets(tokens)

    def identity(auth):
        if not auth or not auth.startswith("Bearer "):
            raise HTTPException(401,"Bearer required")
        bearer=auth[7:]
        principal=tokens.verify(bearer)
        if not principal:
            raise HTTPException(401,"Invalid bearer")
        return bearer,principal

    def authorize(principal,project):
        try:
            rbac.require(principal,project,"read")
        except (AccessDenied,ValueError) as exc:
            raise HTTPException(404,"Project not found") from exc

    @router.post("/projects/{project_id}/events/ticket")
    def issue_ticket(project_id:str,response:Response,
                     authorization:str|None=Header(default=None)):
        bearer,principal=identity(authorization)
        authorize(principal,project_id)
        response.headers["Cache-Control"]="no-store"
        return tickets.issue(bearer,project_id)

    def events_since(project,last_id):
        events=queue.events(project,limit=200)
        return [e for e in reversed(events) if e["id"]>last_id]

    @router.get("/projects/{project_id}/events/stream")
    async def events_sse(project_id:str,
                         authorization:str|None=Header(default=None),
                         last_id:int=Query(0,ge=0),
                         ticks:int=Query(20,ge=1,le=120)):
        bearer,principal=identity(authorization)
        authorize(principal,project_id)
        digest=tokens._hash(bearer)
        async def emit():
            cursor=last_id
            for _ in range(ticks):
                if tickets.token_active(digest)!=principal:
                    return
                try:
                    rbac.require(principal,project_id,"read")
                except (AccessDenied,ValueError):
                    return
                for event in events_since(project_id,cursor):
                    cursor=max(cursor,event["id"])
                    payload=json.dumps(event,separators=(",",":"))
                    yield f"id: {cursor}\nevent: job\ndata: {payload}\n\n"
                await asyncio.sleep(.1)
            yield ": stream window ended; reconnect with Last-Event-ID\n\n"
        return StreamingResponse(emit(),media_type="text/event-stream",
            headers={"Cache-Control":"no-store","X-Accel-Buffering":"no",
                     "X-Content-Type-Options":"nosniff"})

    @router.websocket("/projects/{project_id}/events/ws")
    async def events_ws(ws:WebSocket,project_id:str):
        # Sec-WebSocket-Protocol list: exactly protocol marker and ticket.
        # No query strings, cookie sessions or X-Principal role claims.
        if ws.scope.get("query_string"):
            await ws.close(code=1008)
            return
        values=[s.strip() for s in ws.headers.get("sec-websocket-protocol","").split(",")]
        if len(values)!=2 or values[0]!="wfs.v4":
            await ws.close(code=1008)
            return
        try:
            row=tickets.take(values[1],project_id)
        except ValueError:
            row=None
        if row is None or tickets.token_active(row["token_hash"])!=row["principal"]:
            await ws.close(code=1008)
            return
        principal=row["principal"]
        try:
            rbac.require(principal,project_id,"read")
        except (AccessDenied,ValueError):
            await ws.close(code=1008)
            return
        await ws.accept(subprotocol="wfs.v4")
        cursor=0
        try:
            for _ in range(120):
                if tickets.token_active(row["token_hash"])!=principal:
                    await ws.close(code=1008)
                    return
                try:
                    rbac.require(principal,project_id,"read")
                except (AccessDenied,ValueError):
                    await ws.close(code=1008)
                    return
                for event in events_since(project_id,cursor):
                    cursor=max(cursor,event["id"])
                    await ws.send_json(event)
                await asyncio.sleep(.1)
            await ws.close(code=1000)
        except Exception:
            # Disconnected clients are normal; do not expose database or
            # token details as WebSocket close messages.
            return

    return router
