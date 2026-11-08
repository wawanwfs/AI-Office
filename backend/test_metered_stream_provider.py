"""Mock HTTPS provider SSE tests: no external network or paid API calls."""
import asyncio
import json
import httpx
import pytest

from cost_ledger import CostLedger, BudgetDenied
from metered_stream_provider import buffered_metered_chat,ProviderStreamDenied

def sse(chunks,usage=None,done=True):
    data=[]
    for part in chunks:
        data.append("data: "+json.dumps({"choices":[{"delta":{"content":part}}]})+"\n\n")
    if usage is not None:
        data.append("data: "+json.dumps({"choices":[],"usage":usage})+"\n\n")
    if done:
        data.append("data: [DONE]\n\n")
    return "".join(data).encode()


@pytest.fixture
def env(tmp_path):
    ledger=CostLedger(tmp_path/"ledger.db")
    ledger.set_budget("alpha",100000,approved_by="owner")
    ledger.set_price("billing.example","model-one",
        input_microusd_per_million=1000000,
        output_microusd_per_million=2000000)
    calls=[]
    def factory(response):
        def transport(request):
            calls.append(request)
            return response
        return lambda:httpx.AsyncClient(transport=httpx.MockTransport(transport),
                      timeout=2,follow_redirects=False,trust_env=False)
    def invoke(factory_fn,**changes):
        args=dict(ledger=ledger,project_id="alpha",task_id="t1",
                  agent_id="agent1",base_url="https://billing.example/v1",
                  allowed_hosts={"billing.example"},api_key="fixture-token",
                  model="model-one",
                  messages=[{"role":"user","content":"Say hello"}],
                  max_completion_tokens=100,
                  fence=lambda:None,client_factory=factory_fn)
        args.update(changes)
        return asyncio.run(buffered_metered_chat(**args))
    return ledger,calls,factory,invoke


def test_complete_provider_sse_reconciles_usage_and_returns_content(env):
    ledger,calls,factory,invoke=env
    response=httpx.Response(200,headers={"content-type":"text/event-stream"},
        content=sse(["Hel","lo"],{"prompt_tokens":3,"completion_tokens":5}))
    assert invoke(factory(response))=="Hello"
    assert len(calls)==1
    assert str(calls[0].url)=="https://billing.example/v1/chat/completions"
    payload=json.loads(calls[0].content)
    assert payload["stream_options"]=={"include_usage":True}
    assert payload["max_tokens"]==100
    row=ledger.history("alpha")[0]
    assert row["status"]=="settled"
    assert row["actual_prompt"]==3 and row["actual_completion"]==5
    assert row["actual_microusd"]==13


@pytest.mark.parametrize("body",[
    sse(["partial"],None),
    sse(["partial"],{"prompt_tokens":3,"completion_tokens":5},done=False),
    b"data: not-valid-json\n\ndata: [DONE]\n\n",
])
def test_incomplete_or_invalid_provider_sse_is_held_not_free(env,body):
    ledger,calls,factory,invoke=env
    response=httpx.Response(200,headers={"content-type":"text/event-stream"},
                            content=body)
    with pytest.raises(RuntimeError):
        invoke(factory(response))
    assert ledger.history("alpha")[0]["status"]=="unknown"
    assert ledger.summary("alpha")["remaining_microusd"]<100000


def test_redirect_is_not_followed_and_uncertain_charge_is_held(env):
    ledger,calls,factory,invoke=env
    response=httpx.Response(302,headers={"location":"http://169.254.169.254/"})
    with pytest.raises(RuntimeError):
        invoke(factory(response))
    assert len(calls)==1
    assert ledger.history("alpha")[0]["status"]=="unknown"


def test_unapproved_host_prevents_reservation_and_http(env):
    ledger,calls,factory,invoke=env
    response=httpx.Response(200,headers={"content-type":"text/event-stream"},
         content=sse(["x"],{"prompt_tokens":1,"completion_tokens":1}))
    for base in ("http://billing.example/v1","https://127.0.0.1/v1",
                 "https://billing.example:444/v1","https://billing.example.evil/v1"):
        with pytest.raises(ProviderStreamDenied):
            invoke(factory(response),base_url=base)
    assert calls==[] and ledger.history("alpha")==[]


def test_budget_hard_cap_stops_stream_before_network(env):
    ledger,calls,factory,invoke=env
    ledger.set_budget("alpha",1,approved_by="owner")
    response=httpx.Response(200,headers={"content-type":"text/event-stream"},
         content=sse(["x"],{"prompt_tokens":1,"completion_tokens":1}))
    with pytest.raises(BudgetDenied):
        invoke(factory(response))
    assert calls==[]


def test_fence_revoked_after_provider_event_retains_uncertain_reservation(env):
    ledger,calls,factory,invoke=env
    count=[0]
    def fence():
        count[0]+=1
        if count[0]>=3:
            raise PermissionError("lease revoked")
    response=httpx.Response(200,headers={"content-type":"text/event-stream"},
          content=sse(["hello"],{"prompt_tokens":3,"completion_tokens":5}))
    with pytest.raises(PermissionError):
        invoke(factory(response),fence=fence)
    assert ledger.history("alpha")[0]["status"]=="unknown"
