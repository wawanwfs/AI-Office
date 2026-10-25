# WFS PROJECT — Environment Setup

Dokumen hidup.

## Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt   # fastapi uvicorn httpx pydantic
python3 server.py          # :8787 (API)
python3 hq_proxy.py        # :9503 (UI statis + proxy /wfs-api)
```

Environment variables:
- `WFS_AI_BASE` — base URL provider AI (default https://api.openai.com/v1)
- `WFS_AI_KEY` — API key (JANGAN commit; lewat env/secret manager)
- `WFS_AI_MODEL` — default model (default gpt-4o-mini)
- Konfigurasi per-agent disimpan di `backend/config/agents.json` (600, di-ignore git).

## Frontend (Vite)

```bash
npm install
npm run dev          # :5173 (dev, perlu proxy manual ke backend)
npm run build        # → dist/
cp -r dist/* backend/static/   # agar UI proxy :9503 ter-update
npm test             # vitest (1328 test baseline)
npm run lint
```

## Docker sandbox (Fase 5 — blocker)

Docker belum aktif. Langkah yang diperlukan:
1. Install Docker Engine (docker.io / docker-ce) di VM.
2. Aktifkan service (`systemctl enable --now docker`).
3. (Opsional) docker compose plugin.
4. Build image sandbox dasar (non-root user, resource limits).
5. Verifikasi: `docker run --rm hello-world`.

## Sekuriti

- Jangan commit `.env`, `*.db`, token, atau secret apa pun.
- Token UI dibuat otomatis di `backend/.wfs_ui_token` (di-ignore).
- Eksekusi task memakai kuota API berbayar → selalu lewat dialog konfirmasi.

## Pembersihan dibantuin.com

Referensi di 70 tempat (src + backend). Hapus kode khusus integrasi, bukan
sembunyikan; bersihkan dependency yang tidak lagi dipakai; migration aman.
