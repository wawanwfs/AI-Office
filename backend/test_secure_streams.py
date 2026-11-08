"""FastAPI SSE/WebSocket real ASGI tests for project-bound one-time tickets."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest
from master_queue import DurableMasterQueue
from project_rbac import ProjectRBAC
from secure_control_api import TokenStore
from secure_streams import create_event_stream_router,StreamTickets


@pytest.fixture
def ctx(tmp_path):
    q=DurableMasterQueue(tmp_path/"q.db")
    acl=ProjectRBAC(tmp_path/"acl.db")
    acl.bootstrap_owner("a","alice")
    acl.bootstrap_owner("b","bob")
    tokens=TokenStore(tmp_path/"token.db")
    app=FastAPI()
    app.include_router(create_event_stream_router(queue=q,rbac=acl,tokens=tokens))
    c=TestClient(app)
    auth=lambda p:tokens.mint_local(p)
    return c,q,acl,tokens,auth


def test_sse_requires_bearer_and_only_emits_current_project(ctx):
    c,q,acl,tokens,auth=ctx
    q.submit("a","t1","design")
    q.submit("b","t2","qa")
    url="/api/v4/projects/a/events/stream?ticks=1"
    assert c.get(url).status_code==401
    assert c.get(url,headers={"Authorization":"Bearer "+auth("bob")}).status_code==404
    got=c.get(url,headers={"Authorization":"Bearer "+auth("alice")})
    assert got.status_code==200
    assert got.headers["Content-Type"].startswith("text/event-stream")
    assert "t1" not in got.text  # queue events contain job ID and phase, not task payloads
    assert '"project_id":"a"' in got.text
    assert '"project_id":"b"' not in got.text


def test_one_time_ws_ticket_and_project_scope(ctx):
    c,q,acl,tokens,auth=ctx
    q.submit("a","t1","design")
    url="/api/v4/projects/a/events/ticket"
    assert c.post(url).status_code==401
    assert c.post(url,headers={"Authorization":"Bearer "+auth("bob")}).status_code==404
    issued=c.post(url,headers={"Authorization":"Bearer "+auth("alice")})
    assert issued.status_code==200
    ticket=issued.json()["ticket"]
    assert len(ticket)==43
    uri="/api/v4/projects/a/events/ws"
    with c.websocket_connect(uri,subprotocols=["wfs.v4",ticket]) as ws:
        event=ws.receive_json()
        assert event["project_id"]=="a"
    with pytest.raises(WebSocketDisconnect) as exc:
        with c.websocket_connect(uri,subprotocols=["wfs.v4",ticket]):
            pass
    assert exc.value.code==1008


def test_project_mismatch_and_query_token_are_denied(ctx):
    c,q,acl,tokens,auth=ctx
    issue=c.post("/api/v4/projects/a/events/ticket",
                 headers={"Authorization":"Bearer "+auth("alice")})
    ticket=issue.json()["ticket"]
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect("/api/v4/projects/b/events/ws",
                                 subprotocols=["wfs.v4",ticket]):
            pass
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect("/api/v4/projects/a/events/ws?token="+ticket,
                                 subprotocols=["wfs.v4",ticket]):
            pass


def test_revoked_bearer_before_ws_connect_denied(ctx):
    c,q,acl,tokens,auth=ctx
    bearer=auth("alice")
    ticket=c.post("/api/v4/projects/a/events/ticket",
                  headers={"Authorization":"Bearer "+bearer}).json()["ticket"]
    tokens.revoke_local(bearer)
    with pytest.raises(WebSocketDisconnect) as exc:
        with c.websocket_connect("/api/v4/projects/a/events/ws",
                                 subprotocols=["wfs.v4",ticket]):
            pass
    assert exc.value.code==1008


def test_tickets_bound_to_project_and_not_stored_in_plaintext(ctx):
    c,q,acl,tokens,auth=ctx
    bearer=auth("alice")
    tickets=StreamTickets(tokens)
    ticket=tickets.issue(bearer,"a")["ticket"]
    assert ticket.encode() not in open(tokens.path,"rb").read()
    assert tickets.take(ticket,"b") is None
    assert tickets.take(ticket,"a") is None
