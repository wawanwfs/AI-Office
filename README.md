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

## Arsitektur

```
Browser (React + Three.js)
   |  same-origin, POST wajib header X-WFS-Token
   v
backend/hq_proxy.py   (:9503)  -> menyajikan UI statis + proxy /wfs-api/*
   v
backend/server.py     (:8787)  -> FastAPI: agent, chat, task, order
   |-- tasks.py        task engine + QA + retry (SQLite)
   |-- orders.py       order service (SQLite)
   `-- sandbox_exec.py eksekusi terbatas di sandbox
```

## Menjalankan

### Frontend
```bash
npm install
npm run dev        # mode pengembangan
npm run build      # hasil di dist/
npm test           # vitest
```

### Backend
```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install fastapi uvicorn httpx
export WFS_AI_BASE=... WFS_AI_KEY=... WFS_AI_MODEL=...   # lihat .env.example
python3 server.py        # :8787
python3 hq_proxy.py      # :9503 (menyajikan dist/)
```

> **Keamanan:** token UI dibuat otomatis di `backend/.wfs_ui_token` (di-ignore git). Jangan commit `.env`,
> database `*.db`, atau token apa pun. Eksekusi task memakai kuota API berbayar, jadi selalu lewat dialog konfirmasi.

## Struktur repo

```
src/scene/OfficeScene.js   scene 3D (kantor, karakter, perilaku)
src/components/            Dock, HUD, Papan Task, Chat, Statistik, Log, dll.
src/lib/api.js             klien API + token otomatis
backend/                   gateway FastAPI + task engine
docs/                      catatan arsitektur & changelog
DEV_LOG.md                 log pengembangan harian
```

## Kontrol

Drag untuk memutar · Scroll / pinch untuk zoom · Tap agent untuk fokus · Slider waktu siang-malam · Tombol Neon untuk mode cyberpunk · Esc menutup panel.

## Lisensi & atribusi

MIT. Fondasi visualisasi isometrik awal berasal dari proyek MIT *ai-office* karya Gaurav Mishra;
sejak itu kantor, karakter, dinding, UI, backend, task engine, dan seluruh fitur operasional dibangun ulang
dan dikembangkan oleh WFS Project. Hak cipta asli dipertahankan di `LICENSE` sesuai ketentuan MIT.
