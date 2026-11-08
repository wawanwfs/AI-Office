"""Strict production posture blocks unmetered HTTP requests.

No production server or provider is contacted.
"""
from fastapi.testclient import TestClient
import wfs_server as server


def test_strict_mode_rejects_http_paid_dispatch_and_chat(monkeypatch):
    monkeypatch.setenv("WFS_MASTER_QUEUE_REQUIRED","1")
    monkeypatch.setenv("WFS_METERING_REQUIRED","1")
    with TestClient(server.app) as c:
        r=c.post("/api/tasks/1/run")
        # The task may be paused; both 409 (paused) and 503 (strict mode)
        # are secure. _schedule itself always rejects, even without HTTP.
        assert r.status_code in (409,503)
        assert c.post("/api/chat",json={
            "agent_id":"be1","message":"hello","history":[]}).status_code==503
        assert c.post("/api/test",json={
            "base":"https://example.com","key":"test","model":"m"}).status_code==503
    try:
        server._schedule([123])
    except server.HTTPException as exc:
        assert exc.status_code==503
    else:
        raise AssertionError("HTTP scheduler bypassed strict master queue")


def test_strict_env_not_required_for_readonly_health(monkeypatch):
    monkeypatch.setenv("WFS_MASTER_QUEUE_REQUIRED","1")
    monkeypatch.setenv("WFS_METERING_REQUIRED","1")
    with TestClient(server.app) as c:
        assert c.get("/api/health").status_code==200
