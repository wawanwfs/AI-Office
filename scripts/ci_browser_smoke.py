#!/usr/bin/env python3
"""GitHub runner browser proof: real Chromium screenshots, no backend mocked.

This checks frontend boot/navigation and non-WebGL fallback. It is NOT a
production GPU benchmark, API integration, or mobile-device performance test.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get("WFS_E2E_BASE","http://127.0.0.1:4173").rstrip("/")
OUT=Path(os.environ.get("WFS_E2E_OUTPUT","artifacts/browser"))
OUT.mkdir(parents=True,exist_ok=True)
reports=[]


def capture(page,name):
    page.screenshot(path=str(OUT/(name+".png")),full_page=True,
                    animations="disabled")
    reports.append({"case":name,"url":page.url,
                    "title":page.title(),"screenshot":name+".png"})


with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=[
        "--disable-dev-shm-usage","--enable-webgl","--use-gl=angle",
        "--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    desktop=browser.new_context(viewport={"width":1440,"height":900},
                                device_scale_factor=1)
    p=desktop.new_page()
    resp=p.goto(BASE+"/",wait_until="domcontentloaded",timeout=30000)
    assert resp and resp.status==200
    p.locator(".hq-landing h1").wait_for(timeout=20000)
    assert "work" in p.locator(".hq-landing h1").inner_text().lower()
    p.keyboard.press("Tab")
    assert p.evaluate("document.activeElement.tagName")=="A"
    capture(p,"desktop-landing")
    p.get_by_role("link",name="Mulai dari dashboard").click()
    p.wait_for_url("**/app/?mode=dashboard",timeout=20000)
    p.locator(".dock").wait_for(timeout=30000)
    capture(p,"desktop-dashboard")

    office=desktop.new_page()
    office.goto(BASE+"/app/?mode=office",
                wait_until="domcontentloaded",timeout=30000)
    office.locator(".dock").wait_for(timeout=30000)
    try:
        office.wait_for_function(
            """() => !document.querySelector('.scene-loading:not(.err)')
                  || !!document.querySelector('.scene-loading.err')""",
            timeout=35000)
    except Exception:
        # The screenshot itself remains available to debug a slow 3D startup.
        capture(office,"desktop-office-startup-incomplete")
        raise
    capture(office,"desktop-office")

    mobile=browser.new_context(viewport={"width":390,"height":844},
                               device_scale_factor=1,is_mobile=True,
                               has_touch=True)
    m=mobile.new_page()
    m.goto(BASE+"/",wait_until="domcontentloaded",timeout=30000)
    m.locator(".hq-landing h1").wait_for(timeout=20000)
    capture(m,"mobile-landing")
    m.get_by_role("link",name="Mulai dari dashboard").click()
    m.wait_for_url("**/app/?mode=dashboard",timeout=20000)
    m.locator(".dock").wait_for(timeout=30000)
    capture(m,"mobile-dashboard")

    fallback=browser.new_context(viewport={"width":1280,"height":720},
                                 reduced_motion="reduce")
    fallback.add_init_script("""(() => {
      const old = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind,...args) {
        if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl')
          return null;
        return old.call(this,kind,...args);
      };
    })();""")
    fb=fallback.new_page()
    fb.goto(BASE+"/app/?mode=office",
            wait_until="domcontentloaded",timeout=30000)
    fb.locator(".dock").wait_for(timeout=30000)
    fb.locator(".scene-loading.err").wait_for(timeout=35000)
    assert fb.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
    capture(fb,"office-webgl-unavailable-fallback")
    browser.close()
(OUT/"report.json").write_text(json.dumps(reports,indent=2),encoding="utf-8")
print(json.dumps({"passed":len(reports),"screenshots":reports},ensure_ascii=False))
