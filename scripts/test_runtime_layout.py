"""Run real, paused, isolated API/UI layout checks after npm run build.

Siklus 212: layout runtime kini memakai SUPERSET PRODUKSI ASLI —
backend_live/wfs_hq_server.py (server :9503) + backend_live/wfs_server.py
(gateway :8787, flat-alias tasks/orders). Dulu pakai backend/hq_proxy.py
(duplikat stale — dihapus 212) + backend/server.py (hapus 209) yang saling
meleset dari produksi; test menguji server yang TIDAK pernah jalan di live.

Usage: /path/to/python-with-playwright-and-backend-deps scripts/test_runtime_layout.py
Optional CHROMIUM_EXECUTABLE selects an installed browser. No production state used.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright
from check_runtime_layout import check_header, check_toast

root = Path(__file__).resolve().parents[1]
live = root / 'backend_live'
out = Path(tempfile.mkdtemp(prefix='runtime-layout-', dir=os.environ['TMPDIR']))
backend = out / 'backend'
backend.mkdir()
# Flat superset (pola backend/test_startup_static.py siklus 208-209):
# engine + server gateway + server UI 9503, semua SATU SUMBER dgn produksi.
shutil.copy2(live / 'wfs_tasks.py', backend / 'tasks.py')
shutil.copy2(live / 'wfs_orders.py', backend / 'orders.py')
shutil.copy2(live / 'wfs_server.py', backend / 'server.py')
shutil.copy2(live / 'wfs_hq_server.py', backend / 'hq_ui_server.py')
# static_serve diimpor server 9503 (deploy: sebelah file; repo: fallback ../backend).
shutil.copy2(root / 'backend' / 'static_serve.py', backend / 'static_serve.py')
shutil.copytree(root / 'dist', backend / 'static')
home = out / 'home'
home.mkdir()
processes = []
try:
    for name, code in [
        ('api', "import tasks; tasks.set_paused(True); import uvicorn; uvicorn.run('server:app',host='127.0.0.1',port=18787)"),
        # Superset 9503 asli: ThreadingTCPServer + fitur live eksak (dulu hq_proxy
        # single-thread — SSE membekukan seluruh server). Static = dist/ di static/.
        ('proxy', "import hq_ui_server,os,socketserver; hq_ui_server.GATEWAY='http://127.0.0.1:18787/api/'; os.chdir('static'); hq_ui_server.socketserver.ThreadingTCPServer.allow_reuse_address=True; socketserver.ThreadingTCPServer(('127.0.0.1',19513),hq_ui_server.H).serve_forever()"),
    ]:
        # Fail rather than connect accidentally to another process using our ports.
        import socket
        port = 18787 if name == 'api' else 19513
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
        with (out / f'{name}.log').open('w') as log:
            processes.append(subprocess.Popen([sys.executable, '-c', code], cwd=backend,
                env={**os.environ, 'HOME': str(home)}, stdout=log, stderr=subprocess.STDOUT))
    for _ in range(80):
        if any(p.poll() is not None for p in processes):
            raise RuntimeError(f'Server exited; see {out}')
        try:
            with urllib.request.urlopen('http://127.0.0.1:19513/wfs-api/status', timeout=1) as response:
                assert json.load(response)['ok']
            break
        except OSError:
            time.sleep(.25)
    else:
        raise RuntimeError('Isolated API startup timed out')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE'),
            args=['--no-sandbox', '--disable-webgl', '--disable-dev-shm-usage'])
        for label, width, height in [('desktop', 1440, 900), ('mobile', 390, 844)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors, failures = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda r: failures.append([r.url, r.status]) if r.status >= 400 else None)
            page.goto('http://127.0.0.1:19513/', wait_until='domcontentloaded')
            page.wait_for_function("!document.querySelector('.scene-loading:not(.err)')")
            page.wait_for_timeout(2000)
            result = {'header': check_header(page), 'errors': errors, 'httpFailures': failures}
            if label == 'mobile':
                result['toast'] = check_toast(page)
            page.screenshot(path=str(out / f'{label}.png'))
            (out / f'{label}.json').write_text(json.dumps(result, indent=2))
            assert all(result['header'].values()), result
            assert all(result.get('toast', {}).values()), result
            assert not errors and not failures, result
            page.close()
        browser.close()
    print(f'PASS desktop/mobile fallback layout; evidence: {out}')
finally:
    for process in reversed(processes):
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
