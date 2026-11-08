"""Gateway route isolation: old bearer headers do NOT authorize unscoped APIs."""
import pytest
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from legacy_api_firewall import LegacyAPIFirewall


def make_client():
    app=FastAPI()

    @app.get("/api/health")
    def health():
        return {"status":"live"}

    @app.get("/api/tasks")
    def legacy():
        return {"secret":"legacy unscoped prompt"}

    @app.get("/api/projects/p1/logs")
    def logs():
        return {"secret":"cross-tenant logs"}

    @app.get("/preview/p1/")
    def preview():
        return "private preview"

    @app.get("/api/events")
    def sse():
        return "SSE data"

    @app.get("/api/v4/me")
    def scoped():
        return {"principal":"verified in actual v4 router"}

    @app.websocket("/ws/p1")
    async def ws(sock:WebSocket):
        await sock.accept()
        await sock.send_text("private")
        await sock.close()

    @app.get("/")
    def landing():
        return "WFS landing"
    app.add_middleware(LegacyAPIFirewall)
    return TestClient(app)


@pytest.mark.parametrize("path",[
    "/api/tasks","/api/projects/p1/logs","/preview/p1/","/api/events",
    "/api/chat","/api/sandbox/agent/exec","/terminal/session",
])
def test_legacy_routes_are_not_bypassed_by_bearer_token(path):
    c=make_client()
    for headers in ({},{"Authorization":"Bearer user-token"},
                    {"X-Principal":"owner","X-Project":"p1"}):
        reply=c.get(path,headers=headers)
        assert reply.status_code==404
        assert "secret" not in reply.text
        assert reply.headers["Cache-Control"]=="no-store"


def test_explicit_allowlist_does_not_match_prefix_spoofing():
    c=make_client()
    assert c.get("/api/v4/me").status_code==200
    assert c.get("/api/v4evil/me").status_code==404
    assert c.get("/api/health").status_code==200
    assert c.get("/").status_code==200


def test_websocket_hard_closed_even_with_fake_identity():
    c=make_client()
    with pytest.raises(WebSocketDisconnect) as exc:
        with c.websocket_connect("/ws/p1",headers={"Authorization":"Bearer fake"}):
            pass
    assert exc.value.code==1008


def test_project_scoped_v4_ticket_stream_is_reachable_only_through_real_auth():
    from master_queue import DurableMasterQueue
    from project_rbac import ProjectRBAC
    from secure_control_api import TokenStore
    from secure_streams import create_event_stream_router
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as dirname:
        root=Path(dirname)
        q=DurableMasterQueue(root/"q.db")
        q.submit("alpha","task-1","qa")
        acl=ProjectRBAC(root/"acl.db")
        acl.bootstrap_owner("alpha","alice")
        tokens=TokenStore(root/"tokens.db")
        app=FastAPI()
        app.include_router(create_event_stream_router(queue=q,rbac=acl,tokens=tokens))
        @app.websocket("/ws/private")
        async def old_ws(sock:WebSocket):
            await sock.accept()
        app.add_middleware(LegacyAPIFirewall)
        c=TestClient(app)
        bearer=tokens.mint_local("alice")
        ticket=c.post("/api/v4/projects/alpha/events/ticket",
                      headers={"Authorization":"Bearer "+bearer}).json()["ticket"]
        with c.websocket_connect("/api/v4/projects/alpha/events/ws",
                                 subprotocols=["wfs.v4",ticket]) as ws:
            message=ws.receive_json()
            assert message["project_id"]=="alpha"
        with pytest.raises(WebSocketDisconnect) as denied:
            with c.websocket_connect("/ws/private"):
                pass
        assert denied.value.code==1008
        with pytest.raises(WebSocketDisconnect) as malformed:
            with c.websocket_connect("/api/v4/projects/alpha/terminal/ws"):
                pass
        assert malformed.value.code==1008
