# WFS PROJECT — Environment Setup

Dokumen hidup.

## Checkout baru: verifikasi portabel (bukan deployment produksi)

Sumber gateway hidup dan beberapa test ada di `backend_live/`. Dua file
`backend/server.py` dan `backend/hq_proxy.py` yang disebut panduan lama
sudah tidak disertakan pada git snapshot ini. Jangan menyalin nama perintah
lama dan mengharapkan API otomatis menyala di mesin baru.

### Frontend

```sh
npm ci
npm test
npm run build
npm run dev
```

Vite biasanya mendengarkan di :5173. Landing bisa digunakan tanpa API;
status agent, project, dan eksekusi nyata memerlukan gateway dan token.

### Backend regression suite (Python 3.11)

```sh
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Windows PowerShell: gunakan `py -3.11 -m venv .venv` dan
`.\\.venv\\Scripts\\Activate.ps1` untuk aktivasi.

### Deployment

Sumber superset ada di `backend_live/wfs_server.py` dan
`backend_live/wfs_hq_server.py`. Script `scripts/apply_wfs_*.py` dan
`deploy/docker/` mengacu pada layanan dan path absolut host tertentu;
audit terlebih dahulu dan siapkan rollback sebelum digunakan. Jangan
memakai konfigurasi host networking + Docker socket tanpa isolasi jaringan
dan pembatasan izin.

Variabel AI seperti `WFS_AI_BASE`, `WFS_AI_KEY`, dan `WFS_AI_MODEL`
harus disediakan melalui environment/secret manager, bukan commit.
Lihat [mode audit](ci-audit-execution.md) dan
[laporan pemeriksaan](AUDIT_2026-11-08.md).

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
