<p align="center">
  <img src="public/wfs-logo.svg" width="360" alt="WFS Project" />
</p>

<h1 align="center">WFS AI Office</h1>
<p align="center"><strong>Kantor virtual 3D tempat tim agent AI bekerja, ngobrol, rapat, dan mengerjakan task nyata.</strong></p>
<p align="center">Dibuat oleh <a href="https://github.com/wawanwfs">Wahyu Fajar Setiawan</a> · WFS Project</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react" />
  <img src="https://img.shields.io/badge/Three.js-0.183-black?style=flat-square&logo=threedotjs" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  [![CI](https://github.com/wawanwfs/AI-Office/actions/workflows/ci.yml/badge.svg)](https://github.com/wawanwfs/AI-Office/actions/workflows/ci.yml)
</p>

---

## Apa ini?

WFS AI Office adalah dashboard operasional software house **WFS Project** dalam bentuk diorama 3D isometrik.
Setiap agent AI punya peran (PM, Frontend, Backend, QA, DevOps, Marketing, AI Customer Service, dst.), meja,
layar yang hidup, dan perilaku sendiri. Mereka duduk, berjalan, saling menghampiri, dan berdialog sesuai profesi.

Yang membedakan dari sekadar animasi: **UI terhubung ke backend nyata**.

| Fitur | Keterangan |
|---|---|
| Kantor 3D | Dinding kantor, logo WFS Project, zona Dev Desk / Meeting / Lounge / Café / Server, siang-malam, mode neon |
| Karakter per role | Kulit, tinggi, aksesori berbeda (kacamata, hijab, topi, headphone, blazer, dll.) |
| Interaksi antar role | Agent menghampiri rekan dan bertukar dialog sesuai profesi |
| Papan Task | Daftar task nyata, filter, cari, detail ulasan QA, jalankan dengan konfirmasi |
| Task engine | Multi-call JSON, QA otomatis + retry, bukti uji, file hasil |
| Jeda / Lanjut | Tombol nyata ke backend (jeda menolak eksekusi dengan HTTP 409) |
| Chat agent | Percakapan nyata per agent lewat gateway OpenAI-compatible |
| Widget AI CS | Widget embed untuk toko, dengan riwayat per tenant |
| Responsif | Dock bawah tunggal, panel jadi bottom-sheet di HP, kamera adaptif portrait |

## Arsitektur dan status snapshot

```text
Browser (React + Three.js, Vite)
    ├── /                 → Landing (lazy workspace entry)
    └── /app/?mode=...    → Dashboard / Full AI Office
                │
           same-origin API
                │
backend_live/wfs_hq_server.py  → HQ gateway / reverse proxy
                │
backend_live/wfs_server.py     → FastAPI task engine :8787
    ├── wfs_tasks.py, wfs_orders.py
    ├── wfs_api_service.py, wfs_sh_console.py
    └── backend/database.py, backend/sandbox_exec.py
```

File `backend_live/wfs_*.py` merupakan sumber superset yang diuji CI.
Snapshot ini **tidak** berisi `backend/server.py` atau `backend/hq_proxy.py`
sebagai entrypoint siap pakai. Nama tersebut masih digunakan di lingkungan
deployment tersendiri. Beberapa skrip deployment bergantung pada path absolut,
Docker host, konfigurasi API, dan service lain; **jangan menganggap clone
repository langsung merupakan full-stack production deployment**.

## Menjalankan dan memverifikasi

### Frontend (Windows PowerShell, Linux, macOS)

```sh
npm ci
npm test
npm run build
npm run dev
```

Akses alamat lokal yang dicetak Vite, biasanya `http://localhost:5173/`.
Landing tetap dapat dibuka tanpa backend; operasi agent/task memerlukan
gateway yang dikonfigurasi dan terkoneksi. Endpoint API tidak otomatis
dipalsukan ketika backend belum tersedia.

### Pengujian backend (Python 3.11)

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Linux/macOS:

```sh
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-pytest.txt
python -m pytest backend_live backend -q
```

Untuk audit integrasi yang membutuhkan host live, lihat
[mode audit CI](docs/ci-audit-execution.md). Untuk risiko dan pekerjaan
lanjutan lihat [laporan audit 2026-11-08](docs/AUDIT_2026-11-08.md).
Jangan menyimpan key API di source maupun mem-publish Docker socket.

## Pengembangan Phase 2

Antrean persisten (belum terhubung ke worker produksi) tersedia di
`backend/master_queue.py`. Fitur ini dimulai paused dan hanya menyimpan
metadata job, bukan mengeksekusi task atau memakai API berbayar.

Lihat [matriks REA Phase 2](docs/REA_PHASE2.md) dan
[panduan Master Queue](docs/master-queue-phase2.md) untuk hasil verifikasi,
keterbatasan produksi dan tahapan integrasi yang aman.

## Struktur repo

```
src/scene/OfficeScene.js   scene 3D (kantor, karakter, perilaku)
src/components/            Dock, HUD, Papan Task, Chat, Statistik, Log, dll.
src/lib/api.js             klien API + token otomatis
backend/                   database & sandbox (unit test)
backend_live/              superset gateway & task engine (uji CI)
docs/                      catatan arsitektur, audit & changelog
DEV_LOG.md                 log pengembangan harian
```

## Kontrol

Drag untuk memutar · Scroll / pinch untuk zoom · Tap agent untuk fokus · Slider waktu siang-malam · Tombol Neon untuk mode cyberpunk · Esc menutup panel.

## Lisensi & atribusi

MIT. Fondasi visualisasi isometrik awal berasal dari proyek MIT *ai-office* karya Gaurav Mishra;
sejak itu kantor, karakter, dinding, UI, backend, task engine, dan seluruh fitur operasional dibangun ulang
dan dikembangkan oleh WFS Project. Hak cipta asli dipertahankan di `LICENSE` sesuai ketentuan MIT.
