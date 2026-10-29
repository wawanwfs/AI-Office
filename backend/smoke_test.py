import sys
sys.path.insert(0, '.')
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
print(c.get('/api/health').json())
r = c.post('/api/admin/tenants', json={'name': 'Toko Maju', 'slug': 'toko-maju'})
print(r.json())
print(c.get('/api/admin/tenants').json())
