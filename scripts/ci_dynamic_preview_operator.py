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
