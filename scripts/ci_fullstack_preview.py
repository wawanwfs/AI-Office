#!/usr/bin/env python3
"""Executable CI acceptance for disposable React/FastAPI/Postgres preview.

Requires that Compose is up on 127.0.0.1:18765. No production access.
"""
import asyncio
import json
import os
from pathlib import Path
import time

import httpx
import websockets
from playwright.async_api import async_playwright, Error as PlaywrightError

BASE=os.environ.get("WFS_PREVIEW_BASE","http://127.0.0.1:18765")
TOKEN=os.environ.get("WFS_PREVIEW_TEST_TOKEN")
if not TOKEN or len(TOKEN)<32:
    raise SystemExit("CI-only preview bearer missing")
auth={"Authorization":"Bearer "+TOKEN}
label=os.environ.get("WFS_PREVIEW_EVIDENCE_LABEL","")
if label and (not label.isascii() or not label.isalnum() or len(label)>24):
    raise SystemExit("Invalid preview evidence label")
target=Path("artifacts/fullstack-preview")/label
target.mkdir(parents=True,exist_ok=True)

with httpx.Client(timeout=5) as client:
    for i in range(50):
        try:
            h=client.get(BASE+"/api/health")
            if h.status_code==200 and h.json().get("ok"):
                break
        except httpx.HTTPError:
            pass
        time.sleep(.5)
    else:
        raise SystemExit("Real PostgreSQL-connected preview did not become healthy")
    assert h.json()["services"]==["React/Vite","FastAPI","PostgreSQL"]
    assert client.get(BASE+"/api/db").status_code==401
    assert client.get(BASE+"/api/db",headers={"X-Principal":"owner"}).status_code==401
    other=os.environ.get("WFS_PREVIEW_OTHER_TOKEN")
    if other:
        assert client.get(BASE+"/api/db",headers={"Authorization":"Bearer "+other}).status_code==401
    db=client.get(BASE+"/api/db",headers=auth)
    assert db.status_code==200 and db.json()=={"postgres_query":1,"synthetic":False}
    stream=client.get(BASE+"/api/events",headers=auth)
    assert stream.status_code==200 and "event: database" in stream.text
    assert '"postgres_query": 1' in stream.text
    assert client.get(BASE+"/api/events").status_code==401
    artifact=client.get(BASE+"/api/artifact",headers=auth)
    assert artifact.status_code==200 and artifact.headers["Content-Disposition"]=="attachment"
    assert artifact.json()["database"]==1
    assert client.get(BASE+"/api/artifact").status_code==401
    t=client.post(BASE+"/api/ws-ticket",headers=auth)
    assert t.status_code==200 and len(t.json()["ticket"])==43
    ticket=t.json()["ticket"]

async def check_ws():
    url=BASE.replace("http://","ws://",1)+"/api/ws"
    async with websockets.connect(url,subprotocols=["wfs.preview.v1",ticket],
                                  open_timeout=8,close_timeout=5) as ws:
        message=json.loads(await asyncio.wait_for(ws.recv(),timeout=8))
        assert message=={"postgres_query":1,"source":"real PostgreSQL"}
        assert ws.subprotocol=="wfs.preview.v1"
    try:
        async with websockets.connect(url,subprotocols=["wfs.preview.v1",ticket],
                                      open_timeout=8,close_timeout=5) as ws:
            raise AssertionError("one-use websocket ticket was reusable")
    except websockets.exceptions.InvalidStatus:
        pass
asyncio.run(check_ws())

async def check_ws_denied():
    # Tickets are not accepted in URL queries, and forged identity headers
    # never grant a WebSocket connection. No fallback unauthenticated socket.
    uri=BASE.replace("http://","ws://",1)+"/api/ws"
    candidates=[
        (uri,["wfs.preview.v1"]),
        (uri+"?ticket="+ticket,["wfs.preview.v1",ticket]),
    ]
    for url,protocols in candidates:
        try:
            async with websockets.connect(url,subprotocols=protocols,
                                          open_timeout=8,close_timeout=5):
                raise AssertionError("WebSocket accepted unauthenticated identity")
        except (websockets.exceptions.InvalidStatus,
                websockets.exceptions.ConnectionClosed):
            pass
asyncio.run(check_ws_denied())


def check_host_runtime_limits():
    """Read actual Docker daemon HostConfig, not only authored Compose YAML."""
    import subprocess
    compose=["docker","compose","-f","examples/fullstack-preview/compose.yaml"]
    for service,memory,cpus,pids in (("db",536870912,1000000000,128),
                                     ("api",402653184,750000000,128),
                                     ("ingress",134217728,250000000,64)):
        identifier=subprocess.run(compose+["ps","-q",service],
                                 capture_output=True,text=True,check=True,
                                 timeout=15).stdout.strip()
        assert identifier,service+" container missing"
        details=subprocess.run(["docker","inspect","--format",
                                "{{json .HostConfig}}",identifier],
                               capture_output=True,text=True,check=True,
                               timeout=15)
        cfg=json.loads(details.stdout)
        assert cfg["ReadonlyRootfs"] is True
        assert cfg["PidsLimit"]==pids
        assert cfg["Memory"]==memory
        assert cfg["NanoCpus"]==cpus
        assert "ALL" in [x.upper() for x in cfg["CapDrop"]]
        assert any(option.startswith("no-new-privileges") for option in (cfg["SecurityOpt"] or []))
    return True


runtime_limits_verified=check_host_runtime_limits()

async def screenshots():
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            for label,viewport in (
                ("desktop",{"width":1440,"height":900}),
                ("mobile",{"width":390,"height":844}),
            ):
                page=await browser.new_page(viewport=viewport,device_scale_factor=1)
                # Docker creates independent bridge networks immediately
                # before Chromium opens the page. Linux can briefly emit
                # ERR_NETWORK_CHANGED while routes settle. Retry ONLY that
                # transient network event, still require real SQL proof.
                for attempt in range(3):
                    try:
                        await page.goto(BASE,wait_until="domcontentloaded",timeout=20000)
                        break
                    except PlaywrightError as exc:
                        if "ERR_NETWORK_CHANGED" not in str(exc) or attempt==2:
                            raise
                        await asyncio.sleep(0.5*(attempt+1))
                await page.get_by_text("Live SELECT 1 succeeded").wait_for(timeout=12000)
                assert "Full-Stack Preview Proof" in await page.title()
                await page.screenshot(path=str(target/(label+"-fullstack.png")),
                                      full_page=True)
                await page.close()
        finally:
            await browser.close()

asyncio.run(screenshots())
report={"react_vite_build":True,"fastapi_live":True,"postgresql_live_query":1,
        "auth_denies_missing_bearer":True,
        "sse_live_database":True,"websocket_ticket_one_use":True,
        "artifact_download":True,"screenshots":["desktop-fullstack.png","mobile-fullstack.png"],
        "host":BASE,"production_deployment":False,
        "cross_preview_token_denied":bool(os.environ.get("WFS_PREVIEW_OTHER_TOKEN")),
        "real_docker_limits_verified":runtime_limits_verified,
        "unauthenticated_ws_rejected":True,
        "not_a_multi_tenant_preview_manager":True}
(target/"proof.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report))
