# Changelog WFS AI Office

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
