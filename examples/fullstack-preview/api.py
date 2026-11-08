"""Disposable Phase 5 preview contract (NOT the production gateway).

A real React/Vite UI, FastAPI service, and PostgreSQL backend share one
same-origin preview. Only a CI-supplied ephemeral bearer can read private
DB data, SSE, WebSocket tickets or artifact output. Never expose to WAN.
"""
import asyncio
from contextlib import closing
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time
from urllib.parse import urlsplit

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

SECRET=os.environ.get("WFS_PREVIEW_TEST_TOKEN","")
URL=os.environ.get("DATABASE_URL","")
if len(SECRET)<32 or not URL.startswith("postgresql://"):
    raise RuntimeError("Preview demo requires disposable test auth and DB configuration")

app=FastAPI(docs_url=None,openapi_url=None,redoc_url=None)
_tickets={}
_lock=threading.Lock()

def check_bearer(authorization: str|None=Header(default=None)):
    if not authorization or not hmac.compare_digest(authorization,"Bearer "+SECRET):
        raise HTTPException(401,"Ephemeral bearer required")
    return "ci-preview-principal"

def database_value():
    with closing(psycopg.connect(URL,connect_timeout=4)) as db:
        with db.cursor() as cur:
            cur.execute("SELECT 1")
            return int(cur.fetchone()[0])

@app.get("/api/health")
def health():
    try:
        return {"ok":database_value()==1,"services":["React/Vite","FastAPI","PostgreSQL"],
                "backend":"actual Docker PostgreSQL"}
    except Exception:
        raise HTTPException(503,"Database unavailable")

@app.get("/api/db")
def db_info(_:str=Depends(check_bearer)):
    return {"postgres_query":database_value(),"synthetic":False}

@app.get("/api/events")
async def sse(_:str=Depends(check_bearer)):
    async def events():
        yield "event: database\ndata: "+json.dumps({"postgres_query":await asyncio.to_thread(database_value)})+"\n\n"
        yield ": complete\n\n"
    return StreamingResponse(events(),media_type="text/event-stream",
        headers={"Cache-Control":"no-store","X-Accel-Buffering":"no"})

@app.post("/api/ws-ticket")
def ws_ticket(_:str=Depends(check_bearer)):
    raw=secrets.token_urlsafe(32)
    with _lock:
        _tickets[raw]=time.monotonic()+30
    return Response(content=json.dumps({"ticket":raw,"expires_seconds":30}),
        media_type="application/json",headers={"Cache-Control":"no-store"})

@app.websocket("/api/ws")
async def ws_preview(ws:WebSocket):
    if ws.scope.get("query_string"):
        await ws.close(code=1008)
        return
    args=[x.strip() for x in ws.headers.get("sec-websocket-protocol","").split(",")]
    if len(args)!=2 or args[0]!="wfs.preview.v1":
        await ws.close(code=1008)
        return
    ticket=args[1]
    with _lock:
        deadline=_tickets.pop(ticket,None)
    if not deadline or deadline<time.monotonic():
        await ws.close(code=1008)
        return
    await ws.accept(subprotocol="wfs.preview.v1")
    result=await asyncio.to_thread(database_value)
    await ws.send_json({"postgres_query":result,"source":"real PostgreSQL"})
    await ws.close()

@app.get("/api/artifact")
def download(_:str=Depends(check_bearer)):
    data=json.dumps({"test_result":"real fullstack services","database":database_value()},
                    sort_keys=True).encode()
    return Response(content=data,media_type="application/json",
        headers={"Cache-Control":"no-store","Content-Disposition":"attachment",
                 "X-Content-Type-Options":"nosniff"})

app.mount("/",StaticFiles(directory="/app/dist",html=True),name="vite")
