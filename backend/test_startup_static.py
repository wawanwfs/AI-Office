"""A clean checkout must expose API diagnostics before UI assets are built.

Siklus 208: SATU SUMBER engine = backend_live/wfs_tasks.py + wfs_orders.py
(pola 206/207). Checkout bersih kini butuh kedua file superset itu tersalin
bersama backend/*.py agar server.py (yang mengimpor flat `tasks`/`orders`
persis seperti produksi :8787) bisa start — salinan di sini meniru layout
runtime gateway: tasks.py & orders.py flat di samping server.py.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import pytest

LIVE = Path(__file__).resolve().parents[1] / 'backend_live'


@pytest.mark.parametrize('built', ['missing', 'empty', 'built'])
def test_clean_checkout_without_static_can_start_api(tmp_path, built):
    backend = tmp_path / 'backend'
    backend.mkdir()
    for source in Path(__file__).parent.glob('*.py'):
        shutil.copy2(source, backend / source.name)
    # Modul superset backend_live = sumber `tasks` & `orders` produksi.
    shutil.copy2(LIVE / 'wfs_tasks.py', backend / 'tasks.py')
    shutil.copy2(LIVE / 'wfs_orders.py', backend / 'orders.py')
    if built != 'missing':
        (backend / 'static').mkdir()
    if built == 'built':
        (backend / 'static' / 'index.html').write_text('<h1>Built UI</h1>')
    result = subprocess.run([sys.executable, '-c', '''
from pathlib import Path
from fastapi.testclient import TestClient
import server
with TestClient(server.app) as client:
    assert client.get('/api/status').status_code == 200
    response = client.get('/')
    if Path('static/index.html').exists():
        assert response.status_code == 200
        assert 'Built UI' in response.text
        assert client.get('/assets/missing.js').status_code == 404
    else:
        assert response.status_code == 503
        assert 'not built' in response.text
        assert client.get('/assets/missing.js').status_code == 503
'''], cwd=backend, env={**os.environ, 'HOME': str(tmp_path)}, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
