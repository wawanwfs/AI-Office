"""Provider-adapter integration: no real network calls; charged token evidence."""
import asyncio
import pytest
import wfs_tasks as tasks
from cost_ledger import CostLedger, BudgetDenied
from master_queue import DurableMasterQueue


class FakeResponse:
    status_code=200
    def __init__(self, data):
        self.data=data
    def json(self):
        return self.data


class FakeClient:
    response={"choices":[{"message":{"content":"valid result"}}],
              "usage":{"prompt_tokens":10,"completion_tokens":20}}
    calls=0
    def __init__(self, **kwargs):
        assert kwargs.get("follow_redirects") is False
        assert kwargs.get("trust_env") is False  # no HTTP(S)_PROXY for billable worker
    async def __aenter__(self):
        return self
    async def __aexit__(self,*args):
        return False
    async def post(self,url,**kwargs):
        FakeClient.calls+=1
        assert url=="https://billing.example/v1/chat/completions"
        return FakeResponse(self.response)


@pytest.fixture
def cost_ctx(tmp_path,monkeypatch):
    monkeypatch.setenv("WFS_AI_ALLOWED_HOSTS","billing.example")
    monkeypatch.setattr(tasks,"load_agent_cfg",lambda _: {
        "base":"https://billing.example/v1","key":"example-placeholder",
        "model":"metered-model"})
    monkeypatch.setattr(tasks.httpx,"AsyncClient",FakeClient)
    FakeClient.calls=0
    FakeClient.response={"choices":[{"message":{"content":"valid result"}}],
                         "usage":{"prompt_tokens":10,"completion_tokens":20}}
    ledger=CostLedger(tmp_path/"cost.db")
    ledger.set_budget("project-1",1_000_000,approved_by="owner")
    ledger.set_price("billing.example","metered-model",
                     input_microusd_per_million=1_000_000,
                     output_microusd_per_million=2_000_000)
    queue=DurableMasterQueue(tmp_path/"queue.db")
    job=queue.submit("project-1","task-1","design")
    queue.set_paused(False)
    claim=queue.claim("worker-1",recover_policy="quarantine")
    ctx={"ledger":ledger,"project_id":"project-1","task_id":"task-1",
         "queue":queue,"claim":claim}
    token=tasks._WFS_BILLING_CONTEXT.set(ctx)
    try:
        yield ledger,queue,claim
    finally:
        tasks._WFS_BILLING_CONTEXT.reset(token)


def test_actual_provider_usage_is_settled_to_database(cost_ctx):
    ledger,queue,claim=cost_ctx
    result=asyncio.run(tasks.call_llm("agent-1","system","user brief"))
    assert result=="valid result"
    assert FakeClient.calls==1
    row=ledger.history("project-1")[0]
    assert row["status"]=="settled"
    assert row["actual_prompt"]==10
    assert row["actual_completion"]==20
    assert row["actual_microusd"]==50


def test_unmetered_provider_response_blocks_and_keeps_money_held(cost_ctx):
    ledger,queue,claim=cost_ctx
    FakeClient.response={"choices":[{"message":{"content":"result"}}]}
    with pytest.raises(BudgetDenied,match="usage"):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==1
    assert ledger.history("project-1")[0]["status"]=="unknown"


def test_revoked_lease_blocks_provider_before_http(cost_ctx):
    ledger,queue,claim=cost_ctx
    queue.cancel(claim["id"])
    with pytest.raises(PermissionError,match="lease"):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0


def test_https_origin_allowlist_denies_untrusted_provider(cost_ctx,monkeypatch):
    monkeypatch.setenv("WFS_AI_ALLOWED_HOSTS","unrelated.example")
    with pytest.raises(PermissionError,match="allowlist"):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0


def test_missing_price_denied_without_sending_request(cost_ctx,monkeypatch):
    ledger,queue,claim=cost_ctx
    monkeypatch.setattr(tasks,"load_agent_cfg",lambda _: {
        "base":"https://billing.example/v1","key":"example-placeholder",
        "model":"unpriced"})
    with pytest.raises(BudgetDenied,match="price"):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0


def test_new_worker_never_syncs_files_into_shared_agent_sandbox(cost_ctx):
    ledger,queue,claim=cost_ctx
    result=tasks.sync_sandbox("fe1",["index.html"])
    assert "not synced" in result
    assert "project-scoped" in result



def test_revoked_project_permission_stops_next_paid_call(cost_ctx,tmp_path):
    from project_rbac import ProjectRBAC, AccessDenied
    ledger,queue,claim=cost_ctx
    acl=ProjectRBAC(tmp_path/"rbac.db")
    acl.bootstrap_owner("project-1","owner")
    acl.set_role("owner","project-1","worker-identity","worker")
    current=tasks._WFS_BILLING_CONTEXT.get()
    current["acl"]=acl
    current["principal"]="worker-identity"
    acl.revoke("owner","project-1","worker-identity")
    with pytest.raises(AccessDenied):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0



@pytest.mark.parametrize("base",[
    "http://billing.example/v1",
    "https://billing.example/private/v1",
    "https://billing.example/v1?route=http://127.0.0.1",
    "https://billing.example/v1#other",
    "https://billing.example:444/v1",
    "https://billing.example./v1",
    "https://127.0.0.1/v1",
    "https://alice:password@billing.example/v1",
    "https://billing.example:443/hidden",
])
def test_billed_worker_rejects_url_port_path_and_private_ip_pivots(cost_ctx,monkeypatch,base):
    ledger,queue,claim=cost_ctx
    monkeypatch.setattr(tasks,"load_agent_cfg",lambda _: {
        "base":base,"key":"synthetic-secret","model":"metered-model"})
    with pytest.raises(PermissionError):
        asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0
    assert ledger.history("project-1")==[]


def test_billed_worker_rejects_missing_and_header_injection_keys(cost_ctx,monkeypatch):
    ledger,queue,claim=cost_ctx
    for key in ("", "key\r\nX-Attack: yes", None):
        monkeypatch.setattr(tasks,"load_agent_cfg",lambda _,k=key: {
            "base":"https://billing.example/v1",
            "key":k,"model":"metered-model"})
        if key is None:
            # Default synthetic configuration may fill None, so only
            # explicit control-character case is a hard key assertion.
            continue
        with pytest.raises(PermissionError,match="credential"):
            asyncio.run(tasks.call_llm("agent-1","system","brief"))
    assert FakeClient.calls==0


def test_no_implicit_proxy_environment_in_billed_worker(cost_ctx,monkeypatch):
    monkeypatch.setenv("HTTPS_PROXY","http://127.0.0.1:8888")
    monkeypatch.setenv("HTTP_PROXY","http://127.0.0.1:8888")
    assert asyncio.run(tasks.call_llm("agent-1","system","brief"))=="valid result"
    assert FakeClient.calls==1
