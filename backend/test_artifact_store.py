"""Cross-tenant artifact download tests with real FastAPI auth and SHA-256 bytes."""
import hashlib
import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from artifact_store import VerifiedArtifacts, ArtifactNotReady
from cost_ledger import CostLedger
from master_queue import DurableMasterQueue
from project_rbac import ProjectRBAC
from secure_control_api import TokenStore, create_secure_router


@pytest.fixture
def example(tmp_path):
    root=tmp_path/"work"
    root.mkdir()
    q=DurableMasterQueue(tmp_path/"q.db")
    q.submit("alpha","task-1","backend")
    q.set_paused(False)
    claim=q.claim("worker")
    assert claim and claim["project_id"]=="alpha"
    job_id=claim["id"]
    rootdir=root/"alpha"/job_id/"attempt-1"
    rootdir.mkdir(parents=True)
    data=b"def hello():\n    return 'validated'\n"
    (rootdir/"app.py").write_bytes(data)
    manifest={
        "format":"wfs-artifact-qa-v1","project_id":"alpha","job_id":job_id,
        "attempt":1,"tests_passed":2,
        "files":{"app.py":hashlib.sha256(data).hexdigest()},
    }
    (rootdir/".wfs-qa-attestation.json").write_text(json.dumps(manifest))
    store=VerifiedArtifacts(root)
    acl=ProjectRBAC(tmp_path/"acl.db")
    acl.bootstrap_owner("alpha","alice")
    acl.bootstrap_owner("bravo","bob")
    budget=CostLedger(tmp_path/"cost.db")
    tokens=TokenStore(tmp_path/"tokens.db")
    app=FastAPI()
    app.include_router(create_secure_router(queue=q,rbac=acl,ledger=budget,tokens=tokens,
                                              artifact_store=store))
    c=TestClient(app)
    auth=lambda principal:{"Authorization":"Bearer "+tokens.mint_local(principal)}
    return c,q,store,acl,auth,rootdir,job_id,data


def test_artifact_hidden_until_queue_completed(example):
    c,q,store,acl,auth,rootdir,jid,data=example
    prefix=f"/api/v4/projects/alpha/jobs/{jid}/artifacts"
    assert c.get(prefix,headers=auth("alice")).status_code==409
    assert c.get(prefix+"/app.py",headers=auth("alice")).status_code==409
    claim=q.get(jid)
    assert claim["status"]=="leased"


def publish(example):
    c,q,store,acl,auth,rootdir,jid,data=example
    # See current lease token only through the private worker, never HTTP.
    with q._connect() as db:
        token=db.execute("SELECT lease_token FROM wfs_master_jobs WHERE id=?",(jid,)).fetchone()[0]
    assert q.finish(jid,"worker",token,success=True)=="completed"
    return f"/api/v4/projects/alpha/jobs/{jid}/artifacts"


def test_authenticated_artifact_hash_and_download(example):
    c,q,store,acl,auth,rootdir,jid,data=example
    p=publish(example)
    listing=c.get(p,headers=auth("alice"))
    assert listing.status_code==200
    assert listing.json()["files"]==[{"path":"app.py","sha256":hashlib.sha256(data).hexdigest()}]
    got=c.get(p+"/app.py",headers=auth("alice"))
    assert got.status_code==200
    assert got.content==data
    assert got.headers["content-type"]=="application/octet-stream"
    assert got.headers["cache-control"]=="no-store"


def test_cross_project_and_no_token_denied_even_with_known_file_path(example):
    c,q,store,acl,auth,rootdir,jid,data=example
    p=publish(example)
    assert c.get(p+"/app.py").status_code==401
    assert c.get(p+"/app.py",headers=auth("bob")).status_code==404
    assert c.get(p.replace("/alpha/","/bravo/")+"/app.py",
                 headers=auth("bob")).status_code==404
    assert c.get(p+"/app.py",headers={"X-Principal":"alice"}).status_code==401


def test_revocation_and_post_qa_tamper_fail_closed(example):
    c,q,store,acl,auth,rootdir,jid,data=example
    p=publish(example)
    token=auth("alice")
    (rootdir/"app.py").write_text("tampered")
    assert c.get(p+"/app.py",headers=token).status_code==409
    (rootdir/"app.py").unlink()
    (rootdir/"app.py").symlink_to("/etc/passwd")
    assert c.get(p+"/app.py",headers=token).status_code==409
    acl.set_role("alice","alpha","observer","viewer")
    other=auth("observer")
    assert c.get(p,headers=other).status_code==200
    acl.revoke("alice","alpha","observer")
    assert c.get(p,headers=other).status_code==404


@pytest.mark.parametrize("path",["../other","secret.py","%2e%2e/passwd",".wfs-qa-attestation.json"])
def test_attested_filename_allowlist_denies_other_files(example,path):
    c,q,store,acl,auth,rootdir,jid,data=example
    p=publish(example)
    reply=c.get(p+"/"+path,headers=auth("alice"))
    assert reply.status_code in (404,409)
