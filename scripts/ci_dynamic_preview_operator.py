#!/usr/bin/env python3
"""Actual operator-only dynamic *template* previews: two stacks, lifecycle.

Disposable CI Docker host ONLY. No public gateway, arbitrary untrusted
source builds, provider credentials, or production deployment.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time

import httpx

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"backend"))
from preview_manager import TemplatePreviewManager,PreviewDenied

repo=Path(__file__).resolve().parents[1]
root=Path(tempfile.mkdtemp(prefix="wfs-preview-operator-"))
token_a=secrets.token_urlsafe(32)
token_b=secrets.token_urlsafe(32)
manager=TemplatePreviewManager(root/"registry.db",
    repo/"examples/fullstack-preview/compose.yaml",enabled=True)
proof={"mode":"real-disposable-operator-template-preview",
       "paid_provider_used":False,"production_deployment":False,
       "generic_user_code_preview":False,
       "stacks":[],"cleanup_confirmed":False}
names=("tenant-a","tenant-b")
ports=(19010,19011)
tokens=(token_a,token_b)
live=set()
target=repo/"artifacts"/"phase6-preview-manager"
target.mkdir(parents=True,exist_ok=True)

def health(port,token,other):
    base=f"http://127.0.0.1:{port}"
    with httpx.Client(timeout=4,trust_env=False) as client:
        for _ in range(60):
            try:
                ready=client.get(base+"/api/health")
                if ready.status_code==200 and ready.json().get("ok"):
                    break
            except httpx.HTTPError:
                pass
            time.sleep(.2)
        else:
            raise AssertionError("docker preview was not healthy")
        assert client.get(base+"/api/db").status_code==401
        assert client.get(base+"/api/db",
             headers={"Authorization":"Bearer "+other}).status_code==401
        ok=client.get(base+"/api/db",
             headers={"Authorization":"Bearer "+token})
        assert ok.status_code==200 and ok.json()["postgres_query"]==1
        stream=client.get(base+"/api/events",
             headers={"Authorization":"Bearer "+token})
        assert stream.status_code==200 and "event: database" in stream.text
        return True

try:
    a=manager.reserve(names[0],ports[0])
    b=manager.reserve(names[1],ports[1])
    assert a["compose_name"]!=b["compose_name"]
    try:
        manager.reserve("cross-project",ports[0])
        raise AssertionError("same port assigned to another tenant")
    except PreviewDenied:
        pass

    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        start=manager.start(project,port,token)
        live.add(project)
        assert start["phase"]=="running"
        assert start["url"]==f"http://127.0.0.1:{port}"
        assert not start["public_preview_ready"]
        assert health(port,token,other)
        manager.logs(project,token)
        proof["stacks"].append({"project_sha256":hashlib.sha256(project.encode()).hexdigest(),
                                "port":port,"postgresql_live":True,
                                "other_tenant_token_rejected":True,
                                "lifecycle":"started"})
    for project,port,token,other in zip(names,ports,tokens,
                                         (token_b,token_a)):
        assert manager.restart(project,token)["phase"]=="running"
        assert health(port,token,other)
    proof["restart_proved"]=True
    # Runtime firewall evidence: BOTH preview bridges must be internal,
    # API still reachable on host loopback, and the running API must fail
    # to reach two external IPs even with a direct socket connection.
    for project,token in zip(names,tokens):
        assigned=manager.status(project)["compose_name"]
        for net in ("preview-internal","preview-edge"):
            result=subprocess.run(["docker","network","inspect",
                                   assigned+"_"+net,"--format","{{.Internal}}"],
                                  capture_output=True,text=True,timeout=10,check=True)
            assert result.stdout.strip()=="true", f"network {net} has public egress"
        socket_probe="""import socket
for host,port in [('1.1.1.1',443),('169.254.169.254',80)]:
    try:
        sock=socket.create_connection((host,port),timeout=1.5)
    except OSError:
        continue
    sock.close()
    raise SystemExit('external egress unexpectedly available')
print('outbound IPv4 denied for both targets')
"""
        result=manager._invoke(manager.status(project),token,
            ["exec","-T","api","python","-c",socket_probe],timeout=20)
        assert "outbound IPv4 denied" in result
    proof["two_networks_per_project_internal"]=True
    proof["external_socket_egress_denied"]=True

    # Actual HTTP gateway TestClient -> authenticated project RBAC ->
    # read-only registry -> running loopback preview -> live PostgreSQL.
    # The HTTP gateway is never given the Docker socket or operator runner.
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from preview_proxy import PreviewRegistryReader, AuthenticatedPreviewRead
    from secure_control_api import create_secure_router, TokenStore
    from master_queue import DurableMasterQueue
    from cost_ledger import CostLedger
    from project_rbac import ProjectRBAC

    acl=ProjectRBAC(root/"rbac.db")
    http_tokens=TokenStore(root/"http_tokens.db")
    for index,project in enumerate(names):
        acl.bootstrap_owner(project,f"owner-{index}")
    app=FastAPI()
    credentials=dict(zip(names,tokens))
    reader=AuthenticatedPreviewRead(PreviewRegistryReader(root/"registry.db"),
                                    token_for_project=credentials.get)
    app.include_router(create_secure_router(
        queue=DurableMasterQueue(root/"queue.db"),
        rbac=acl,ledger=CostLedger(root/"ledger.db"),
        tokens=http_tokens,preview_reader=reader))
    with TestClient(app) as gateway:
        auth=[{"Authorization":"Bearer "+http_tokens.mint_local(f"owner-{i}")}
              for i in range(2)]
        base="/api/v4/projects/"
        for i,project in enumerate(names):
            endpoint=base+project+"/preview/api/db"
            assert gateway.get(endpoint).status_code==401
            assert gateway.get(endpoint,headers=auth[1-i]).status_code==404
            verified=gateway.get(endpoint,headers=auth[i])
            assert verified.status_code==200,verified.text
            assert verified.json()["postgres_query"]==1
            assert verified.headers["cache-control"]=="no-store"
            assert "set-cookie" not in verified.headers
            readonly=gateway.get(base+project+"/preview",headers=auth[i])
            assert readonly.status_code==200
            assert readonly.headers["x-frame-options"]=="DENY"
            assert gateway.get(base+project+"/preview/api/events",
                               headers=auth[i]).status_code==409
    proof["authenticated_preview_http_two_tenants"]=True
    proof["upstream_public_bearer_not_forwarded"]=True
    proof["operator_registry_read_only"]=True

finally:
    errors=[]
    for project,token in zip(names,tokens):
        try:
            status=manager.status(project)
            if status["phase"] in ("running","uncertain"):
                manager.stop(project,token,allow_data_loss=True)
            if manager.status(project)["phase"]=="stopped":
                continue
        except (PreviewDenied,OSError,subprocess.TimeoutExpired) as exc:
            errors.append(type(exc).__name__)
    probe=subprocess.run(["docker","ps","-a","--filter","name=wfs-preview-",
                           "--format","{{.Names}}"],
                         capture_output=True,text=True,timeout=20,check=True)
    proof["cleanup_confirmed"]=not probe.stdout.strip() and not errors
    (target/"operator-preview-proof.json").write_text(json.dumps(proof,indent=2))
    assert proof["cleanup_confirmed"],"operator preview cleanup not verified"

assert proof["restart_proved"] and len(proof["stacks"])==2
print(json.dumps(proof,sort_keys=True))
