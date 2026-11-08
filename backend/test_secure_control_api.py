"""Real FastAPI TestClient contract: principal auth, cross-tenant deny and RBAC."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from cost_ledger import CostLedger
from master_queue import DurableMasterQueue
from project_rbac import ProjectRBAC
from secure_control_api import TokenStore, create_secure_router


class StubEngine:
    def __init__(self):
        self.approved=True
        self.paused=False
    def get_task(self,task_id):
        if task_id==1:
            return {"id":1,"project":"alpha","role":"design","status":"pending"}
        if task_id==2:
            return {"id":2,"project":"bravo","role":"qa","status":"pending"}
        if task_id==3:
            return {"id":3,"project":"alpha","role":"backend","status":"pending"}
        if task_id==4:
            return {"id":4,"project":"alpha","role":"frontend","status":"pending"}
        return None
    def require_launch_approval(self,project_id):
        if not self.approved:
            raise PermissionError("revoked")
    def is_paused(self):
        return self.paused
    def add_task(self,project,title,role,prompt):
        self.created=getattr(self,"created",[])
        task_id=100+len(self.created)
        task={"id":task_id,"project":project,"title":title,"role":role,
              "prompt":prompt,"status":"pending"}
        self.created.append(task)
        return task_id


@pytest.fixture
def api(tmp_path):
    q=DurableMasterQueue(tmp_path/"q.db")
    acl=ProjectRBAC(tmp_path/"acl.db")
    ledger=CostLedger(tmp_path/"cost.db")
    tokens=TokenStore(tmp_path/"tokens.db")
    engine=StubEngine()
    acl.bootstrap_owner("alpha","alice")
    acl.bootstrap_owner("bravo","bob")
    acl.set_role("alice","alpha","worker","worker")
    acl.set_role("alice","alpha","observer","viewer")
    ledger.set_budget("alpha",1_000_000,approved_by="alice")
    ledger.set_budget("bravo",1_000_000,approved_by="bob")
    app=FastAPI()
    app.include_router(create_secure_router(queue=q,rbac=acl,ledger=ledger,
                                             tokens=tokens,taskengine=engine))
    def headers(principal):
        return {"Authorization":"Bearer "+tokens.mint_local(principal)}
    return TestClient(app),q,acl,ledger,tokens,engine,headers


def test_anonymous_fake_identity_and_wrong_token_cannot_read(api):
    c,q,acl,ledger,tokens,engine,headers=api
    p="/api/v4/projects/alpha/jobs"
    assert c.get(p).status_code==401
    assert c.get(p,headers={"X-Principal":"alice"}).status_code==401
    assert c.get(p+"?token=fake").status_code==401
    assert c.get(p,headers={"Authorization":"Bearer madeup"}).status_code==401
    assert c.get(p,headers=headers("alice")).status_code==200


def test_cross_tenant_read_budget_members_and_cancel_denied(api):
    c,q,acl,ledger,tokens,engine,headers=api
    alice=headers("alice")
    bob=headers("bob")
    base="/api/v4/projects/"
    for suffix in ("jobs","events","budget","usage","members"):
        assert c.get(base+"bravo/"+suffix,headers=alice).status_code==404
        assert c.get(base+"alpha/"+suffix,headers=bob).status_code==404
    assert c.get(base+"alpha/budget",headers=alice).json()["approved"] is True
    job=q.submit("bravo","2","qa")
    assert c.post(base+f"alpha/jobs/{job}/cancel",headers=alice).status_code==404
    assert c.post(base+f"bravo/jobs/{job}/cancel",headers=bob).status_code==200


def test_enqueued_task_not_executed_and_approval_recheck(api):
    c,q,acl,ledger,tokens,engine,headers=api
    alice=headers("alice")
    p="/api/v4/projects/alpha/tasks/1/enqueue"
    out=c.post(p,headers=alice)
    assert out.status_code==202
    assert out.json()["execution_started"] is False
    assert q.get(out.json()["job_id"])["status"]=="queued"
    assert c.post(p,headers=alice).json()["job_id"]==out.json()["job_id"]
    assert c.post("/api/v4/projects/bravo/tasks/1/enqueue",headers=headers("bob")).status_code==404
    engine.approved=False
    assert c.post(p,headers=alice).status_code==403
    engine.approved=True
    acl.revoke("alice","alpha","observer")
    assert c.post(p,headers=headers("observer")).status_code==404


def test_viewer_and_worker_may_not_enqueue_or_cancel(api):
    c,q,acl,ledger,tokens,engine,headers=api
    p="/api/v4/projects/alpha/tasks/1/enqueue"
    for principal in ("observer","worker"):
        assert c.post(p,headers=headers(principal)).status_code==404
    job=q.submit("alpha","1","design")
    assert c.post("/api/v4/projects/alpha/jobs/"+job+"/cancel",
                  headers=headers("observer")).status_code==404
    assert c.get("/api/v4/projects/alpha/events",
                 headers=headers("observer")).status_code==200


def test_expired_revoked_tokens_are_real_auth_failures(api):
    c,q,acl,ledger,tokens,engine,headers=api
    token=tokens.mint_local("alice")
    p="/api/v4/projects/alpha/jobs"
    assert c.get(p,headers={"Authorization":"Bearer "+token}).status_code==200
    assert tokens.revoke_local(token)
    assert c.get(p,headers={"Authorization":"Bearer "+token}).status_code==401
    raw=token
    with open(tokens.path,"rb") as f:
        dbbytes=f.read()
    assert raw.encode() not in dbbytes


def test_scope_checked_after_principal_role_revocation(api):
    c,q,acl,ledger,tokens,engine,headers=api
    token=headers("observer")
    url="/api/v4/projects/alpha/budget"
    assert c.get(url,headers=token).status_code==200
    acl.revoke("alice","alpha","observer")
    assert c.get(url,headers=token).status_code==404



def test_coding_task_intake_disabled_by_default_even_for_project_owner(api):
    c,q,acl,ledger,tokens,engine,headers=api
    resp=c.post("/api/v4/projects/alpha/tasks/3/enqueue",headers=headers("alice"))
    assert resp.status_code==409
    assert q.list("alpha")==[]


def test_only_explicitly_approved_python_code_roles_may_enter_queue(api):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from secure_control_api import create_secure_router
    c,q,acl,ledger,tokens,engine,headers=api
    app=FastAPI()
    app.include_router(create_secure_router(
        queue=q,rbac=acl,ledger=ledger,tokens=tokens,taskengine=engine,
        code_qa_intake_enabled=True))
    approved=TestClient(app)
    owner=headers("alice")
    assert approved.post("/api/v4/projects/alpha/tasks/3/enqueue",
                         headers=headers("observer")).status_code==404
    assert approved.post("/api/v4/projects/alpha/tasks/4/enqueue",
                         headers=owner).status_code==409
    outcome=approved.post("/api/v4/projects/alpha/tasks/3/enqueue",headers=owner)
    assert outcome.status_code==202
    assert outcome.json()["execution_started"] is False
    assert q.get(outcome.json()["job_id"])["role"]=="backend"



def test_authenticated_brief_creates_real_task_and_durable_job_only_when_ready(api):
    c,q,acl,ledger,tokens,engine,headers=api
    app=FastAPI()
    app.include_router(create_secure_router(queue=q,rbac=acl,ledger=ledger,
        tokens=tokens,taskengine=engine,code_qa_intake_enabled=True))
    client=TestClient(app)
    q.set_paused(False)
    path="/api/v4/projects/alpha/briefs"
    body={"title":"Buat API inventori","brief":"Bangun aplikasi inventori dengan endpoint daftar barang dan pengujian unittest minimal.","role":"backend"}
    assert client.post(path,json=body).status_code==401
    assert client.post(path,headers={"X-Principal":"alice"},json=body).status_code==401
    assert client.post(path,headers=headers("bob"),json=body).status_code==404
    assert client.post(path,headers=headers("observer"),json=body).status_code==404
    assert not getattr(engine,"created",None)
    ok=client.post(path,headers=headers("alice"),json=body)
    assert ok.status_code==202,ok.text
    payload=ok.json()
    assert payload["execution_started"] is False
    assert payload["qa_required"] is True
    assert payload["preview_published"] is False
    task=engine.created[0]
    assert task["project"]=="alpha" and task["role"]=="backend"
    job=q.get(payload["job_id"])
    assert job["task_id"]==str(payload["task_id"]) and job["project_id"]=="alpha"
    assert job["status"]=="queued" and job["max_attempts"]==1
    assert ok.headers["Cache-Control"]=="no-store"


def test_brief_intake_rejects_unapproved_paused_invalid_roles_and_payloads(api):
    c,q,acl,ledger,tokens,engine,headers=api
    app=FastAPI()
    app.include_router(create_secure_router(queue=q,rbac=acl,ledger=ledger,
        tokens=tokens,taskengine=engine,code_qa_intake_enabled=True))
    client=TestClient(app)
    q.set_paused(False)
    url="/api/v4/projects/alpha/briefs"
    auth=headers("alice")
    good={"title":"Proyek pengujian","brief":"Buat kode layanan berbasis Python dengan pengujian yang dapat dieksekusi.","role":"backend2"}
    for changes in ({"role":"frontend"},{"role":"devops"},{"brief":"short"},
                    {"title":"a"},{"project_id":"bravo"},{"command":"docker ps"}):
        body={**good,**changes}
        expected=422
        # Extra input fields have no authority; strict role and length validate.
        result=client.post(url,headers=auth,json=body)
        assert result.status_code==expected
    before=len(getattr(engine,"created",[]))
    engine.approved=False
    assert client.post(url,headers=auth,json=good).status_code==403
    engine.approved=True
    engine.paused=True
    assert client.post(url,headers=auth,json=good).status_code==403
    engine.paused=False
    q.set_paused(False)
    assert len(getattr(engine,"created",[]))==before


def test_brief_intake_disabled_by_default_and_bare_client_fields_never_create(api):
    c,q,acl,ledger,tokens,engine,headers=api
    url="/api/v4/projects/alpha/briefs"
    body={"title":"Make service","brief":"An approved isolated service with at least one objective unittest."}
    assert c.post(url,headers=headers("alice"),json=body).status_code==503
    assert not getattr(engine,"created",None)
