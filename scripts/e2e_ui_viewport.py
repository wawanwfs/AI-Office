#!/usr/bin/env python3
"""Real Chromium layout gate. No task mutations; 3D disabled for CPU-safe UI checks.
Run against a local build/dev URL: python3 scripts/e2e_ui_viewport.py URL
"""
import json, os, runpy, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/e2e_shot.py'))
WS, CHROME = helpers['WS'], helpers['CHROME']
url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:19517/'
port = 19518
scratch = Path(os.environ.get('TMPDIR', str(Path.home() / '.hermes/cache/scratch')))
results = []
with tempfile.TemporaryDirectory(dir=scratch, prefix='office-ui-') as profile:
    p = subprocess.Popen([CHROME, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', f'--remote-debugging-port={port}', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tabs = []
        for _ in range(50):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list', timeout=1)); break
            except Exception: time.sleep(.1)
        ws = WS(next(t['webSocketDebuggerUrl'] for t in tabs if t.get('type') == 'page'))
        mid = 0
        def cmd(method, params=None):
            global mid
            mid += 1
            ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
            while True:
                r = json.loads(ws.recv())
                if r.get('id') == mid:
                    if 'error' in r: raise RuntimeError(r)
                    return r.get('result', {})
        def ev(expression):
            r = cmd('Runtime.evaluate', {'expression': expression, 'returnByValue': True})
            if 'exceptionDetails' in r: raise RuntimeError(r)
            return r.get('result', {}).get('value')
        cmd('Page.enable'); cmd('Runtime.enable')
        cmd('Page.addScriptToEvaluateOnNewDocument', {'source': "const orig=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/.test(t)?null:orig.call(this,t,...a)}"})
        cmd('Page.navigate', {'url': url})
        for _ in range(100):
            if ev("!!document.querySelector('.dock')"): break
            time.sleep(.1)
        ev("localStorage.setItem('wfs_view_mode','2d')")
        for width, height in [(320,640),(360,640),(390,844),(768,1024),(1366,768)]:
            for reduced in [False, True]:
                cmd('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': 1, 'mobile': width < 768})
                cmd('Emulation.setEmulatedMedia', {'features': [{'name':'prefers-reduced-motion', 'value':'reduce' if reduced else 'no-preference'}]})
                ev("document.querySelector('[aria-label=Dashboard]').click()")
                time.sleep(1.2)
                row = ev("""(() => { const d=document.querySelector('#dashboard'), b=d.querySelector('.dash-body'), c=d.querySelector('.x'); const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}}; const before=b.scrollTop;b.scrollTop=b.scrollHeight;return {dialog:rect(d),body:rect(b),close:rect(c),scrolls:b.scrollTop>before || b.scrollHeight<=b.clientHeight,portal:!d.closest('.dock')}; })()""")
                row.update(width=width, height=height, reducedMotion=reduced)
                results.append(row)
                assert row['body']['height'] >= 200, row
                assert row['dialog']['y'] >= -1 and row['dialog']['bottom'] <= height+1, row
                assert row['close']['right'] <= width+1 and row['close']['bottom'] <= height+1, row
                assert row['scrolls'] and row['portal'], row
                cmd('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                cmd('Input.dispatchKeyEvent', {'type':'keyUp','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
                time.sleep(.15)
                assert ev("!document.querySelector('#dashboard')"), 'Escape did not close dashboard'
        ev("document.querySelector('.view-mode-switch button').click()")
        time.sleep(1)
        for width in [320,360,390]:
            cmd('Emulation.setDeviceMetricsOverride', {'width':width,'height':640,'deviceScaleFactor':1,'mobile':True})
            time.sleep(1.2)
            controls = ev("""(() => {const rect=e=>{const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')||e.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,width:r.width}};return {hud:rect(document.querySelector('.hud')),floor:rect(document.querySelector('.floor-nav')),targets:[...document.querySelectorAll('.floor-nav button,.hud button,.dock button,.view-mode-switch button')].map(rect)}})()""")
            results.append({'width':width,'controls':controls})
            assert controls['hud']['width'] <= width and controls['floor']['width'] <= width, controls
            for target in controls['targets']:
                assert target['x'] >= -1 and target['right'] <= width+1 and target['y'] >= -1 and target['bottom'] <= 641, target
            target = next(t for t in controls['targets'] if 'Executive' in t['name'])
            assert target['height'] >= 44, target
            cmd('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':target['x']+10,'y':target['y']+10}]})
            cmd('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            time.sleep(.1)
            assert ev("document.querySelectorAll('.floor-nav button')[2].getAttribute('aria-pressed')") == 'true'
        print(json.dumps(results, indent=2))
    finally:
        p.terminate()
        try: p.wait(5)
        except subprocess.TimeoutExpired: p.kill(); p.wait()
        (scratch / 'office-ui-viewports.json').write_text(json.dumps(results, indent=2))
