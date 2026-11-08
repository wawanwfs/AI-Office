"""Cross-tenant and SSRF denial tests for the read-only preview inspection."""
import asyncio
import sqlite3
from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
import pytest

from cost_ledger import CostLedger
from master_queue import DurableMasterQueue
from preview_proxy import AuthenticatedPreviewRead, PreviewRegistryReader, PreviewProxyUnavailable
from project_rbac import ProjectRBAC
from secure_control_api import TokenStore, create_secure_router


@pytest.fixture
def scoped(tmp_path):
    db = tmp_path / "operator.db"
    with sqlite3.connect(db) as conn:
        conn.execute("CREATE TABLE wfs_preview_instances(project_id TEXT PRIMARY KEY,port INTEGER,phase TEXT)")
        conn.executemany("INSERT INTO wfs_preview_instances VALUES(?,?,?)", [
            ("alpha", 19010, "running"), ("bravo", 19011, "running"),
            ("stopped", 19012, "stopped"),
        ])
    preview_tokens = {"alpha": "A"*43, "bravo": "B"*43}
    requests = []

    def handler(req):
        requests.append(req)
        if req.url.path == "/api/db":
            key = "alpha" if req.url.port == 19010 else "bravo"
            if req.headers.get("authorization") != "Bearer " + preview_tokens[key]:
                return httpx.Response(401, json={"error": "denied"})
            return httpx.Response(200, json={"postgres_query": 1},
                                  headers={"set-cookie": "bad=1"})
        return httpx.Response(200, text="<h1>safe local preview</h1>",
                              headers={"content-type": "text/html", "set-cookie": "bad=1"})

    reader = PreviewRegistryReader(db)
    preview = AuthenticatedPreviewRead(reader, token_for_project=preview_tokens.get,
        client_factory=lambda: httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=2,
            follow_redirects=False, trust_env=False))
    rbac = ProjectRBAC(tmp_path/"rbac.db")
    tokens = TokenStore(tmp_path/"tokens.db")
    rbac.bootstrap_owner("alpha", "alice")
    rbac.bootstrap_owner("bravo", "bob")
    rbac.set_role("alice", "alpha", "viewer", "viewer")
    app = FastAPI()
    app.include_router(create_secure_router(
        queue=DurableMasterQueue(tmp_path/"queue.db"), rbac=rbac,
        ledger=CostLedger(tmp_path/"cost.db"), tokens=tokens, preview_reader=preview))
    def auth(principal):
        return {"Authorization": "Bearer "+tokens.mint_local(principal)}
    return TestClient(app), db, requests, preview_tokens, auth, rbac


def test_anonymous_cross_tenant_and_fake_identity_blocked(scoped):
    c, db, requests, keys, auth, rbac = scoped
    url = "/api/v4/projects/alpha/preview/api/db"
    assert c.get(url).status_code == 401
    assert c.get(url, headers={"X-Principal": "alice"}).status_code == 401
    assert c.get(url, headers=auth("bob")).status_code == 404
    assert requests == []
    good = c.get(url, headers=auth("alice"))
    assert good.status_code == 200 and good.json() == {"postgres_query": 1}
    assert requests[-1].url.port == 19010
    assert requests[-1].headers["Authorization"] == "Bearer " + keys["alpha"]
    assert "set-cookie" not in good.headers
    assert good.headers["cache-control"] == "no-store"
    assert "sandbox" in good.headers["content-security-policy"]
    assert c.get("/api/v4/projects/bravo/preview/api/db", headers=auth("bob")).status_code == 200
    assert requests[-1].url.port == 19011
    assert requests[-1].headers["Authorization"] == "Bearer " + keys["bravo"]


def test_unsafe_paths_and_unapproved_endpoint_do_not_reach_upstream(scoped):
    c, db, requests, keys, auth, rbac = scoped
    head = "/api/v4/projects/alpha/preview"
    assert c.get(head, headers=auth("alice")).status_code == 200
    baseline = len(requests)
    for path in ("api/private", "api/events", "api/db/secret",
                 ".git/config", "assets/../../api/db", "assets/foo%3Fbar"):
        response = c.get(head+"/"+path, headers=auth("alice"))
        assert response.status_code in (404, 409)
    assert len(requests) == baseline


def test_operator_state_and_revocation_rechecked_before_network(scoped):
    c, db, requests, keys, auth, rbac = scoped
    viewer = auth("viewer")
    path = "/api/v4/projects/alpha/preview/api/health"
    assert c.get(path, headers=viewer).status_code == 200
    baseline = len(requests)
    rbac.revoke("alice", "alpha", "viewer")
    assert c.get(path, headers=viewer).status_code == 404
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE wfs_preview_instances SET phase='uncertain' WHERE project_id='alpha'")
    assert c.get(path, headers=auth("alice")).status_code == 409
    assert len(requests) == baseline


def test_no_caller_defined_url_and_no_browser_token_fallback(scoped):
    c, db, requests, keys, auth, rbac = scoped
    keys.pop("alpha")
    path = "/api/v4/projects/alpha/preview/api/db"
    assert c.get(path, headers=auth("alice")).status_code == 409
    assert requests == []
    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE wfs_preview_instances SET port=80 WHERE project_id='alpha'")
    assert c.get("/api/v4/projects/alpha/preview/api/health",
                 headers=auth("alice")).status_code == 409
    assert requests == []


def test_redirect_and_response_size_deny_without_following(tmp_path):
    db = tmp_path/"registry.db"
    with sqlite3.connect(db) as c:
        c.execute("CREATE TABLE wfs_preview_instances(project_id TEXT,port INTEGER,phase TEXT)")
        c.execute("INSERT INTO wfs_preview_instances VALUES('alpha',19010,'running')")
    def mock(req):
        if req.url.path == "/api/health":
            return httpx.Response(302, headers={"Location": "http://169.254.169.254/"})
        return httpx.Response(200, content=b"x"*(2*1024*1024+1),
                              headers={"content-type": "text/plain"})
    proxy = AuthenticatedPreviewRead(PreviewRegistryReader(db),
        client_factory=lambda: httpx.AsyncClient(
            transport=httpx.MockTransport(mock), follow_redirects=False))
    with pytest.raises(PreviewProxyUnavailable, match="rejected"):
        asyncio.run(proxy.fetch("alpha", "api/health"))
    with pytest.raises(PreviewProxyUnavailable, match="2MiB"):
        asyncio.run(proxy.fetch("alpha", ""))
