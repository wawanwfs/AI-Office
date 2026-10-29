# dibantuin — SaaS AI Customer Service (WFS PROJECT)

> Multi-tenant AI customer service SaaS. Dibangun oleh tim agent AI WFS (10 task otomatis via task engine) + fondasi manual, Docker-ready.

## Layanan (docker compose)
| Kontainer | Port | Fungsi |
|---|---|---|
| backend | 8000 | FastAPI + SQLAlchemy (postgres) — API utama |
| admin | 3000 | Halaman admin (login JWT) |
| widget | 3001 | Widget chat embeddable untuk toko |
| db | — | PostgreSQL 16 |
| redis | — | Redis 7 (cache/rate-limit) |

## Akses (Tailscale: 100.117.198.46)
- Admin: http://100.117.198.46:3000 — login `admin` / `wfs-admin-2026` (ubah via env `ADMIN_USER`/`ADMIN_PASSWORD`)
- API: http://100.117.198.46:8000/api/health
- Widget: http://100.117.198.46:3001

## Fitur live (terverifikasi)
- ✅ Multi-tenant: buat tenant → API key otomatis
- ✅ Admin JWT protected (401 tanpa token)
- ✅ Chat AI CS Bahasa Indonesia (LLM via proxy)
- ✅ Cek order real-time: sebut nomor order (mis. 1024) → jawab status/resi/ETA dari DB WFS (orders.db read-only mount)
- ✅ Percakapan & pesan tersimpan di postgres
- ✅ Widget chat siap embed via iframe

## API utama
```
POST /api/auth/login                  {username, password} → JWT
GET  /api/admin/tenants               (Bearer) daftar tenant
POST /api/admin/tenants               {name, slug} → tenant + api_key
GET  /api/admin/conversations?tenant_id=N
GET  /api/admin/conversations/{id}/messages
POST /api/admin/chat                  {tenant_id, message} → {conversation_id, reply}
GET  /api/health
```

## Jalankan
```bash
cp .env.example .env   # isi DB_PASSWORD, JWT_SECRET, LLM_API_KEY
docker compose up -d --build
```

## Jalankan tanpa Docker (dev)
```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Struktur
- `backend/app/` — FastAPI (main, core/config+database, api/routes_admin+routes_auth, models)
- `backend/alembic/` — migrasi (hasil agent)
- `admin/`, `widget/` — frontend statis (nginx)
- `design/tokens.css` — design system
- `docs/` — output dokumen agents

## Task engine (tim agent WFS)
Task dibuat & dieksekusi via gateway `:8787` (`/api/projects`, `/api/tasks/run_all`).
Agent punya sandbox Docker terpisah (`wfs-agent-*`, workspace `~/wfs-office/sandboxes/<id>`);
hasil kerja agent otomatis tersalin ke sandbox-nya. QA loop: verdict "revise" → auto re-run (1x).
