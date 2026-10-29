# Final production checklist — dibantuin (14 Okt 2026)

## Infrastruktur
- [x] Docker compose 5 kontainer (backend/admin/widget/db/redis) — healthy
- [x] Healthcheck backend (`/api/health`) + depends_on db healthy
- [x] Restart policy (backend via compose, sandbox unless-stopped)
- [x] Log rotation (logrotate.d/wfs-office)
- [x] Backup DB harian 03:30 cron (gzip, retensi 7 hari) — teruji

## Keamanan
- [x] Login JWT admin (12 jam expiry) — password default sudah diganti (file kredensial terpisah)
- [x] Semua endpoint admin 401 tanpa token — terverifikasi
- [x] Rate limiting chat 20 req/menit per IP — unit tested (429)
- [x] Security headers nginx (X-Frame-Options, nosniff, Referrer-Policy)
- [x] JWT secret dirotasi (hex 32) di .env
- [x] orders.db mount read-only

## Fungsional (terverifikasi end-to-end)
- [x] Multi-tenant: create/list tenant + API key otomatis
- [x] Chat AI CS: menu & harga (6 item) + cek order real-time (resi, ETA)
- [x] Percakapan & pesan tersimpan postgres
- [x] Widget embeddable multi-tenant (?tenant=N&name=Nama)
- [x] Dashboard admin: stats real (tenant/conversations/messages)
- [x] Logout admin

## Performa
- [x] Load test: 200 req / 50 concurrent → 0 error, p95 175ms

## Task engine & sandbox
- [x] 10/10 task agents done, output file valid (py_compile 14/14)
- [x] 4 sandbox kontainer (be1/fe1/qa1/toni) + executor API
- [x] pytest di sandbox lulus (2 passed) + bukti test masuk QA verdict
- [x] QA auto-retry loop

## Catatan dikenal (non-blocking)
- Widget chat masih satu instance LLM proxy (env LLM_API_KEY global)
- Knowledge base statis (menu hardcoded di cs_context.py) — bisa dipindah ke DB per tenant
- HTTPS belum (akses via Tailscale; untuk domain publik perlu reverse proxy + cert)

## Status: LAYAK PRODUCTION (internal/Tailscale) — publik perlu HTTPS
