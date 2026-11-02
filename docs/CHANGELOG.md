# Changelog WFS AI Office

## Unreleased (2.1.0) — diperbarui 2026-11-02
- Satu sumber kebenaran backend produksi (pola superset `backend_live/`): `wfs_hq_server.py` (:9503), `wfs_api_service.py` + `database.py` (:9503), `wfs_tasks.py` + `wfs_orders.py` + `wfs_server.py` (:8787) — fitur live dan hardening digabung, drift-gate vitest mengunci sha256 live = sumber; deploy terkontrol `scripts/apply_*.py` (backup → compile-check → restart → smoke 2 fase → auto-rollback, terbukti nyata 5x).
- Hardening task engine (kuota API berbayar): approval gate di semua pintu eksekusi, pause PERSISTEN di DB (tidak hilang saat restart, endpoint `/api/tasks/paused` selalu baca engine), claim anti-dobel-run (fcntl), `recover_interrupted` saat startup, bug retry QA-revise `asyncio.sleep` (NameError) diperbaiki.
- Ketahanan HTTP: parser Content-Length toleran + cap body 413 (semua jalur POST proxy & API), clamp timeout sandbox exec 1–600s, guard body None.
- Frontend jujur: deadline `AbortSignal.timeout` di semua call-site fetch (poll tak menggantung, badge live tak palsu), badge/status liveness SSE log console (terputus vs realtime vs menyambung), badge live ProjectBoard 3 keadaan.
- Tooling & CI: CI GitHub Actions hijau kembali (lockfile URL registry.npmjs.org + drift-gate CI-safe), gate piksel scene-alive `png_stats` (warna/nonbg/lum_std — bukan proksi ukuran file), hardening transport 64 probe CDP (connect/handshake/per-request deadline + EOF guard), 62 call-site subprocess sinkron + 88 urlopen ber-timeout.
- Suite uji: vitest 3281 test (222 file) + pytest 148 test + ESLint 0 warning.

## Unreleased (2.1.0) — 2026-10-27
- Realtime SSE `/api/events` (backend + proxy + UI live logs aktivitas kantor).
- Docker sandbox: container per project + workspace shell (jalankan test Python/Node, git status/commit/logs, restart/stop/start container).
- Kanban: preset rentang tanggal kustom (date picker), pencarian real-time (shortcut `/` + highlight), drag-and-drop kustom dengan feedback visual, ekspor ringkasan task CSV/JSON, preset multi-tag & multi-divisi kustom, preset divisi cepat (Shift+D), pengurutan sprint & bar progres kolom/sprint, badge prioritas.
- Audio engine ambience kantor (pink noise HVAC + hum 55Hz) + widget kontrol cepat di HUD.
- WYSIWYG warna permukaan UI 3D (`toneMapped:false`): TV, papan, whiteboard, jam, monitor, nameplate, bubble, poster, logo, sign, zona, terrace sign.
- Badge status koneksi gateway di TV lounge & strip 3D ProjectBoard + polling adaptif backoff eksponensial (live/stale/down).
- WfsPanel: gateway chat AI + konfigurasi agent; gizmo status a11y dialog/tablist roving.
- Tema royal-blue premium (bg #010722, aksen #4D9FFF) sinkron daycycle malam.
- Kamera responsif multi-window/split-screen, FOV/radius dinamis, raycast NDC akurat.
- Perbaikan: cincin hover nyangkut & membeku saat agen berjalan, kamera runtuh saat homeRadius null, validasi tanggal kustom (tolak YMD mustahil), guard anti-poisoning NaN/±Infinity di motion_math, security headers (nosniff + referrer-policy).
- Refactor DRY: interaksi pick terpusat di `parts/raycast_targets.js`, formula hover ring & anchor sel, helper kamera (ensureHomeRadius/saveCam), style blok output ShConsole.

## 2.0.0 (2026-10-15)
- Rebrand penuh ke WFS Project: logo, favicon, README, metadata, package.
- Kantor 3D baru: dinding solid (wainscot, pilaster, crown molding), plakat logo WFS PROJECT, jendela, kanban, poster.
- Karakter beda per role (aksesori, kulit, tinggi) dan interaksi antar role.
- Papan Task, Jeda/Lanjut nyata, dock tunggal, HUD, kamera adaptif portrait.
- Backend FastAPI + task engine disertakan di `backend/` (tanpa database atau secret).
