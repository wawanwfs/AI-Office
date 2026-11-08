"""Fail-closed worker-only OpenAI-compatible SSE *provider* billing adapter.

Not an HTTP gateway, not user-facing live stream transport and not a
multi-provider implementation. The worker reserves an approved budget before
opening an HTTPS provider request; no unmetered retry or redirect is possible.
Content is buffered until real provider final usage settles successfully.
Unknown/partial usage remains financially held for operator reconciliation.
"""
import ipaddress
import json
from urllib.parse import urlsplit

import httpx
from cost_ledger import BudgetDenied


class ProviderStreamDenied(PermissionError):
    pass


def _approve_origin(base,allowed_hosts):
    parsed=urlsplit(base)
    if (parsed.scheme!="https" or parsed.username or parsed.password or
        not parsed.hostname or parsed.port not in (None,443) or
        parsed.query or parsed.fragment or parsed.hostname.endswith(".")):
        raise ProviderStreamDenied("HTTPS origin, standard port and no credentials required")
    host=parsed.hostname.lower()
    if host not in set(allowed_hosts):
        raise ProviderStreamDenied("provider hostname not allowlisted")
    if host=="localhost" or host.endswith(".local") or host.endswith(".internal"):
        raise ProviderStreamDenied("internal providers are forbidden")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ProviderStreamDenied("literal IP destination not approved")
    if not parsed.path.rstrip("/").endswith("/v1"):
        raise ProviderStreamDenied("only the operator-configured /v1 chat API is supported")
    return host,base.rstrip("/")+"/chat/completions"


async def buffered_metered_chat(*,ledger,project_id,task_id,agent_id,base_url,
                                allowed_hosts,api_key,model,messages,
                                max_completion_tokens,fence,
                                client_factory=None):
    """Return text ONLY after final SSE usage + ledger settlement.

    The caller (independent worker) supplies the trusted fence and model price.
    No arbitrary user URL, HTTP gateway route, or Docker access is exposed.
    """
    if not callable(fence):
        raise ProviderStreamDenied("live lease/approval fence is required")
    if not isinstance(api_key,str) or not api_key or "\n" in api_key or "\r" in api_key:
        raise ProviderStreamDenied("operator-owned provider secret required")
    if (isinstance(max_completion_tokens,bool) or
        not isinstance(max_completion_tokens,int) or not 1<=max_completion_tokens<=8192):
        raise ValueError("completion cap must be 1..8192")
    if (not isinstance(messages,list) or not 1<=len(messages)<=32 or
        any(not isinstance(m,dict) or set(m)!={"role","content"} or
            m["role"] not in ("system","user","assistant") or
            not isinstance(m["content"],str) or len(m["content"])>64000
            for m in messages)):
        raise ValueError("invalid bounded messages")
    host,url=_approve_origin(base_url,allowed_hosts)
    payload={"model":model,"messages":messages,"stream":True,
             "stream_options":{"include_usage":True},
             "max_tokens":max_completion_tokens}
    conservative=len(json.dumps(messages,ensure_ascii=False).encode("utf-8"))
    fence()
    reservation=ledger.reserve(project_id,task_id,agent_id,host,model,
                               prompt_tokens=conservative,
                               max_completion_tokens=max_completion_tokens)
    # Network failures, token cancellation and provider schema failures are
    # financially ambiguous. Never release or replay an unknown reservation.
    actual_usage=None
    text=[]
    used_bytes=0
    saw_done=False
    try:
        make_client=client_factory or (lambda:httpx.AsyncClient(
            timeout=120,follow_redirects=False,trust_env=False))
        async with make_client() as client:
            async with client.stream("POST",url,
                    headers={"Authorization":"Bearer "+api_key},
                    json=payload) as response:
                if response.status_code!=200:
                    raise RuntimeError("provider rejected streaming request")
                if "text/event-stream" not in response.headers.get("content-type",""):
                    raise RuntimeError("provider returned non-event-stream data")
                async for raw in response.aiter_lines():
                    fence()
                    if not raw or raw.startswith(":"):
                        continue
                    if not raw.startswith("data: "):
                        raise RuntimeError("unexpected provider SSE line")
                    item=raw[6:].strip()
                    if item=="[DONE]":
                        saw_done=True
                        break
                    try:
                        event=json.loads(item)
                    except (ValueError,TypeError) as exc:
                        raise RuntimeError("invalid provider event JSON") from exc
                    if not isinstance(event,dict):
                        raise RuntimeError("invalid provider event payload")
                    if event.get("usage") is not None:
                        if actual_usage is not None:
                            raise RuntimeError("duplicated provider usage event")
                        actual_usage=event["usage"]
                    for choice in event.get("choices",[]):
                        if not isinstance(choice,dict):
                            raise RuntimeError("invalid provider choices")
                        delta=choice.get("delta") or {}
                        content=delta.get("content")
                        if content is not None:
                            if not isinstance(content,str):
                                raise RuntimeError("invalid provider delta")
                            used_bytes+=len(content.encode("utf-8"))
                            if used_bytes>256*1024:
                                raise RuntimeError("provider output exceeded buffer cap")
                            text.append(content)
        fence()
        if not saw_done:
            raise RuntimeError("provider SSE ended without DONE marker")
        if not isinstance(actual_usage,dict):
            raise RuntimeError("provider SSE lacked final usage")
        ledger.settle(reservation,actual_usage)
        fence()
        return "".join(text)
    except BaseException as exc:
        ledger.mark_uncertain(reservation,
                              "provider SSE incomplete or uncertain: "+type(exc).__name__)
        raise
