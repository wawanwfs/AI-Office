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
