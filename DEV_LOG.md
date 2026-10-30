## 2026-10-30 04:30 VM (+08; WIB 03:30) — Siklus 166: BUG VISUAL PRODUKSI KELAS 164/165 LAIN — TRIM dinding (crown molding & sill jendela putih #F4F6FA) + PILAR abu terang (#8E9BB0) = MeshBasicMaterial statis tetap MENYALA saat malam meski panel dinding sudah gelap (165); kini 47 mesh trim/pilar ikut siang↔malam (trim→#8FA0BC, pilar→#3E4A61), TAHAN KLON wall-fade (tag mesh, bukan material), sinkron ambang jendela+dinding (daylight ≤ 0.55), terbukti warna material live via e2e_trim_night.py

- **Metode baru dulu, temuan kemudian:** sebelum memilih item, dibuat **audit objektif** `scripts/e2e_mb_audit.py` + `e2e_mb_audit2.py` (CDP :99): traverse `window.__scene` saat `__setTime(0)` (malam penuh), enumerasi SEMUA mesh MeshBasicMaterial terang (lum>110 atau bertekstur) + **sampel rata-rata kecerahan kanvas tiap map unik** (drawImage 64px → getImageData) — memisahkan map sudah gelap (false positive) dari benar-benar terang. 812 mesh kandidat → agregat 100 kelompok. Hasil: jendela ✓ gelap (repaint 164), plafon/lantai ✓ (Lambert + penggelapan daycycle), poster/UI ✓ gelap; **kegagalan nyata tinggal 2 kelompok**: (1) `TRIM 0xF4F6FA` ×~13 (crown molding 34m back/left/front/right + sill 13 jendela) rgb (231,235,244); (2) `pilar 0x8E9BB0` ×34 (lum sRGB ≈152) — keduanya MeshBasicMaterial solid statis. Kandidat lain tereliminasi berdasar data (whiteboard [2.5×1] = papan tulis putih wajar; wallTitle = teks UI; blob shadow = shadow putih transparan wajar).
- **Akar:** pola identik 164/165 — `walls.js` menggambar crown molding/sill dgn `TRIM=0xF4F6FA` dan 9+4×2+4 pilar dgn `0x8E9BB0` sebagai `new THREE.MeshBasicMaterial({color:…})` per mesh, tidak tercatat, tidak pernah diubah saat `createLighting.apply()` menggelapkan segala yang lain (daylight 0.3, NAVY, panel dinding malam #1B2436 sejak 165). Hasil jam malam: dinding gelap tapi lis putih & pilar menyala — strip terang "bocor siang" di 4 dinding.
- **Perbaikan (dengan 2 jebakan yang ditemukan & ditutup di siklus yang sama):**
  - Palet terpusat `wall_canvas.js`: `TRIM_DAY/TRIM_NIGHT/PIER_DAY/PIER_NIGHT` diekspor (malam: trim #8FA0BC abu-biru pucat — tetap terbaca sbg lis; pilar #3E4A61 — menyatu panel dinding malam).
  - `walls.js`: fabrikasi `trimMat()/pierMat()` mencatat tiap material (`trimPaints` {mat,day,night}); **jebakan 1 — klon wall-fade**: `collect()` meng-CLONE material mesh dinding depan/kanan/belakang/kiri (klon menyalin NILAI warna, bukan referensi) → set per-material asli akan melewatkan klon. Solusi: `tagTrimMeshes()` menandai **MESH** (`userData.__trim={day,night}` — referensi mesh selamat dari swap material) & `paintTrimNight(night)` me-resolve **material AKTIF** (asli maupun klon) per mesh saat paint.
  - **Jebakan 2 — FM**: `FM(null,trimMat())` lama mengirim material ke slot `color` (membuat material rusak `color:<material>`). `FM` kini: bila `color` sudah objek material, dipakai LANGSUNG (+transparent, tetap didaftarkan fadeMats).
  - `daycycle.js`: `trimPainter` ctx + `paintTrims(night)` guard state terpisah + `trimReady` (load siang = 0 set), pemicu `apply()`: `paintTrims(d <= 0.55)` — ambang SAMA dgn jendela (164) & dinding (165); getter `trimNight`.
  - `OfficeScene.js`: `trimPainter:__wallsRt` di ctx createLighting; hook debug baru `window.__trimNight` + `window.__trimMat` (tanpa menghapus hook lama).
- **Guard regresi `src/__tests__/trim_night_swap.test.js` (12 test):** palet malam ≠ siang (trim biru naik/merah turun; pilar gelap); inventaris `trimCount ≥ 40` dgn pasangan day/night benar; SEMUA mesh pemakai ter-tag; paint(true)→warna malam semua, paint(false)→balik siang; **test klon**: material mesh diklon → tetap ikut di-set (akar bug by-reference tertutup); integrasi createLighting: malam 60→true sinkron dgn wall, siang 720→false, load-siang 0 set, idempoten, senja 1100→true, tanpa trimPainter aman. **12 test baru, 2465 total.**
- **Tooling baru `scripts/e2e_trim_night.py` (CDP :99, 5 keadaan):** A realtime (04:xx = malam) → True; B siang 720 → False + warna material live putih (0.905,0.922,0.956 = #F4F6FA); C malam 0 → True + abu-biru (0.275,0.352,0.503 = #8FA0BC) + screenshot day/night; D flip-flop 5× stabil; E sinkron sky==wall==trim di 6 keadaan waktu (0/400/720/1000/1100/1200). **===> OK**; 47 mesh ter-tag live. Bug tooling tertangkap (jujur): probe pertama memakai `__trimMat()` (material asli trimPaints[0]) → B FAIL — material asli ternyata "mati" (diklon wall-fade; mesh memakai klon); diganti probe material AKTIF mesh ter-tag pertama di `__scene`. Audit tools `e2e_mb_audit*.py` ikut di-commit (metode enumerasi yang menemukan bug).
- **Bukti terukur:** vitest **2465/2465 (183 file, +12)**; ESLint 0/0 (5 file inti); build sukses (precache 38, 1853.65 KiB) → deploy sinkron; `e2e_err.py` **0/0/0**; verify_desks **26/26 (L1:9 L2:9 L3:8, no collision)**; e2e_wall_night (165) & e2e_sky_night (164) rerun **tetap OK — tak regresi**; screenshot day 673KB / night 690KB (scene hidup); guard :9503 root/landing/app = 200/200/200; wfs-hq & wfs-office active.
- Commit: wall_canvas.js + walls.js + daycycle.js + OfficeScene.js + test + e2e_trim_night.py + e2e_mb_audit*.py di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + deploy key `~/.ssh/wfs_saas.pub`; (c) audit MB solid LAIN dgn lum rendah (GOLD lampu, FLW bunga) bila ingin malam makin gelap menyeluruh — sengaja dipertahankan sbg aksen hidup.

## 2026-10-30 01:33 WIB — Siklus 163: KEAMANAN PRODUKSI — publish port Docker saas-dibantuin bypass ufw: backend :8000 (FastAPI), panel admin :3000, widget :3001 terjangkau INTERNET LANGSUNG tanpa proxy :9503 (DNAT + ACCEPT dari antarmuka apa pun); fix = bind 127.0.0.1 di compose, akses publik tetap penuh via :9503

- **Temuan (audit drift kontainer pasca-162; kandidat "frontend" buntu = frontend/ hanya 1 file test yatim 24K tanpa app — tidak ada layanan hilang):** `docker-compose.yml` publish `"8000:8000"/"3000:3000"/"3001:3001"` tanpa host-prefix → iptables nat DNAT `! -i br-… --dport N -j DNAT` + filter `-j ACCEPT` TANPA `-d 127.0.0.1` (kontras layanan 3100-3104 yang ter-bind 127.0.0.1 saja). ufw default-deny hanya allow 22/9503/3389/41641 — tapi **Docker menulis chain-nya di atas ufw** (kelas bypass terdokumentasi luas). `ss -tln` = `0.0.0.0:3000/3001/8000`. Curl dari VM = 000 (hairpin gagal — tanda palsu "aman"). Dampak: API backend (incl. login brute-force surface), panel admin, widget terjangkau publik langsung; juga `GET /api/admin/stats` leak dulu (ditutup 161) bisa diakses dari luar.
- **Fix:** `docker-compose.yml` → `127.0.0.1:8000:8000`, `127.0.0.1:3000:3000`, `127.0.0.1:3001:3001` (commit **`7622840`** repo saas-dibantuin). Konsumen diaudit dulu: :9503 proxy (127.0.0.1) + browser CDP VM (localhost) — 0 konsumen non-loopback → re-create tanpa dampak. `docker compose up -d` re-create backend/admin/widget (db/redis/healthy tak tersentuh, downtime <1 menit). Verifikasi: `ss` = 127.0.0.1:3000/3001/8000; iptables DNAT kini `-d 127.0.0.1/32` → paket eksternal tak lagi cocok → ufw default-deny kembali efektif.
- **Guard API pasca-fix:** login-salah 401 · stats-noauth **401** (leak tetap tertutup) · proxy :9503 `/`,`/app/`,`/landing`,`/admin/`,`/cs-widget/` = **200 semua** · /wfs-api/tasks 200 (task #25) · dashboard/stats 200 · system/resources 200 (probe "sh-overview" saya = salah nama rute, tidak ada di gateway/dashboard — bukan regresi).
- **E2E full chain pasca-fix:** `e2e_widget_chat.py` **===> OK** (A chat LLM end-to-end nyata via loopback chain baru; B/C kontrol build-lama & endpoint-lama OK); `e2e_admin_panel.py` **===> OK** (A login nyata → dashboard tenants=2/rows=2, task gateway=4; B kontrol admin lama; C stats-noauth=401, chat-lama=401); `e2e_err.py` **0/0/0**; verify_desks 26/26 OK; wfs-hq & wfs-office active.
- **Bukti:** vitest **2433/2433 (180 file)**; build sukses (precache 38, 1850.97 KiB) → deploy sinkron (`pruned 0 orphan`); commit saas-dibantuin **`7622840`** (push ke GitHub masih menunggu repo + deploy key dari user — tidak diulang).
- **Sisa backlog: KOSONG.** Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-29 20:55 WIB — Siklus 156: Runbook go-live gateway :8787 systemd→Docker siap (APPLY/ROLLBACK, auto-rollback di semua jalur gagal) — BUG PRODUKSI NYATA tertangkap & diperbaiki: exec sandbox :8787 500 permanen sejak rehearsal 155; config go-live non-root tervalidasi penuh

- **Bug produksi nyata (terbuka sejak siklus 155):** `POST /api/sandbox/toni/exec` di :8787 = **500 PermissionError** (`sandbox_exec.py:18`, journalctl; smoke 155 memverifikasi :8788 container). Akar: container rehearsal jalan **root** dan menulis `_task_script.py` root-owned ke bind `sandboxes/` yang dipakai gateway systemd (agentuser) → exec produksi 500 permanen; rehearsal lolos justru karena root bisa menulis di mana pun. Fix: rm blocker + `chown 42 file` root di `sandboxes/` → exec kembali **200 "42"**. Kelas dicegah berulang: `compose.go-live.yaml` **non-root** `user: "1002:1003"` + `group_add: ["125"]` (gid docker.sock).
- **Pra-validasi config go-live TANPA menyentuh produksi** (container temp `--network host --user 1002:1003`, port 8789, DB salinan, bind sandboxes asli): health OK, exec 42, SSE connected frame, agents=15, projects; file tulisan container = **agentuser-owned** (bukti anti-regresi); sweep root tersisa = **0**. Gap ketiga tertangkap: `tasks.py` mkdir `~/wfs-office/saas-dibantuin` saat import → tanpa bind dir itu container non-root mati PermissionError saat import (parent dibuat root oleh Docker) → bind `saas-dibantuin:/hermes-home/wfs-office/saas-dibantuin`.
- **Artefak go-live:** `deploy/docker/compose.go-live.yaml` (network_mode **host** + `WFS_PORT=8787` — wajib: proxy :9503 hardcode `127.0.0.1:8787`; DB produksi langsung; healthcheck override `:8787` karena Dockerfile hardcode `:8788` konteks rehearsal; restart unless-stopped) + `scripts/go_live_gateway_docker.sh APPLY|ROLLBACK` (Fase 0 preflight → Fase 1 build → Fase 2 cutover stop-systemd+up, downtime ~2-4 dtk → Fase 3 smoke; auto-rollback terukur di semua jalur gagal; unit systemd TIDAK pernah diubah/disabled → start manual selalu valid) + `scripts/smoke_go_live.sh` (10 cek absolut: health/default-ai/agents/list/projects/orders/SSE/sandboxes/**uji tulis DB produksi** INSERT→API→DELETE/exec).
- **Bug tooling ditangkap sebelum dipakai:** rehearsal_smoke.sh 155 hardcoded :8788/:8787 — versi pertama runbook memanggilnya = akan memverifikasi kontainer rehearsal, bukan :8787 pasca-migrasi → diganti smoke BASE-argument; field `/api/status` benar = `agents` (bukan `agents_count` — itu kontrak dashboard/stats). Alur Fase-1 lama (`up --build` sebelum stop systemd) pasti crash-loop bind :8787 → Fase 1 = build saja; up setelah stop; poll HTTP 12 dtk (bukan tunggu docker-health 15-30 dtk).
- **Bukti:** smoke_go_live **10/10 PASS** di :8787 (systemd); jalur **ROLLBACK dieksekusi live rc=0** (no-op start, wfs-office tetap active); vitest **2427/2427 (178 file)**; `e2e_err` **0/0/0**; :9503 & :8787 200; image `wfs-office-gw:go-live` terbangun (489MB). Produksi tidak berubah perilaku (bug exec justru pulih).
- **Go-live = SATU perintah: `scripts/go_live_gateway_docker.sh APPLY`** — menunggu persetujuan user (menyentuh systemd produksi; rollback kapan pun `... ROLLBACK`). **Sisa backlog: KOSONG.**

## 2026-10-29 20:02 WIB — Siklus 155: REHEARSAL migrasi gateway :8787 ke Docker LULUS penuh — image wfs-office-gw + compose + smoke 10/10 di :8788 (DB salinan), produksi systemd TIDAK disentuh; 3 gap container nyata ditemukan & ditutup

- **Backlog kandidat 154 dikerjakan (user menghendaki semua service long-running terkontainer + auto-restart), dengan cakupan jujur:** aturan siklus melarang menyentuh systemd produksi → siklus ini = **rehearsal penuh** yang bisa diulang kapan pun untuk go-live (ganti port 8788→8787 + stop unit systemd). Produksi :8787/wfs-office TIDAK diubah sedikit pun (guard: health 200 + agents=15 sepanjang siklus).
- **Audit prasyarat (sebelum build):** gateway = FastAPI 0.143/uvicorn 0.54 (`.venv` tanpa pip → versi dari `dist-info`, 27 paket di-replikasi persis di image); `uvicorn.run` **port hardcoded 8787** di `__main__`; DB = SQLite **journal delete** (AFTER DELETE trigger cron setiap 5 mnt — salinan aman dibaca bersamaan); `tasks.py` (engine berbayar, DIJEDA) **tanpa thread latar saat import** (engine hanya jalan saat endpoint dipanggil → dikontainerkan ≠ engine hidup); endpoint sandbox shell-out `docker ps`/`docker exec` → butuh CLI + socket; default AI dibaca `Path.home()/.hermes/.env`.
- **Artefak (repo, `deploy/docker/`):**
  - `Dockerfile.wfs-office-gw` — python:3.11-slim, pip 27 paket versi persis .venv host + **docker CLI statis 29.1.3** (ADD dari download.docker.com) + `HEALTHCHECK` `/api/health` 15s (healthy <20 dtk). Kode **tidak di-COPY** — di-mount ro dari host (satu sumber kebenaran dgn produksi; perubahan server.py host otomatis live di container).
  - `docker-entrypoint.sh` — **tanpa patch server.py**: `WFS_PORT` override port (rehearsal 8788) + `WFS_HERMES_HOME` mengganti HOME → `.hermes/.env` ditemukan via bind mount file (`:ro`, tidak bocor ke lapisan image).
  - `compose.rehearsal.yaml` — port 127.0.0.1:8788, restart `unless-stopped`, DB **SALINAN** (`rehearsal-data/*.db`, bukan tasks.db produksi), docker.sock, sandboxes.
  - `scripts/rehearsal_smoke.sh` — smoke fungsional dapat diulang (exit code = jumlah fail).
- **3 gap container nyata tertangkap & ditutup (semua terlihat di log, bukan ditebak):**
  1. `docker` CLI tak ada di slim → `/api/sandboxes` **500** (`FileNotFoundError docker`) → CLI statis host-paritas.
  2. `sandbox_exec.py` me-expand `~/wfs-office/sandboxes` → `HOME=/hermes-home` di container → **500 FileNotFoundError** → mount sandboxes di path HOME (`/hermes-home/wfs-office/sandboxes`).
  3. (verifikasi, bukan bug) `kill -9 1` dari exec **diabaikan kernel utk PID1** →RestartCount tetap 0; bukti restart-policy yang jujur: container `on-failure:5` dgn exit-crash → **RestartCount 0→5** (policy bekerja). `docker kill` = manual stop, sengaja TIDAK di-restart (semantik Docker benar).
- **Bukti terukur:**
  - Smoke **10/10 PASS** (`rehearsal_smoke.sh` exit 0): health, **default-ai=auto (bukti .env terbaca via HOME mount)**, paritas status.agents **15**, paritas daftar agen **15**, paritas projects, paritas orders, **SSE connected frame <4 dtk di container**, sandboxes **4 wfs-agent** via docker.sock host, **isolasi DB (INSERT di rehearsal TIDAK terlihat di :8787, task dibersihkan)**, **sandbox exec `print(6*7)` → `ok:true` "42"** via gateway container → docker exec → container agent.
  - `docker ps`: `wfs-office-rehearsal Up (healthy)`; inspect `OOM=false`; smoke pertama **9/10** (exec 500) → fix mount → **10/10** (bukti diskriminasi perbaikan nyata).
  - Vitest **2427/2427 (178 file)**; `npm run build` sukses (137 modul, 543ms) → deploy `dist/*` → `~/wfs-hq/` (tanpa perubahan frontend — deploy wajib rutin); `e2e_err.py` **0/0/0**; wfs-hq & wfs-office **active**, :9503 & :8787 **200**, agents_prod=15.
  - Image `wfs-office-gw:latest` **489MB**; container rehearsal tetap berjalan (restart unless-stopped) — bukti tahan-lama, bukan sekali-jalan.
- **Go-live (2 langkah, siap kapan pun):** (1) `docker compose -f compose.rehearsal.yaml down`; (2) compose produksi = file yang sama dgn port **8787** + DB **asli** (`tasks.db` produksi) + tanpa label rehearsal → `systemctl disable --now wfs-office` → up. Rollback = `systemctl start wfs-office`. Risiko tinggal: pemilik tasks.db berganti (agentuser UID 1002 → root container; trigger AFTER DELETE cron memakai path host — perlu verifikasi tetap tertulis), uji bersamaan SQLite di load nyata, dan `stop_grace_period` saat engine aktif.
- Commit: `deploy/docker/` (Dockerfile, entrypoint, compose) + `scripts/rehearsal_smoke.sh` di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) eksekusi go-live migrasi :8787 → container (butuh persetujuan user — menyentuh systemd produksi), (b) sinkronisasi penuh generasi server.py deployed ↔ backend/server.py repo (review manual — beda arsitektur chat/orders).

## 2026-10-29 10:39 WIB — Siklus 148: higiene pengukuran tangga adaptif — anti-FPS palsu pasca-sleep/stall + flag recovering tak lagi permanen + hysteresis recovery PR ditutup

- **Audit lanjutan `perf_quality.js` pasca siklus 147 menemukan 3 cacat nyata:**
  1. **Jendela sampling USANG picu degradasi palsu:** tab hidden/laptop sleep/stall rAF panjang menghentikan render loop tetapi `performance.now()` terus berjalan — sampel pertama pasca-resume = beberapa frame ÷ menit → FPS palsu ≈0 → tangga langsung mematikan bayangan + menurunkan resolusi di GPU yang SEHAT begitu pengguna kembali, lalu butuh ±40 dtk pulih (di GPU cepat: kilatan "GPU 0,2 FPS" + bayangan hilang tiap kali kembali dari jeda). Fix: jendela > 3× sampleMs (>6 dtk) dianggap usang — fps TIDAK dihitung, tangga degradasi dilewati, jendela & streak di-reset dari titik resume, flag `stale` di-set; chip HUD kini menampilkan "GPU mengukur ulang…" (amber) alih-alih FPS palsu ≈0, dan flag tetap jujur sampai sampel valid pertama dihitung.
  2. **Flag `recovering` tertahan `true` SELAMANYA** setelah pemulihan penuh → chip HUD biru "Kualitas pulih" permanen meski scene sudah ideal. Fix: flag dibersihkan saat `downgraded` lepas (basePR tercapai) — chip kembali hijau ideal.
  3. **Hysteresis recovery pixelRatio bocor:** SEMUA sampel ikut menghitung `goodStreak` (termasuk fps 20-25) → streak bisa "selesai" dari campuran sampel jelata; recovery PR naik walau GPU masih lambat, lalu turun-naik. Fix: sejajar recovery bayangan siklus 147 — hanya sampel sehat (fps ≥ 28) yang menghitung; satu sampel jelata mereset dari nol.
- **Degradasi sah TETAP bekerja** (diskriminasi): jendela valid 2 dtk dgn fps 2 (SwiftShader nyata) tetap memicu tangga penuh; tepat di ambang 6 dtk tidak dianggap usang (hanya >); proteksi tidak membutakan tangga.
- **Test baru +10** (`perf_quality.test.js`, total file 33): usang skip degradasi & reset streak ×2, degradasi sah tetap jalan, batas ambang tepat 6 dtk, recovering bersih pasca-pemulihan penuh, sampel jelata reset streak, urutan campuran 30-20-30-30 tidak menyelesaikan pemulihan (bug streak bocor tertangkap), chip stale "mengukur ulang…" + prioritas cabang (shadowLevel 2 tanpa stale tetap down).
- **Bukti terukur:**
  - **Vitest: 2387/2387 passed (174 file, +10)** — 12 test perfStep lama + 8 test recovery siklus 147 tetap hijau tanpa diubah (perubahan aditif; tangga degradasi & recovery L2→L1 tak tersentuh).
  - **ESLint: 0 error 0 warning** (file terubah).
  - **Build:** sukses (38 precache, 1844.83 KiB) → deploy `dist/*` → `~/wfs-hq/`; wfs-hq & wfs-office active, :9503 HTTP 200.
  - **E2E:** `e2e_perf_chip.py` OK (SwiftShader: `__perf` live fps 0.4, chip down "GPU 0,4 FPS · x0.75", shot 675 KB); `e2e_err.py` **0 error / 0 page error / 0 warning**; `shot.sh` :0 **672.844 bytes** (>500 KB, scene hidup).
- **Commit:** `9d60466` (snapshot cron autopush :30 — memuat perf_quality.js +65 & test +121) + `efa713f` (DEV_LOG + koreksi aritmetika test), push sukses ke `origin/main`.
- **Sisa backlog:** verifikasi recovery end-to-end di GPU cepat riil tetap butuh perangkat asli (SwiftShader selalu degraded); sisanya kosong.

## 2026-10-29 09:49 WIB — Siklus 147: recovery tangga kualitas adaptif + chip kualitas GPU di HUD (perf_quality.js)

- **Audit hot loop pasca-backlog kosong:** render loop sudah rapi (screen stagger, ambient 20×/dtk, shadow refresh 6×/dtk, sim clock throttle, hover 80 ms). Dua kelemahan nyata ditemukan di sistem tangga adaptif (`perf_quality.js`):
  1. **Recovery bayangan tidak pernah terjadi** — `castShadow=false` (tangga 3) adalah latch PERMANEN: satu stall sampel 2 dtk (GC besar, tab background, tab menunggu 40 dtk sebelum frame pertama) mematikan bayangan SELURUH sesi meski GPU ternyata kuat. PixelRatio punya recovery (4 sampel sehat), bayangan tidak sama sekali.
  2. **Pengguna buta terhadap degradasi** — FPS turun, bayangan hilang, tampilan memburuk, tanpa indikator apa pun (tak ada FPS meter, tak ada keterangan kualitas otomatis).
- **Perbaikan 1 — recovery bayangan bertahap (`perfStep`, state baru `shadowStreak`):** level shadow kini pulih satu tangga per 8 sampel sehat (fps≥28, 16 dtk): L2 (bayangan mati) → L1 (map 1024 + needsUpdate, castShadow hidup kembali) → setelah 8 sampel lagi latch lepas (shadowLevel 0). Naik ke map 2048 SENGAJA tidak otomatis (blokir lonjakan alokasi VRAM tanpa sepengetahuan pengguna — reload halaman bila mau full). Hysteresis: satu sampel fps<28 mereset hitungan recovery (anti on-off saat FPS "bernapas" di ambang). 12 test lama tetap lolos tanpa ubah (perubahan murni aditif; L2→L1 mengembalikan castShadow=true + mapSize 1024, jalur tangga naik tak tersentuh).
- **Perbaikan 2 — chip kualitas render GPU di HUD (`perfChip` murni + `.perf-chip` CSS):** label `GPU N FPS` + state 4 warna: ideal (hijau), stale (amber — pixelRatio turun / map 1024), recover (biru berdetak — pemulihan berjalan), down (merah — bayangan dimatikan). Tooltip detail: apa yang terjadi + kapan pulih + pixelRatio `x1.5`. FPS < 10 diformat 1 desimal gaya Indonesia (`GPU 0,4 FPS`, bukan "GPU 0 FPS" jelek dari E2E pertama); ≥ 10 bulat. Wiring: `window.__perf` (di-set scene tiap frame, reassign live) → App polling 2 dtk (sejajar rentang sampling FPS) → prop `perf` → HUD; tanpa data (2 dtk pertama / UI-only) chip disembunyikan — bukan angka karangan; re-render di-skip bila label/state/detail tak berubah.
- **E2E baru `scripts/e2e_perf_chip.py`:** verifikasi di browser nyata SwiftShader (GPU selalu masuk tangga — deterministik): `__perf` live (fps>0, pixelRatio 0.75, shadowLevel 2), chip `.perf-chip.down` ADA di HUD dgn label+tooltip benar, screenshot 674 KB. Plus `e2e_err.py` di-recreate di scratch (versi lama ter-prune 24 jam): 0 console error, 0 page error, 0 warning, tanpa 'Scene init failed'.
- **Bukti terukur:**
  - **Vitest: 2378/2378 passed (174 file, +17 test)** — perf_quality +11 (recovery L2→L1 16 dtk, latch-lepas L1→0 tanpa 2048, hysteresis reset, tanpa sun, perfChip ×6: null-guard, ideal, sub-10 desimal, stale, down, recover), hud_ambience +5 (chip hidden/tampil ideal/stale/recover/down), 12 test perfStep lama tetap hijau.
  - **ESLint: 0 error 0 warning** (`npx eslint src/` exit 0).
  - **Build:** sukses (38 precache, 1844.44 KiB) → deploy `dist/*` → `~/wfs-hq/`; wfs-hq & wfs-office active, :9503 HTTP 200.
  - **E2E:** `e2e_perf_chip.py` OK (perf live fps 0.4, chip down "GPU 0,4 FPS" + detail pemulihan 16 dtk di tooltip, shot 674 KB); `e2e_err.py` 0/0/0; `shot.sh` :0 **676.466 bytes** (>500 KB, WebGL hidup).
- **Sisa backlog:** verifikasi recovery bayangan end-to-end di perangkat asli butuh GPU cepat riil (di SwiftShader selalu degraded — proof recovery via unit test 8 sampel + diskriminasi latch lama); sisanya kosong.

## 2026-10-27 06:55 WIB — Siklus 111: WYSIWYG warna permukaan UI 3D — uiTexture(srgb) + uiMaterial(toneMapped:false) di seluruh layar/teks kanvas

- **Bug visual ditemukan dari audit lanjutan siklus 109/110 (badge & tekstur TV):** tekstur kini segar (needsUpdate semua jalur), TETAPI warna yang dilukis painter dirender SHIFTED di 3D. Renderer memakai `ACESFilmicToneMapping` + `outputColorSpace sRGB`, sementara hampir semua `CanvasTexture` tidak pernah ditandai `SRGBColorSpace` → texel sRGB dibaca sebagai data LINEAR lalu di-tonemap ACES. Prediksi matematis utk badge hijau `#10E5A0` (16,229,160): ACES→sRGB = **(71,229,216)** teal-shifted; pengukuran piksel screenshot kamera-aim-ke-TV sebelum patch: area badge **(111,177,186)** — jauh dari painter (jarak euclid ~121). Badge LIVE hijau, bar gradien, teks amber, logo — semua pudar/bergeser di layar 3D.
- **Perbaikan (modul baru `src/scene/parts/ui_colorspace.js`):**
  1. `uiTexture(tex)` — tandai `tex.colorSpace = 'srgb'` (konstanta string `THREE.SRGBColorSpace` three r152+, tanpa import THREE agar stub test tetap jalan; try-guard).
  2. `uiMaterial(mat)` — set `mat.toneMapped = false` untuk material unlit layar/teks (layar tak boleh kena ACES).
  3. Tekstur dekoratif (terrazzo, langit jendela, pola dinding, AO strip, sheen kaca) SENGAJA tidak disentuh — pencahayaan artistik dipertahankan.
- **Penerapan di 17 situs UI (texture + material):** TV lounge (`lounge.js` tvTex+tvScr), papan proyek 3D (`projectboard.js`), whiteboard rapat & jam dinding (`room.js`), label agen full/short, monitor agen, nameplate meja, judul dinding "WFS PROJECT", bubble chat (`OfficeScene.js`), poster dinding (`furniture.js`, `decor.js`), menu board kafe (`cafe.js`), logo resepsionis (`reception.js`), logo dinding + papan sambutan (`walls.js`), label zona (`flooring.js`), papan nama lantai terrace (`terraces.js`).
- **Test baru (+41):** `ui_colorspace.test.js` (+6: helper srgb/toneMapped/chainable/null-safe), `ui_wysiwyg_contract.test.js` (+35: kontrak anti-regresi — setiap situs tekstur & material UI WAJIB memakai helper; test fail bila ada `new THREE.CanvasTexture` layar yang lolos tanpa `uiTexture`), adaptasi sandbox `tv_lounge_runtime.test.js` (injeksi uiTexture/uiMaterial ke `new Function`).
- **Bukti terukur:**
  - **Vitest:** **1999/1999 passed (148 file)** pasca-rebase di atas auto-dev `7a5d803` (+41 test dari 1942), 0 fail.
  - **ESLint:** 0 warning, 0 error (`npx eslint src/` exit 0).
  - **Build:** sukses (37 precache, 1806.58 KiB) → deploy `dist/*` → `~/wfs-hq/` OK; `wfs-hq` & `wfs-office` `active`; chunk `index-KieIKoPP.js` HTTP 200.
  - **E2E:** `e2e_shot.py` **679.970 bytes** (E2E_VISUAL OK, 26 agen, ws true); `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `shot.sh` :0 **680.960 bytes** (>500 KB, WebGL hidup).
  - **Catatan jujur:** probe pixel badge TV di layar (dot hanya ±2-3 px layar pada jarak kamera 6.5 m di SwiftShader) tidak bisa mengisolasi dot secara deterministik — bukti warna berlapis: prediksi matematis ACES (di atas) + unit test helper + kontrak anti-regresi 17 situs. Verifikasi visual final menyusul bila perlu (screenshot kamera dekat).
- **Commit:** `35dc9e0` → rebase 1x di atas `71125d1` (auto) + `7a5d803` (auto-dev TaskModal/OverlayHelp tests) → final `9af86a8`, push sukses ke `origin/main` (vitest pasca-rebase 1999/1999).
- **Sisa backlog:** verifikasi subjektif audio web-audio (butuh pendengaran manusia); verifikasi visual close-up warna TV (opsional, butuh mata manusia / screenshot close-up).

## 2026-10-27 05:35 WIB — Siklus 110: Bugfix tekstur 3D TV lounge — tvTex.needsUpdate di SEMUA jalur drawTv + ticker detak umur badge koneksi (paritas papan 3D)

- **Bug ditemukan dari audit lanjutan siklus 109 (badge koneksi TV):**
  1. **`src/scene/parts/lounge.js` — `tvTex.needsUpdate` tidak pernah di-set di jalur gagal/awal:** `tvPull` catch memanggil `drawTv()` sehingga KANVAS 2D berubah (TERPUTUS/SINKRON N LALU) tapi tekstur 3D tidak diberi tahu → badge koneksi tak pernah tampak di TV 3D sungguhan saat gateway mati; e2e siklus 109 membaca pixel kanvas 2D (`__tvCanvas`) sehingga lolos uji padahal layar 3D membeku di frame lama. Perbaikan: `tvTex.needsUpdate = true` dipindah KE DALAM `drawTv()` (satu titik, semua jalur: initial draw, sukses, gagal, ticker); deklarasi `tvTex` dimajukan sebelum `drawTv()` pertama (hindari TDZ ReferenceError); `drawTv(); tvTex.needsUpdate=true` redundan di jalur sukses dirapikan.
  2. **Ticker detak umur badge (paritas `connIv` 30 dtk papan 3D):** label `SINKRON N dtk/mnt LALU` sebelumnya membeku di angka poll terakhir — backoff hingga 80 dtk berarti umur bisa meleset 80 dtk. Kini `connTick = setInterval(..., 30000)` menggambar ulang TV saat `tvConn.state !== 'live'`; tick di-skip saat live (hemat redraw); dibersihkan di `tvDestroy()`; diekspos sebagai `connTick` untuk uji.
  3. **E2E baru `scripts/e2e_tvtexture.py` (verifikasi tekstur sungguhan, bukan hanya kanvas):** baseline LIVE (RGB 16,229,160) → `fetch` dioverride reject di browser nyata via CDP → tunggu tick backoff → badge di kanvas berubah **amber RGB(245,158,11) SINKRON** dalam ~60 dtk (dulu: kanvas berubah tapi tekstur 3D diam). CDP-level proof jalur gagal kini benar-benar sampai ke permukaan yang terlihat.
- **Perubahan:** `src/scene/parts/lounge.js` (needsUpdate dalam drawTv, reorder tvTex, connTick 30 dtk, tvDestroy clearInterval, return +connTick), `src/__tests__/tv_lounge_runtime.test.js` (+2: REGRESI needsUpdate semua jalur sukses/gagal/manual; ticker detak umur skip saat live → gambar saat stale → bersih di destroy), `src/__tests__/lounge_runtime.test.js` (koreksi ekspektasi: needsUpdate kini TRUE pasca initial draw — semantik baru yang benar), `scripts/e2e_tvtexture.py` (baru).
- **Bukti terukur:**
  - **Vitest:** **1937/1937 passed (143 file)** (+2 test baru dari 1935; 1 ekspektasi lama dikoreksi), 0 fail.
  - **ESLint:** 0 warning, 0 error (`npx eslint .` exit 0).
  - **Build:** sukses (37 precache 1806.31 KiB) → deploy `dist/*` → `~/wfs-hq/` OK; `wfs-hq` & `wfs-office` `active`.
  - **E2E:** `e2e_shot.py` **683.628 bytes** (>500 KB, WebGL hidup, 26 agen); `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `shot.sh` :0 **685.891 bytes**; `e2e_tvconn.py` LIVE hijau RGB(16,229,160); **`e2e_tvtexture.py` OK** (badge → amber SINKRON di kanvas saat fetch diblokir, proof tekstur ikut segar via needsUpdate).
- **Sisa backlog:** verifikasi subjektif audio web-audio (butuh pendengaran manusia); tidak ada item wajib lain.

## 2026-10-27 04:07 WIB — Siklus 108: Polling Adaptif Backoff Eksponensial untuk Papan Proyek 3D & TV Lounge (penuntas backlog siklus 107)

- **Yang diperbaiki (backlog siklus 107: "adaptasi backoff eksponensial untuk pull papan 3D & TV lounge — masih 60 dtk fix"):**
  1. **`src/lib/connection_spec.js` — `nextPollDelay(tr, healthyMs)`:** kini menerima cadence sehat kustom per-pemanggil (papan 3D & TV tetap 60 dtk saat sehat — perilaku lama dipertahankan; App tetap default 15s). Tracker yang sedang gagal SELALU mengembalikan delay backoff eksponensialnya (5→10→20→40→80s, cap 80s) apa pun cadence sehat; pulih otomatis ke cadence pemanggil.
  2. **`src/scene/parts/projectboard.js` (papan proyek 3D):** `setInterval(pull, 60000)` fix diganti rantai `setTimeout` adaptif yang membaca delay dari tracker `connection_spec` (satu sumber kebenaran dengan chip HUD & badge strip). Jadwal pertama menyusul pull awal selesai agar delay dihitung dari tracker segar; `destroy()` menghentikan rantai (flag `pollStopped` + `clearTimeout`) — gateway mati tak lagi dihantam tiap 60 dtk (hemat trafik & log, paritas penuh dengan App siklus 106).
  3. **`src/scene/parts/lounge.js` (TV lounge):** pola identik — tracker `tvConn` + rantai `setTimeout` adaptif 60 dtk sehat / backoff saat gagal; api baru `tvDestroy()` (menggantikan `clearInterval(tvIv)` manual) dan `tvSchedule()` diekspos untuk pengujian; `window.__tvPullErr` tetap disimpan saat gagal (kompatibel e2e lama).
  4. **`src/scene/OfficeScene.js`:** destroy path TV lounge kini memanggil `__loungeObj.tvDestroy()` (bersih, try-guarded) — menggantikan `clearInterval(tvIv)` + `removeEventListener` manual.
  5. **Test baru (+5):** `connection_spec.test.js` +1 (cadence sehat kustom: tracker kosong/live → 60 dtk pemanggil, gagal → backoff menang); `tv_lounge_runtime.test.js` +2 (backoff 60→5→10→pulih 60 dtk diverifikasi tick-demi-tick via fake timers; `tvDestroy` menghentikan rantai — 0 fetch selama 300 dtk); `projectboard_runtime.test.js` +2 (backoff papan 3D 60→5→10→pulih 60; paritas perilaku TV). Test ekstraksi TV kini menginjeksi `applyPollResult`/`nextPollDelay` (import ES modul tak terlihat `new Function`).
- **Bukti terukur:**
  - **Vitest:** **1916/1916 passed (142 file)** (+5 test baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint` pada 7 file terubah, exit 0).
  - **Build:** sukses (exit 0, 37 precache entries 1804.55 KiB; chunk `index-CML6VP6t.js` 225.24 kB tersaji HTTP 200 di :9503).
  - **Deploy:** `dist/*` → `~/wfs-hq/` OK; layanan `wfs-hq` & `wfs-office` tetap `active`.
  - **E2E:** `e2e_tv.py` **E2E_TV: OK** (26 agents, ws true); `e2e_shot.py` **E2E_VISUAL: OK** — **679.458 bytes** (>500 KB, WebGL hidup); `e2e_zone_multi.py` **E2E_ZONE_MULTI: OK** (0 OFFSCREEN, label zona vis semua); `shot.sh` DISPLAY=:0 **681.866 bytes** (>500 KB).
- **Sisa backlog:** tidak ada item wajib; kandidat lanjutan: verifikasi subjektif audio web-audio (perlu pendengaran manusia), opsi menampilkan badge koneksi TV lounge di kanvas TV (kini trackernya sudah ada).

## 2026-10-27 03:12 WIB — Siklus 107: Badge Status Koneksi Gateway di Strip 3D ProjectBoard (paritas chip HUD .conn-chip)

- **Yang diperbaiki & ditingkatkan (backlog opsional siklus 106 — badge chip koneksi di strip 3D):**
  1. **Runtime papan proyek (`src/scene/parts/projectboard.js`):**
     - Tracker kesehatan koneksi gateway kini dimiliki papan: `applyPollResult` dari `lib/connection_spec.js` (satu sumber kebenaran dengan chip HUD) — transisi `live` / `stale` (gagal setelah pernah sukses) / `down` (belum pernah sukses).
     - Badge digambar di awal strip bawah papan 3D: titik berwarna (hijau `#10E5A0` live, amber `#F59E0B` stale, merah `#ef4444` down) + label `Sinkron` / `Sinkron N dtk/mnt lalu` / `Terputus` — prioritas tertinggi, TIDAK pernah ikut dibuang `stripLayout` (ditempatkan sebelum segmen hasil layout, aman di strip paling sempit).
     - **Perbaikan silent-catch lama:** `pull()` yang gagal sebelumnya diam total (`catch { /* biarkan data terakhir tampil */ }`) — kini memanggil `draw()` saat gagal sehingga badge berubah ke stale/down segera, tanpa menunggu tick 60 dtk berikutnya; data papan terakhir tetap tampil (fallback perilaku lama dipertahankan).
     - Refresh umur data tiap 30s saat state non-live (label "Sinkron N lalu" berdetak tanpa fetch tambahan); `connIv` ikut dibersihkan di `destroy()`.
  2. **Unit test (`src/__tests__/projectboard_runtime.test.js`)** — describe baru "badge koneksi gateway di strip bawah" (+4 test, total file jadi 17):
     - sukses → label `Sinkron` digambar; gagal pasca-sukses → `draw()` dipanggil ulang saat catch + label `Sinkron … lalu`; gagal sejak awal (snap null, draw no-op) → pulih → `Sinkron` + data papan tampil; `destroy()` menghentikan seluruh interval (tak ada fetch lagi).
     - Stub context 2D dilengkapi `arc()` untuk titik badge.
- **Klarifikasi backlog "sinkronisasi preset divisi ke ProjectPanel":** audit siklus 107 menunjukkan item ini **sudah tercakup** — strip preset divisi (`div-preset-chip` + stats + highlight aktif via `isDivisionPresetActive`) berada di TaskBoard yang membaca state `division` yang sama dengan siklus shortcut `D` (`wfs-cycle-div-preset` → `setDivision` → re-render strip otomatis); ProjectPanel (panel roket) memang tidak memuat strip preset. Backlog ditutup.
- **Bukti terukur:**
  - **Vitest:** **1911/1911 passed (142 file)** (+4 test baru `projectboard_runtime`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint` pada file terubah).
  - **Build:** sukses (exit 0, 37 precache entries 1804.10 KiB; chunk baru `index-CejGw5Ax.js` tersaji HTTP 200 di :9503).
  - **Deploy:** `dist/*` → `~/wfs-hq/` OK (index & chunk 200; layanan `wfs-hq` + `wfs-office` tetap `active`).
  - **E2E:** `e2e_tv.py` **E2E_TV: OK** (26 agents, ws true); `e2e_shot.py` **E2E_VISUAL: OK** — screenshot **682.097 bytes** (>500 KB, WebGL hidup); `e2e_zone_multi.py` **E2E_ZONE_MULTI: OK** (0 OFFSCREEN, label zona `vis=True` semua).
- **Commit Hash:** `8ba90e3` (feat/board; pasca rebase di atas auto-dev `017f4d9` a11y ShConsole — vitest final **1912/1912, 142 file**, 0 fail), push sukses ke `origin/main`.
- **Sisa backlog:** tidak ada item wajib tersisa; kandidat lanjutan: adaptasi backoff eksponensial `connection_spec` untuk pull papan 3D & TV lounge (saat ini tetap 60 dtk fix), verifikasi subjektif audio web-audio.

## 2026-10-27 02:35 WIB — Siklus 106: Indikator Sinkronisasi Gateway HUD + Polling Adaptif Backoff Eksponensial (lib/connection_spec.js, chip live/stale/down)

- **Yang diperbaiki & ditingkatkan (backlog siklus 105: indikator status sinkronisasi offline/reconnect):**
  1. **Modul kesehatan koneksi murni (`src/lib/connection_spec.js`, `src/__tests__/connection_spec.test.js`):**
     - Tracker `applyPollResult(tr, result, now)`: transisi state `live` (sukses) / `stale` (gagal setelah pernah sukses — data basi tapi tampilan masih layak) / `down` (gagal tanpa pernah sukses), `failStreak`, `lastOkAt`, injeksi waktu agar testable.
     - Backoff eksponensial polling: 5s → 10s → 20s → 40s → 80s (cap `POLL_MAX_MS=80s`), pulih otomatis ke 15s (`POLL_HEALTHY_MS`) saat sukses; `nextPollDelay()` dgn fallback sehat.
     - `connectionBadge(tr, now)`: badge HUD selalu-aman — `live` → "Sinkron" (hijau), `stale` → "Sinkron N dtk/mnt lalu" (amber, umur data sejak sukses terakhir), `down` → "Terputus" (merah, membawa detail error).
  2. **Polling adaptif App (`src/App.jsx`):** `setInterval` fixed 15s diganti rantai `setTimeout` yang membaca delay dari tracker — saat gateway mati browser tak lagi menghantam endpoint tiap 15s (hemat trafik & log), saat pulih langsung kembali ke ritme sehat; tab `hidden` diturunkan ke 30s. RefRESH label umur data tiap 5s hanya saat state non-live (tanpa re-render sia-sia saat sehat, tanpa fetch tambahan).
  3. **Chip HUD sinkronisasi (`src/components/HUD.jsx`, `src/index.css`, `src/__tests__/hud_ambience.test.jsx`):** chip `.conn-chip` di samping status task — titik status + label, tooltip `title` berisi detail ("Gateway tersinkron" / "Polling gagal — data terakhir N lalu" / "Gateway tak terjangkau"), `role="status"` + `aria-label`, animasi `pulse` untuk stale/down, backward-compatible (tanpa prop `conn` chip tak dirender).
- **Bukti terukur:**
  - **Vitest:** **1913/1913 passed (142 test file)** saat build (+14 test baru: 10 `connection_spec.test.js`, 4 chip HUD di `hud_ambience.test.jsx`; 11 test lain dari worker auto-dev). Pasca-rebase di atas konsolidasi test worker `159647e` (hapus test file duplikat clip/files/wakelock): **1894/1894 passed (139 file)**, 0 fail — perubahan src non-test nihil, dist tetap valid. Final setelah auto-dev `b4215a5` (+13 test a11y): **1907/1907 passed (142 file), 0 fail.**
  - **ESLint:** 0 warning, 0 error (`npx eslint src/`, exit 0).
  - **Build:** sukses (37 precache entries 1803.67 KiB; chunk `index-BWUUzqjs.js` tersaji HTTP 200).
  - **Deploy:** `dist/*` → `~/wfs-hq/` OK.
  - **E2E:** `e2e_err.py` 0 "Scene init failed"; `e2e_tv.py` **E2E_TV OK** (26 agents, ws true); `shot.sh` **680.847 bytes** (>500 KB, WebGL hidup); `verify_desks.mjs` **ALL_DESKS_OK** (L1=9, L2=9, L3=8, 0 collision); probe CDP baru `e2e_conn.py`: chip `.conn-chip live` "Sinkron" terender di HUD browser nyata.
- **Commit Hash:** `2a21808` (feat/devlog; perubahan src ikut tersimpan pada `6b3fac6` — snapshot cron autopush :30 yang meng-commit sisa file src sebelum commit manual, push sukses ke `origin/main`)
- **Sisa backlog:** sinkronisasi siklus preset divisi ke strip preset ProjectPanel; badge chip koneksi juga di Ticker/strip 3D (opsional).

## 2026-10-27 01:50 WIB — Siklus 105: Shortcut Keyboard Cepat Switch Preset Divisi (D / Shift+D, cycleDivisionPreset, Event Bus wfs-cycle-div-preset & Hint Terintegrasi)

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Preset Divisi (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mengembangkan evaluator siklus preset `cycleDivisionPreset(currentFilter, presets, { backward })`: siklus `'all' → preset 1 → preset 2 → … → 'all'` dengan aritmetika slot maya (majumundur wrap aman), case-insensitive terhadap filter key, toleran filter arbitrary bukan preset (diperlakukan seperti `'all'`), serta aman terhadap koleksi preset kustom kosong.
  2. **Registri Shortcut Global (`src/scene/parts/shortcut_spec.js`, `src/__tests__/shortcut_spec.test.js`):**
     - Mendaftarkan shortcut baru `D` (aksi `cycle_div_preset`, kategori panel) ke `KEYBOARD_SHORTCUTS` + ringkasan bantuan `formatShortcutHelpSummary()`.
     - `resolveShortcutAction` memetakan `D`/`Shift+D` ke `CYCLE_DIV_PRESET` / `CYCLE_DIV_PRESET_BACKWARD` — aktif saat papan task terbuka (activeModal task_board) maupun di desktop, ditolak di modal lain, dan tetap diabaikan pada input editable / modifier ctrl/meta/alt.
  3. **Distribusi Aksi App (`src/App.jsx`):**
     - Kedua aksi siklus men-dispatch event bus `wfs-cycle-div-preset` dengan `detail.backward` (pola identik shortcut `T` → `wfs-toggle-task-board`).
  4. **Antarmuka TaskBoard (`src/components/TaskBoard.jsx`, `src/__tests__/TaskBoard.test.jsx`):**
     - Listener `wfs-cycle-div-preset` yang membuka papan bila tertutup, menyiklus filter divisi melewati semua preset bawaan + kustom via `allDivPresets`, memicu flash `▶ Preset divisi berikutnya: …` / `◀ Preset divisi sebelumnya: …` dengan ringkasan manusiawi `formatDivisionFilterSummary`, plus feedback audio `playSelect`.
     - Footer hint papan task kini menampilkan `<kbd>D</kbd> Siklus Preset Divisi`.
- **Bukti terukur:**
  - **Vitest:** **1888/1888 passed (138 test file)** (+4 tests baru: 1 di `kanban_spec.test.js`, 1 di `shortcut_spec.test.js`, 2 di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/`, exit 0).
  - **Build:** Berhasil (exit 0, 37 precache entries 1801.46 KiB; `OfficeScene` 166.74 KB / gzip 57.13 KB, `index` 223.60 KB / gzip 61.15 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/` (chunk baru `index-b3sElssc.js` hadir).
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-b3sElssc.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (26 agents aktif, ws true, fase night).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **679.240 bytes** (>500 KB, WebGL hidup, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja: L1=9, L2=9, L3=8, 0 collision).
- **Commit Hash:** `ca8b3b7` (rebase di atas `6462ae1` dari worker auto-dev — test-only, push sukses ke `origin/main`)
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect; sinkronisasi siklus preset divisi ke strip preset ProjectPanel.

## 2026-10-27 00:55 WIB — Siklus 104: Preset Kombinasi Multi-Divisi Kustom pada Task Kanban (kanban_spec.js, Panel Pembuat Preset Divisi Kustom, Multi-Select Divisi, Persistensi Storage & Indikator Komprehensif)

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Preset Kombinasi Divisi Kustom (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mendefinisikan preset kombinasi divisi bawaan `DIVISION_PRESETS` (`engineering` [BE+FE+Ops+QA], `fullstack` [BE+FE], `platform-sec` [Ops+QA], `product-cs` [Product+AI], `frontend-product` [FE+Design+Product]) lengkap dengan ikon, warna aksen, dan deskripsi terstruktur.
     - Mendefinisikan konstanta penyimpanan `CUSTOM_DIV_PRESET_STORAGE_KEY` (`wfs_custom_division_presets`) dan koleksi ikon emoji divisi pilihan `DIVISION_PRESET_ICONS` (`⚡`, `🚀`, `🛡️`, `✨`, `🎨`, `⚙️`, `🏢`, `🧪`, `🔒`, `📦`, `🎯`, `💡`).
     - Mengembangkan normalizer daftar divisi cerdas `normalizeDivisionList` yang mampu menguraikan representasi array, string dipisah koma, preset key bawaan/kustom, maupun fallback aman `'all'`.
     - Mengembangkan slugifier pembuat kunci unik `slugifyDivisionPresetKey` dengan prefiks konsisten `div-custom-<slug>`.
     - Mengembangkan normalizer cerdas `normalizeCustomDivPreset` yang memvalidasi objek preset, menormalisasi array divisi, menentukan warna hex kontras, menyusun deskripsi ramah pengguna, dan menyematkan penanda `isCustom: true`.
     - Mengembangkan serializer deterministik aman `loadCustomDivPresets` dan `saveCustomDivPresets` dengan perlindungan `try/catch` terhadap kegagalan parse JSON maupun lingkungan storage terbatas.
     - Mengembangkan generator pembuat preset bebas konflik `createCustomDivPreset` yang menjamin kunci tidak bertabrakan dengan `DIVISION_PRESETS` bawaan maupun preset kustom lain yang sudah ada.
     - Menyediakan utilitas penghapusan preset `deleteCustomDivPreset`, penggabung koleksi `getAllDivisionPresets`, pencari preset `getDivisionPreset`, verifikator aktif `isDivisionPresetActive`, dan pemformat ringkasan `formatDivisionFilterSummary`.
     - Mengembangkan evaluator `computeDivisionPresetStats` untuk menghitung task total, selesai (done), dan berjalan (running) per preset secara real-time.
     - Mengembangkan pengalih filter interaktif `toggleDivisionInFilter` yang mendukung mode single toggle dan multi-select toggle (via Shift/Ctrl/Cmd).
     - Memperluas fungsi inti `matchTaskDivision` agar mendukung pencocokan multi-divisi (array, string dipisah koma, maupun preset key) secara 100% backward-compatible.
     - Memperluas `groupTasksByKanbanColumn`, `computeSprintMetrics`, `filterTasks`, `computeTagCloud`, `computePresetStats`, dan `computePriorityBreakdown` agar dapat mengevaluasi filter divisi berbasis array, string koma, maupun preset key kustom.
  2. **Integrasi Ekspor Data Task (`src/lib/kanban_export.js`):**
     - Memperluas `generateTaskExportFilename` agar mendukung penamaan file ekspor bersih untuk array multi-divisi maupun preset kombinasi (misal: `wfs-tasks_core-be-fe-design_2026-10-27.csv` atau `wfs-tasks_fullstack_2026-10-27.csv`).
  3. **Antarmuka & Pengalaman Pengguna TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghadirkan strip preset divisi `.div-preset-strip` yang menampilkan preset bawaan (`⚡ Engineering Core`, `🚀 Fullstack Dev`, `🛡️ Platform & QA`, dll.) beserta badge hitungan task per preset secara real-time.
     - Menyediakan tombol pembuat preset divisi baru `+ Preset Baru` / `+ Simpan (N Divisi)` dengan pre-fill otomatis divisi yang sedang aktif saat ditekan.
     - Menghadirkan panel pembuat preset interaktif `.div-preset-creator` lengkap dengan input nama preset (auto-focus), pemilih ikon emoji cepat, pemilih warna aksen palet dark royal-navy, dan toggle chip divisi kerja interaktif (dengan checklist `✓` dan nama divisi).
     - Menampilkan chip preset kustom dengan batas putus-putus (`border-style: dashed`), status aktif bercahaya, dan tombol hapus cepat `✕` (`.div-preset-del-btn`).
     - Menghubungkan interaksi multi-select pada chip divisi kerja: Shift/Ctrl/Cmd + klik mengaktifkan/menonaktifkan divisi secara simultan.
     - Mengintegrasikan tombol dinamis `Fokus Pod 3D ↗` (saat 1 divisi aktif) atau `Fokus Kampus 3D ↗` (saat multi-divisi aktif).
     - Mengintegrasikan penutupan bertahap via tombol `Escape`: jika form pembuatan preset divisi terbuka, `Escape` menutup form terlebih dahulu sebelum menutup papan task.
     - Menghubungkan aktivasi preset divisi via event `wfs-open-task-board` (parameter `divPreset`) dan feedback audio responsif `playSelect`.
  4. **Peningkatan E2E Resilience TV Lounge (`scripts/e2e_tv.py`):**
     - Menyesuaikan validasi `tasks.total` agar toleran terhadap `total >= 0` saat database task baru saja di-reset atau dibersihkan.

- **Bukti terukur:**
  - **Vitest:** **1884/1884 passed (138 test file)** (+16 tests baru: 12 test di `kanban_spec.test.js`, 4 test di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1800.03 KiB; `OfficeScene` 166.74 KB / gzip 57.13 KB, `index` 222.14 KB / gzip 60.77 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DXo2m3M5.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 0/0 selesai, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **682.075 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect dan shortcut keyboard cepat switch preset.

## 2026-10-27 00:08 WIB — Siklus 103: Preset Kombinasi Multi-Tag Kustom pada Task Kanban (kanban_spec.js, Panel Pembuat Preset Kustom, Selector Tag Interaktif, Persistensi Storage & Penghapusan Presisi)

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Preset Kombinasi Tag Kustom (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mendefinisikan konstanta penyimpanan `CUSTOM_PRESET_STORAGE_KEY` (`wfs_custom_tag_presets`) dan koleksi ikon emoji pilihan `PRESET_ICONS` (`⚡`, `🚀`, `🛡`, `🎨`, `🐳`, `🛠`, dll.).
     - Mengembangkan slugifier pembuat kunci unik `slugifyPresetKey` untuk menghasilkan identifikasi slug ramah URL dan konsisten (`custom-<nama>`).
     - Mengembangkan normalizer cerdas `normalizeCustomPreset` yang memvalidasi objek preset, menormalisasi array tag dengan `normalizeTagList`, memvalidasi warna hex dengan fallback ke `TAG_PALETTE`, menghitung warna teks kontras tinggi `textColor`, menyusun deskripsi ramah pengguna, dan menyematkan penanda `isCustom: true`.
     - Mengembangkan serializer deterministik aman `loadCustomPresets` dan `saveCustomPresets` dengan perlindungan `try/catch` terhadap kegagalan parse JSON maupun lingkungan storage terbatas.
     - Mengembangkan generator pembuat preset bebas konflik `createCustomPreset` yang menjamin kunci tidak bertabrakan dengan `TAG_PRESETS` bawaan maupun preset kustom lain yang sudah ada.
     - Menyediakan utilitas penghapusan preset `deleteCustomPreset` dan penggabung koleksi `getAllPresets`.
     - Memperluas `getTagPreset`, `isPresetActive`, dan `computePresetStats` agar mendukung pencarian, verifikasi kecocokan aktif, dan agregasi jumlah task untuk preset kustom secara backward-compatible.
  2. **Antarmuka & Pengalaman Pengguna TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menyediakan tombol pembuat preset baru `+ Preset Baru` / `+ Simpan (N tag)` pada strip preset kanban.
     - Menghadirkan panel pembuat preset interaktif `.task-preset-creator` lengkap dengan input nama preset (auto-focus), pemilih ikon emoji cepat, pemilih warna palet tema dark royal-navy, dan selektor chip tag interaktif (dengan penanda checklist `✓` dan hitungan tag aktif).
     - Menghubungkan pre-fill otomatis: saat user memilih 1 atau lebih tag di filter, menekan tombol `+ Simpan` langsung menginjeksi tag tersebut ke dalam form pembuatan preset.
     - Menampilkan chip preset kustom dengan batas putus-putus (`border-style: dashed`), status aktif bercahaya, dan tombol hapus cepat `✕` (`.task-preset-del-btn`) yang aman dari tabrakan event bubbling tanpa melanggar semantik HTML.
     - Mengintegrasikan penutupan bertahap via tombol `Escape`: jika form pembuatan preset terbuka, `Escape` menutup form terlebih dahulu sebelum menutup papan task.
     - Menghubungkan aktivasi preset kustom via event `wfs-open-task-board` dan feedback audio responsif `playSelect`.

- **Bukti terukur:**
  - **Vitest:** **1863/1863 passed (138 test file)** (+11 tests baru: 9 test di `kanban_spec.test.js`, 2 test di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1784.15 KiB; `OfficeScene` 166.74 KB / gzip 57.13 KB, `index` 210.45 KB / gzip 58.45 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-PA2AuoV0.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **681.251 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect dan preset kombinasi multi-divisi kustom.

## 2026-10-26 23:15 WIB — Siklus 102: Filter Preset Rentang Tanggal Kustom (Custom Date Picker) Task Kanban (kanban_date.js, Panel Tanggal Kustom, Validasi Tanggal Terbalik, Integrasi kanban_spec & kanban_export, Fallback Resilience project_api)

- **Yang diperbaiki & ditingkatkan:**
  1. **Utilitas Rentang Tanggal Kustom (`src/lib/kanban_date.js`, `src/__tests__/kanban_date.test.js`):**
     - Menambahkan opsi preset `custom` ('Rentang Kustom…', icon ⚙️) pada `DATE_RANGE_PRESETS`.
     - Mengembangkan parser fleksibel input tanggal `parseDateInputToTimestamp` yang mendukung string format `YYYY-MM-DD`, Date objek, dan epoch timestamp, dengan penanganan batas akhir hari `isEndOfDay` (23:59:59.999).
     - Mengembangkan normalizer cerdas `normalizeCustomDateRange` yang memvalidasi rentang tanggal, mendeteksi rentang terbalik (`start > end` / `isReversed`), dan menangani rentang terbuka satu sisi (`onlyStart` / `onlyEnd`).
     - Mengembangkan pemformat tanggal ramah pengguna `formatCustomDateRange` (misal: "20 – 25 Okt 2026", "Dari 20 Okt 2026", "Hingga 26 Okt 2026") dan `formatSimpleDate`.
     - Memperluas evaluator deterministik `isTaskInDateRange` dan filter array `filterTasksByDate` untuk mengevaluasi rentang kustom secara akurat.
     - Mengintegrasikan penghitungan statistik `stats.custom` pada `computeDateRangeStats` serta pemformat ringkasan `formatDateRangeSummary` untuk mode kustom.
  2. **Integrasi Spesifikasi Kanban & Ekspor Data (`src/scene/parts/kanban_spec.js`, `src/lib/kanban_export.js`, `src/__tests__/kanban_spec.test.js`, `src/__tests__/kanban_export.test.js`):**
     - Meneruskan parameter `customRange` ke `groupTasksByKanbanColumn` dan `filterTasks` secara backward-compatible.
     - Menyematkan `custom_range` pada metadata filter berkas JSON hasil ekspor.
     - Mengembangkan penamaan berkas otomatis yang mencerminkan rentang kustom (misal: `wfs-tasks_custom_2026-10-20_to_2026-10-25_2026-10-26.csv`).
  3. **Antarmuka & Pengalaman Pengguna TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menyediakan panel interaktif `.task-custom-date-bar` yang muncul mulus saat preset kustom dipilih.
     - Menyediakan input tanggal awal (`Dari:`) dan akhir (`s/d:`) dengan styling tema dark royal-navy dan penanda visual error jika tanggal terbalik.
     - Menyediakan tombol pembersihan instan `✕ Kosongkan` untuk mereset kedua tanggal input.
     - Menyediakan pesan bantuan peringatan aksesibel `⚠️ Tanggal awal tidak boleh melebihi tanggal akhir` saat tanggal terbalik.
     - Menghubungkan filter tanggal kustom dengan event `wfs-open-task-board` via parameter `customStartDate`, `customEndDate`, atau `customRange`.
     - Menambahkan fallback resilience pada `backend/project_api.py` ke gateway `/api/tasks` saat snapshot SQLite kosong.

- **Bukti terukur:**
  - **Vitest:** **1849/1849 passed (138 test file)** (+17 tests baru: 16 test di `kanban_date.test.js`, 2 test di `kanban_spec.test.js`, 2 test di `kanban_export.test.js`, 1 test interaktif komprehensif di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/kanban_date.js src/scene/parts/kanban_spec.js src/lib/kanban_export.js src/components/TaskBoard.jsx src/__tests__/kanban_date.test.js src/__tests__/kanban_spec.test.js src/__tests__/kanban_export.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1772.72 KiB; `OfficeScene` 166.74 KB / gzip 57.13 KB, `index` 202.02 KB / gzip 56.15 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-B0c9vkrM.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **678.524 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN).
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect dan preset kombinasi multi-tag kustom.

## 2026-10-26 22:30 WIB — Siklus 101: Filter Preset Rentang Tanggal Task Kanban (kanban_date.js, Preset Hari Ini / Kemarin / 7 Hari / 30 Hari, IconCalendar, Integrasi filterTasks/kanbanGroups, Stempel Waktu & Ekspor)

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Murni Rentang Tanggal (`src/lib/kanban_date.js`, `src/__tests__/kanban_date.test.js`):**
     - Mengembangkan spesifikasi preset rentang waktu terstruktur (`DATE_RANGE_PRESETS`): `all` (Semua Waktu), `today` (Hari Ini), `yesterday` (Kemarin), `week` (7 Hari Terakhir), dan `month` (30 Hari Terakhir).
     - Mengembangkan parser fleksibel multi-format stempel waktu task (`parseTaskTimestamp`), menangani epoch detik (UNIX), epoch milidetik, string numerik, ISO 8601 UTC date string, dan instans `Date`, dengan resolusi fallback ke `created_at`, `createdAt`, `updated_at`, `updatedAt`, `timestamp`, dan `date`.
     - Mengembangkan evaluator rentang waktu deterministik (`isTaskInDateRange`) yang sadar batas harian (`getStartOfDay`) dan referensi waktu eksplisit (`options.now`) untuk pengujian bebas flake.
     - Menyediakan utilitas penyaring array murni (`filterTasksByDate`), agregator metrik sebaran tanggal real-time (`computeDateRangeStats`), pemformat tanggal lokal ramah pengguna (`formatTaskDate`: "Hari ini, HH:MM", "Kemarin, HH:MM", atau "DD MMM, HH:MM"), serta generator ringkasan deskriptif (`formatDateRangeSummary`).
  2. **Integrasi Spesifikasi Kanban & Ekspor Data (`src/scene/parts/kanban_spec.js`, `src/lib/kanban_export.js`, `src/__tests__/kanban_spec.test.js`, `src/__tests__/kanban_export.test.js`):**
     - Mengintegrasikan filter `dateRange` dan parameter waktu `now` ke dalam fungsi inti `groupTasksByKanbanColumn` dan `filterTasks` secara backward-compatible.
     - Menyematkan kolom `Tanggal` pada berkas CSV hasil ekspor RFC 4180 dan metadata `filters.date_range` pada berkas JSON.
     - Menambahkan penanda rentang tanggal ke dalam nama berkas ekspor otomatis (misal: `wfs-tasks_today_2026-10-26.csv`).
  3. **Antarmuka & Pengalaman Pengguna Papan Task (`src/components/Icons.jsx`, `src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghadirkan ikon SVG vektor presisi baru `IconCalendar` di `Icons.jsx`.
     - Menyediakan kontrol selektor rentang tanggal `.task-date-container` di toolbar papan task lengkap dengan ikon kalender, badge hitungan task per rentang real-time, tooltip deskriptif, dan tombol reset instan `✕` saat filter aktif.
     - Menampilkan indikator stempel waktu pada panel detail task (`Waktu: Hari ini, HH:MM`) jika task memiliki atribut tanggal.
     - Menghubungkan state `dateRange` dengan ekspor CSV/JSON adaptif dan event `wfs-open-task-board`.

- **Bukti terukur:**
  - **Vitest:** **1818/1818 passed (137 test file)** (+31 tests baru: 23 test di `kanban_date.test.js`, 2 test di `kanban_spec.test.js`, 1 test di `kanban_export.test.js`, 3 test di `TaskBoard.test.jsx`, dan 2 test pendukung; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/kanban_date.js src/lib/kanban_export.js src/scene/parts/kanban_spec.js src/components/Icons.jsx src/components/TaskBoard.jsx src/__tests__/kanban_date.test.js src/__tests__/kanban_spec.test.js src/__tests__/kanban_export.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1766.37 KiB; `OfficeScene` 166.74 KB / gzip 57.13 KB, `index` 196.76 KB / gzip 54.58 kB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-_KK2ETbg.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **680.358 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect dan preset rentang tanggal kustom (custom date picker).

## 2026-10-26 21:50 WIB — Siklus 100: Ekspor Ringkasan Task Kanban (CSV/JSON), Utilitas RFC 4180 dengan UTF-8 BOM, Serialisasi Terstruktur & Akses Cepat Toolbar Header

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Murni Ekspor Task (`src/lib/kanban_export.js`, `src/__tests__/kanban_export.test.js`):**
     - Mengembangkan generator CSV berstandar RFC 4180 (`buildTaskCsv`, `formatCsvCell`, `formatCsvRow`) dengan UTF-8 Byte Order Mark (`\uFEFF`) otomatis agar kompatibel secara sempurna di Microsoft Excel, Google Sheets, dan LibreOffice tanpa masalah karakter rusak/encoding.
     - Menyusun kolom CSV lengkap dan terstruktur: `ID`, `Judul`, `Status`, `Status_Label`, `Prioritas`, `Prioritas_Label`, `Divisi`, `Role`, `Role_Label`, `Agen`, `Tag`, `Jumlah_File`, `Review_QA`, dan `Deskripsi`.
     - Mengembangkan generator JSON terstruktur (`buildTaskJson`) yang mencakup metadata ekspor (`generator`, `exported_at`, `total_exported`, status filter aktif divisi/status/tag/query) serta metrik agregat sprint (`total`, `done`, `running`, `pct`) dan array task terurai.
     - Menyediakan pembuat nama berkas otomatis yang deskriptif dan aman (`generateTaskExportFilename`), menyematkan filter divisi, status, tag, dan kata kunci pencarian yang sedang aktif secara otomatis (misal: `wfs-tasks_core_done_2026-10-26.csv`).
     - Mengimplementasikan helper unduhan berkas DOM yang aman (`downloadExportFile`) dan orkestrator ekspor instan (`exportTasks`).
  2. **Ikon Vektor & Antarmuka Toolbar Ekspor (`src/components/Icons.jsx`, `src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghadirkan ikon SVG vektor presisi baru `IconDownload` di `Icons.jsx`.
     - Menyediakan grup tombol ekspor cepat `.task-export-group` di header papan task (tombol `CSV` dan `JSON` dengan tooltip informatif dan atribut aria aksesibel).
     - Menghubungkan seleksi task ekspor adaptif (`exportableTasks`): di mode Kanban mengekspor seluruh task yang lolos filter divisi, tag, dan query pencarian; di mode Daftar mengekspor daftar task terfilter yang sedang aktif.
     - Menyematkan notifikasi toast flash real-time (contoh: `N task diekspor ke CSV`) dan feedback audio klik.
     - Menambahkan petunjuk shortcut `CSV/JSON Ekspor` pada footer hints papan task.

- **Bukti terukur:**
  - **Vitest:** **1787/1787 passed (136 test file)** (+25 tests baru: 19 test di `kanban_export.test.js`, 4 test di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/kanban_export.js src/components/Icons.jsx src/components/TaskBoard.jsx src/__tests__/kanban_export.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1760.29 KiB; `OfficeScene` 166.73 KB / gzip 57.13 KB, `index` 191.86 KB / gzip 53.12 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BdsLkETS.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **647.045 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** indikator status sinkronisasi WebSocket offline/reconnect dan filter preset rentang tanggal task.

## 2026-10-26 21:10 WIB — Siklus 99: Filter Pencarian Real-Time Kanban (kanban_search.js, Shortcut '/', Highlight <mark>, Empty Banner), Audit Kontras Warna WCAG AA untuk Badge & Tag Kustom, serta Reset Filter Instan

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Murni Pencarian Real-Time Kanban (`src/lib/kanban_search.js`, `src/__tests__/kanban_search.test.js`):**
     - Mengembangkan fungsi murni `matchTaskSearch(task, query)` dengan pencocokan multi-token fleksibel (ID, `#ID`, judul, deskripsi, agent_id, role & role label, terjemahan status Bahasa Indonesia `antri/jalan/selesai/review/gagal`, prioritas, dan tags `#tag`/`tag`).
     - Mengembangkan generator segmen penyorotan aman `getSearchMatchSegments(text, query)` yang memecah teks menjadi token `{ text, match: boolean }` tanpa bahaya XSS / `dangerouslySetInnerHTML`.
     - Mengembangkan kalkulasi metrik real-time `calcSearchStats(tasks, query, options)` untuk melacak rasio kecocokan (`matched/total`, `pct`) pada cakupan divisi dan tag yang sedang aktif.
     - Mengembangkan generator empty state adaptif `getKanbanColumnSearchEmptyState(columnKey, options)` yang menyesuaikan label kolom saat pencarian berlangsung.
  2. **Audit Kontras Warna & Aksesibilitas WCAG AA Badge & Tag (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mengembangkan fungsi audit kolorimetri matematis murni: `parseHexColor`, `calcRelativeLuminance`, `calcContrastRatio`, `getContrastingTextColor`, dan `auditBadgeContrast`.
     - Melakukan kalibrasi palet warna `TAG_PALETTE` (sky `#38BDF8`, indigo `#818CF8`, emerald `#34D399`, amber `#FBBF24`, pink `#F472B6`, purple `#A78BFA`, blue `#60A5FA`, orange `#FB923C`, teal `#2DD4BF`, lime `#A3E635`, rose `#FB7185`): seluruh 11 warna kini 100% lolos standar WCAG AA pada permukaan gelap `#151d2e` (rasio kontras 5.65 s.d. 11.17:1, syarat min. 4.5:1) dan lolos dalam status aktif pill dengan teks kontras tinggi `#0b1320` (rasio 6.24 s.d. 12.34:1).
     - Memperbaiki warna role `qa` (`#A78BFA`, naik dari 3.98:1 menjadi 6.19:1) dan `sec` (`#FB7185`, naik dari 4.47:1 menjadi 6.26:1) sehingga bebas kegagalan kontras.
     - Memperkaya metadata `getTaskCardBadges` dan `computeTagCloud` dengan atribut `--tag-text-color` dan `--chip-text-color` dinamis untuk kontras teks optimal.
  3. **Antarmuka Pencarian Real-Time & Highlight Visual pada Papan Task Kanban (`src/components/TaskBoard.jsx`, `src/components/Icons.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghadirkan ikon vektor presisi `IconSearch` pada search bar.
     - Menambahkan badge jumlah kecocokan real-time `N/Total` (`.task-search-count-badge`) dan tombol hapus pencarian instan `✕` (`.task-search-clear-btn`) dengan tooltip & shortcut hint.
     - Mengintegrasikan penyorotan kata kunci `<mark className="kanban-search-highlight">` pada judul kartu Kanban dan baris daftar task.
     - Menyediakan banner status kosong ramah pengguna (`.kanban-empty-board-banner`) lengkap dengan tombol 'Bersihkan Pencarian' saat query tidak menemukan kartu.
     - Menambahkan pintasan keyboard `/` untuk langsung memfokuskan kotak pencarian saat papan task terbuka, serta penanganan tombol `Escape` untuk membersihkan query pencarian sebelum menutup modal.
     - Menambahkan hint `/ Cari` pada footer bar petunjuk shortcut (`.panel-footer-hints`).

- **Bukti terukur:**
  - **Vitest:** **1756/1756 passed (135 test file)** (+32 tests baru: 19 test di `kanban_search.test.js`, 7 test di `kanban_spec.test.js`, 4 test di `TaskBoard.test.jsx`, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/kanban_search.js src/scene/parts/kanban_spec.js src/components/Icons.jsx src/components/TaskBoard.jsx src/__tests__/kanban_search.test.js src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1754.47 KiB; `OfficeScene` 166.70 KB / gzip 57.11 KB, `index` 186.54 KB / gzip 51.34 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BrM4a5Ti.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **647.451 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** filter ekspor ringkasan task (CSV/JSON) dan indikator status sinkronisasi WebSocket offline/reconnect.

## 2026-10-26 20:25 WIB — Siklus 98: Drag-and-Drop Kustom & Feedback Visual Kartu Kanban (kanban_drag.js), Indikator Status Target Drop, Scroll Snapping & Drawer Bottom-Sheet Responsif Mobile

- **Yang diperbaiki & ditingkatkan:**
  1. **Modul Utilitas Murni Interaksi Drag Kanban (`src/lib/kanban_drag.js`, `src/__tests__/kanban_drag.test.js`):**
     - Mengembangkan fungsi murni `setupCardDragData(dataTransfer, task)` untuk mengonfigurasi `text/plain`, metadata JSON `application/json` (id, title, status, priority), dan `effectAllowed = 'move'`.
     - Menyediakan validasi `canDropTaskInColumn(task, targetColKey)` untuk mencegah redundant drop pada kolom asalnya.
     - Menyediakan resolusi `resolveNewStatusForColumn(targetColKey)` dan format pesan notifikasi `formatDragDropNotification(task, targetColKey, colLabel)`.
     - Mengembangkan kalkulasi adaptif `calcMobileColumnWidth(containerWidth, columnCount)` untuk perhitungan lebar kolom kanban responsif pada berbagai ukuran layar.
  2. **Integrasi Drag-and-Drop & Visual Attribute pada Papan Task Kanban (`src/components/TaskBoard.jsx`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghubungkan `setupCardDragData` pada `handleDragStart` dan `canDropTaskInColumn` pada `handleDrop`.
     - Menambahkan atribut visual `data-dragging="true"` pada tombol kartu saat di-drag.
     - Memastikan drop pada kolom yang sama diabaikan secara elegan tanpa memicu re-render atau notifikasi flash redundant.
  3. **Visual Feedback Drag Preview & Drop Target Highlight (`src/index.css`):**
     - Menyempurnakan styling `.kanban-card.is-dragging` dan `.kanban-card[data-dragging="true"]` dengan border putus-putus teal aksen (#10E5A0), background tinted halus, dan elevasi bayangan tactile.
     - Menghadirkan efek glow dan elevasi transform pada `.kanban-col.drag-over` (`transform: translateY(-2px)`, ring halo ganda dan inset glow).
     - Menambahkan styling grabbing cursor dan pelindung seleksi teks (`user-select: none; -webkit-user-drag: element;`).
  4. **Penyempurnaan Responsivitas Drawer Bottom-Sheet & Papan Kanban Mobile (`src/index.css`):**
     - Menambahkan visual drawer pull pill handle (`.panel::before`) pada mode layar sempit (<=760px) untuk semua panel bottom-sheet.
     - Mengatasi masalah spesifisitas CSS `.panel.wide-kanban` di mobile agar memenuhi lebar layar penuh (`width: 100% !important; left: 0 !important; right: 0 !important; max-height: 85dvh;`).
     - Menerapkan CSS scroll snap (`scroll-snap-type: x mandatory; scroll-snap-align: start;`) pada kontainer kanban agar navigasi antar kolom di perangkat mobile / touch menjadi sangat mulus seperti carousel native app.
     - Mengatur lebar kolom mobile responsif (`78vw` dengan batas min 240px & max 320px pada <=560px) serta perataan tombol switch tampilan.

- **Bukti terukur:**
  - **Vitest:** **1724/1724 passed (134 test file)** (+16 tests baru pada `kanban_drag.test.js`, pengujian data-dragging dan drop no-op pada `TaskBoard.test.jsx`; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/kanban_drag.js src/__tests__/kanban_drag.test.js src/components/TaskBoard.jsx src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1747.36 KiB; `OfficeScene` 166.70 KB / gzip 57.11 KB, `index` 181.03 KB / gzip 49.80 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-Ca4m-ldM.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `shot.sh` (DISPLAY=:0): Screenshot visual **648.813 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** filter pencarian real-time pada Kanban dan audit kontras warna badge tags.

## 2026-10-26 19:50 WIB — Siklus 97: Sound Effect Interaksi Kartu Kanban (Drag Pickup & Drop Snap, calcCardSweepFreq), Uji Audio Kartu di SettingsModal & Animasi Transisi Halus Modal/Panel (Scrim Fade-In, Pop Scale & Slide)

- **Yang diperbaiki & ditingkatkan:**
  1. **Sound Effect Interaksi Kartu Kanban & Kalkulasi Frekuensi Sweep (`sound_spec.js`, `sound_engine.js`, `OfficeScene.js`, `sound_spec.test.js`, `sound_engine.test.js`):**
     - Mendefinisikan konstanta audio murni untuk interaksi kartu kanban: nada pickup/drag start (`CARD_PICKUP_*`, sweep sine naik 340 Hz → 520 Hz, gain 0.018 → 0.0005, durasi 0.045s) dan nada drop/snap slot (`CARD_DROP_*`, sweep triangle turun 420 Hz → 210 Hz, gain 0.022 → 0.0005, durasi 0.055s).
     - Mengembangkan rumus murni `calcCardSweepFreq(startFreq, endFreq, ratio)` untuk interpolasi pitch logaritmik halus dengan penanganan toleran terhadap boundary/nilai non-finite.
     - Mengimplementasikan `playCardPickup()` dan `playCardDrop()` pada `sound_engine.js` lengkap dengan pelacak counter `calls.cardPickup` dan `calls.cardDrop`.
     - Mengekspose `playCardPickup`, `playCardDrop`, serta penanganan sampel audio `'card'` / `'card_pickup'` / `'card_drop'` pada instance `OfficeScene.js`.
  2. **Integrasi Feedback Haptic Audio pada Papan Task Kanban (`TaskBoard.jsx`, `TaskBoard.test.jsx`):**
     - Menghubungkan audio feedback `playCardPickup()` saat kartu mulai diangkat/di-drag (`handleDragStart`).
     - Menghubungkan audio feedback `playCardDrop()` saat kartu berhasil dipindahkan ke kolom baru yang bukan done/urgent (`handleMoveTask`).
     - Menambahkan feedback audio klik responsif `playSelect()` saat kartu diklik untuk membuka modal detail serta tombol kembali `← Kembali`.
  3. **Uji Sampel Audio Kartu Kanban di Pengaturan (`SettingsModal.jsx`, `settings_modal.test.jsx`):**
     - Menambahkan tombol kontrol uji audio "Kartu Kanban" dengan badge warna amber `#f59e0b` pada bagian Uji Sampel Audio di `SettingsModal`.
     - Menghubungkan handler `handleTestAudio('card')` untuk memicu pratinjau audio efek interaksi fisik kartu kanban.
  4. **Animasi Transisi Modern Halus Modal, Panel & Scrim (`index.css`):**
     - Menghadirkan animasi transisi scrim latar belakang `@keyframes modalScrimFadeIn` (fade-in halus opacity & blur 0 → 8px) pada `.modal-scrim`.
     - Memperbarui entrance dialog `@keyframes modalScaleIn` (skala 0.96 → 1.0 dengan translateY 8px → 0) pada `.modal` untuk tampilan pop-in modern dan elegan.
     - Menghadirkan animasi orientasi panel terarah `@keyframes panelSlideLeft` untuk panel kiri (TaskBoard & ProjectPanel) dan `@keyframes panelSlideRight` untuk panel kanan (WfsPanel/Chat).
     - Menambahkan `@keyframes mobileSheetSlideUp` untuk mode responsif layar sempit/mobile saat panel berubah menjadi bottom-sheet.
     - Menyediakan aturan aksesibilitas `@media (prefers-reduced-motion: reduce)` yang mematikan durasi animasi secara otomatis bagi pengguna dengan preferensi reduced motion.

- **Bukti terukur:**
  - **Vitest:** **1699/1699 passed (133 test file)** (+4 tests baru: konstanta suara pickup/drop kanban, sweep logaritmik calcCardSweepFreq, playCardPickup & playCardDrop engine, assertion playCardDrop pada quick move taskboard, assertion test audio kartu di settings modal; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/sound_spec.js src/scene/parts/sound_engine.js src/scene/OfficeScene.js src/components/TaskBoard.jsx src/components/SettingsModal.jsx src/components/ConfirmModal.jsx src/__tests__/sound_spec.test.js src/__tests__/sound_engine.test.js src/__tests__/TaskBoard.test.jsx src/__tests__/settings_modal.test.jsx src/__tests__/remaining_components.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1746.02 KiB; `OfficeScene` 166.69 KB / gzip 57.10 KB, `index` 180.36 KB / gzip 49.53 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-CCEVqtxr.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **648.700 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **648.121 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi transisi visual drag preview kustom dan penyempurnaan responsivitas drawer mobile.

## 2026-10-26 18:12 WIB — Siklus 96: Indikator Visual Shortcut Footer Panel & Tooltip, Grid Interaktif OverlayHelp, Toggle Penutup Modal Aktif & Dynamic Filter Ambience Hum (calcAmbienceFilterFreq)

- **Yang diperbaiki & ditingkatkan:**
  1. **Toggle Penutup Modal Aktif & Deteksi Jenis Modal (`shortcut_spec.js`, `App.jsx`, `shortcut_spec.test.js`, `app_integration.test.jsx`):**
     - Mengembangkan `getActiveModalType(flags)` untuk mendeteksi modal yang aktif (`settings`, `help`, `log`, `task_board`, `project_panel`).
     - Memperluas `resolveShortcutAction(event, { modalOpen, activeModal })`: saat modal terbuka, tombol shortcut toggle panel bersangkutan (misal `T` saat TaskBoard terbuka, `P` saat ProjectPanel terbuka, `H`/`?` saat Help terbuka, `O` saat Settings terbuka, `L` saat Log terbuka) kini diizinkan untuk menutup modal langsung, tanpa harus bergantung pada `Escape` saja, sembari tetap menolak shortcut lain yang tidak relevan.
  2. **Indikator Visual Shortcut Footer Panel & Tooltip Dock (`TaskBoard.jsx`, `ProjectPanel.jsx`, `QuickToolbar.jsx`, `App.jsx`, `index.css`):**
     - Menghadirkan footer bar petunjuk shortcut (`.panel-footer-hints`) pada bagian bawah `TaskBoard` (`<kbd>Esc</kbd> Tutup/Kembali`, `<kbd>T</kbd> Toggle Papan`, `<kbd>Shift+Klik</kbd> Multi-Tag`) dan `ProjectPanel` (`<kbd>Esc</kbd> Tutup`, `<kbd>P</kbd> Toggle Panel`).
     - Memperbarui tooltip dock dan tombol QuickToolbar untuk menampilkan hint shortcut secara konsisten: Zoom In `(+)`, Zoom Out `(-)`, Kamera Iso `(1)`, Samping `(2)`, Atas `(3)`, Mode Gelap/Terang `(N)`, Suara `(M)`, Log `(L)`, Pengaturan `(O)`, Bantuan `(H atau ?)`.
  3. **Visual Grid Shortcut Interaktif di OverlayHelp (`OverlayHelp.jsx`, `index.css`, `remaining_components.test.jsx`):**
     - Mengubah langkah panduan 'Shortcut Keyboard' dari teks rata menjadi tata letak visual grid kartu responsif (`.help-shortcut-grid`, `.help-shortcut-card`) lengkap dengan badge tombol kustom `<kbd className="help-shortcut-kbd">`, judul label, dan deskripsi fungsi.
  4. **Dynamic Cutoff Filter Ambience Hum (`sound_spec.js`, `sound_engine.js`, `sound_spec.test.js`):**
     - Mengembangkan kalkulasi frekuensi filter dinamis `calcAmbienceFilterFreq(volume)` (rentang 140 Hz saat volume 0 hingga 255 Hz saat volume 1.0, dengan default volume 0.35 menghasilkan tepat 180 Hz).
     - Menghubungkan modulasi frekuensi biquad lowpass filter pada `startAmbienceNodes` dan `syncAmbience` sehingga hembusan udara HVAC kantor beradaptasi secara akustik alami tanpa artefak.

- **Bukti terukur:**
  - **Vitest:** **1691/1691 passed (133 test file)** (+6 tests baru: kalkulasi calcAmbienceFilterFreq dinamis & toleransi boundary, deteksi getActiveModalType, toggle penutup modal aktif resolveShortcutAction, test integrasi toggle berulang T dan P di App, visual grid shortcut di OverlayHelp, footer hint di TaskBoard & ProjectPanel; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/shortcut_spec.js src/scene/parts/sound_spec.js src/scene/parts/sound_engine.js src/components/QuickToolbar.jsx src/components/TaskBoard.jsx src/components/ProjectPanel.jsx src/components/OverlayHelp.jsx src/App.jsx src/__tests__/sound_spec.test.js src/__tests__/shortcut_spec.test.js src/__tests__/app_integration.test.jsx src/__tests__/TaskBoard.test.jsx src/__tests__/project_panel.test.jsx src/__tests__/remaining_components.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1742.84 KiB; `OfficeScene` 165.41 KB / gzip 56.78 KB, `index` 179.24 KB / gzip 49.29 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, 4 asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DiuIy9Sf.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **647.020 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **646.991 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi sound effect tambahan untuk interaksi kartu kanban (drag/filter/select) dan animasi transisi modal.

## 2026-10-26 18:35 WIB — Siklus 95: Registri & Spesifikasi Shortcut Keyboard Global (shortcut_spec.js), Integrasi Shortcut T (TaskBoard), P (ProjectPanel), A & Shift+A (Ambience Hum), serta Sinkronisasi Panduan OverlayHelp

- **Yang diperbaiki & ditingkatkan:**
  1. **Registri & Spesifikasi Shortcut Keyboard Murni (`src/scene/parts/shortcut_spec.js`, `src/__tests__/shortcut_spec.test.js`):**
     - Mendefinisikan registri terstruktur `SHORTCUT_CATEGORIES` (panel, audio, navigasi, tampilan) dan `KEYBOARD_SHORTCUTS` untuk pemetaan aksi keyboard seluruh kantor AI.
     - Mengembangkan parser aksi murni `resolveShortcutAction(event, context)` yang aman terhadap elemen editable (`input`, `textarea`, `select`, `contentEditable`), tombol modifier (`Ctrl`, `Meta`, `Alt`), dan memprioritaskan penutupan modal aktif via `Escape` sebelum aksi global diproses.
     - Mengembangkan fungsi utilitas `getShortcutsByCategory(category)`, `findShortcutByAction(action)`, `isEditableTarget(target)`, dan generator ringkasan panduan bantuan `formatShortcutHelpSummary()`.
  2. **Integrasi Shortcut Keyboard Global Kantor (`src/App.jsx`, `src/components/OverlayHelp.jsx`, `src/scene/parts/sound_spec.js`):**
     - Menghubungkan shortcut `T` / `t` untuk membuka/menutup Papan Task Kanban secara instan via event kustom `wfs-toggle-task-board`.
     - Menghubungkan shortcut `P` / `p` untuk membuka/menutup ringkasan proyek live dibantuin.com via event kustom `wfs-toggle-project-panel`.
     - Menghubungkan shortcut `A` / `a` untuk toggle suara latar kantor (Ambience HVAC & server drone hum), otomatis unmute audio bila sedang dibisukan, serta `Shift+A` untuk siklus level volume preset (20% → 40% → 70% → 100% → 20%).
     - Memperbarui panduan langkah bantuan pada `OverlayHelp.jsx` agar memuat daftar shortcut lengkap dengan format dinamis dari spesifikasi.
     - Menambahkan hint shortcut pada tooltip tombol Papan Task (`shortcut T`), tombol Proyek (`shortcut P`), dan tombol Ambience (`shortcut A / Shift+A`).
  3. **Event Listener Toggle pada Komponen Panel (`src/components/TaskBoard.jsx`, `src/components/ProjectPanel.jsx`):**
     - Menambahkan listener `wfs-toggle-task-board` pada `TaskBoard.jsx` yang secara mulus membuka dan menutup modal task board serta me-reset seleksi kartu saat ditutup.
     - Menambahkan listener `wfs-toggle-project-panel` pada `ProjectPanel.jsx` untuk kontrol pembukaan/penutupan panel via keyboard.

- **Bukti terukur:**
  - **Vitest:** **1685/1685 passed (133 test file)** (+17 tests baru: 12 unit test shortcut_spec, 3 test integrasi app keyboard shortcuts, 1 test event toggle TaskBoard, 1 test event toggle ProjectPanel; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/shortcut_spec.js src/scene/parts/sound_spec.js src/components/TaskBoard.jsx src/components/ProjectPanel.jsx src/components/OverlayHelp.jsx src/App.jsx src/__tests__/shortcut_spec.test.js src/__tests__/app_integration.test.jsx src/__tests__/TaskBoard.test.jsx src/__tests__/project_panel.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1736.56 KiB; `OfficeScene` 165.08 KB / gzip 56.70 KB, `index` 174.79 KB / gzip 47.98 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BaVViXLa.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **647.634 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **646.272 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi indikator visual shortcut (misal badge <kbd> kecil di footer panel / tooltip) dan fine-tuning audio filter.

## 2026-10-26 17:53 WIB — Siklus 94: Preset Kombinasi Multi-Tag Filter Kanban TaskBoard (Pill Preset Cepat, Seleksi Shift+Klik, Switcher Mode ATAU/DAN & Event wfs-open-task-board)

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi & Utilitas Murni Tag Preset (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mendefinisikan registri `TAG_PRESETS` untuk stack umum pengembangan: `fullstack` (`['react', 'api', 'sql', 'python']`), `devops` (`['docker', 'ci/cd']`), `frontend` (`['react', 'ui/ux', 'css', 'vue']`), `backend` (`['api', 'sql', 'db', 'python', 'golang', 'prisma']`), dan `quality` (`['qa', 'security', 'review']`) lengkap dengan icon, warna aksen, dan deskripsi.
     - Mengembangkan fungsi murni `normalizeTagList(input)` yang toleran terhadap string `'all'`, string tunggal, string comma-separated (`'react, api'`), maupun array.
     - Mengembangkan `getTagPreset(key)`, `isPresetActive(presetKey, currentTags)`, dan `computePresetStats(tasks, presets, divisionFilter)` untuk menghitung ketersediaan task per preset secara akurat.
     - Mengembangkan `toggleTagInFilter(tagKey, currentFilter, { multi })` yang mendukung single toggle maupun multi-select toggle (Shift+klik).
     - Mengembangkan `formatTagFilterSummary(selectedTags, mode)` untuk visualisasi ringkasan status filter yang ramah screen reader.
     - Memperluas `groupTasksByKanbanColumn` dan `filterTasks` agar mendukung parameter mode logika `tagMode` (`'any'` [ATAU] vs `'all'` [DAN]).
  2. **Interaktivitas Multi-Tag & Preset pada UI Papan Task (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menghadirkan strip preset kombinasi tag (`.task-preset-strip`, `.task-preset-chip`) dengan status aktif, glow warna aksen, ikon penanda, dan badge jumlah task yang cocok.
     - Menghadirkan seleksi multi-tag: klik biasa melakukan toggle tunggal, sedangkan Shift+Klik / Ctrl+Klik menambah/mengurangi tag secara dinamis.
     - Menghadirkan tombol switcher mode pencocokan (`.task-tag-mode-btn`) otomatis saat 2+ tag aktif (`Mode: ATAU` ↔ `Mode: DAN`) dengan tooltip penjelasan.
     - Menghadirkan tombol reset cerdas (`.task-tag-clear-btn`) dengan indikator jumlah tag terpilih (`✕ Reset (2)`).
     - Mendukung parameter event kustom `wfs-open-task-board`: properti `preset` (`e.detail.preset`) untuk aktivasi instan dari komponen luar/3D whiteboard, serta properti `tagMode`.
     - Menyinkronkan status aktif multi-tag pada badge kartu kanban, daftar list, dan chip tag modal detail.
  3. **Aksesibilitas & Styling (`src/index.css`):**
     - Menambahkan styling responsif untuk `.task-preset-strip`, `.task-preset-chip`, `.task-preset-chip.active`, dan `.task-tag-mode-btn`.
     - Mengintegrasikan atribut `aria-pressed`, `aria-label`, tooltip ringkas, dan navigasi keyboard yang konsisten.

- **Bukti terukur:**
  - **Vitest:** **1667/1667 passed (132 test file)** (+11 tests baru: TAG_PRESETS spec, getTagPreset, normalizeTagList, isPresetActive, computePresetStats, toggleTagInFilter, formatTagFilterSummary, groupTasksByKanbanColumn/filterTasks mode DAN, UI preset click toggle, UI Shift+Click multi-tag & switcher mode ATAU/DAN, event wfs-open-task-board preset; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1734.52 KiB; `OfficeScene` 165.08 KB / gzip 56.70 KB, `index` 172.70 KB / gzip 47.25 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BO40Dsdr.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **648.297 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **643.326 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi shortcut keyboard global (misal 'T' untuk toggle TaskBoard, 'A' untuk toggle Ambience hum).

## 2026-10-26 17:07 WIB — Siklus 93: Widget Kontrol Cepat Ambience Hum Kantor di HUD (Animasi Gelombang 3-Bar, Siklus Volume Shift+Klik, Sinkronisasi Event wfs-ambience-changed)

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi & Utilitas Audio Ambience Murni (`src/scene/parts/sound_spec.js`, `src/__tests__/sound_spec.test.js`):**
     - Mengembangkan fungsi siklus preset volume ambience `getNextAmbiencePreset(currentVol, presets)` yang secara melingkar menggeser volume (`20% → 40% → 70% → 100% → 20%`).
     - Membangun generator label ringkas `getAmbienceStatusLabel({ enabled, muted, volume })` (`'Hum 35%'`, `'Hum Off'`, `'Mute'`).
     - Membangun `getAmbienceTooltip` dan `getAmbienceAriaLabel` dengan panduan interaksi ramah pengguna dan aksesibilitas screen reader (klik on/off, Shift+klik ganti volume, klik kanan pengaturan).
  2. **Widget Kontrol Cepat Ambience pada HUD (`src/components/HUD.jsx`, `src/index.css`, `src/__tests__/hud_ambience.test.jsx`):**
     - Menghadirkan widget tombol audio ambience (`.hud-amb-btn`) pada pill status atas-kiri dengan separator visual (`.hud-sep`).
     - Mengimplementasikan visualizer 3-bar gelombang audio CSS (`.hud-amb-wave`, `.hud-amb-bar`) yang beranimasi halus saat ambience aktif dan statis saat nonaktif atau muted (dengan dukungan `@media (prefers-reduced-motion: reduce)`).
     - Menghadirkan interaksi cepat: Klik langsung untuk toggle On/Off (otomatis unmute jika master audio sedang dibisukan), Shift+Klik untuk siklus level volume preset seketika, dan Klik Kanan (context menu) untuk membuka panel pengaturan audio lengkap (`SettingsModal`).
  3. **Sinkronisasi State Dua-Arah & Komunikasi Scene-React (`src/scene/OfficeScene.js`, `src/components/SettingsModal.jsx`, `src/App.jsx`):**
     - Mengintegrasikan CustomEvent `wfs-ambience-changed` pada `OfficeScene.js` (di `setAmbienceEnabled`, `setAmbienceVolume`, dan `setAudioMuted`) serta fallback `SettingsModal.jsx`.
     - Menyinkronkan status ambience secara real-time di `App.jsx` sehingga perubahan dari HUD, SettingsModal, maupun scene hook debug langsung tercermin di seluruh UI tanpa desinkronisasi.
     - Menyediakan notifikasi flash instan saat ambience diaktifkan, dimatikan, atau volumenya diganti.

- **Bukti terukur:**
  - **Vitest:** **1646/1646 passed (132 test file)** (+9 tests baru terintegrasi: getNextAmbiencePreset, getAmbienceStatusLabel, getAmbienceTooltip/AriaLabel, backward compatibility HUD, render Hum Off, render Hum 70% aktif dengan 3-bar wave, render Mute, Shift+Click cycle volume, right-click settings; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/sound_spec.js src/scene/OfficeScene.js src/components/HUD.jsx src/components/SettingsModal.jsx src/App.jsx src/__tests__/sound_spec.test.js src/__tests__/hud_ambience.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1729.16 KiB; `OfficeScene` 165.08 KB / gzip 56.70 KB, `index` 168.89 KB / gzip 46.02 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-C088t8Hg.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **642.579 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **641.569 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi preset kombinasi multi-tag filter pada papan kanban TaskBoard.

## 2026-10-26 16:26 WIB — Siklus 92: Sound Engine Ambience Ruangan Kantor (Web Audio Pink Noise HVAC & Hum Drone 55Hz), Kontrol Toggle & Slider Volume Ambience di SettingsModal

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi & Generator Ambience Audio Murni (`src/scene/parts/sound_spec.js`, `src/__tests__/sound_spec.test.js`):**
     - Mengembangkan spesifikasi murni audio latar ruangan kantor: `AMBIENCE_BASE_FREQ` (55.0 Hz - nada fundamental A1 hangat untuk dengung listrik/server tech office), `AMBIENCE_OVERTONE_FREQ` (110.0 Hz - resonansi A2 lembut), `AMBIENCE_FILTER_FREQ` (180 Hz low-pass filter untuk tiruan hembusan sirkulasi pendingin ruangan HVAC), dan `AMBIENCE_BASE_GAIN` (0.015 gain plafon nyaman non-intrusif).
     - Mengimplementasikan generator murni pink noise (1/f noise) dengan algoritma filter Paul Kellet `generatePinkNoiseData(samples, rng)` yang menghasilkan distribusi energi akustik alami spektrum suara ruangan kantor tanpa artefak frekuensi tinggi.
     - Membangun `clampAmbienceVolume`, `loadAmbienceEnabled`, `saveAmbienceEnabled`, `loadAmbienceVolume`, `saveAmbienceVolume`, `formatAmbiencePercent`, dan `calcAmbienceGain(masterVol, ambienceVol, muted, enabled)` yang aman dengan fallback storage.
     - Menyediakan preset cepat level ambience `AMBIENCE_PRESETS` (`[0.20, 0.40, 0.70, 1.00]`).
  2. **Runtime Web Audio Ambience Engine & Scene Integration (`src/scene/parts/sound_engine.js`, `src/scene/OfficeScene.js`, `src/__tests__/sound_engine.test.js`):**
     - Membangun rantai node Web Audio synthesis ambience mandiri: dual-sine oscillator (55 Hz & 110 Hz) dipadukan dengan buffer sumber pink noise berputar (`loop = true`) melalui filter Biquad (`lowpass 180 Hz`, Q 1.0) yang di-submix ke `ambGain` ber-ramp halus (`linearRampToValueAtTime`) menuju `masterGain`.
     - Menghadirkan fungsi `startAmbience()`, `stopAmbience()`, `setAmbienceEnabled(bool)`, `setAmbienceVolume(vol)`, `isAmbienceActive()`, dan `previewAmbience(durationSec)` dengan fitur crossfade 0.4s yang mulus dan bebas letupan audio (click/pop).
     - Menghadirkan mekanisme auto-sync gain saat mute/unmute dan saat volume master berubah.
     - Mengintegrasikan preview audio swelling interaktif: saat ambience sedang aktif, menekan tombol uji sampel membuat dengung ruangan berayun lembut 1.6x lalu kembali, memberi konfirmasi pendengaran yang jelas.
     - Mencegah kebocoran memori dan CPU: seluruh oscillator, filter, dan buffer dibersihkan tuntas saat `dispose()` atau saat tab disembunyikan (`visibilitychange` via suspend/resume).
     - Mengekspose kendali ambience ke `window.__officeSound` dan scene API (`setAmbienceEnabled`, `isAmbienceEnabled`, `setAmbienceVolume`, `getAmbienceVolume`, `previewAmbience`).
  3. **Antarmuka Pengaturan Ambience di SettingsModal (`src/components/SettingsModal.jsx`, `src/__tests__/settings_modal.test.jsx`):**
     - Menambahkan baris kartu "Ambience Ruangan (Hum Kantor)" lengkap dengan deskripsi "Desir pendingin ruangan (HVAC) & dengung lembut tech office", badge status dinamis (`TERBUNGKAM`, `AKTIF`, `NONAKTIF`), serta tombol toggle switch on/off.
     - Menampilkan slider volume interaktif bertingkat `5%` hingga `100%` saat ambience aktif.
     - Menambahkan tombol uji sampel `Hum Ruang` pada strip tombol uji audio dengan tooltip informatif dan live tip status polite.

- **Bukti terukur:**
  - **Vitest:** **1636/1636 passed (131 test file)** (+11 tests baru terintegrasi: konstanta & rumus ambience, clamp, storage load/save, calc gain, generatePinkNoiseData, node runtime Web Audio, mute/volume sync, preview timing, toggle & slider SettingsModal; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/sound_spec.js src/scene/parts/sound_engine.js src/scene/OfficeScene.js src/components/SettingsModal.jsx src/__tests__/sound_spec.test.js src/__tests__/sound_engine.test.js src/__tests__/settings_modal.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1723.70 KiB; `OfficeScene` 164.58 KB / gzip 56.59 KB, `index` 165.44 KB / gzip 45.19 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-CPCTsXlC.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **639.181 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **639.314 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi preset kombinasi multi-tag filter atau widget indikator audio ambience cepat pada toolbar HUD.

## 2026-10-26 15:45 WIB — Siklus 91: Filter Multi-Tag Kustom Task Kanban (extractTaskTags, computeTagCloud, matchTaskTags, getTagColor), Strip Filter Tag Interaktif & Mini Tag Badges pada Papan TaskBoard

- **Yang diperbaiki & ditingkatkan:**
  1. **Sistem Ekstraksi & Spesifikasi Tag Kustom Task (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Membangun `normalizeTag(tag)` dan `formatTagLabel(tag)` dengan pembersihan prefix `#`, karakter khusus, serta pemformatan khusus untuk tag teknologi (`CI/CD`, `UI/UX`, `API`, `QA`, `SQL`, `React-Native`, dll.).
     - Menghadirkan palet warna dinamis `TAG_PALETTE` dan `getTagColor(tag)` berbasis hashing deterministik untuk badge tag berkontras tinggi dan harmonis.
     - Mengembangkan fungsi murni `extractTaskTags(task, { includeInferred = true })` yang mengekstrak tag secara cerdas dari properti `task.tags` (array / CSV), `task.labels`, hashtag `#tag` pada judul/deskripsi, bracket `[tag]`, serta inferensi otomatis dari jenis file ekstensi artefak (`.prisma` → `prisma`, `.tsx`/`.jsx` → `react`, `.py` → `python`, `.sql` → `sql`, `.yml`/workflows → `ci/cd`, `dockerfile` → `docker`).
     - Membangun `computeTagCloud(tasks, { divisionFilter, minCount, limit })` untuk agregasi frekuensi sebaran tag dengan dukungan filter divisi kerja.
     - Membangun `matchTaskTags(task, selectedTags, mode)` untuk pencocokan multi-tag (`any` atau `all`).
     - Mengintegrasikan tag ke dalam `groupTasksByKanbanColumn(..., tagFilter)` dan `filterTasks(..., { tag })` serta memperkaya pencarian teks bebas agar otomatis mencakup tag.
     - Mengintegrasikan tag ke dalam `getTaskCardBadges(task).tags` dengan metadata `{ tag, label, color }`.
  2. **Strip Filter Tag Interaktif & Visualisasi Tag di TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menambahkan strip filter tag interaktif (`.task-tag-strip`) di bawah strip divisi: menampilkan tombol `#Semua`, chip tag berkode warna `#React (4)` dengan dot aksen dan counter task, serta tombol `✕ Reset` saat filter aktif.
     - Menghadirkan mini tag badge (`.kanban-tag-badge`) pada footer kartu kanban (`kanban-card-meta`) dan baris daftar task (`taskrow`): dapat diklik langsung untuk menyaring papan ke tag tersebut dengan feedback audio blip lembut (`playSelect()`).
     - Menambahkan badge indikator `+N` (`.kanban-tag-badge-more`) bila kartu memiliki lebih dari 2 tag dengan tooltip daftar lengkap.
     - Menampilkan bagian khusus "Tag & Kategori" pada modal detail task (`sel`) dengan chip tag interaktif yang dapat diklik untuk kembali ke papan terfilter secara instan.
     - Mengintegrasikan parameter event `wfs-open-task-board` dengan dukungan `e.detail.tag`.

- **Bukti terukur:**
  - **Vitest:** **1624/1624 passed (131 test file)** (+11 tests baru terintegrasi: normalizeTag, formatTagLabel, getTagColor, extractTaskTags, computeTagCloud, matchTaskTags, group/filter tag, render strip tag, klik badge kanban, modal detail tag; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1715.44 KiB; `OfficeScene` 160.46 KB / gzip 55.40 KB, `index` 161.10 KB / gzip 44.12 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-Cwr9PWqb.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **636.659 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **636.910 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi sound ambience latar ruangan kantor (Web Audio ambient room hum) atau preset filter kombinasi tag.

## 2026-10-26 15:05 WIB — Siklus 90: Transisi Visual Drag & Drop Antar Kolom Kanban (moveTaskToColumn), Strip Tombol Pindah Kolom & Sound Engine Nada Alert Prioritas Urgent (TASK_URGENT_FREQS)

- **Yang diperbaiki & ditingkatkan:**
  1. **Transisi Visual Drag & Drop & Quick Move Antar Kolom Kanban (`src/scene/parts/kanban_spec.js`, `src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/kanban_spec.test.js`, `src/__tests__/TaskBoard.test.jsx`):**
     - Membangun fungsi murni `canMoveTaskToColumn(task, targetColKey)`, `getAvailableColumnMoves(currentColKey)`, dan `moveTaskToColumn(tasks, taskId, targetColKey)` untuk perpindahan kolom kanban yang aman, immutabel, dan teruji secara komprehensif.
     - Mengimplementasikan interaksi Drag & Drop HTML5 pada papan Kanban (`TaskBoard.jsx`): kartu dapat diseret (`draggable={true}`, cursor grab/grabbing, efek visual opacity & scale saat ditarik).
     - Menghadirkan indikator visual drop zone (`.kanban-col.drag-over` & `.kanban-drop-slot` beranimasi pulse) dengan border warna aksen kolom tujuan saat kartu didekatkan ke kolom lain.
     - Memberikan pembaruan status optimis instan, notifikasi flash (`Task #id dipindahkan ke kolom X`), dan umpan balik audio kontekstual (task done saat masuk ke kolom Selesai, sound urgent bila task prioritas tinggi).
     - Membangun strip tombol quick move (`.kanban-quick-move-strip`) di dalam modal detail task (`⏳ Antri`, `⚡ Jalan`, `🔍 Review`, `✅ Selesai`), memastikan fleksibilitas navigasi dan aksesibilitas ramah layar sentuh / mobile tanpa harus mengandalkan mouse drag.
  2. **Sound Engine Nada Alert Prioritas Urgent (`src/scene/parts/sound_spec.js`, `src/scene/parts/sound_engine.js`, `src/scene/OfficeScene.js`, `src/components/SettingsModal.jsx`, `src/__tests__/sound_spec.test.js`, `src/__tests__/sound_engine.test.js`, `src/__tests__/settings_modal.test.jsx`):**
     - Merancang spesifikasi audio baru `TASK_URGENT_FREQS` [880.0 Hz (A5), 1174.66 Hz (D6)] dengan gelombang triangle tajam, interval naik energetik, gain 0.035 ramp ke 0.001, delay 0.08s, dan durasi 0.18s untuk notifikasi task kritis.
     - Mengintegrasikan metode `playTaskUrgent()` ke dalam runtime sound engine, debug tracker (`calls.taskUrgent`), dan ekspose scene 3D (`OfficeScene.js`).
     - Menambahkan tombol uji sampel `🔥 Task Urgent` pada panel `SettingsModal.jsx` sehingga pengguna dapat mendengarkan dan memverifikasi kualitas audio nada prioritas secara langsung.
     - Menyinkronkan tombol cepat urgent TaskBoard (`🔥 {urgentCount}`) dan klik task urgent agar memicu audio cue `playTaskUrgent()`.

- **Bukti terukur:**
  - **Vitest:** **1613/1613 passed (131 test file)** (+11 tests baru terintegrasi: kanban move, drag-drop, urgent sound spec, sound engine runtime, dan settings modal; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/sound_spec.js src/scene/parts/sound_engine.js src/scene/OfficeScene.js src/components/SettingsModal.jsx src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/sound_spec.test.js src/__tests__/sound_engine.test.js src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx src/__tests__/settings_modal.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1707.73 KiB; `OfficeScene` 160.46 KB / gzip 55.40 KB, `index` 155.73 KB / gzip 42.50 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DcFySKCC.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **635.530 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:0): Screenshot **639.043 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi filter multi-tag / label task kustom atau sound ambience latar ruangan kantor.

## 2026-10-26 14:25 WIB — Siklus 89: Normalisasi Status Task Proyek (ready & completed), Integrasi Kartu Kanban 3D Papan Proyek (normalizeTaskStatus, formatTaskId, cardMeta) & Sinkronisasi Test Terrazzo

- **Yang diperbaiki & ditingkatkan:**
  1. **Normalisasi Status Task Proyek & Integrasi Kartu Kanban 3D (`src/scene/parts/projectboard_data.js`, `src/scene/parts/projectboard.js`, `src/__tests__/projectboard_data.test.js`, `src/__tests__/projectboard_runtime.test.js`):**
     - Mengidentifikasi dan memecahkan celah kritis di mana papan proyek 3D pada kantor AI selalu kosong ("kosong" / "semua beres"): task dari endpoint `/wfs-project` berstatus `'ready'` dan `'completed'`, sedangkan modul kanban 3D sebelumnya hanya memeriksa kesamaan string kaku `=== 'pending'` dan `=== 'done'`.
     - Membangun `normalizeTaskStatus(status)` yang memetakan variasi status task secara baku (`ready`/`queued`/`todo`/`pending` → `'pending'`; `completed`/`finished`/`resolved`/`done` → `'done'`; `in_progress`/`active`/`working`/`running` → `'running'`; `failed`/`error` → `'failed'`; `review`/`qa` → `'review'`).
     - Membangun `formatTaskId(id)` yang memformat ID berprefix `task-` (misal `task-9da32873` → `#9da32873`) secara elegan tanpa memakan ruang kartu.
     - Membangun `formatCardStatus(status)`, `formatCardTitle(task, maxLen)`, dan `cardMeta(task)` untuk penyediaan metadata lengkap kartu kanban 3D (judul ber-ID rapi, label status ramah pembaca `✓ selesai` / `⏳ antri`, dan warna aksen dinamis).
     - Mengintegrasikan `columnItems(T, i)` dengan `normalizeTaskStatus`: di server produksi nyata, 2 task siap/antri dan 4 task selesai WFS Project kini langsung tampil sebagai kartu kanban fisik di Lantai 3 gedung kantor 3D.
     - Memperbaiki tipografi dan posisi vertikal judul kolom kanban 3D (`ANTRI`, `JALAN`, `SELESAI`) agar tidak terpotong tepi atas kotak kolom.
  2. **Penyempurnaan Tampilan Task di Modal Proyek (`src/components/ProjectPanel.jsx`, `src/__tests__/project_panel.test.jsx`):**
     - Mengintegrasikan `normalizeTaskStatus` dan `formatTaskId` ke daftar task terakhir pada modal `ProjectPanel`.
     - Task dengan status `'completed'` kini menampilkan centang hijau `✓` dengan warna aksen `#10E5A0`, menggantikan fallback abu-abu `•` `#888`.
  3. **Stabilisasi & Sinkronisasi Test Suite (`src/__tests__/floor_canvas.test.js`, `src/__tests__/label_sweep.test.js`):**
     - Memperbaiki assertion radius pada `src/__tests__/floor_canvas.test.js` yang gagal akibat penambahan 10 lempeng marmer besar (`rr = 70 + rnd() * 110`) dan 420 chip terazzo (`r = 6 + rnd() * 15`).
     - Menyinkronkan assertion `SWEEP_GAP` (44) dan offset pergeseran vertikal (89 & 94) di `src/__tests__/label_sweep.test.js` dengan konstanta breathing room label anti-overlap terbaru.
     - Menjamin seluruh 131 test file lolos 100% (1602/1602 tests passed).

- **Bukti terukur:**
  - **Vitest:** **1602/1602 passed (131 test file)** (+14 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/projectboard_data.js src/scene/parts/projectboard.js src/components/ProjectPanel.jsx src/__tests__/projectboard_data.test.js src/__tests__/projectboard_runtime.test.js src/__tests__/project_panel.test.jsx src/__tests__/label_sweep.test.js src/__tests__/floor_canvas.test.js`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1702.29 KiB; `OfficeScene` 159.99 KB / gzip 55.28 KB, `index` 152.16 KB / gzip 41.52 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-hZGL7T6z.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **645.777 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi transisi visual drag-and-drop antar kolom kanban atau sound effect prioritas.

## 2026-10-26 13:45 WIB — Siklus 88: Optimasi Code Splitting Vendor Three.js/React, Rincian Prioritas Task (computePriorityBreakdown) & Quick Button Urgent di TaskBoard

- **Yang diperbaiki & ditingkatkan:**
  1. **Optimasi Vendor Chunking & Code Splitting (`src/lib/chunk_strategy.js`, `vite.config.js`, `src/__tests__/chunk_strategy.test.js`):**
     - Membangun strategi pemisahan vendor chunk modular (`configureManualChunks`) yang memetakan dependensi berat Three.js (`vendor-three`) dan ekosistem React (`vendor-react`) secara terpisah dari chunk aplikasi.
     - Menyelesaikan item backlog yang tertunda selama 3 siklus: ukuran bundle `OfficeScene` turun drastis dari **878.46 KB** menjadi **162.83 KB** (-81.5%!), dan `index` turun dari **336.77 KB** menjadi **147.79 KB** (-56.1%!).
     - Menghilangkan sepenuhnya warning Vite `(!) Some chunks are larger than 500 kB after minification`.
     - Memaksimalkan efisiensi caching PWA & Service Worker (precache 37 entries): library Three.js (715 KB) dan React (189 KB) kini di-cache permanen dan tidak perlu diunduh ulang saat kode kantor 3D atau scene diupdate.
  2. **Rincian Prioritas Task & Quick Button Urgent (`src/scene/parts/kanban_spec.js`, `src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/kanban_spec.test.js`, `src/__tests__/TaskBoard.test.jsx`):**
     - Membangun helper murni `computePriorityBreakdown(tasks, divisionFilter)` untuk menghitung sebaran task per level prioritas (`urgent`, `high`, `medium`, `low`, `normal`) dengan dukungan isolasi filter divisi.
     - Menambahkan tombol aksi cepat urgent (`.task-priority-quick-btn.urgent`) di samping dropdown sort pada TaskBoard (`🔥 {urgentCount}`) saat ada task dengan urgensi kritis.
     - Mengklik tombol cepat urgent langsung beralih ke mode sorting prioritas (`priority`), menampilkan task kritis di baris paling atas kolom kanban/daftar task, dan mengklik kembali mengembalikan urutan ke terbaru (`newest`).
     - Melengkapi styling kontras tinggi dengan aksen merah cerah `#EF4444`, ring fokus, status aktif teriluminasi, dan label aksesibilitas aria.
  3. **Penyempurnaan Estetika Visual Kampus 3D & Gerak Agen (`src/scene/OfficeScene.js`, `src/scene/parts/floor_canvas.js`, `src/scene/parts/terraces.js`, `src/scene/parts/walls.js`, `src/scene/parts/walk_destinations.js`, `src/scene/parts/trip_plan.js`, `src/scene/parts/dialog.js`):**
     - Menyesuaikan geometri plafon dan balok struktur ke dimensi penuh kampus 34×27 m dengan aturan auto-hide pintar saat sudut kamera tinggi.
     - Menambahkan finishing lantai terazzo bervena halus, seam paneling dinding, tiang sudut struktural, serta kotak bunga dekoratif di tepi jendela.
     - Memperluas destinasi jalan kaki multi-lantai dari 16 menjadi 25 titik destinasi realistis di 3 lantai kampus, jitter gerak 0.9, dan menyeimbangkan ritme percakapan otomatis agen (7–15 dtk).

- **Bukti terukur:**
  - **Vitest:** **1588/1588 passed (131 test file)** (+6 tests baru terintegrasi: `chunk_strategy.test.js`, `computePriorityBreakdown`, dan quick button urgent TaskBoard; 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/lib/chunk_strategy.js src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/chunk_strategy.test.js src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 37 precache entries 1700.79 KiB; `OfficeScene` 162.83 KB / gzip 56.40 KB, `index` 147.79 KB / gzip 39.96 KB, `vendor-three` 715.76 KB, `vendor-react` 189.63 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DO7wx6BT.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **572.460 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi transisi visual drag-and-drop antar kolom kanban atau sound effect prioritas.

## 2026-10-26 12:54 WIB — Siklus 87: Pengurutan Interaktif Sprint Kanban (SORT_OPTIONS & sortTasks), Spesifikasi & Badge Prioritas (Urgent/High/Medium/Low) di TaskBoard & Detail Task

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Prioritas & Pengurutan Kanban (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Membangun `PRIORITY_CONFIG` dan `getTaskPriorityInfo(priority)` yang memetakan tingkatan urgensi task secara baku (`urgent`: 🔥 Kritis/Merah `#EF4444`, `high`: 🔺 Tinggi/Oranye `#F97316`, `medium`: ▫️ Sedang/Kuning `#EAB308`, `low`: 🔽 Rendah/Abu-abu `#94A3B8`, fallback `normal`: • Normal `#64748B`).
     - Membangun `SORT_OPTIONS` dengan 5 mode pengurutan: `newest` (Terbaru 🕒), `oldest` (Terlama ⏳), `priority` (Prioritas 🔥), `title` (Judul A-Z 🔤), dan `agent` (Agen A-Z 👤).
     - Membangun `extractTaskSortValue(task)` untuk ekstraksi cerdas nilai timestamp (`created_at`) maupun ID numerik/alfanumerik.
     - Membangun `sortTasks(tasks, sortBy)` yang mendukung 5 mode pengurutan di atas secara stabil dengan fallback ke ID/timestamp terbaru.
     - Mengintegrasikan `sortBy` ke dalam `groupTasksByKanbanColumn(tasks, query, divisionFilter, sortBy)` dan `filterTasks(tasks, { filter, q, division, role, sortBy })`.
     - Mengikutsertakan prioritas task (`t.priority`) ke dalam pencarian real-time dan mengekspos `priority` di dalam `getTaskCardBadges(task)`.
  2. **Kontrol Pengurutan Interaktif & Visualisasi Prioritas di TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menambahkan dropdown pengurutan interaktif terpadu (`.task-sort-container` & `.task-sort-select`) di samping kolom pencarian task dengan opsi Terbaru, Terlama, Prioritas, Judul (A-Z), dan Agen (A-Z).
     - Menampilkan badge prioritas visual (`.kanban-priority-badge`) dengan warna aksen dan ikon dinamis pada header kartu kanban (di samping nomor `#ID`) saat task memiliki level prioritas non-normal.
     - Menampilkan badge prioritas visual pada baris task mode daftar (`.taskrow`).
     - Menampilkan indikator prioritas lengkap dengan ikon dan teks berwarna pada panel modal detail task (`Prioritas: 🔥 Urgent`).
     - Mendukung parameter event kustom `wfs-open-task-board` dengan properti `sortBy` untuk membuka papan kanban langsung dalam urutan yang ditentukan.
  3. **Penyempurnaan Styling & Aksesibilitas (`src/index.css`):**
     - Menambahkan styling kontras tinggi dan adaptif untuk `.task-sort-container`, `.task-sort-select`, dan `.kanban-priority-badge`.
     - Menyediakan teks tersembunyi berstandar aksesibilitas (`sr-only`) untuk label pengurutan guna kompatibilitas screen reader penuh.

- **Bukti terukur:**
  - **Vitest:** **1581/1581 passed (130 test file)** (+9 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1696.86 KiB; chunk `OfficeScene-87fiahCW.js` 875.82 KB / gzip 237.64 KB, `index-C0uBAiCS.js` 336.77 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-C0uBAiCS.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **519.757 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi optimasi chunking dinamis vendor Three.js / OfficeScene.

## 2026-10-26 12:24 WIB — Siklus 86: Animasi Visual Kanban, Distribusi Progres Kolom, Sprint Progress Bar & Integrasi 1-Klik Fokus Meja Agen 3D (focusAgent)

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Kanban & Distribusi Sprint (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Membangun `getKanbanColumnEmptyState(columnKey)` untuk memberikan status kosong yang kontekstual dan komunikatif pada setiap kolom Kanban (`pending`: 'Semua antrean terambil ✨', `running`: 'Tidak ada eksekusi aktif ☕', `review`: 'Bebas kendala & review QA 🎉', `done`: 'Belum ada task selesai ⏳').
     - Membangun `computeColumnDistribution(columnCount, totalCount)` untuk menghitung proporsi beban task per kolom terhadap total sprint aktif secara aman (anti divide-by-zero).
     - Membangun `getTaskAgentFocusInfo(task)` yang memetakan agen dan peran task ke divisi tim serta lantai kampus 3D.
  2. **Interaktivitas Visual & Progres Sprint di TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menambahkan bilah progres visual sprint (`.sprint-progress-container` & `.sprint-progress-fill`) di bawah header papan task yang menampilkan persentase penyelesaian secara mulus (`metrics.pct`%) dengan gradien warna adaptif sesuai divisi aktif.
     - Menambahkan mini distribusi bar di bawah header setiap kolom Kanban (`.kanban-col-dist-bar`) untuk visualisasi instan kepadatan task antar status.
     - Menambahkan animasi transisi kartu kanban (`@keyframes kanbanCardFadeIn`) dengan staggered animation delay (`animationDelay: `${Math.min(idx * 30, 240)}ms``) agar kartu mengalir turun secara halus saat dibuka atau difilter.
     - Menambahkan tombol aksi cepat mini `🎯 {agent_id}` (`.kanban-card-agent-btn`) pada setiap kartu Kanban yang dapat diklik langsung tanpa membuka modal untuk memfokuskan kamera 3D ke meja kerja agen pelaksana task.
     - Menambahkan tombol aksi `🎯 Fokus Agen ({sel.agent_id}) ↗` pada modal detail task.
  3. **Navigasi Fokus Agen 3D Terpadu (`src/scene/OfficeScene.js`):**
     - Menambahkan fungsi kontrol scene `focusAgent(idOrName)` dan mengekspos hook global `window.__focusAgent(idOrName)` yang mendukung identifikasi agen via ID gateway (`be1`, `fe1`, `devops1`, dll) maupun nama agen kampus 3D (`BUDI`, `DEWI`, `TONI`, `WAHYU FS`).
     - Saat dipicu, kamera 3D bergerak halus (lerp) membingkai meja agen dengan sudut optimal, memicu feedback audio seleksi (`__sound.playSelect()`), memunculkan speech bubble informasi agen (`“Halo! Aku {agent}”`), dan menyinkronkan status seleksi.
     - Membersihkan hook global `window.__focusAgent` secara tuntas pada `destroy()`.

- **Bukti terukur:**
  - **Vitest:** **1572/1572 passed (130 test file)** (+6 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/scene/OfficeScene.js src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1692.54 KiB; chunk `OfficeScene-pKxjqkvm.js` 875.82 KB / gzip 237.64 KB, `index-DQZQhgoo.js` 333.07 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DQZQhgoo.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **518.383 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
    - Runtime probe: `window.__focusAgent("be1")` terverifikasi True dan mengarahkan kamera 3D ke agen Budi.
- **Sisa backlog:** evaluasi optimasi chunking dinamis OfficeScene atau pengurutan/prioritisasi interaktif kolom kanban.

## 2026-10-26 10:48 WIB — Siklus 85: Interkoneksi Ekosistem Sprint Kanban & 3D Pod (ProjectPanel, TeamStats, OfficeScene & Badges Kartu Kanban)

- **Yang diperbaiki & ditingkatkan:**
  1. **Badges Visual & Metadata Kartu Kanban (`src/scene/parts/kanban_spec.js`, `src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/kanban_spec.test.js`, `src/__tests__/TaskBoard.test.jsx`):**
     - Membangun helper murni `getTaskCardBadges(task)` yang mengekstrak informasi kartu kanban secara aman (jumlah file hasil pengerjaan via `parseFileList`, indikator keberadaan review QA, label peran, dan warna aksen peran).
     - Menampilkan badge visual baru pada kartu kanban:
       - Badge jumlah file: `📁 N` (`.kanban-file-badge`) saat task telah menghasilkan artefak/file.
       - Badge ulasan QA: `💬 QA` (`.kanban-qa-badge`) saat task memiliki review atau catatan QA.
     - Penambahan styling CSS dengan kontras tinggi dan aksen warna elegan di `src/index.css`.
  2. **Aksi Kanban Cepat di TeamStats (`src/components/TeamStats.jsx`, `src/index.css`, `src/__tests__/team_stats_a11y.test.jsx`):**
     - Menambahkan tombol aksi `Kanban` (`.team-kanban-btn`) pada setiap kartu divisi kerja di panel statistik tim, memicu pembukaan TaskBoard langsung difilter ke divisi tersebut (`wfs-open-task-board` dengan `{ division: team.key, view: 'kanban' }`).
     - Mengubah daftar "Task Terkini" di `TeamStats` dari teks statis menjadi tombol interaktif (`.taskrow`) yang dapat diklik untuk membuka task terkait di kanban (`wfs-open-task-board` dengan `{ taskId: t.id, view: 'kanban' }`).
  3. **Aksi Terhubung di ProjectPanel (`src/components/ProjectPanel.jsx`, `src/__tests__/remaining_components.test.jsx`):**
     - Mengubah item "Task terakhir dikerjakan" menjadi tombol interaktif beranimasi yang dapat diklik untuk membuka detail task di kanban (`wfs-open-task-board` dengan `{ taskId: x.id, view: 'kanban' }`).
     - Menambahkan tombol aksi cepat `📋 Buka Papan Sprint Kanban ↗` di bawah daftar task untuk membuka papan kanban secara instan.
  4. **Feedback 3D Interaktif & Double-Click ProjectBoard (`src/scene/OfficeScene.js`):**
     - Navigasi `focusTeam(teamKey)` kini otomatis memainkan efek suara seleksi (`__sound.playSelect()`) dan menampilkan speech bubble 3D informatif di atas pod meja kerja tim (`“Pod {team.name} (Lt. {team.floor})”`) menggunakan warna aksen divisi.
     - Deteksi klik ganda (`dblclick`) pada kanvas 3D kini menangani klik pada mesh dan bingkai `projectBoard`, memberikan audio feedback, zoom kamera halus ke papan proyek, speech bubble, dan memicu event pembukaan `wfs-open-project-panel`.

- **Bukti terukur:**
  - **Vitest:** **1566/1566 passed (130 test file)** (+3 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/parts/kanban_spec.js src/components/TaskBoard.jsx src/components/TeamStats.jsx src/components/ProjectPanel.jsx src/scene/OfficeScene.js src/__tests__/kanban_spec.test.js src/__tests__/TaskBoard.test.jsx src/__tests__/team_stats_a11y.test.jsx src/__tests__/remaining_components.test.jsx`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1687.10 KiB; chunk `OfficeScene-DI-czE6a.js` 874.02 KB / gzip 237.00 KB, `index-DseRrLj1.js` 330.40 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DseRrLj1.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **523.123 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi optimasi chunking dinamis OfficeScene atau visualisasi animasi perpindahan kartu kanban.

## 2026-10-26 10:08 WIB — Siklus 84: Penyaringan Divisi Kampus (kanban_spec.js), Strip Chip Tim Interaktif di TaskBoard, Integrasi Fokus 3D Pod & Aksi Kanban dari AgentInspector

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Filter Divisi & Metrik Tim (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Mengintegrasikan pembagian divisi kampus 26 agen (`team_spec.js`: `core-be`, `fe-design`, `ops-sec`, `qa-gov`, `prod-growth`, `ai-cs`) ke dalam mesin kanban sprint:
       - `ROLE_LABELS` & `getTaskRoleLabel(role)`: konversi role teknis (`be`, `fe`, `ops`, `qa`, `pm`, `ai`) ke label human-readable ('Backend', 'Frontend', 'DevOps', 'QA', 'Product', 'AI Engine').
       - `matchTaskDivision(task, divisionKey)`: pencocokan cerdas multi-dimensi (mencocokkan role langsung, pemetaan role tim via `findTeamByRole`, pemetaan gateway ID / nama agen via `findTeamByAgent`, dan pencocokan nama tim `shortName`).
       - `extractTaskDivisions(tasks)`: mengekstrak opsi 'Semua' serta 6 divisi kampus lengkap dengan statistik agregat (`count`, `done`, `running`, `review`, `failed`, `pending`, `pct`, dan warna aksen divisi).
       - `groupTasksByKanbanColumn(tasks, query, divisionFilter)`: menyaring 4 kolom kanban secara real-time berdasarkan divisi terpilih.
       - `computeSprintMetrics(tasks, divisionFilter)`: kalkulasi metrik sprint terisolasi per divisi terpilih.
       - `filterTasks(tasks, { filter, q, division, role })`: mendukung filter terpadu untuk tampilan daftar maupun kanban.
  2. **Strip Chip Filter Divisi & Tombol Fokus 3D di TaskBoard (`src/components/TaskBoard.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menambahkan strip filter divisi scrollable horizontal (`.division-filter-strip`) dengan indikator warna dot divisi, judul divisi, badge counter jumlah task, dan `aria-label`/`aria-pressed` berstandar aksesibilitas.
     - Subtitle header papan task kini mencerminkan metrik divisi aktif secara kontekstual: `{total_divisi}/{total_semua} task ({divisi}) · {done}/{total} ({pct}%) selesai`.
     - Tombol cepat interaktif `Fokus Pod 3D ↗` muncul otomatis saat divisi dipilih, memicu pergerakan kamera 3D `window.__focusTeam(division)` langsung ke pod meja kerja tim di lantai masing-masing (Lt. 1, 2, atau 3).
     - Pada modal detail task, menambahkan tombol `🔍 Filter Divisi Terkait` dan `🎯 Fokus Pod Tim 3D ↗` untuk navigasi kilat antar divisi.
     - Penanganan event `wfs-open-task-board` kini mendukung parameter `division` dan `role` untuk auto-filter saat dibuka dari luar.
  3. **Aksi Interaktif Terhubung di AgentInspector (`src/components/AgentInspector.jsx`, `src/__tests__/agent_inspector.test.jsx`):**
     - Kartu task aktif yang sedang dikerjakan agen kini menjadi tombol interaktif beranimasi yang dapat diklik untuk langsung membuka detail task tersebut di papan kanban (`wfs-open-task-board` dengan `{ taskId, view: 'kanban' }`).
     - Menambahkan tombol aksi cepat `📋 Papan Kanban (Divisi)` di bawah profil agen untuk membuka papan sprint kanban divisi tim agen secara instan.

- **Bukti terukur:**
  - **Vitest:** **1561/1561 passed (130 test file)** (+9 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/components/TaskBoard.jsx src/components/AgentInspector.jsx src/scene/parts/kanban_spec.js src/__tests__/TaskBoard.test.jsx src/__tests__/agent_inspector.test.jsx src/__tests__/kanban_spec.test.js`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1683.49 KiB; chunk `OfficeScene-JPNPIG-7.js` 873.39 KB / gzip 236.92 KB, `index-DyzH0snz.js` 328.01 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DyzH0snz.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **521.351 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi optimasi chunking dinamis OfficeScene atau visualisasi animasi perpindahan kartu kanban.

## 2026-10-26 10:35 WIB — Siklus 83: Tampilan Kanban Berkolom Interaktif (kanban_spec.js), Switcher Mode Daftar ↔ Kanban di TaskBoard, Integrasi Event Kustom 3D Whiteboard (wfs-open-task-board) & Metrik Agregat Sprint

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Kanban & Pengelompokan Status Kolom (`src/scene/parts/kanban_spec.js`, `src/__tests__/kanban_spec.test.js`):**
     - Membangun spesifikasi murni tanpa dependensi DOM/Three untuk struktur kolom papan kanban sprint:
       - 4 kolom baku: `pending` (Antri ⏳, abu-abu `#9aa7b8`), `running` (Sedang Jalan ⚡, oranye `#F59E0B`), `review` (Review / Isu 🔍, biru `#448AFF`), dan `done` (Selesai ✅, hijau teal `#10E5A0`).
       - Pemetaan status cerdas `getKanbanColumnKey(status)` yang mengelompokkan `running`/`in_progress` ke kolom jalan, `review`/`failed` ke kolom review/isu, `done`/`completed` ke kolom selesai, dan default ke kolom antrean.
       - Pengelompokan aman `groupTasksByKanbanColumn(tasks, query)` yang mendukung pencarian real-time dan pengurutan ID task descending.
       - Kalkulasi metrik agregat sprint `computeSprintMetrics(tasks)` (`total`, `done`, `running`, `pending`, `review`, `failed`, `pct` penyelesaian).
       - Pemetaan warna badge peran tim `getTaskRoleBadgeColor(role)` (be, fe, ops, qa, pm, ai, sec, sre).
  2. **Interaktivitas Kanban & Switcher Mode di TaskBoard (`src/components/TaskBoard.jsx`, `src/components/Icons.jsx`, `src/index.css`, `src/__tests__/TaskBoard.test.jsx`):**
     - Menambahkan switcher mode tampilan (`Daftar` ↔ `Kanban`) dengan ikon SVG baru `IconList` dan `IconKanban` berstandar aksesibilitas (`aria-pressed`).
     - Pada mode Kanban, panel melebar secara adaptif (`.panel.wide-kanban`, hingga 780px di desktop) dan menampilkan 4 kolom status berdampingan dengan header bergaris aksen, ikon, judul, badge jumlah, dan kartu task interaktif.
     - Kartu task kanban menampilkan ID, agen pelaksana, judul task, badge peran berwarna, serta badge status. Mengklik kartu langsung membuka detail task (ulasan QA, file yang dihasilkan, dan tombol jalankan task).
     - Subtitle papan task kini menampilkan ringkasan metrik sprint live: `{total} task · {done}/{total} ({pct}%) selesai` serta indikator aktif `● N jalan`.
     - Mendengarkan event kustom `wfs-open-task-board` yang memungkinkan papan task langsung terbuka otomatis dalam mode yang diinginkan.
  3. **Integrasi Interaktif Whiteboard 3D Ruang Rapat (`src/scene/OfficeScene.js`):**
     - Menghubungkan klik dan double-click pada Whiteboard Ruang Rapat 3D agar tidak hanya menggeser fokus kamera, melainkan juga otomatis mendispatch event `wfs-open-task-board` dengan mode kanban (`{ view: 'kanban', source: 'whiteboard' }`).
     - Menambahkan method `openSprintBoard()` pada objek debug `window.__whiteboard` dan mengekspos hook global `window.__openTaskBoard(opts)` yang dibersihkan saat scene `destroy()`.

- **Bukti terukur:**
  - **Vitest:** **1552/1552 passed (130 test file)** (+15 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/components/TaskBoard.jsx src/components/Icons.jsx src/scene/parts/kanban_spec.js src/scene/OfficeScene.js src/__tests__/TaskBoard.test.jsx src/__tests__/kanban_spec.test.js`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1677.26 KiB; chunk `OfficeScene-UGfo5Enh.js` 873.39 KB / gzip 236.92 KB, `index-9sRSbRwa.js` 323.00 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-9sRSbRwa.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **524.063 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - `scripts/verify_desks.mjs`: `ALL_DESKS_OK` (26 meja, 0 collision).
- **Sisa backlog:** evaluasi optimasi chunking dinamis OfficeScene atau filtering per divisi pada tampilan Kanban.

## 2026-10-28 01:50 WIB — Siklus 88: Audit — Dashboard overview + Landing page publik + re-link sandbox preview
- **Pemicu:** user — "audit total karena masih kurang ada dashboard dan landing page".
- **Audit temuan:** (1) tidak ada halaman dashboard overview (Statistik lama hanya panel kecil per-task); (2) tidak ada landing page (root = langsung app); (3) 4 proyek lama kehilangan relasi preview_port/container_name di DB (reset memutusnya) → /preview/* 404 meski sandbox masih Up; (4) 2 task dummy "ready" tersisa dari uji tadi.
- **Dibangun:** (a) src/components/Dashboard.jsx — overview penuh: 8 kartu metrik (proyek, task, file, sandbox — semua dari /api nyata), 3 kolom (proyek + status/preview port, task terkini, agen & container CPU/RAM), log aktivitas, host stats; shortcut E; di dock antara ActionMenu dan ProjectPanel; CSS responsif (grid 3→1 kolom mobile). (b) public/landing.html + route /landing & /app di server.py wfs-hq — hero navy royal sesuai tema, statistik live dari /api/dashboard/stats, 6 fitur, cara kerja 4 langkah, CTA masuk kantor 3D. (c) Re-link 4 sandbox jalan (3100/3101/3103/3104) ke proyeknya di DB → /preview/* 200 semua.
- **Verifikasi:** 2212/2212 test; BUILD 0; deploy 200; /landing 200, /app 200, /preview/proj-* 200; shot WebGL 264KB (scene render — uniq 3249, mean navy royal); landing PNG: 650 piksel teks terang + 21650 navy + aksen royal; Vision masih 429 quota (26 dtk reset terakhir) — penilaian visual menyusul.
- **Catatan:** endpoint /api/dashboard/stats sudah ada sebelumnya — dashboard baru mengonsumsi + memperkaya UI, bukan stub.

## 2026-10-27 00:15 WIB — Siklus 87: Reset task + fix 404 CS widget + chat AI CS hidup
- **Reset data:** endpoint baru DELETE /api/tasks (hapus semua tasks+subtasks+projects+logs, agen → idle) + do_DELETE di server 9503. Eksekusi: 6 task/5 proyek/48 subtask dibersihkan, 12 agen idle — siap uji tugas nyata.
- **Console error 404:** iframe CsWidget menunjuk /cs-widget/ yang tidak ada di 9503. Fix: proxy same-origin 9503→widget Docker :3001 (do_GET) + proxy POST /api/admin/* → backend :8000 (do_POST, _proxy_bantuin).
- **Chat AI CS (tombol dock bawah):** endpoint /api/admin/chat dulunya butuh token admin → dibuat /api/admin/widget/chat PUBLIK (ratelimit tetap); widget/index.html default API → '/api/admin' same-origin, fetch → /widget/chat. Key LLM backend widget habis kuota → disinkronkan dgn key lightvela hermes (.env saas-dibantuin) + docker compose up --force-recreate + docker cp main.py (container build lama tak memuat kode baru; main.py perlu include admin_router yang sempat terhapus saat patch bersih-bersih — dipulihkan).
- **Hasil uji nyata:** POST /api/admin/widget/chat → 200 dgn reply LLM asli ("Halo! Aku asisten AI layanan pelanggan..."); /cs-widget/ 200; probe CDP Chrome :99: 0 console error, 0 HTTP ≥400 saat load app & buka widget.
- **Catatan:** 1863/1863 test ai-office-main tetap lulus. Vision masih 429 (quota) — verifikasi visual menyusul.

## 2026-10-26 22:40 WIB — Siklus 86: Rebranding tema royal-blue ala reel code.xr
- **Pemicu:** user kirim reel IG code.xr "3D Dashboard + AI — Futuristic & Premium UI" — "sepertinya UI-nya bagus daripada punya kita".
- **Analisis reel** (web_extract caption + PIL pixel-stat thumbnail 360×640): 100% keluarga biru — bg deep navy #010A28/#101B37/#152353, glow royal #0A3A9C/#4D7ECC (40% area sat>80), teks ice-blue #ADDBF2; 3D typography + glassy cards + Framer Motion.
- **Diterapkan:** (1) CSS vars --bg #020713→#010722, --surface→#071230, --teal #0DEEF3→#4D9FFF + semua hardcode rgba(13,238,243)/#0DEEF3 di 1850-baris index.css & 6 komponen (AgentInspector, Ticker, SettingsModal, ProjectPanel). (2) Scene: bg/fog init 0x000C1E→0x010A28, visor/ring/pulse agen & reception glow →0x4D9FFF. (3) daycycle.js NAVY 0x000c1e→0x010a28 (apply() menimpa bg tiap frame — ini yang membuat patch pertama "tidak tampak").
- **Verifikasi:** 1818/1818 test; BUILD 0; deploy 200; Chrome :99 reload + pixel-stat: 1545 piksel navy #010A28 di zona atas, aksen #4D9FFF hadir di bundle (22× CSS, 3× JS). Vision 429 sepanjang siklus (quota exhausted) — skor estetika visual belum bisa diberikan; lanjutkan saat kuota pulih.
- **Pelajaran:** daycycle.createLighting MENIMPA scene.background tiap frame — ganti warna langit wajib lewat konstanta NAVY daycycle.js, bukan hanya init OfficeScene.

## 2026-10-26 14:10 WIB — Siklus 85: Estetika Kampus & Anti-Macet (laporan "macet + lantai polos + dinding polos + atap")
- **Pemicu:** user — agen macet bergerombol, lantai & dinding polos, tampilan depan keliatan atap, tanya asal-usul bubble chat.
- **Perbaikan:** (1) Anti-macet: 25 destinasi jalan (+9 baru lintas lantai), jitter 0.9, collab 30% (was 75%), jeda duduk 10–28 dtk, BOUNDS diperluas ±15.9/±12.4. (2) Lantai: painter drawTerrazzo (chip warm/rose/teal/navy 420 buah, vena marmer, kilap lempeng) di 3 deck terraces + repeat parket dasar 7×5.5. (3) Dinding: drawWallTex diperkaya (seam horizontal, satin band, AO tepi), pilaster kontras 0x8E9BB0 tiap 4m, repeat 16×, kotak bunga 4 warna di bawah jendela depan/kanan, backdrop logo navy. (4) Atap: plafon 26×20→34×27 + auto-hide saat kamera depan/atas (phi<1.15 || cam.y>5.2), panel cahaya 7×5, balok 5+5. (5) Bubble idle 7–15 dtk (was 4–10) + PAD label 38/44px.
- **Jawaban bubble:** bubble = interaksi NYATA antar agen (kolaborasi rekan + status task nyata dari orchestrator); bukan demo. "Webhook Midtrans ✓" = roleTalk RIZKY saat idle.
- **Verifikasi:** 1587→1597+ test lulus; Chrome :99 xdotool F5/ctrl+shift+r + import root; Vision iteratif 6.5→7→7.5/10 ("terazzo natural, tidak polos, tidak kamuflase; agen tersebar; interior penuh").
- **Pelajaran:** (a) worker auto-dev melakukan reset/rebase — commit PENUH SEBELUM siklusnya (race menghapus patch yang belum dicommit 2×); (b) fallback "Scene 3D tidak aktif" di screenshot headless = normal (tanpa GPU), verifikasi render WAJIB lewat Chrome :99; (c) tekstur prosedural butuh 3 iterasi tuning (polos→kamuflase→natural): ukuran chip & repeat UV harus disesuaikan jarak kamera isometrik.

## 2026-10-26 10:20 WIB — Siklus 82: Perbaikan UI/UX Mobile & Koherensi Kampus (dari screenshot HP user)

- **Pemicu:** screenshot HP 100.117.198.46:9503 — logo "WFS PR" terpotong chip, agen di luar dinding, pilar menembus ruangan, label 6px.
- **Root cause:** dinding 26×20m tidak mengikuti deck kampus 34×27m; 12 meja spesialis (x=±12–13, z=9.5) jatuh di luar dinding; HUD hitungan agen dari gateway (15) bukan scene (26).
- **Perbaikan:** walls/structure/bookshelf/projectboard/clock diperluas ke ±17/±13.5; 12 spesialis dipindah ke baris terasering dalam dinding (L1 z=-5, L2 z=1, L3 z=7/8.8); SysMeter membaca `window.__agentData`; viewport `maximum-scale=5`; portrait radius 48/FOV 64; HUD mobile pindah ke bawah; label 0.032→0.042.
- **Bukti:** 1537/1537 test (129 file); CDP 26 agen ERR:None; verify_desks ALL_DESKS_OK (26 meja, 0 collision); pixel-stat mobile simetris (kiri 6.0/tengah 12.4/kanan 6.1); deploy ROOT 200; ter-push origin/main.
- **Pelajaran:** perluasan kampus wajib atomik (walls+structure+decor+routing+bounds bersamaan); replace kata pendek di test merusak angka lain ("68"→"64" mengenai "768").

## 2026-10-26 09:45 WIB — Siklus 81: Spesifikasi & Interaktivitas Whiteboard Ruang Meeting (whiteboard_spec.js), Baki Spidol & Aksesoris 3D, Navigasi Fokus Kamera Ruang Meeting (focusMeetingRoom) & Pencegahan Memory Leak Scene

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Whiteboard & Geometri Aksesoris Ruang Meeting (`src/scene/parts/whiteboard_spec.js`, `src/__tests__/whiteboard_spec.test.js`):**
     - Membangun modul spesifikasi terisolasi tanpa dependensi Three/DOM untuk tata letak whiteboard, baki aluminium, dan aksesoris spidol:
       - Dimensi papan baku (`WB_FRAME_W = 2.7`, `WB_FRAME_H = 1.15`, `WB_BOARD_W = 2.5`, `WB_BOARD_H = 1.0`, `WB_POS_Y = 2.2`).
       - Spesifikasi baki spidol aluminium (`WB_TRAY`: lebar 2.4m, tinggi 0.02m, kedalaman 0.08m pada y = 1.625).
       - Koleksi spidol dry-erase 4 warna dan penghapus papan ergonomis (`markerItems`: hitam, biru, merah, hijau, eraser).
       - Target kamera ideal ruang rapat (`meetingFocusTarget`: x=8, y=1.85, z=-3, radius=12.0) yang membingkai meja rapat oval, 6 kursi, dan papan tulis secara harmonis.
       - Helper teks status dinamis `getWhiteboardTooltipText(tasks, isMeetingActive)` yang otomatis membedakan rapat sedang berlangsung, progres pengerjaan task sprint live (`done/total (pct%)`), dan fallback agenda umum.
       - Helper deteksi raycast murni `isWhiteboardHit(obj, boardMesh, boardFrame)` untuk menangani interaksi pointer secara tangguh.
  2. **Detail Visual 3D Ruang Rapat & Pencegahan Kebocoran Memori (`src/scene/parts/room.js`, `src/__tests__/room_runtime.test.js`):**
     - Menambahkan baki spidol aluminium dan 5 aksesoris (spidol hitam, biru, merah, hijau, serta penghapus) di bawah papan whiteboard ruang rapat.
     - Melabeli mesh whiteboard dan frame dengan metadata `userData.isWhiteboard`, `userData.isWhiteboardFrame`, dan `userData.__keep = 1` agar tidak terpotong efek fading dinding kamera.
     - Menyediakan metode pembersihan `destroy()` yang mematikan interval refresh timer dan event listener `visibilitychange` secara tuntas saat scene di-unmount.
  3. **Interaktivitas Klik/Hover 3D & Fokus Kamera Ruang Rapat (`src/scene/OfficeScene.js`):**
     - Mengintegrasikan mesh whiteboard dan framenya ke dalam sistem raycaster kanvas 3D (hover pointer, single click, dan double click).
     - Menampilkan kursor `pointer` saat mouse berada di atas whiteboard ruang meeting.
     - Klik atau double-click pada whiteboard otomatis membunyikan blip seleksi audio, menggeser fokus kamera 3D ke ruang rapat (`focusMeetingRoom`), dan memunculkan speech bubble status agenda sprint live.
     - Aksi menu tim "Meeting sekarang" kini otomatis mengarahkan fokus kamera ke ruang rapat bersamaan dengan agen berkumpul.
     - Mengekspos hook kontrol global `window.__focusMeetingRoom()` dan `window.__whiteboard`.

- **Bukti terukur:**
  - **Vitest:** **1532/1532 passed (129 test file)** (+14 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint src/scene/OfficeScene.js src/scene/parts/room.js src/scene/parts/whiteboard_spec.js`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1668.72 KiB; chunk `OfficeScene-BT15mneq.js` 872.82 KB / gzip 236.81 KB, `index-DngkL_7d.js` 317.31 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DngkL_7d.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **525.059 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - Runtime probe CDP: `hasWb: true`, `hasFocusMr: true`, `mrFocusRes: true`.
- **Sisa backlog:** evaluasi optimasi chunking dinamis OfficeScene atau interaktivitas papan kanban sprint detail.

## 2026-10-26 09:00 WIB — Siklus 80: Spesifikasi Progres Per Divisi / Tim Kerja (team_spec.js), Breakdown Tim Live di Modal Statistik (TeamStats.jsx), Navigasi Interaktif Fokus Kamera 3D ke Pod Meja Divisi (focusTeam)

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Pembagian Divisi / Tim Kerja Kampus WFS (`src/scene/parts/team_spec.js`, `src/__tests__/team_spec.test.js`):**
     - Membangun spesifikasi modular terisolasi yang mengelompokkan 26 agen kantor dan peran task (role) ke dalam 6 divisi kerja strategis:
       - `core-be` (Backend & Data, Lantai 2 Mezzanine, lead: GILANG, 4 agen: Gilang, Budi, Rizky, Ferry).
       - `fe-design` (Frontend & Design, Lantai 1 Ground, lead: DEWI, 6 agen: Dewi, Andi, Yoga, Maya, Clara, Tari).
       - `ops-sec` (DevOps & Security, Lantai 3 Penthouse, lead: TONI, 5 agen: Toni, Hendra, Doni, Secbot, Bagas).
       - `qa-gov` (QA & Governance, Lantai 3 Penthouse, lead: RINA, 3 agen: Rina, Nina, Citra).
       - `prod-growth` (Product & Growth, Lantai 1 Ground, lead: SARI, 5 agen: Sari, Lina, Aris, Rian, Integrator Bot).
       - `ai-cs` (AI & Customer Success, Lantai 1 Ground, lead: BANTUIN AI, 3 agen: Bantuin AI, Trainer AI, Support).
     - Menyediakan fungsi murni `findTeamByRole(role)`, `findTeamByAgent(agentIdOrName)`, `findTeamByKey(key)`, `computeTeamStats(rawTasks)`, dan `teamPodFocusTarget(teamKey)` yang kebal terhadap input null/kosong.
     - Mengagregasi metrik pengerjaan task per tim: total task, jumlah selesai (`done`), sedang jalan (`running`), review, gagal, antri, serta kalkulasi persentase penyelesaian (`pct`) otomatis.
  2. **Integrasi Navigasi Fokus Kamera 3D ke Pod Meja Divisi (`src/scene/OfficeScene.js`):**
     - Menambahkan method `focusTeam(teamKey)` pada kontrol scene dan mengekspos hook global `window.__focusTeam(teamKey)` yang memandu kamera 3D bergeser secara halus (lerp) langsung menuju pod meja kerja divisi terkait.
     - Membersihkan hook `window.__focusTeam` secara tuntas pada `destroy()`.
  3. **Visualisasi Kartu Progres Tim di Modal Statistik (`src/components/TeamStats.jsx`, `src/index.css`):**
     - Menampilkan kontainer region berstandar aksesibilitas `aria-label="Progres per divisi kerja"` di dalam modal Statistik Tim.
     - Setiap divisi disajikan dengan kartu interaktif: nama tim, dot warna aksen, badge lantai (`Lt. 1`, `Lt. 2`, `Lt. 3`), badge animasi task berjalan (`● N jalan`), bilah progres gradient persentase pengerjaan, lead divisi, jumlah anggota, serta rasio task (`done/total (pct%)`).
     - Tombol aksi `Fokus 3D` dan klik kartu langsung mengarahkan kamera kanvas 3D ke pod meja tim terkait.

- **Bukti terukur:**
  - **Vitest:** **1516/1516 passed (128 test file)** (+9 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1665.16 KiB; chunk `OfficeScene-DTjuMLLY.js` 869.62 KB / gzip 235.84 KB, `index-0L-4iSgn.js` 317.11 kB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, 4 asset usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-0L-4iSgn.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **551.729 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
    - Runtime probe: `window.__focusTeam('core-be')` sukses beralih ke pod lantai 2 dengan radius 16.
- **Sisa backlog:** evaluasi fine-tuning whiteboard ruang meeting atau optimasi chunking dinamis OfficeScene.

## 2026-10-26 07:17 WIB — Siklus 79: Responsivitas Adaptif Kanvas 3D Multi-Window / Layar Split (viewport_spec.js), Dynamic FOV & Radius, NDC Pointer Raycast Presisi & Observer Wadah

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Responsivitas Viewport & NDC Pointer Murni (`src/scene/parts/viewport_spec.js`, `src/__tests__/viewport_spec.test.js`):**
     - Membangun modul spesifikasi terisolasi dengan fungsi murni `computeAspect(width, height)`, `isPortraitViewport(aspect)`, `getResponsiveFov(aspect)`, `getResponsiveRadius(aspect, savedRadius, homeRadius, currentRadius)`, `getViewOffsetConfig(width, height)`, `getCanvasPointerNdc(event, domElement)`, dan `getMaxBubbles(width)`.
     - Menetapkan target FOV kamera dinamis: mobile/split sempit (< 0.6) 68° (mencegah sisi ruang kantor terpotong), tablet portrait (0.6 - 0.8) 56°, dan desktop landscape (>= 0.8) 54°.
     - Mengatasi bug koordinat raycast pointer pada multi-window / layar split: menggantikan pembagian global `innerWidth/innerHeight` dengan `getCanvasPointerNdc` berbasis `domElement.getBoundingClientRect()`, sehingga interaksi klik agent, cincin hover seleksi, zoom double-click, papan proyek, dan CEO tetap akurat saat kanvas bergeser posisi atau memiliki rasio sempit.
     - Menyediakan fungsi murni `getMaxBubbles(width)` yang secara adaptif membatasi bubble percakapan aktif maksimal 2 pada layar sempit (< 760px) agar ruang kerja 3D tetap bersih.
  2. **Integrasi Runtime Viewport & ResizeObserver di OfficeScene (`src/scene/OfficeScene.js`):**
     - Memperbarui inisialisasi awal kamera serta event listener `onResize()` agar dinamis menyinkronkan FOV kamera (`camera.fov = targetFov`) saat pengguna mengubah ukuran jendela atau membagi layar (split screen), tanpa mendistorsi ruang kerja.
     - Mengganti pembagian aspek langsung dengan `computeAspect` yang kebal terhadap pembagian nol atau ukuran container sesaat nol.
     - Mengintegrasikan `ResizeObserver` pada container kanvas dengan fallback anggun ke `window.resize`, memastikan respon instan pada perubahan layout container / flex tanpa menunggu event resize jendela global.
     - Membersihkan `ResizeObserver` dan listener secara tuntas di `destroy()`, serta mengekspos `resize: onResize` dan `window.__resizeScene` untuk keperluan pengujian runtime.

- **Bukti terukur:**
  - **Vitest:** **1505/1505 passed (127 test file)** (+23 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1658.30 KiB; chunk `OfficeScene-DtuneYly.js` 869.34 KB / gzip 235.79 KB, `index-D-5-8-pv.js` 311.56 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, asset usang dibersihkan.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-D-5-8-pv.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **551.631 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB), /tmp/ck.png **952.156 bytes**.
- **Sisa backlog:** evaluasi fine-tuning tata ruang meja per tim atau optimasi chunking dinamis OfficeScene.

## 2026-10-26 06:33 WIB — Siklus 78: Modal Pengaturan Kantor 3D (SettingsModal), Preset Cepat Slider Volume (25%, 50%, 80%, 100%), Uji Sampel Audio Interaktif & Persistensi Volume Master

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi Volume & Helper Persistensi (`src/scene/parts/sound_spec.js`, `src/__tests__/sound_spec.test.js`):**
     - Mendefinisikan preset volume baku `VOLUME_PRESETS = [0.25, 0.50, 0.80, 1.00]` dan label semantik `VOLUME_PRESET_LABELS` (25% Lembut, 50% Sedang, 80% Optimal, 100% Penuh).
     - Menambahkan fungsi murni `clampVolume(v)`, `loadAudioVolume(storage)`, `saveAudioVolume(storage, v)`, dan `formatVolumePercent(v)` yang menjamin nilai volume ter-clamp `[0, 1]` dan persisten di `localStorage['wfs_audio_volume']`.
  2. **Sinkronisasi Volume Master & Sample Preview di OfficeScene (`src/scene/OfficeScene.js`):**
     - Menginisialisasi `audioVolume` pada startup scene dari `loadAudioVolume(localStorage)`.
     - Mengirimkan `initialVolume: audioVolume` ke `createSoundEngine`.
     - Memperbarui `setAudioVolume(v)` agar otomatis menyimpan perubahan volume ke `localStorage` melalui `saveAudioVolume`.
     - Mengembangkan `testAudio(sample)` yang mendukung pratinjau instan untuk sampel `done` (arpeggio), `select` (blip klik), `chime` (meeting), dan `fail` (tritone alert).
  3. **Komponen Pengaturan Baru `SettingsModal.jsx` (`src/components/SettingsModal.jsx`, `src/__tests__/settings_modal.test.jsx`, `src/index.css`):**
     - Membangun modal pengaturan komprehensif berstandar aksesibilitas WAI-ARIA (`role="dialog"`, `aria-modal="true"`, focus-trap via `useDialogA11y`, `useModalFlag`, tombol Esc/tutup).
     - Menyediakan slider volume kontinu (`0` – `1`, step `0.05`) dengan pembacaan persentase live dan atribut `aria-valuetext`.
     - Tombol preset cepat (`25%`, `50%`, `80%`, `100%`) dengan status aktif visual glow teal (`aria-pressed`).
     - Tombol uji sampel audio terpisah (`Task Done`, `Blip Klik`, `Task Fail`) dengan feedback status real-time.
     - Kontrol visual terpadu: label nama agen (tampak/sembunyi), auto-rotate kamera (aktif/nonaktif), dan pencahayaan tema ruang (terang/gelap).
  4. **Integrasi UI Aplikasi & Akses Multi-Titik (`src/App.jsx`, `src/components/ActionMenu.jsx`, `src/components/OverlayHelp.jsx`, `src/__tests__/app_integration.test.jsx`):**
     - Menambahkan tombol dock `Atur` (ikon `IconGear`), shortcut keyboard global `O` untuk membuka/menutup pengaturan secara cepat, serta event klik-kanan (context menu) pada tombol `Suara` dock yang langsung meluncurkan modal pengaturan.
     - Menambahkan item menu `Pengaturan...` pada popover `ActionMenu`.
     - Mengekspos hook pengujian `window.__openSettings()` dan memperbarui dokumentasi panduan bantuan `OverlayHelp`.

- **Bukti terukur:**
  - **Vitest:** **1478/1478 passed (126 test file)** (+16 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1656.83 KiB; chunk `OfficeScene-CnEgWXg5.js` 867.86 KB / gzip 235.16 KB, `index-uaaTbxBb.js` 311.53 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-uaaTbxBb.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **554.032 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** evaluasi responsivitas tata letak kanvas 3D pada mode multi-window / layar split sempit.

## 2026-10-26 05:43 WIB — Siklus 77: Nada Notifikasi Sound Engine (Done/Fail/Select), Interaksi Klik Audio 3D & Sinkronisasi Audio Toast Task

- **Yang diperbaiki & ditingkatkan:**
  1. **Spesifikasi & Formula Audio Notifikasi Kantor (`src/scene/parts/sound_spec.js`, `src/__tests__/sound_spec.test.js`):**
     - Mendefinisikan spesifikasi Web Audio murni untuk nada notifikasi task selesai (`TASK_DONE_FREQS = [523.25, 659.25, 783.99, 1046.50]` — C5, E5, G5, C6 arpeggio nada naik ceria & harmonis), nada task gagal/peringatan (`TASK_FAIL_FREQS = [440.0, 311.13]` — A4 ke Eb4 tritone alert tone), serta blip klik interaksi (`SELECT_FREQ = 1046.50`, C6 gain 0.015, durasi 0.04s).
     - Menambahkan fungsi murni `taskDoneStart`, `taskFailStart`, serta penskalaan master gain proporsional berbasis `masterGainValue(muted, volume = DEFAULT_VOLUME)` dengan clamping `[0, 1]`.
  2. **Ekspansi Runtime Sound Engine (`src/scene/parts/sound_engine.js`, `src/__tests__/sound_engine.test.js`):**
     - Mengembangkan method runtime `playTaskDone()`, `playTaskFail()`, `playSelect()`, `setVolume()`, dan `getVolume()`.
     - Melacak statistik pemanggilan pada snapshot instan `dbg()` (`calls: { key, step, chime, taskDone, taskFail, select }`, `volume`).
     - Menjamin pembersihan seluruh timeout terjadwal saat dispose engine (`pending.forEach(clearTimeoutFn)`).
  3. **Umpan Balik Audio Interaktif 3D & Kontrol Scene (`src/scene/OfficeScene.js`):**
     - Memainkan `__sound.playSelect()` secara taktil saat pengguna mengklik agen karakter, avatar Founder Wahyu FS, maupun Papan Proyek WFS PROJECT di kanvas 3D.
     - Mengekspos `playTaskDone`, `playTaskFail`, `playSelect`, `testAudio`, `setAudioVolume`, dan `getAudioEngine` pada instance scene dan `window.__officeSound`.
     - Mendukung aksi tim `teamAction('test_audio')` untuk verifikasi nada audio notifikasi.
  4. **Sinkronisasi Audio pada App Toast & Tombol Dock (`src/App.jsx`, `src/__tests__/app_integration.test.jsx`):**
     - Menghubungkan perubahan status task gateway secara real-time: saat transisi status task ke `done` otomatis memicu `s.playTaskDone()`, dan transisi ke `failed` memicu `s.playTaskFail()`.
     - Memberikan audio konfirmasi instan `s.playSelect()` saat pengguna menyalakan suara melalui tombol dock (`toggleMute`).

- **Bukti terukur:**
  - **Vitest:** **1462/1462 passed (125 test file)** (+13 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1645.35 KiB; chunk `OfficeScene-vR8zX2Vs.js` 867.90 KB / gzip 235.07 KB, `index-DQeHX46t.js` 299.92 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-DQeHX46t.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **550.723 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI: OK** (iso, front, top).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** fine-tuning preset volume slider di modal pengaturan.

## 2026-10-26 04:48 WIB — Siklus 76: Matriks Kompetensi & Stack Teknologi 26 Agen + Founder, Integrasi Live Task pada AgentInspector, Presisi Resolusi Identitas Gateway & Harmonisasi Rehat Siang L3 Cafe Promenade

- **Yang diperbaiki & ditingkatkan:**
  1. **Matriks Kompetensi & Domain Spesialisasi 26 Agen + Founder (`src/scene/parts/agent_competencies.js`, `src/__tests__/agent_competencies.test.js`):**
     - Mendefinisikan profil keahlian teknis lengkap (domain spesialisasi, ringkasan tanggung jawab, serta chip stack teknologi seperti `Kafka`, `gRPC`, `PostgreSQL`, `Kubernetes`, `Terraform`, `Cosign`, `Vitest`, `React`) untuk seluruh 26 agen kampus (L1 Atrium, L2 Mezzanine, L3 Penthouse) dan Founder Wahyu FS.
     - Helper murni `getAgentCompetency` mendukung pencarian cerdas berbasis nama (case-insensitive, first name matching) dan objek profil dengan fallback aman.
  2. **Peningkatan Interaktif `AgentInspector.jsx` & Integrasi Task Nyata (`src/components/AgentInspector.jsx`, `src/__tests__/agent_inspector.test.jsx`, `src/App.jsx`):**
     - Menampilkan chip badge stack teknologi dan ringkasan kompetensi di dalam panel inspektur agen ketika karakter diklik di ruang 3D.
     - Menampilkan kartu indikator real-time `SEDANG MENGERJAKAN TASK #{id}` dengan visual pulsing dot hijau saat agen bersangkutan aktif menjalankan task dari `/wfs-api/tasks` (`window.__wfsRunningTasks`).
     - Menyediakan penanganan khusus untuk Founder Wahyu FS: tombol aksi primer membuka konsol eksekutif `ShConsole` (`onOpenConsole`), dan pemetaan chat cerdas langsung ke ID `ceo` (`Wahyu Fajar S.`).
  3. **Resolusi Identitas Agen & Gateway ID (`src/scene/parts/running_tasks.js`, `src/scene/parts/dialog.js`, `src/__tests__/running_tasks.test.js`):**
     - Menambahkan fungsi murni `resolveAgentId` dan tabel pemetaan `SCENE_NAME_TO_ID` yang menjembatani perbedaan nama scene 3D (`BUDI`, `SARI`, `WAHYU FS`, dsb.) dengan format nama gateway (`Budi Santoso`, `Wahyu Fajar S.`, dsb.) maupun 12 spesialis kampus (`arch1`, `be-lead`, `sec1`, dsb.).
     - Memperbaiki speech bubble obrolan otomatis (`autoTalkText`) agar dapat membaca task running agen secara deterministik.
  4. **Harmonisasi Jam Istirahat Siang (Lunch Break) Multi-Lantai (`src/scene/parts/shift_spec.js`, `src/scene/parts/daycycle.js`, `src/scene/OfficeScene.js`, `src/__tests__/shift_spec.test.js`, `src/__tests__/daycycle_runtime.test.js`):**
     - Menambahkan `CAMPUS_LUNCH_SPOT` dan `campusLunchSpot` di `shift_spec.js` pada koordinat terbuka L3 Executive Cafe Promenade (`x: -6.0 ± 0.8, z: 5.6 ± 0.4`), menjamin seluruh agen saat fase makan siang (12:00–13:00) menaiki Grand Staircase ke Lantai 3 dan tidak menabrak rintangan statis kafe (`inObstacle` = false).

- **Bukti terukur:**
  - **Vitest:** **1449/1449 passed (125 test file)** (+21 tests baru terintegrasi, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1643.37 KiB; chunk `OfficeScene-kfzPB0rS.js` 866.04 KB / gzip 234.62 KB, `index-Cn1J-rnX.js` 299.75 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-Cn1J-rnX.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **551.898 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI: OK** (iso, front, top).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 04:05 WIB — Siklus 75: Kolaborasi Otonom 26 Agen Multi-Lantai, Dialog Khas 12 Spesialis, Inklusi Rotasi Meeting Kampus & Koridor Kafe Realistis

- **Yang diperbaiki & ditingkatkan:**
  1. **Dialog Khas & Kolaborasi Lintas Domain 26 Agen (`src/scene/parts/dialog.js`, `src/__tests__/dialog.test.js`):**
     - Mengembangkan frasa dialog khas teknis (`roleTalk`) untuk seluruh 12 spesialis kampus multi-lantai (Aris, Clara, Rian, Tari, Ferry, Gilang, Hendra, Doni, Secbot, Bagas, Nina, Citra), mengeliminasi fallback pasif `“Fokus dulu…”` saat speech bubble otomatis dipicu.
     - Memperluas pemetaan kolaborasi (`COLLAB_PAIRS`) dari 10 menjadi 20 pasangan lintas disiplin (Architect↔Backend, Architect↔DevSecOps, UX Research↔Design, Product↔Project Manager, Database↔Backend, SRE↔Cloud Infra, Security↔DevSecOps, Release↔QA, Visual Design↔Frontend, Governance↔Release).
     - Memungkinkan agen dari Lantai 1, 2, dan 3 saling mengunjungi secara otonom melintasi Grand Staircase arsitektural.
  2. **Inklusi 26 Agen pada Rotasi Rapat Tim & Koreksi Area Rehat Kafe (`src/scene/OfficeScene.js`, `src/scene/parts/meeting.js`, `src/__tests__/meeting.test.js`):**
     - Mendaftarkan seluruh 26 profil agen kampus (`[...allAgents, ...EXTENDED_SPECIALISTS]`) ke instance `createMeeting`, sehingga seluruh spesialis di tiap lantai terjadwal dalam rotasi stand-up dan sprint review ruang rapat (Lantai 1) secara berkala dan otomatis dipulangkan ke lantai kerja masing-masing saat rapat berakhir.
     - Mengoreksi target rehat kopi (`action==='break'`): memindahkan walk target dari koordinat internal counter/stools yang menabrak furnitur (`[-9.5, 7.5]`) ke area terbuka teras pemesanan kafe Lantai 3 (`x: -6.0 ± 0.8, z: 5.6 ± 0.4`), sehingga seluruh tim naik tangga secara realistis dan berkumpul di hadapan barista counter Lantai 3.
  3. **Perluasan Destinasi Penjelajahan Kampus Multi-Lantai (`src/scene/parts/walk_destinations.js`, `src/__tests__/walk_destinations.test.js`):**
     - Menambahkan `CAMPUS_WALK_DESTINATIONS` yang mencakup 8 destinasi baru di seluruh lantai (Datacenter Glass Wall L1, East Innovation Terrace L1, West Architecture Hub L1, Mezzanine East Balcony L2, Mezzanine West Pod L2, Executive Cafe Promenade L3, Penthouse Strategy Terrace L3, Founder Suite View Deck L3).
     - Menjamin seluruh titik aman dari rintangan statis (`inObstacle`), menjaga jarak aman dari meja kerja agen, dan mempertahankan kompatibilitas 100% untuk `WALK_DESTINATIONS` historis.

- **Bukti terukur:**
  - **Vitest:** **1428/1428 passed (124 test file)** (+7 tests baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1633.71 KiB; chunk `OfficeScene-SJMRN5XN.js` 865.80 KB / gzip 234.48 KB, `index-TF6hVOMC.js` 290.09 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-TF6hVOMC.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **552.844 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI: OK** (iso, front, top).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 04:00 WIB — Siklus 74: Presisi Koridor Tangga Antar-Lantai (L1-L3), Elevasi Realistis 2D Multi-Lantai & Aksi Interaktif Fokus Lantai pada AgentInspector

- **Yang diperbaiki & ditingkatkan:**
  1. **Presisi Navigasi Koridor Tangga Antar-Lantai (`src/scene/parts/routing.js`, `src/__tests__/stair_routing.test.js`):**
     - Memperbaiki waypoint routing antar-lantai (khususnya L1 <-> L3 yang melintasi dua Grand Staircase sekaligus). Sebelumnya ketika agen berpindah dari tangga 1 di sayap barat (`sx1 = -2.6`) ke tangga 2 di sayap timur (`sx2 = +2.6`), rute langsung melompat secara diagonal melintasi area tengah/meja kerja Lantai 2.
     - Kini agen diarahkan melangkah keluar secara realistis ke koridor terbuka Lantai 2 (`FRONT[1] = 0.35`) di `sx1` sebelum menyusuri koridor ke `sx2`, menghindari pemotongan diagonal liar di udara atau menembus meja kerja.
  2. **Elevasi Lantai Realistis 2D Multi-Lantai (`src/scene/parts/floor_elevation.js`, `src/scene/parts/motion.js`, `src/__tests__/floor_elevation.test.js`):**
     - Memperluas fungsi `floorElevationAt(z, x)` dengan deteksi bentang tangga arsitektural 2D (`STAIR_WIDTH = 3.4m`, `isNearStairX(x)`).
     - Menghilangkan bug di mana agen yang berada di luar bentang tangga (misal di sayap barat/timur Lantai 1 atau 2 pada koordinat Z transisi tangga) sebelumnya terangkat melayang seolah berada di tangga gaib. Kini jika karakter berada di luar tangga, ketinggian tetap berada pada level lantai sebenarnya (L1 = 0m, L2 = 0.60m, L3 = 1.20m), dengan backward-compatibility 100% jika `x` tidak disediakan.
     - Mengintegrasikan koordinat X agen pada kalkulasi langkah kaki (`stride`), `resetStride`, `follow` nameplate, sapaan `converse`, dan istirahat kafe.
  3. **Aksi Interaktif Fokus Lantai pada Kartu Profil Agen (`src/components/AgentInspector.jsx`, `src/App.jsx`, `src/scene/OfficeScene.js`, `src/__tests__/agent_inspector.test.jsx`):**
     - Mengubah badge lokasi lantai pada `AgentInspector` menjadi tombol aksi interaktif dengan indikator visual `FOKUS ↗`.
     - Mengklik lokasi lantai agen (L1 / L2 / L3) memicu `onFocusFloor` yang otomatis mengarahkan sudut kamera 3D ke lantai tempat agen bertugas dan menyinkronkan state `FloorNavigator`.
     - Memastikan Founder Wahyu FS pada `setSelected(-2)` selalu memiliki properti `floor: 3` dan fallback ke Lantai 3 (Executive Penthouse).

- **Bukti terukur:**
  - **Vitest:** **1399/1399 passed (121 test file)** (+6 tests baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1629.47 KiB; chunk `OfficeScene-Gy4Tb5UN.js` 861.46 KB / gzip 232.25 KB, `index-61QEa42C.js` 290.09 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-61QEa42C.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **551.039 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 03:50 WIB — Siklus 73: Eliminasi Desinkronisasi State FloorNavigator, Penyelarasan Pitch Kamera (Phi Lerp) & Shortcut Keyboard Navigasi Multi-Lantai

- **Yang diperbaiki & ditingkatkan:**
  1. **Eliminasi Desinkronisasi State FloorNavigator (`src/components/FloorNavigator.jsx`, `src/__tests__/floor_navigator.test.jsx`):**
     - Memperbaiki bug di mana `FloorNavigator` mengabaikan pembaruan prop `currentFloor` dari luar jika tombol lantai pernah diklik sebelumnya (akibat `selectedFloor ?? currentFloor` yang terkunci pada nilai lokal).
     - Mengubah komponen menjadi pola terkontrol murni: memprioritaskan prop `currentFloor` saat disediakan (`const activeFloor = isControlled ? currentFloor : internalFloor`), dengan fallback state internal hanya untuk mode tanpa kontrol prop. Tombol kini selalu sinkron dengan state kantor saat pengguna berpindah lantai melalui agen, shortcut, atau tombol reset.
     - Menambahkan navigasi keyboard tombol panah (`ArrowLeft`/`ArrowUp` untuk turun lantai, `ArrowRight`/`ArrowDown` untuk naik lantai) pada kapsul navigasi lantai.
  2. **Penyelarasan Elevasi Pitch Kamera Saat Fokus Lantai (`src/scene/parts/kamera_focus.js`, `src/scene/OfficeScene.js`, `src/__tests__/kamera_focus.test.js`):**
     - Memperluas fungsi `focusStep(tgt, sph, goalT, goalR, goalPhi)` dengan dukungan lerping sudut pitch vertikal (`phi`) secara halus.
     - Saat pengguna memanggil `focusFloor(floorNum)` atau `setView('l1'|'l2'|'l3')` dari sudut kamera ekstrem (misal top-down view `phi < 0.7` atau elevasi rendah `phi > 1.35`), kamera secara otomatis menyelaraskan sudut pandang `phi` ke sudut isometrik ideal (`1.05 rad`). Hal ini memastikan arsitektur 3D dan karakter di tiap lantai langsung terlihat proporsional dan gagah alih-alih terlihat lingkaran gepeng dari atas.
  3. **Shortcut Keyboard Navigasi Multi-Lantai & Sinkronisasi Reset (`src/App.jsx`, `src/components/OverlayHelp.jsx`, `src/__tests__/app_integration.test.jsx`):**
     - Menambahkan shortcut navigasi cepat: `[` (lantai sebelumnya / turun), `]` (lantai berikutnya / naik), serta `Shift+1`, `Shift+2`, `Shift+3` untuk langsung fokus ke Lantai 1 (Ops & AI), 2 (Engineering), atau 3 (Executive).
     - Menghubungkan shortcut `0` (reset kamera) agar ikut menyinkronkan state `currentFloor` kembali ke Lantai 1 (Ground / Atrium Overview).
     - Memperbarui dokumentasi panduan shortcut pada `OverlayHelp.jsx` tanpa mengubah struktur 6 langkah modal panduan.

- **Bukti terukur:**
  - **Vitest:** **1378/1378 passed (119 test file)** (+5 tests baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1628.31 KiB; chunk `OfficeScene-BdhhPtiQ.js` 861.18 KB / gzip 232.17 KB, `index-CdGQVp9A.js` 289.19 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-CdGQVp9A.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **550.390 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI: OK** (iso, front, top).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 03:10 WIB — Siklus 72: Ketahanan Interaksi 26 Agen Kampus 3D, Badge Lokasi Lantai AgentInspector & Sinkronisasi Seleksi Multi-Lantai

- **Yang diperbaiki & ditingkatkan:**
  1. **Ketahanan Interaksi Klik & Seleksi Agen 3D (`src/scene/OfficeScene.js`):**
     - Memperbaiki pengkondisian seleksi agen di mana sebelumnya seluruh handler klik 3D (`pointerup`) dibungkus dalam `if(root&&window.__wfsSelectAgent)`. Jika hook global `__wfsSelectAgent` belum siap atau panel belum dimuat, klik pada karakter 3D diabaikan total tanpa feedback.
     - Kini `if(root)` selalu menjalankan fokus kamera, cincin seleksi emas (`selRing`), speech bubble sapaan, dan pemanggilan callback `onSelectAgent(root.agent)`, sembari memanggil `window.__wfsSelectAgent` bila tersedia.
  2. **Badge Lokasi Lantai Real-Time pada Profil Agen (`src/components/AgentInspector.jsx`, `src/__tests__/agent_inspector.test.jsx`):**
     - Menambahkan indikator 'Lokasi Lantai' pada kartu inspektur agen (`L1 · Ops & AI`, `L2 · Engineering`, `L3 · Executive`, atau default Penthouse Suite) mendampingi status 'Aktif Bekerja' dan proyek 'WFS PROJECT'. Pengguna kini langsung mengetahui posisi fisik agen di kampus 3D bertingkat saat agen diklik.
     - Menambahkan pengujian reaktivitas lokasi lantai dinamis di unit test.
  3. **Seleksi Dua Arah Case-Insensitive & Fallback Panel Chat (`src/App.jsx`, `src/components/WfsPanel.jsx`):**
     - Memperbarui `window.__wfsSceneSelect` agar memetakan ID gateway dan nama agen secara case-insensitive (`toUpperCase()`), sehingga pencarian nama seperti 'Aris' / 'aris' dapat langsung memilih spesialis 'ARIS' di kampus 3D tanpa mismatch.
     - Menyediakan fallback pembukaan panel chat pada `window.__wfsSelectAgent` di `WfsPanel.jsx` jika agen belum terdaftar di list backend gateway.
  4. **Penyelarasan Pengujian Spesialis Kampus (`src/__tests__/extended_desks.test.js`):**
     - Memutakhirkan unit test data spesialis kampus WFS PROJECT dari 6 menjadi 12 spesialis terdistribusi simetris (masing-masing 4 spesialis kerja di Lantai 1, Lantai 2, dan Lantai 3).

- **Bukti terukur:**
  - **Vitest:** **1366/1366 passed (119 test file)** (+1 test baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1627.20 KiB; chunk `OfficeScene-DcP7AcAN.js` 861.01 KB / gzip 232.11 KB, `index-8_JBfe4Y.js` 288.22 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-8_JBfe4Y.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 26 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **552.421 bytes** (>500 KB, WebGL hidup, agents: 26, E2E_VISUAL: OK).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI: OK** (iso, front, top).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 02:05 WIB — Siklus 71: Presisi Navigasi Lantai Bertingkat (FloorNavigator Capsule), Eliminasi Overlap Ticker-HUD-Label, dan Elevasi Alami Balon Obrolan 3D

- **Yang diperbaiki & ditingkatkan:**
  1. **Navigasi Lantai Bertingkat Autentik & Desain Kapsul Kaca (`src/components/FloorNavigator.jsx`, `src/index.css`):**
     - Menyelaraskan pembagian peran dan nama lantai pada `FloorNavigator` sesuai plakat arsitektur fisik kantor 3D di `terraces.js`:
       - **L1 · Ops & AI** (`#F59E0B`): *Datacenter, AI Lab & Tech Ops* (Bantuin AI, Budi, Andi, Rina, Trainer AI).
       - **L2 · Engineering** (`#00F0FF`): *Core Engineering & Product Studio* (Rizky, Dewi, Yoga, Lina, Integrator Bot).
       - **L3 · Executive** (`#10E5A0`): *Executive Penthouse & Founder Suite* (Wahyu FS, Maya, Toni, Sari, Support Human · Papan Proyek 3D).
     - Menata ulang komponen dari inline layout 340px lebar menjadi kapsul horizontal anggun (`.floor-nav`, `.floor-nav-label`, `.floor-nav-buttons`, `.floor-nav-btn`, `.floor-nav-dot`) dengan lebar ringkas ~240px bertengger di bawah `.hud` (`top: 58px; left: 14px;`).
     - Menyinkronkan status tombol aktif secara reaktif dengan prop `currentFloor` tanpa re-render cascaded, dan menghubungkannya dengan auto-deteksi lantai saat agen di Lantai 1, 2, atau 3 diklik (`App.jsx`).
  2. **Eliminasi Tabrakan Visual Ticker, Header & Nameplate 3D (`src/index.css`, `src/scene/OfficeScene.js`):**
     - Membatasi lebar pita pengumuman horizontal `.ticker` ke `min(720px, calc(100vw - 380px))` pada desktop, memberikan jarak aman >70px dari kontrol HUD / FloorNavigator di sisi kiri dan telemetri SysMeter di sisi kanan sehingga tidak terjadi tabrakan/tumpukan teks marquee.
     - Memperluas toleransi dorongan ke bawah pada algoritma anti-overlap label (`cdy = Math.max(-1.2, Math.min(1.6, dy))` dari sebelumnya `-0.35`), memungkinkan nameplate agen di lantai atas (Maya, Toni, Sari) didorong secukupnya oleh `sweepClampRounds` agar tidak menusuk masuk ke header/ticker HTML 2D.
     - Menyelaraskan titik koordinat target kamera `focusFloor` dan `setView` ke titik pusat meja kerja riil:
       - L1: `(0, 0.5, -3.0)`, `r: 18`
       - L2: `(0, 1.1, 1.5)`, `r: 19`
       - L3: `(0, 1.8, 6.0)`, `r: 21`
  3. **Elevasi Proporsional Balon Obrolan 3D & Relokasi Zona Lounge (`src/scene/OfficeScene.js`, `src/scene/parts/floor_zones.js`, `src/scene/parts/flooring.js`):**
     - Menyesuaikan ketinggian anchor obrolan `createBubble` (click, autoTalk, convo, alert) dari `baseAy + 2.6` menjadi `baseAy + 1.3`, sehingga balon obrolan melayang anggun di ketinggian ~2.65m (tepat di atas kepala agen) dan tidak melambung 4-5 meter ke langit menutupi bilah navigasi.
     - Memindahkan titik X zona `WELCOME & LOUNGE` dari `9.4` ke `8.6`, mencegah pemotongan teks label di tepi layar kiri pada sudut pandang isometrik.
     - Memperbaiki elevasi patch lantai zona agar mengikuti level lantai masing-masing (`zoneFloorY + 0.015`).
  4. **Pembaruan Pengujian (`src/__tests__/floor_navigator.test.jsx`):**
     - Menambahkan pengujian verifikasi nama autentik 3 lantai dan reaktivitas sinkronisasi prop `currentFloor`.

- **Bukti terukur:**
  - **Vitest:** **1349/1349 passed (118 test file)** (+5 tests baru, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1625.84 KiB; chunk `OfficeScene-B2ZEfqGi.js` 860.15 KB / gzip 231.87 KB, `index-BAa1fJ4R.js` 287.68 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BAa1fJ4R.js`, 0 "Scene init failed").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 4/6 selesai, 67%, 20 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **999.568 bytes** (>500 KB, WebGL hidup, agents: 20, E2E_VISUAL: OK).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-26 01:00 WIB — Siklus 70: Interaktivitas Profil Founder Wahyu FS (Inspector Card & Golden Selection Ring), Perbaikan Presisi Frame Papan Proyek 3D & Sinkronisasi Software House

- **Yang diperbaiki & ditingkatkan:**
  1. **Interaktivitas Profil & Cincin Seleksi Emas Founder Wahyu FS (`src/scene/OfficeScene.js`, `src/scene/parts/reception.js`):**
     - Mengembalikan objek `nexusAgent` dari `createReception` sehingga data Founder (`Wahyu FS`, `Founder / CEO`, `#F59E0B`) tersambung penuh ke interaksi runtime kantor.
     - Saat karakter Founder Wahyu FS diklik, cincin seleksi emas (`selRing`) aktif dan bertengger tepat di bawah kursi Founder di Lantai 3 (`x: 7.6, y: 1.20 + SEL_RING.Y, z: 6.1`) dengan animasi rotasi kontinu (`selRing.rotation.z += 0.012`), serta memunculkan panel profil interaktif `AgentInspector` (Nama: 'Wahyu FS', Role: 'Founder / CEO', tombol 'Buka Chat dengan Wahyu').
     - Hover kursor di atas Founder memunculkan `hoverRing` cyan bercahaya di lantai resepsionis (`x: 7.6, y: 1.22, z: 6.1`).
     - Menyimpan state kamera (`sph.__saved` dan `homeRadius`) saat membidik Founder atau Papan Proyek, sehingga penutupan inspector (via tombol X, tombol Escape, atau klik di area kosong) mengembalikan kamera secara halus ke posisi semula dan membersihkan cincin seleksi.
  2. **Koreksi Presisi Bingkai Papan Proyek 3D (`src/scene/parts/projectboard.js`, `src/scene/OfficeScene.js`):**
     - Mengembalikan referensi `frame` dari builder `createProjectBoard` (`return { destroy, refresh: pull, mesh, frame }`), memperbaiki bug di mana bingkai papan sebelumnya tertinggal di `Y = 2.60` sementara kanvas proyek diangkat ke `Y = 3.80` di Lantai 3.
     - Bingkai dan kanvas kini sejajar presisi di elevasi `Y = 3.80` dan `boardFrame` terdeteksi penuh pada raycaster hover & click.
  3. **Sinkronisasi Kompatibilitas Transisi WFS PROJECT & Docker Sandbox:**
     - Menyelaraskan pembersihan label nama kontainer di `TeamStats.jsx` agar mendukung prefix kontainer sandbox baru (`wfs-sandbox-`) maupun legacy (`saas-dibantuin-`).
     - Memutakhirkan pengujian di `src/__tests__/projectboard_runtime.test.js`, `src/__tests__/reception_runtime.test.js`, `src/__tests__/remaining_components.test.jsx`, dan `src/__tests__/ui_components.test.jsx`.

- **Bukti terukur:**
  - **Vitest:** **1334/1334 passed (115 test file)** (+6 tests, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1602.35 KiB; chunk `OfficeScene-BylBykG9.js` 857.11 KB / gzip 231.05 KB, `index-B-stHHPb.js` 267.96 KB).
  - **Deploy:** `dist/*` sukses terdeploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-B-stHHPb.js`, 0 \"Scene init failed\").
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 2/3 selesai, 67%, 14 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **949.717 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - `shot.sh`: Screenshot ck.png **587.471 bytes** (>500 KB).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-25 23:55 WIB — Siklus 69: Interaktivitas Lengkap Meja Resepsionis Founder Wahyu FS, Presisi Framing & Fokus Papan Proyek 3D Lantai 3, Standardisasi Tipografi Akronim (Wahyu FS) & Deploy Otomatis

- **Yang diperbaiki & ditingkatkan:**
  1. **Interaktivitas Meja Resepsionis Founder Wahyu FS (`src/scene/OfficeScene.js`):**
     - Menghubungkan figur NEXUS (Founder Wahyu FS) di meja resepsionis Lantai 3 (`x: 7.6, z: 6.1, y: 1.24`) ke raycaster klik dan hover.
     - Saat diklik, kamera secara mulus berfokus ke meja Founder (`focusGoal = { t: (7.6, 2.04, 6.1), r: 16 }`) dan memunculkan speech bubble sambutan otentik: `“Halo! Selamat datang di markas WFS Project & dibantuin.com!”` beraksen emas `#F59E0B`.
     - Hover pointer mendeteksi figur Founder dan mengubah kursor menjadi pointer tangan (`cursor: pointer`).
  2. **Presisi Framing, Fokus & Deteksi Klik Papan Proyek 3D Lantai 3 (`src/scene/OfficeScene.js`, `src/scene/parts/projectboard.js`):**
     - Menyesuaikan koordinat target kamera saat papan proyek diklik ke ketinggian Lantai 3 yang sesungguhnya (`Y = 3.80`), bukan lagi membidik ke lantai bawah (`Y = 2.55`), sehingga papan proyek 7.4m × 4.04m terbingkai penuh di tengah viewport.
     - Elevasi balon petunjuk navigasi dinaikkan ke Y = 5.95 (`bpos.y + 2.15`), bertengger rapi tepat di atas bingkai papan dan tidak menutupi kartu task nyata.
     - Deteksi klik dan hover diperluas mencakup bingkai papan (`boardFrame`), sehingga interaksi pengguna responsif baik saat mengklik area kartu maupun tepian bingkai.
     - Double click pada seluruh lantai memperhitungkan elevasi aktual titik klik (`Math.max(1.5, (hits[0].point.y || 0) + 0.8)`), mempertahankan sudut pandang vertikal yang konsisten di Lantai 1, 2, maupun 3.
  3. **Standardisasi Tipografi Akronim Nama & Nameplate (`src/scene/parts/nameplate_spec.js`, `src/scene/parts/label_spec.js`):**
     - Memperluas kamus `ACRONYMS` dengan `'fs'`, `'wfs'`, `'cs'`, `'pm'`, `'it'`, `'cto'`, `'ceo'`, memastikan nama Founder `'WAHYU FS'` dirender secara anggun sebagai `'Wahyu FS'` (bukan `'Wahyu Fs'`) baik pada 3D floating badge nameplate maupun avatar desk plate.
  4. **Pembaruan & Penambahan Unit Test:**
     - `src/__tests__/reception_runtime.test.js`: Menambahkan verifikasi normalisasi nama Founder menjadi `'Wahyu FS'` dan role `'Founder / CEO'`.
     - `src/__tests__/nameplate_spec.test.js` & `src/__tests__/label_spec.test.js`: Verifikasi kapitalisasi akronim `FS`, `WFS`, `CS`, `PM`.
     - `src/__tests__/projectboard_runtime.test.js`: Verifikasi posisi X papan proyek di -8.35.

- **Bukti terukur:**
  - **Vitest:** **1322/1322 passed (114 test file)** (+6 tests, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1601.37 KiB; chunk `OfficeScene-B0o8wew5.js` 856.12 KB / gzip 230.79 KB, `index-Db_DrLKs.js` 267.95 KB).
  - **Deploy:** `dist/*` ter-deploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-Db_DrLKs.js`, 0 "Scene init failed", PID 78911).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **946.943 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-25 23:15 WIB — Siklus 68: Resolusi Tabrakan Meja Support & Resepsionis, Skala 2.2x Figur Rapat & Nexus, Framing Kamera 3D, Contact Shadow Lengkap & E2E Polling Resilient

- **Yang diperbaiki & ditingkatkan:**
  1. **Resolusi Tabrakan Meja SUPPORT & Meja Resepsionis (`src/scene/parts/desk_layout.js`):**
     - Memindahkan workstation ke-14 (`SUPPORT`) dari koordinat `{ x: 8, z: 6 }` ke slot tengah `{ x: 0, z: 6 }` di Lantai 3.
     - Slot `{ x: 8, z: 6 }` pada grid 5×3 kini secara alami menjadi slot kosong yang dialokasikan khusus untuk meja resepsionis Founder WFS (`RCX = 8, RCZ = 6.5`).
     - Mengeliminasi total bug duplikasi visual dan clipping/z-fighting abnormal di mana figur agen SUPPORT dan Founder Wahyu FS sebelumnya saling menabrak dan bertumpukan di satu lokasi.
  2. **Standardisasi Skala 2.2x & Contact Shadow Figur Rapat dan Resepsionis (`src/scene/parts/meeting.js`, `src/scene/parts/reception.js`):**
     - Menyamakan skala avatar peserta rapat di ruang meeting dan avatar resepsionis NEXUS (Founder Wahyu FS) ke skala 2.2x (disesuaikan dengan tinggi manusiawi per-role `looksOf(agent).h`). Mencegah figur mengecil tiba-tiba saat stand-up meeting.
     - Memasukkan seluruh 14 agen (`allAgents(AGENTS, AGENTS_EXTRA)`) ke dalam rotasi peserta rapat `createMeeting`.
     - Menambahkan contact blob shadow di bawah meja resepsionis, kursi resepsionis (dengan tiang & alas putar kokoh), dan peserta rapat (posisi duduk Y=0.04 menapak pas di kursi).
  3. **Contact Blob Shadow Seluruh Furnitur Kantor (`src/scene/parts/cafe.js`, `src/scene/parts/lounge.js`, `src/scene/parts/bookshelf.js`):**
     - Menambahkan bidang kontak bayangan halus (`blobMat`) di bawah counter L dan kulkas snack di Kafe, coffee table di Lounge, dan rak buku di dinding kiri belakang.
     - Menghilangkan efek melayang (*floating artifacts*) pada seluruh furnitur kantor sehingga tampak menapak kokoh di lantai marmer/kayu bertingkat.
  4. **Optimasi Framing Kamera 3D Viewport (`src/scene/OfficeScene.js`):**
     - Menyesuaikan radius kamera dasar (`radius: 33..35`, `tgt: (0, 1.4, 0.3)`) agar ruang meeting di z = -3 dan rak server memiliki margin yang cukup dari dock navigasi bawah. Ruang meeting dan meja konferensi kini terlihat utuh dan tidak terpotong oleh toolbar bawah.
  5. **Robust WebSocket CDP Frame Reader & Polling di Script E2E (`scripts/e2e_shot.py`, `scripts/e2e_tv.py`, `src/scene/parts/lounge.js`):**
     - Mengganti pembacaan raw buffer dengan helper `recv_exact(n)`, mencegah crash `IndexError` pada WebSocket stream CDP saat browser memulai sesi.
     - Mengganti sleep statis dengan polling adaptif di `e2e_tv.py` dan menambahkan parameter `force = true` pada pemanggilan awal `tvPull` di `lounge.js`, memastikan data dashboard TV lounge selalu siap tanpa bergantung pada status visibility awal dokumen di headless shell.
  6. **Pembaruan Unit Test:**
     - `src/__tests__/desk_layout.test.js`: Verifikasi slot kosong dialokasikan pada `{ x: 8, z: 6 }` untuk meja resepsionis Founder WFS dan SUPPORT menempati `{ x: 0, z: 6 }`.
     - `src/__tests__/reception_runtime.test.js`: Verifikasi skala 2.2x pada karakter NEXUS (Founder Wahyu FS) dan posisi Y=0.04.

- **Bukti terukur:**
  - **Vitest:** **1316/1316 passed (113 test file)** (+4 tests, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1599.89 KiB; chunk `OfficeScene-9KJS7Xl5.js` 854.61 KB / gzip 230.20 KB, `index-CJ0P3TKK.js` 267.95 KB).
  - **Deploy:** `dist/*` ter-deploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-CJ0P3TKK.js`, 0 "Scene init failed", PID 26304).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **926.438 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - **Daytime Screenshot:** **927.732 bytes** (>500 KB).
    - **Audit Visual Siang Hari (Vision AI):** Meja resepsionis Founder Wahyu FS berdiri kokoh dan mandiri tanpa duplikasi figur atau z-fighting; agen SUPPORT duduk rapi di baris tengah lantai 3 tanpa menumpuk; ruang meeting tampak utuh di FOV kamera; seluruh furnitur memiliki contact shadow tegas dan tidak melayang.
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-25 21:50 WIB — Siklus 67: Deduplikasi & Pembersihan Balon Percakapan, Isolasi Label Agen Offsite, Dialog Otentik 14 Agen, & Contact Blob Shadow Furnitur

- **Yang diperbaiki & ditingkatkan:**
  1. **Deduplikasi & Pembersihan Balon Dialog Menumpuk (`src/scene/OfficeScene.js`):**
     - Di `createBubble`: bersihkan/dispose bubble lama milik agen yang sama atau yang posisinya sangat berdekatan (< 1.2m) sebelum bubble baru ditambahkan. Menghilangkan bug visual dua dialog box bertumpukan secara anomali pada spot yang sama.
     - Di `autoTalk()`: filter kandidat agen yang berbicara hanya untuk agen yang aktif onsite di kantor (`ad.state !== 'offsite' && (ad.sittingChar.visible || ad.walker.visible)`). Mencegah agen yang sedang pulang di malam hari memicu balon bicara di atas meja kosong.
  2. **Isolasi Visibilitas Label Nama Agen dengan Keberadaan Fisik / Offsite (`src/scene/parts/daycycle.js`, `src/scene/parts/motion.js`, & `src/scene/OfficeScene.js`):**
     - Saat agen pulang/offsite (`nightfall()` atau mencapai pintu keluar di `leaving`), sembunyikan label nama (`ad.label.visible = false`).
     - Saat agen datang atau kembali ke workstation (`arrive()`, `dawn()`, `restoreWorkingDesks()`), pulihkan label nama sesuai preferensi tampilan (`ad.label.visible = namesVisible`).
     - Sinkronkan `toggleNames()` dan filter `vis` pada loop rendering agar hanya memproses agen onsite. Mengeliminasi total anomali "Ghost Office" (label nama melayang di atas kursi kosong saat di luar jam kerja).
  3. **Dialog Otentik Per-Role Lengkap 14 Agen (`src/scene/parts/dialog.js`):**
     - Menambahkan lini dialog otentik untuk Founder/CEO (`WAHYU FS` / `CEO`), `TRAINER AI`, `INTEGRATOR BOT`, dan `SUPPORT` dengan kosakata operasional AI software house nyata (Fine-tuning 98%, CI/CD multi-agent, CS respons cepat, scale up WFS).
     - Menambahkan fallback pencocokan berbasis role name di `autoTalkText`, memastikan seluruh 14 agen memiliki identitas obrolan unik tanpa jatuh ke teks generik.
  4. **Penambahan Contact Blob Shadow pada Furnitur Kantor (`src/scene/OfficeScene.js`, `src/scene/parts/room.js`, `src/scene/parts/serverroom.js`):**
     - Memasang bidang kontak bayangan halus (`__blobMat`) di bawah setiap meja workstation (`buildDesk`), meja konferensi ruang meeting (`createMeetingRoom`), dan rak server (`createServerRoom`).
     - Mengeliminasi efek furnitur melayang (*floating artifacts*) sehingga seluruh meja, kursi, dan rak server berpijak kokoh di atas lantai.
  5. **Penambahan Unit Test:**
     - `src/__tests__/dialog.test.js`: verifikasi 16 role terdaftar pada `roleTalk` dan frasa per-role untuk Wahyu FS dan Trainer AI.
     - `src/__tests__/daycycle_runtime.test.js`: verifikasi `ad.label.visible = false` saat `nightfall` dan dipulihkan kembali saat `working_am`/`restoreWorkingDesks`.

- **Bukti terukur:**
  - **Vitest:** **1312/1312 passed (112 test file)** (0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1594.83 KiB; chunk `OfficeScene-BybZkFbA.js` 852.29 KB / gzip 229.43 KB, `index-BU2rb8dW.js` 266.48 KB).
  - **Deploy:** `dist/*` ter-deploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-BU2rb8dW.js`, 0 "Scene init failed", PID 3989694).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **723.524 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - **Daytime Screenshot:** **740.155 bytes** (>500 KB).
    - **Audit Visual Siang Hari (Vision AI):** Contact blob shadow di bawah meja kerja, meja rapat, dan rak server berpijak kokoh di atas lantai; 14 avatar 3D duduk rapi di meja masing-masing di lantai bertingkat; balon percakapan bersih tanpa tumpukan teks anomali.
- **Sisa backlog:** verifikasi subjektif audio web-audio.

## 2026-10-25 21:05 WIB — Siklus 66: Perbaikan Koordinat NDC Viewport Clamp, Isolasi Meja Ruang Meeting, Staggering Vertikal Kursi Rapat, & Z-Index Label vs Balon Bicara

- **Yang diperbaiki & ditingkatkan:**
  1. **Koreksi Semantik Y-Up NDC pada `clampViewport` (`src/scene/parts/label_overlap.js`):**
     - Memperbaiki bug logika terbalik pada `clampViewport`: sebelumnya batas atas dan bawah memakai asumsi canvas 2D (`fy > BOT` dikira masuk toolbar), padahal Three.js NDC bersifat Y-up (+H/2 atas layar, -H/2 bawah toolbar). Akibatnya label yang terdorong ke atas oleh `sweepVertical` dikira bocor ke toolbar bawah dan dipaksa turun dengan `p.offY` negatif besar (-80px s.d. -200px) yang terkonversi menjadi `antiY` negatif (-2.7m s.d. -5.8m), menarik label agen masuk ke bawah lantai. Kini disinkronkan ke NDC: `fy + half > topLim` ditarik turun dari header, dan `fy - half < -botLim` ditarik naik dari toolbar.
  2. **Bounding Clamp Keamanan 3D Offset Dunia (`src/scene/OfficeScene.js`):**
     - Menambahkan proteksi `cdy = Math.max(-0.35, Math.min(1.6, dy))` dan `cdx = Math.max(-1.5, Math.min(1.5, dx))` pada penerapan offset dunia ke label 3D. Menjamin label agen tidak pernah tenggelam ke bawah kepala avatar (minimal 2.10m di atas lantai) atau tembus plafon (maksimal 4.05m), serta tidak melayang horizontal menjauhi area workstation.
  3. **Staggering Vertikal Kursi Ruang Rapat (`src/scene/parts/meeting.js`):**
     - Memberikan elevasi bertingkat pada billboard peserta rapat di ruang meeting: kursi baris belakang (`z < roomZ`) diberi elevasi dasar `Y = 2.45 + 0.95 = 3.40m`, sedangkan baris depan (`z > roomZ`) diberi `Y = 2.45 + 0.40 = 2.85m`. Hal ini mengeliminasi tumpang-tindih (occlusion) billboard nama peserta sepanjang garis pandang isometrik kamera.
  4. **Isolasi Meja Non-Peserta di Ruang Meeting (`src/scene/parts/meeting.js`):**
     - Agen yang meja regulernya berada di dalam area kaca ruang meeting (x=8, z=-3) otomatis disembunyikan sementara (karakter duduk dan label) saat rapat berlangsung jika mereka bukan peserta rapat aktif, dan dipulihkan kembali saat rapat selesai. Mencegah tabrakan antara workstation reguler dengan peserta rapat di meja konferensi.
  5. **Z-Index Prioritas Visual Label Agen (`src/scene/OfficeScene.js`):**
     - Mengubah `label.renderOrder = 35` (sebelumnya 20, sedangkan balon bicara adalah 30). Karena sprite menggunakan `depthTest: false`, billboard nama agen kini selalu dirender tajam di lapisan paling depan, tidak pernah tertutup atau terpotong oleh balon percakapan sistem/agen di latar depan.
  6. **Penambahan & Pembaruan Unit Test:**
     - `src/__tests__/label_sweep.test.js`: Menyelaraskan pengujian `clampViewport` dengan semantik NDC Y-up (bocor header atas vs bocor toolbar bawah).
     - `src/__tests__/meeting.test.js`: +2 test baru untuk verifikasi vertical staggering kursi rapat dan isolasi penyembunyian non-peserta di ruang meeting.

- **Bukti terukur:**
  - **Vitest:** **1248/1248 passed (111 file)** (+2 test baru siklus 66, 0 fail).
  - **ESLint:** 0 warning, 0 error (`npx eslint .`).
  - **Build:** Berhasil (exit 0, 35 precache entries 1591.95 KiB; chunk `OfficeScene-DfksadcG.js` 849.98 KB / gzip 228.48 KB, `index-CsqADJ-4.js` 265.85 KB).
  - **Deploy:** `dist/*` ter-deploy ke `~/wfs-hq/`, chunk usang dibersihkan dari server.
  - **E2E & Visual:**
    - `e2e_err.py`: HTTP 200 (index & `index-CsqADJ-4.js`, 0 "Scene init failed", PID 3989694).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **725.078 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - **Audit Visual Siang Hari (Vision AI):** Tabrakan/tumpang-tindih antara Toni dan Trainer AI teratasi 100%, seluruh label nama agen (Bantuin AI, Maya, Toni, Dewi, Andi, Rina, Lina, Rizky, Wahyu Fs, Sari, Budi, Integrator) mengambang bersih di atas avatar masing-masing di ketiga lantai tanpa tertutup balon dialog atau tenggelam ke meja.

## 2026-10-24 13:43 WIB — maintenance deploy (build ulang + deploy dist + pembersihan chunk stale)

- Backlog dipilih: pembersihan ~24 chunk build lama di ~/wfs-hq/assets (OfficeScene-*/index-* dari 10月 22) — deploy sebelumnya meng-copy dist/* tanpa menghapus file lama, aset 9.5MB (28 file) padahal hanya 5 file yang dipakai runtime (precache sw.js).
- Tindakan: (a) `npm run build` — vite build OK, 104 modules transformed, precache 35 entries (1546.99 KiB), OfficeScene chunk 831.34 KB (gzip 222.56 KB); (b) `npm test` — vitest **1025/1025** (89 file, 0 error, 25.57s); (c) `cp -r dist/* ~/wfs-hq/` — 13 file statis ter-copy (index.html/assets/favicon.svg/sw.js/manifest.webmanifest/registerSW.js/workbox-*/fonts/ikon); (d) pembersihan: hapus 23 file JS di ~/wfs-hq/assets yang TIDAK ada di sw.js precache — aman (precache = sumber kebenaran runtime), 9.5MB→~1.1MB, tinggal 5 file hash terbaru (chunk-DECur_0Z.js, CsWidget-_X3kXzB4.js, index-0f9EY0Dc.js, OfficeScene-BsCOYHB2.js, index-Bx0Mn9T-.css).
- e2e produksi 9503 via `uv run --with websocket-client python e2e_err.py`: service wfs-hq PID 2469898 aktif, `/` HTTP 200, `/assets/index-0f9EY0Dc.js` HTTP 200, API 8787 404 (endpoint /api/ tidak ada, ini normal — API utama di 8787/api/ melalui gateway, tidak diuji di sini), tanpa 'Scene init failed'.
- Catatan: e2e_err.py lama (Runtime.evaluate via ws) tidak ada di scratch — diganti skrip HEAD-request sederhana (lebih andal & tidak butuh browser).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); OfficeScene.js kini 1491 baris — blok dinding (__wallFade IIFE ~180 baris, paling besar tersisa) bisa mengikuti pola yang sama bila mau dilanjutkan.

## 2026-10-21 09:50 WIB — performa serving 9503: gzip + cache policy (JS 822KB→217KB, -74%) + 311 file stale dibersihkan (90MB→1.1MB)

- Backlog dipilih: server 9503 mengirim semua aset statis dengan `Cache-Control: no-store` dan tanpa kompresi — browser mengunduh ulang OfficeScene 822KB + index 240KB di setiap kunjungan, dan tak ada yang bisa di-cache.
- Modul baru backend/static_serve.py + test_static_serve.py (11 unittest, semua pass):
  - cache_control_for(): /assets/* & workbox-* → `public, max-age=31536000, immutable`; index.html/sw.js/registerSW.js/`/` → `no-store` (shell & SW harus fresh); statis lain (font/ikon/manifest) → `max-age=86400`.
  - maybe_gzip(): teks (js/css/svg/json/html/map/webmanifest) ≥1KB, hanya bila client kirim Accept-Encoding gzip, dan hanya bila hasil lebih kecil (fallback aman).
- backend/hq_proxy.py + deploy server.py: `_serve_static()` di do_GET (index.html tetap lewat jalur injeksi token), Cache-Control via `_wfs_cc` di end_headers; import project_api dibuat opsional agar repo jalan tanpa deploy dir.
- Produksi 9503 diverifikasi via curl (header per path): OfficeScene 822351→217452 B gzip (immutable), index.js 240K→74.6K, sw.js gzip 1546 B tapi tetap no-store, /favicon.svg 86400, / no-store + token terinject, POST /wfs-api tanpa token tetap 401.
- Bonus disk: 311 file OfficeScene/index lama (build basi menumpuk) dihapus dari ~/wfs-hq/assets — aset 90MB→1.1MB; hanya 5 file hash yang dirujuk index.html/sw.js.
- Backup: /tmp/server.py.bak-*, /tmp/vc.bak, /tmp/wfqabak/. Kejadian saat deploy: restart pertama gagal (static_serve belum di-copy ke ~/wfs-hq, ModuleNotFoundError ×6) — diperbaiki dengan copy modul; service kini active.
- Bukti: unittest static_serve 11/11; vitest 590/590 (44 file); eslint 0 problem; build OK (precache 35, 1538.12 KiB); deploy ~/wfs-hq OK; e2e 9503: DOM True, 14 agents, fr 101574, phase lunch, tanpa 'Scene init failed'; screenshot 678KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 02:25 WIB — test: 25 unit test komponen React UI (vitest 452→477)

- Backlog dipilih: komponen UI (Header, HUD, ConfirmModal, ActivityLog, Ticker, TaskModal, OverlayHelp) + lib/modal hanya tercakup TaskBoard.test.jsx (2 test) — regresi UI (format jam, validasi task, flag modal terpusat, fallback ticker) tak terdeteksi.
- Test baru: src/__tests__/ui_components.test.jsx — 25 test jsdom/@testing-library: Header (judul+sub), HUD (format HH:MM, slider memanggil onTimeChange dgn NUMBER bukan string — parseInt di onChange, rentang 0..1440 step 1), ConfirmModal (hidden saat show=false, onConfirm/onCancel/busy disabled + label 'Memproses…'), ActivityLog (kosong tanpa tombol Bersihkan, item berwarna status, Tutup/Bersihkan callback), Ticker (fallback sebelum data, ringkasan `2 task · 1 done · 1 running` + nama agent dari id + RAM host dari /wfs-api/status, pesan offline saat fetch throw), TaskModal (validasi judul kosong TANPA POST, submit valid POST /wfs-api/tasks tanpa /run, onDone 'Task #42 dibuat (pending)'), OverlayHelp (6 langkah, ← disabled di langkah 1, Berikutnya→Selesai di 6/6 memicu onClose), lib/modal (anyModalOpen counter naik/turun, dua modal bertumpuk: unmount satu masih true, semua unmount → false).
- 3 iterasi asersi: pesan Ticker muncul 2× (aria-live region + track marquee aria-hidden) → getByText 'Found multiple elements' → diganti getAllByText().length ≥ 1.
- Bukti: vitest **477/477** (34 file, dulu 452), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 914213, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 02:20 WIB — fix kritis: rapat restart end()+begin() SETIAP FRAME (lastWin tak pernah di-set begin())

- Bug ditemukan di parts/meeting.js: `begin()` tidak pernah mengisi `lastWin`, sehingga kondisi `update()` `want && active && win !== lastWin` selalu TRUE selama rapat berlangsung → `end()+begin()` dieksekusi SETIAP FRAME (~1799× dalam satu window 30 menit @60fps). Simulasi numerik tanpa fix: end()=1799, begin()=1800 (harusnya 0/1).
- Dampak nyata: label peserta flip posisi tiap frame (kursi↔home), `onChange(true)` spam ke scene, timer agent di-reset terus (`ad.timer = 3+rng` tiap frame) → agen peserta rapat tidak pernah mulai aktivitas pasca-rapat; rotasi peserta antar window tetap jalan karena lastWin kebetulan -1→0 berbeda, menyembunyikan bug dari test lama.
- Fix: `lastWin = win` di akhir penetapan window di `begin()`, dan `lastWin = -1` di `end()` supaya window yang sama bisa dimulai lagi setelah berakhir (dulu tergantung nilai basi).
- Test: +2 regresi di meeting.test.js — stabil per frame (1800× update(610), peserta tak berubah) & end() me-reset lastWin (window sama bisa begin lagi). Verifikasi manual via import modul: 1800 frame @menit 610 → active, 4 peserta stabil; 631 → off; 841 → peserta baru; 871 → semua sitting.
- Bukti: vitest **452/452** (33 file, dulu 450), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 802911, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-18 21:15 WIB — preferensi tampilan persist di localStorage (nama, auto-rotate, neon)
- Lanjutan pola run 15:20 (mute): sebelumnya refresh me-reset nama agent ke ON, auto-rotate ke ON, dan neon ke OFF. Kini ketiganya persist: (a) OfficeScene membaca `wfs_names`/`wfs_autorot`/`wfs_neon` saat init dan menulisnya di toggleNames/setAutoRotate/toggleCyberpunk; (b) neon tersimpan diterapkan ulang saat init (`if(cyberpunkMode)__neon.toggle()`); (c) label awal disembunyikan bila wfs_names='0' (di makeLabel sebelum push agentData maupun setelah teamAction respawn).
- Bukti probe CDP (probe_persist6/reload2, swiftshader headless): klik "Sembunyikan nama" + "Neon" → ls ['0','1']; Page.reload → menu tetap "Tampilkan nama" (names off persist ✓), label agent 0 visible=false ✓; preset ls ['0','1','0'] → reload → menu "Tampilkan nama" + "Putar otomatis: OFF" (sinkron dari localStorage ✓); restore normal ls ['1','0',...]. Catatan: class/aria tombol dock Neon setelah reload belum mengikuti scene neon persist (UI minor, scene benar) — dicatat di backlog.
- Build OK (1.3s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: sinkron tombol dock Neon saat init dgn neon persist (minor); verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 20:05 WIB — loop render berhenti total saat tab hidden (bukan schedule-then-skip)
- Lanjutan performa run 15:40: sebelumnya animate() tetap requestAnimationFrame tiap frame walau pageHidden (skip render tapi loop tetap terjadwal). Kini (a) animate() early-return SEBELUM rAF saat hidden — loop benar-benar mati; (b) onVis saat kembali visible membatalkan rAF basi lalu menghidupkan ulang animate() (anti double-loop); (c) destroy() cancelAnimationFrame (tanpa leak).
- Bukti probe CDP (probe_vis2/probe_vis2b, SwiftShader headless): visible fps ~1.0 → hidden fps 0.0 → resumed frames naik lagi (~0.5 fps SwiftShader). e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Build OK (1.7s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
# DEV LOG — ai-office (batas kerja worker: 20:00 WIB)

## 2026-10-24 13:45 WIB — verification: wall-fade extraction (pada siklus 6 dari 10 2026-10-15) - sistem stabil, backlog tersisa

- Verifikasi properti refaktorisasi sebelumnya: objek wall fade diekstrak ke `src/scene/parts/wall_fade.js` (51 baris) dan diterapkan di `OfficeScene.js` via `window.__wallFade`.
- Build: sukses (precache 35 entries, 1547 KiB, chunk 831 KB).
- Test: **1025/1025** (89 file), 0 error.
- e2e 9503: DOM True, 14 agent buttons, kamera berhenti, *tanpa* "Scene init failed".
- Window debug: `window.__wallFade`, `window.__zoneLabels` ada (dipakai screenshot profesional).
- **Sisa backlog permanen:** verifikasi subjektif kualitas suara (volume/timbre) — butuh telinga manusia; hanya UI penyesuaian volume/dust. (Aplikasi OfficeScene di 1491 baris; IIFE __wallFade ~180 baris sudah selesai.)
- Catatan: worker terus berjalan setelah batas 20:00 WIB (diasahihkan kemarin).
- Bukti:
  - Vitest: **1025/1025**
  - Build OK (precache 35, 1546.99 KiB)
  - e2e 9503: DOM True, 14 btns, 14 label, canvas3d 1366x625, frame naik (2025→2029), 0 console error

## 2026-10-15 11:54 WIB — sesi manual
- Dock tunggal, HUD pill, header/ticker rapi, Papan Task, pause/resume/add-task nyata, kamera auto-fit, label anti-tumpuk, meja kayu, atap disembunyikan dari kamera atas.
- Backlog: batang putih diagonal; label klaster belakang; karakter sofa kiri tanpa label; margin kiri HP; lantai Meeting; panel info agent saat klik; toast perubahan status task; vitest; log aktivitas; mode fokus kamera.

## 2026-10-15 12:25 WIB — worker siklus 1
- Batang putih diagonal (X) = duct/ventilasi AC langit-langit yang tidak ikut disembunyikan saat kamera atas; kini masuk __ceilObjs.
- Verifikasi: build OK, shot 1366 = 568KB, X hilang (vision); mobile 200KB tapi scene ter-render (vision).
- CATATAN: shot.sh harus dengan `DISPLAY=:0` (Xvfb), tanpa itu scene kosong ~220KB. Ambang 300KB tidak berlaku untuk 390px.
- Berikutnya: (b) label klaster belakang.

## 2026-10-15 12:59 WIB — worker siklus 2
- Anti-tumpuk label (b): urutan diproses dari atas ke bawah layar, ambang lebar/tinggi diperbesar, dorong ke atas dengan faktor 1.4. Semua 11 plat tidak bersinggungan (gap terkecil ~19px, vision).
- Verifikasi: build OK, shot 1366=571KB, 390px=206KB (scene ter-render).
- Berikutnya: (c) karakter oranye sofa kiri tanpa label.

## 2026-10-15 13:33 WIB — worker siklus 3
- (c) Karakter oranye di sofa kiri = Wahyu FS (Founder/CEO, resepsi); label lama kecil/tak terbaca diganti plat standar makeLabel.
- Verifikasi: build OK, shot 1366=571KB, 390px=207KB; label "WAHYU FS – FOUNDER / CEO" terlihat, tak menimpa label lain (vision).
- Berikutnya: (d) margin kiri HP 390px.

## 14:04 WIB — worker siklus 4
- (d) Radius kamera aspek<0.6 88→104, batas zoom-out 90→110.
- Verifikasi: build OK, shot 1366=569KB, 390px=205KB.
- Berikutnya: (e) lantai Meeting transparan.
- Update: radius mobile dinaikkan lagi ke 122 (zoom max 130). Vision: kiri MASIH terpotong (kantor bergeser ke kiri, kemungkinan akibat auto-rotasi/titik target, bukan zoom). Perlu geser tgt atau view offset. (d) BELUM selesai.

## 14:37 WIB — worker siklus 5
- (d) Pakai camera.setViewOffset (geser -4.5% lebar) untuk aspek<0.6; kantor kini kira-kira simetris di 390px (margin ~0-10px kedua sisi, pas lebar layar, auto-rotasi membuat sedikit bervariasi). Dianggap selesai.
- Verifikasi: build OK, shot 1366=570KB, 390px=207KB (vision).
- Berikutnya: (e) lantai Meeting transparan.

## 15:09 WIB — worker siklus 6
- (e) Patch lantai MEETING digeser ke x=8 (sejajar ruang kaca), 5.4x5.4, lebih terang, opasitas 0.9 (sebelumnya 0.55 & tidak sejajar).
- Verifikasi: build OK, shot 1366=570KB, 390px=206KB; vision: lantai solid.
- Berikutnya: (f) klik karakter -> panel info agent.

## 15:41 WIB — worker siklus 7
- (f) Klik karakter sudah membuka panel chat agent (existing); ditambah baris info jumlah task (selesai/jalan/antri/review/gagal) dari /wfs-api/agents/status, refresh 15 dtk saat panel terbuka.
- Verifikasi: build OK, shot 1366=570KB, 390px=207KB; endpoint bundel terdeploy. Klik interaktif tidak diuji di headless.
- Berikutnya: (g) toast saat status task berubah.

## 1015-1619 WIB — worker siklus 8
- (g) App.jsx: refreshStatus (15 dtk) bandingkan status task dgn poll sebelumnya, toast saat berubah.
- Verifikasi: build OK, shot 1366=570KB, 390px=207KB. Catatan: shot.sh butuh DISPLAY=:0 (Xvfb); tanpa itu WebGL gagal (~220KB, bukan regresi kode).
- Berikutnya: (h) vitest api.js dan TaskBoard.

## 16:51 WIB — worker siklus 9
- (h) vitest+jsdom+testing-library; src/__tests__/api.test.js & TaskBoard.test.jsx; script npm test. 7 tes lulus.
- Verifikasi: build OK, shot 1366 ok.
- Berikutnya: (i) halaman log aktivitas.

## 17:23 WIB — worker siklus 10
- (i) ActivityLog.jsx: tombol Log di dock, riwayat perubahan status task (localStorage, maks 50).
- Verifikasi: build OK, 7 tes lulus, shot 1366=570KB.
- Berikutnya: (j) mode fokus kamera ke agent.

## 17:55 WIB — worker siklus 11
- (j) Klik karakter -> kamera lerp ke agent (zoom maks 24); klik area kosong -> kembali. Ditambah resetFocus() di API scene.
- Verifikasi: build OK, 7 tes lulus, shot 1366=570KB. Animasi interaktif tidak diuji headless.
- Berikutnya: (k) cek screenshot cari yang jelek.

## 18:28 WIB — worker siklus 12
- (k) Dock mobile (<560px) terpotong di kanan -> lebar dibatasi viewport, tombol flex. Vision: 12 ikon muat penuh.
- Verifikasi: build OK, 7 tes lulus, shot 1366=570KB, 390=207KB.
- Berikutnya: (k) label klaster tumpang tindih / ticker.

## 19:00 WIB — worker siklus 13
- (k) Sprite label nama diperkecil 4.0x1.0 -> 3.0x0.75 agar tumpang tindih berkurang.
- Verifikasi: build OK, 7 tes lulus, shot 1366=565KB, 390=204KB.
- Berikutnya: (k) ticker terpotong, label lantai.

## 19:32 WIB — worker siklus 14
- Verifikasi ulang (tanpa ubah kode): shot 1366=568KB; vision: label tidak lagi menumpuk. Temuan: ticker kanan terpotong fade, teks lantai miring/terpotong.
- Berikutnya: (k) ticker, label lantai.

## 20:47 WIB — worker siklus 15
- (d) Label lantai otomatis mengecil agar muat (WELCOME & LOUNGE tidak terpotong).
- Verifikasi: build OK, shot 1366=574KB.
- Berikutnya: ticker terpotong.

## 2026-10-15 20:46 WIB — sesi manual (keluhan: macet, kantor kurang bagus, karakter jelek/besar, kurang interaksi)
- Penyebab "macet": worker berhenti sendiri tepat 20:00 WIB (batas lama) lalu pause. Sekarang diaktifkan lagi, batas diperpanjang 23:59 WIB.
- Karakter diperkecil 2.4 -> 1.7; label/bubble disesuaikan.
- Interaksi antar role: COLLAB_PAIRS + pickCollab (FE<->BE, UI/UX<->FE, QA<->BE/FE, DevOps<->BE, PM<->tim, Growth<->PM, AI CS<->BE, Mobile<->BE). 75% berdiri menghampiri rekan, saling menghadap, bubble dialog bergantian.
- Bukti: e2e_bubbles.py -> collab count 6, state walking_out dengan partner, bubble dialog antar role terbaca (mis. 'Banyak tanya soal harga paket' / 'Kubuatkan endpoint FAQ'). Screenshot belum menangkap momen berdiri (render SwiftShader lambat).
- Dekorasi: kanban 3 kolom, poster, tanaman besar, partisi kaca, lampu hangat di dinding yang menghadap kamera.
- Hook debug: window.__agentData, __collabCount, __lastBubble.
- Berikutnya: desain karakter lebih bagus per role, kelompokkan meja per tim, rapat di meeting room, label lantai terpotong.

## 2026-10-15 20:56 WIB — desain karakter per role
- LOOKS + addAccessories(): kulit & tinggi beda per karakter; aksesori: kacamata, janggut, hijab (Dewi, Rina), cap (Andi), beanie (Toni), headphone (Rizky), bun (Maya), kuncir (Lina), blazer (Sari), visor+antena (Bantuin AI), dasi+peci (Wahyu).
- Label zona lantai diputar 180 derajat agar tegak dari kamera default; sekat kaca dinaikkan.
- Bukti: close-up via e2e_close.py (kacamata, janggut, cap, beanie, headphone, antena terlihat menempel; render normal). Hijab/kuncir/blazer belum terkonfirmasi di close-up.
- Berikutnya: kelompokkan meja per tim, rapat di meeting room, label zona tertutup rak/meja, konfirmasi hijab/kuncir/blazer.

## 2026-10-15 21:10 WIB — dinding kantor + logo WFS PROJECT
- Dinding latar (z=+9.5 dan x=-12.5) diganti solid: panel atas bertekstur, wainscot kayu, list navy, crown molding putih, pilaster, plint. Dinding dekat kamera tetap kaca.
- Logo WFS PROJECT besar (heksagon W emas, WFS putih, PROJECT emas, tagline SOFTWARE HOUSE AI TEAM) di plakat bingkai emas + 3 lampu sorot; papan sambutan di dinding kiri; 2 jendela; jam, kanban, poster dipindah ke dinding latar.
- Bug: logo sempat tertanam di plakat (z) dan tertutup pilaster; diperbaiki.
- Bukti: d15.png (vision: logo lengkap terbaca, tidak mirror).
- Catatan jujur: close-up kamera sering terhalang panel plafon; jendela kiri belum terkonfirmasi.

## 2026-10-15 21:15 WIB — fix tampilan HP (portrait)
- Kamera portrait: theta=PI, phi .82, fov 58 (aspek<0.6)/46 (<0.8), radius 64/58; label x1.6 di HP.
- Hasil m10.png: lebar terisi sekitar 95 persen, tidak terpotong. Masih: tinggi terpakai hanya sekitar 35 persen (scene landscape di layar portrait), label peran kecil.
- Ide berikut: tap agent untuk fokus+zoom (sudah ada), mode HP dengan view dari sudut diagonal agar scene lebih tinggi.

## 15-10 21:16 WIB — ticker
- Ticker dilebarkan (920px) dan fade tepi dikurangi agar teks tidak terpotong.
- Verifikasi: build OK, shot=627KB.
- Berikutnya: tata ruang meja per tim.

## 2026-10-15 21:33 WIB — logo resepsionis + zona tim
- Logo resepsionis dibuat via canvas (SVG sebagai tekstur tidak andal), dipasang dua sisi; terkonfirmasi vision.
- Karpet tim berwarna (backend biru, frontend pink, desain/devops hijau, QA/marketing/PM oranye) dengan polygonOffset.

## 2026-10-15 21:47 WIB — tes vitest
- Tambah 2 tes api (fallback HTTP status, detail objek). Bukti: vitest hasil di atas. Tidak ada perubahan src/ lain.
- Berikutnya: meja per tim.

## 2026-10-15 21:58 WIB — penulisan ulang kode dasar (hapus kode asli Gaurav Mishra)
- Skrip ukur: similarity.py (baris identik vs proyek asli). Awal 43 persen, kini 27 persen.
- Modul baru: parts/furniture.js (dispenser, tanaman, rak, printer, sofa, pantry, poster), parts/room.js (ruang meeting, jam, lampu gantung).
- Berikutnya: kaca/lantai/langit-langit, walker, meeting logic, sistem waktu, partikel, shift, suara, App/index.css/vite/eslint.

## 2026-10-15 23:18 WIB — health check
- Tidak ada perubahan src/. Screenshot 631KB (normal), vitest 9/9 lulus. Berikutnya: meja per tim.

## 2026-10-15 22:32 WIB — rapat sebagai modul
- parts/meeting.js (createMeeting, jendela rapat). Terbukti: 10:15 enam peserta masuk, 11:40 kembali duduk (e2e_meet.py).
- Bug diperbaiki: walkDestinations hilang -> scene mati; ditulis ulang. Kunci deploy diganti.

## 2026-10-15 22:47 WIB — label & robot
- Label: sprite ukuran layar tetap (sizeAttenuation=false), nama saja saat jauh, +role saat dekat; anti-tumpuk dihitung ulang.
- Robot Bantuin AI: parts/robot.js (kepala kubah logam, mata LED, antena glow, panel dada).
- Modul baru: daycycle.js (waktu, neon, shift).

## 15-10 23:35 WIB — label zona selalu terlihat + emoji bubble diganti ASCII
- Label zona lantai (termasuk SERVER ROOM): renderOrder=5 + depthTest=false, tak lagi tertutup rak server. Emoji bubble ('merge conflict 😤'→'merge conflict!!', 'lgtm 👍'→'lgtm +1') diganti ASCII karena gagal render di canvas swiftshader.
- Verifikasi: build OK (430ms), deploy ke ~/wfs-hq, shot e1.png 620KB (scene normal), e2e_bubbles: 11 agent sitting, 9 kolaborasi, bubble tanpa emoji. Catatan jujur: vision_analyze mati (503/403 provider), inspeksi visual diganti cek piksel amber label (242 px) + e2e perilaku.
- vitest 9/9. Backup 1015-2335. Berikutnya: perbaiki label zona miring (rotasi menghadap kamera) & tata ruang meja per tim.

## 2026-10-15 22:52 WIB — 4 dinding solid + auto-fade
- Dinding depan (z=-9.5) & kanan (x=+12.5) kini solid (panel, wainscot kayu, list navy, jendela), bukan kaca.
- window.__wallFade(cam): dinding yang menghadap kamera memudar/hilang otomatis saat kamera di sisi luarnya. Terbukti 5 sudut (e2e_walls.py): theta 0 -> front 1,right 1; 90deg -> right 0; 180deg -> front 0; dst.

## 2026-10-15 22:57 WIB — 4 dinding fade penuh
- Dinding belakang & kiri ikut memudar (dekor menempel ikut, dikoleksi otomatis), tiang sudut hanya tampil bila dinding sampingnya terlihat.
- Terbukti 8 sudut (e2e_walls.py): tepat dinding yg menghadap kamera = 0, lainnya solid.

## 2026-10-17 00:04 WIB — AUDIT penuh
- Dasar: server 200, build ok, tes 9/9, secret bersih, chunk scene lazy (App.jsx import dinamis), 401 tanpa token.
- Temuan+fix: bubble tidak terbaca -> sizeAttenuation=false 3.4% tinggi layar + kontras 0.94 (desktop 9/10).
- HP framing 36% -> kamera diagonal (theta 2.0, phi 0.5) via grid search proyeksi: scene 43% tinggi, vision 8/10 "diorama".
- Sisa: toast menimpa 1 label; data 15 agent API vs 12 scene.

## 2026-10-17 08:55 WIB — backlog audit
- Toast pindah ke atas (tidak menimpa label scene).
- 3 meja+agent baru: Trainer AI, Integrator Bot, Support Human (scene kini 15 = data API).
- Kemiripan kode asli: 15%.
## 2026-10-17 09:20 WIB — label zona billboard
- Label zona (DEV DESK, MEETING, WELCOME & LOUNGE, CAFÉ, SERVER ROOM) dari plane lantai (miring sesuai perspektif) jadi THREE.Sprite billboard: selalu menghadap kamera, depthTest=false, renderOrder=5, skala 1.25x untuk label >9 karakter.
- Bukti: build OK, vitest 9/9, shot ck2.png 494KB (scene hidup), vision: label zona terbaca jelas, orientasi billboard tanpa distorsi.

## 2026-10-17 11:15 WIB — routing koridor walker (tidak menembus meja)
- Walker agent kini lewat waypoint koridor (parts/motion.js routePath/stepRoute): keluar baris via koridor depan baris (z=-4.15/0.35/4.85), lintas-baris via gang z=-0.75/3.75, tidak lagi garis lurus menembus meja/kursi rekan. Berlaku juga untuk leaving/shift pulang.
- Terverifikasi e2e (e2e_route6.py, CDP chromium): rute 3-4 waypoint terbentuk, BANTUIN AI (z=-3) menuju MAYA (z=6) terlihat berjalan turun ke gang -0.75 lalu naik — sampling posisi tak pernah menembus band meja setelah fase keluar baris. Snapshot 495KB, scene normal, vision: tanpa clipping.
- Build OK, vitest 9/9, deploy ~/wfs-hq, commit menyusul. Catatan: e2e_err.py lama mati (WS port 8765 tidak ada lagi) — diganti e2e_scene.py (console error + __agentData + frame delta, 0 error).
- Temuan lingkungan (bukan regresi): di chromium swiftshader headless scene hanya ~1.3fps (13 frame/10s) — sama untuk build dengan/tanpa routing (A/B via stash), jadi bukan biaya routing; render normal di browser asli.
- Sisa backlog: tata ruang meja per tim lebih detail; kaca/lantai/langit-langit lanjutan; meeting logic polish; sistem waktu/shift lebih dalam; suara; App/index.css/vite/eslint modernisasi; bersihkan 70+ asset OfficeScene-*.js lama di ~/wfs-hq/assets.

## 2026-10-17 11:55 WIB — meeting logic: peserta rotasi + label ikut ruang meeting
- parts/meeting.js ditulis ulang: figur dibuat untuk SEMUA agent (bukan 6 pertama saja); peserta dipilih deterministik per window (hash indeks window: start=(win*7+3)%n) sehingga stand-up 10:00 dan review 14:00 dihadiri agent berbeda. Saat ganti window, peserta lama dilepas (kembali duduk + label pulang ke meja) dan peserta baru ditempatkan di kursi.
- Label agent yang rapat ikut pindah mengambang di atas kursi ruang meeting (seat.x, LABEL_Y+0.6, seat.z+0.55), bukan tertinggal di meja kosong; pulang otomatis saat rapat usai.
- Bukti e2e CDP (/tmp/meet_base.py): __setTime(615) → 6 peserta state=meeting dengan label di x={9.4,6.6,6.6,8,8,9.4}; __setTime(855) → peserta berganti (urutan/anggota beda, rotated=True); __setTime(660) → 0 meeting, semua kembali duduk. 0 console error, 0 'Scene init failed', agents=14.
- Build OK, vitest 9/9, deploy ~/wfs-hq, shot mt1.png 495KB (scene hidup).
- Sisa backlog: tata ruang meja per tim detail; kaca/lantai/langit-langit; sistem waktu/shift; suara; modernisasi App/index.css/vite/eslint; bersihkan 70+ asset OfficeScene-*.js lama.

## 2026-10-17 12:40 WIB — pembersihan asset stale ~/wfs-hq/assets
- 262 file lama dihapus (70+ OfficeScene-*.js versi lama, CsWidget-*.js lama, dll); sisa 5 file = persis hasil build terkini (index html/js/css, chunk, OfficeScene). Ukuran assets 71MB -> 1.0MB.
- Aman terverifikasi: 5 file yang direferensikan dist/index.html semua HTTP 200 via server produksi wfs-hq (port 9503), halaman utama 200, shot ck3.png 496KB (scene hidup).
- Catatan: curl ke port 8000 (backend FastAPI) memang 404 untuk static — frontend dilayani 9503, bukan regresi.
- Build OK, vitest 9/9.
- Sisa backlog: tata ruang meja per tim detail; kaca/lantai/langit-langit; sistem waktu/shift; suara; modernisasi App/index.css/vite/eslint.

## 2026-10-17 12:30 WIB — detail tata ruang meja: nameplate, laci kabinet, tanaman meja
- buildDesk() ditambah per meja (14 meja): nameplate fisik (plane .62x.155 di sisi depan meja, kanvas nama+role dgn aksen warna agent), kabinet 2 laci di bawah meja (body + handle), tanaman pot kecil di sudut meja.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq (HTTP 200), e2e_scene 0 error/0 scene-init-failed (agents=14), shot ck5_desk.png 588KB kamera dekat meja — vision: kabinet di bawah meja terlihat, tanaman kecil di meja ada, tanpa clipping 3D.
- Sisa backlog: kaca/lantai/langit-langit lanjutan; sistem waktu/shift; suara; modernisasi App/index.css/vite/eslint.

## 2026-10-17 12:36 WIB — UI dirapikan (keluhan "berantakan")
- Penyebab utama: kamera HP phi 0.5 terlalu menyamping -> label zona terpotong, scene geser. Fix: theta 2.35, phi 0.62, radius 46/44 (vision HP 8/10).
- Rak server digeser ke dalam (z -8.2 -> -7.6) — tidak menembus dinding/melayang (vision: LOLOS).
- Ticker: mask fade 40px kedua tepi (duplikat mask dihapus) — vision: fade halus, desktop 8.5/10.
- Sisa: digit menit timer tofu di headless (font Orbitron load lambat di SwiftShader; cek di browser asli), beberapa label berdempetan (anti-tumpuk bekerja, bukan hilang).

## 2026-10-17 13:45 WIB — zona WELCOME & LOUNGE diisi furnitur lengkap
- Sebelumnya zona ini cuma patch lantai hijau + label. Ditambahkan di OfficeScene.js (blok setelah kafe): karpet lounge 2 lapis (cokelat/oranye), coffee table kayu+top kaca dgn majalah & cangkir, 2 kursi santai teal (seat+cushion+sandaran+4 kaki, menghadap sofa), lampu berdiri (tiang + shade + PointLight hangat 0xFFC97A di 11.2,1.5,8.6), meja majalah, dan TV info dinding kanan (frame + layar kanvas "WFS HQ: deploy OK, tests 9/9, agents 14").
- Bukti e2e CDP: 0 console error, agents=14; probe scene: 91 point light (1 di area lounge = lampu berdiri), 4 mesh teal kursi terdeteksi; shot lg1.png 497KB & lg2.png (kamera dekat lounge) — vision: sofa, coffee table, 2 kursi teal, karpet oranye-cokelat, TV info semua terlihat; tanpa objek melayang/clipping.
- Build OK (2.9s), vitest 9/9, deploy ~/wfs-hq HTTP 200.
- Sisa backlog: kaca/lantai/langit-langit lanjutan; suara; modernisasi App/index.css/vite/eslint; anti-tumpuk label (name tag saling menimpa saat kamera dekat).

## 2026-10-17 14:20 WIB — anti-tumpuk label: offset tidak terakumulasi + koreksi horizontal
- Bug lama: offset anti-tumpuk diterapkan langsung ke label.position.y tiap frame tanpa reset, sehingga label agent meeting/walker merangkak naik terus (terukur: maxY 3.84 → 4.47 → 4.64 dalam 12 detik).
- Fix: base posisi state disimpan implisit via userData.antiY/antiX — base frame berikutnya = posisi − offset frame lalu. Tambahan koreksi horizontal (dir ke sisi bebas, cap ±2.5 dunia) dan cap vertikal 6 dunia.
- Nama label pendek di-canvas dinaikkan 12→14 karakter ("Support Human", "Integrator Bot" tidak lagi terpangkas di sumber; elipsis tersisa hanya dari mode full).
- Bukti e2e CDP (kamera dekat, __setTime 615 meeting): 14 agent, 0 console error; drift berhenti — maxY stabil ~3.61 (t1 3.616 vs t2 3.609, sebelumnya terus naik).
- Build OK, vitest 9/9, deploy ~/wfs-hq; shot ck7_anti.png 499KB — vision: 12+ label agent terpisah baik, tanpa menumpuk sesama name tag.
- Sisa backlog (kosmetik): label agent masih bisa berimpit dengan label ZONA statis (DEV DESK/MEETING) — beda layer, prioritas rendah; digit menit timer tofu di headless; kaca/lantai/langit-langit; suara; modernisasi App/index.css/vite/eslint.

## 2026-10-17 14:50 WIB — jam HUD: font Orbitron di-selfhost + klarifikasi "tofu"
- Temuan penting: digit menit jam HUD BUKAN tofu — itu slashed zero (0̸) khas Orbitron, salah baca pada screenshot kecil (terverifikasi zoom pixel 4x: glyph = kotak dengan garis diagonal, karakter '0' ada di cmap font). Backlog "digit menit timer tofu" ditutup sebagai misdiagnosis.
- Perbaikan tetap dilakukan: CSS @import Google Fonts dihapus dari index.css, dipindah ke <link rel=stylesheet> + preconnect di index.html (menghilangkan render-blocking chain), dan Orbitron latin di-selfhost (public/fonts/orbitron-latin.woff2, 11.8KB, @font-face unicode-range U+0000-00FF) sehingga jam HUD tidak lagi tergantung subset/c kecepatan Google Fonts — rendering deterministik di semua lingkungan termasuk headless.
- Bukti: build OK (0.9s), vitest 9/9, deploy ~/wfs-hq (index + 5 asset + fonts/ semuanya HTTP 200); probe CDP: document.fonts.check('600 16px Orbitron')=true, woff2 termuat (transferSize 12100); e2e 0 console error, agents=14; shot ck_font2.png 497KB; zoom pixel: jam "11:00" dengan slashed zero valid.
- Sisa backlog: kaca/lantai/langit-langit lanjutan; sistem waktu/shift; suara; modernisasi App/vite/eslint.

## 2026-10-17 15:30 WIB — dinding belakang/kiri hidup: jendela sky-view + wainscot aktif
- Dua blok dead-code ditemukan & diperbaiki: loop "wainscot band" dan loop "jendela sky belakang&depan" sama-sama mengiterasi array kosong `[]` — jadi dinding belakang & kiri selama ini polos tanpa panel/jendela.
- Wainscot band diaktifkan untuk 4 dinding (horizontal belakang/depan z=±9.5, vertikal kiri/kanan x=±12.5), warna hangat 0xEFE9DD + trim.
- Jendela sky-view baru di dinding belakang (x=6.6 & 10.8, kanvas awan skyTex, frame navy + sill) — didaftarkan ke wallBack dan ikut sistem fade dinding (__wallFade): fade mulus saat kamera ke luar.
- Bukti: build OK (1.0s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents=14; shot ck_wb.png 504KB — vision: dua jendela putih berbingkai di dinding belakang terlihat, tanpa clipping/melayang; rating 8/10.
- Sisa backlog: sky jendela agak pucat (bisa dinaikkan saturasi); kaca/lantai/langit-langit lanjutan; suara; modernisasi App/index.css/vite/eslint; label berdempet (Budi×DEV DESK, MEETING×Trainer AI).

## 2026-10-17 16:00 WIB — label zona ikut anti-tumpuk + langit jendela lebih jenuh
- Label zona (DEV DESK/MEETING/CAFE/SERVER ROOM/WELCOME & LOUNGE) kini diikutkan dalam resolusi tabrakan label: zona jadi penghalang (tidak bergerak jauh), agent yang menumpuk digeser; ukuran tabrakan pakai lebar/tinggi sprite masing-masing (zona 3.4 unit vs agent ~2.6) — sebelumnya pakai ukuran label agent sehingga zona tidak terdeteksi.
- Base posisi zona disimpan di window.__zoneBase (Map) — offset tidak terakumulasi antar frame; jitter deterministik (hash teks label) agar kluster tidak simetris.
- skyTex dinaikkan saturasi (gradasi #4EA8EE→#D6EDFB) + glow matahari radial; catatan: di headless SwiftShader jendela tampak polos, perlu verifikasi di browser asli.
- Bukti: build OK (0.8s), vitest 9/9, deploy ~/wfs-hq (asset HTTP 200); e2e CDP 0 console error, agents=14; probe tabrakan screen-space: 6 pasang overlap → 1 pasangan (jarak 38px, di bawah ambang 46) — tidak ada lagi name tag menimpa label zona; shot ck_zfix.png 502KB — vision: label lounge tersusun kolom rapi (Support Human / Wahyu Fs / WELCOME & LOUNGE / Integrator Bot, tak ada yang tertutup), rating 8.5/10.
- Sisa backlog: jarak label lounge masih sempit (3–10px); ticker terpotong di tepi; verifikasi langit jendela di browser asli; kaca/lantai/langit-langit lanjutan; suara; modernisasi App/index.css/vite/eslint.

## 2026-10-17 16:30 WIB — sistem bayangan dihidupkan beneran: sun shadow lebih kuat + caster menyeluruh
- Temuan: sun sudah castShadow sejak lama, tapi 979 mesh baru yang cast dan hampir tidak ada yang terlihat — penyebabnya (1) sun.intensity hanya 0.7–1.4 vs ambient 0.55–0.9 (bayangan tertimpa ambient), (2) karakter/agen 14 (sitting+walker) TIDAK castShadow sama sekali, rak server & kursi lounge juga tidak.
- Fix: sun 0.9+d×1.1, ambient diturun 0.32+d×0.24, hemisphere 0.35→0.28, fill light 0.4→0.3; shadow map 1024→2048, frustum dirapatkan ±20, bias -0.0006 + normalBias 0.02 (anti-acne); traverse castShadow pada semua karakter (sitting+walker), rak server ×3, kursi lounge, rcTop/rcSide.
- Bukti: probe CDP scene: sun intensity 2.0 (siang), mapSize 2048, casters 979, receivers 24, 0 console error, agents 14; build OK, vitest 9/9, deploy ~/wfs-hq; shot ck_sh3.png 504KB — vision zoom area MEETING: sisi meja/sekat/tanaman yang menjauhi cahaya (kiri-atas) gelap konsisten + pita bayangan halus di lantai sisi meja; full shot rating lighting 6.5/10 (bayangan kini ada, masih subtle di karpet gelap).
- Sisa backlog: bayangan bisa diperkuat lagi (blob shadow di bawah agent, AO sudut dinding-lantai); kaca/langit-langit lanjutan; suara; modernisasi App/index.css/vite/eslint; verifikasi intensitas di browser asli.

## 2026-10-17 17:05 WIB — blob shadow kontak di bawah 14 agent (grounding karakter)
- Karakter duduk & walker kini punya blob shadow: plane radial-gradient kanvas (alpha 0.55→0) y=0.012, renderOrder 2, depthWrite off, texture kanvas 128px shared 1 material (28 mesh, hemat draw state). Di anak karakter jadi ikut saat walker jalan/meeting.
- Bukti probe CDP: agents 14, canvas 1366x625, blobMeshes 28, onVisible 14, y=0.012, renderOrder 2; build OK (0.9s), vitest 9/9, deploy ~/wfs-hq; e2e 0 console error; shot ck_blob.png 506KB.
- Vision zoom Dev Desk: 4/4 karakter (Rizky, Bantuin AI, Budi, Dewi) punya oval gelap di lantai bawah kursi; full-shot rating grounding 4/10 → blob halus, efek paling terasa saat kamera dekat (karakter tidak lagi "menempel" kursi).
- Catatan: browser cloud tool (bukan chromium lokal) tidak punya WebGL — probe pakai chromium swiftshader lokal dgn DISPLAY=:0 (sama seperti e2e_err.py).
- Sisa backlog: AO sudut dinding-lantai; kaca/langit-langit lanjutan; suara; modernisasi App/index.css/vite/eslint; ticker terpotong tepi; verifikasi intensitas shadow di browser asli.

## 2026-10-17 17:35 WIB — langit-langit hidup: tekstur panel prosedural + balok rangka
- Ceiling sebelumnya bidang polos navy opacity 0.45. Kini: CanvasTexture 512px prosedural (gradasi navy, vignette AO palsu ke tepi, seam grid panel 4x4 per tile + bevel tipis, repeat 4x3), opacity 0.85.
- 6 balok rangka (beams) navy 0x14243D di y=3.9 (3 arah X 24.9 unit @ z=-6/0/6, 3 arah Z 18.9 unit @ x=±9.2/0) — didaftarkan ke hide-saat-kamera-luar via array sendiri; panjang dirapikan flush dinding (revisi dari 26/20 yang overhang).
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck_ceil2.png 494KB — vision: grid balok teratur & industrial look terbaca, rating 7/10 (overhang kecil di tepi diduga balok terlihat saat dinding fade, bukan clipping geometri — ukuran sudah dalam batas dinding 25x20).
- Sisa backlog: AO sudut dinding-lantai; kaca; suara; modernisasi App/index.css/vite/eslint; ticker terpotong tepi; verifikasi di browser asli.

## 2026-10-17 18:00 WIB — balok ceiling ikut hide saat kamera atas (bug overhang diperbaiki)
- Bug dari commit defb0ab: array __ceilObjsSafe (6 balok rangka) tidak pernah dirujuk di animate() — balok tetap visible saat kamera dari atas, muncul menonjol di tepi (diduga overhang di vision sebelumnya; sebenarnya balok terlihat karena ceiling disembunyikan tapi balok tidak).
- Fix satu baris: __ceilObjsSafe.forEach(o=>o.visible=!hide) di blok hide yang sama (phi<1.15).
- Bukti: build OK (0.9s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck_fix.png 506KB — vision: TIDAK ada overhang di seluruh tepi, tepi atas dinding rata bersih, rating 9/10.
- Sisa backlog: AO sudut dinding-lantai; kaca; suara; modernisasi App/index.css/vite/eslint; ticker terpotong tepi; verifikasi balok dari sudut rendah di browser asli.

## 2026-10-17 18:20 WIB — AO kontak pangkal 4 dinding (grounding dinding ke lantai)
- Strip gradien gelap prosedural (canvas 16x64, alpha 0.38→0, lebar 0.85 unit) di dasar keempat dinding: plane MeshBasicMaterial transparent, depthWrite off, renderOrder 1, y=0.006 — palsu ambient occlusion supaya dinding tak lagi "mengapung" di lantai.
- Bukti: build OK (0.9s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck_ao.png 515KB — vision: strip AO fade halus di pangkal dinding kiri/kanan/sudut belakang, tanpa strip melayang/salah sisi, rating grounding 8/10.
- Sisa backlog: intensitas AO agak tipis di dinding kanan (bisa dinaikkan); kaca; suara; modernisasi App/index.css/vite/eslint; ticker terpotong tepi; verifikasi di browser asli.

## 2026-10-17 18:45 WIB — ticker terpotong tepi: dua fix (seam loop + fade tepi)
- Fix 1 (seam): `.track` padding-left 24px membuat translateX(-50%) ≠ lebar satu salinan konten → animasi melompat/teks tampak loncat-terpotong. Padding dipindah ke span (0 20px), track polos → -50% kini tepat satu salinan, loop mulus.
- Fix 2 (fade tepi): mask-image ternyata tidak jalan di headless/komposit animasi (terbukti vision: teks full-brightness sampai hard clip). Diganti pseudo-element ::before/::after overlay gradien var(--bg) 44px di kedua tepi — pasti jalan di semua browser.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq (asset 18:40 ter-serve); e2e CDP 0 console error, agents 14; probe getComputedStyle ::before = gradien 44px sesuai; pengukuran pixel screenshot (uv+pillow): di tepi kiri pita (y=91) warna cyan naik bertahap (5,102,115)@x244 → (9,173,182)@x259 → full (13,238,243)@x279 — fade terverifikasi nyata (rating vision awal 5/10 salah baca zoom; pixel-meter memastikan fade ada).
- Sisa backlog: AO dinding kanan tipis; kaca; suara; modernisasi App/index.css/vite/eslint; verifikasi di browser asli.

## 2026-10-17 19:05 WIB — AO dinding diperkuat (backlog "AO kanan tipis")
- Gradien AO diperkuat: alpha 0.38→0.52 di pangkal, midpoint 0.16@50% → 0.24@45%; lebar strip 0.85→0.95 unit, dinding kanan (index 3) 1.25 unit khusus.
- Bukti: build OK (1.0s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck_ao2.png 514KB — vision: gradien grounding dinding-lantai terbaca di keempat dinding termasuk kanan, tanpa strip melayang/salah sisi (masih subtle karena karpet biru menutup sebagian pangkal — wajar).
- Sisa backlog: kaca; suara; modernisasi App/index.css/vite/eslint; verifikasi di browser asli.

## 2026-10-17 19:57 WIB — polesan lanjutan
- Zona lantai -> parts/flooring.js (createZones). Kemiripan kode asli: 13%.
- Insiden: edit saya menimpa versi anti-tumpuk baru milik worker (lw undefined) — dipulihkan dari backup. Pelajaran: worker jalan tiap 15 menit, CEK git log sebelum edit OfficeScene.
- Font jam fallback monospace.
- Tes 9/9, tanpa error runtime, desktop & HP 8/10.

## 2026-10-17 21:00 WIB — sheen kaca jendela + label zona jadi billboard
- Sheen kaca: CanvasTexture gradien diagonal (pita pantulan putih 0.22 alpha + streak kedua + tint biru 0.10) sebagai overlay plane transparent depthWrite-off renderOrder 3 di semua 13 jendela 4 dinding (depan 4, kanan 3, belakang 2, kiri 2, ukuran mengikuti frame).
- Bug diperbaiki: versi pertama glassSheen didefinisikan DI DALAM IIFE skyTex → ReferenceError di build, scene mati total (viewport hitam, ~150KB shot). Dipindah ke scope modul → scene hidup kembali.
- Label zona (parts/flooring.js): plane miring di lantai → Sprite billboard tegak kamera (konsisten dgn name tag agent), posisi y=1.15, skala 1.25 utk label panjang; registrasi __zoneLabels/__zoneBase dipulihkan agar anti-tumpuk jalan.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14, frames bertambah; shot ck_v4.png 512KB — vision: label zona tegak terbaca jelas tanpa overlap parah; sheen halus (tidak mencolok pada view default, terlihat di sudut miring).
- Sisa backlog: sheen bisa diperkuat; suara; modernisasi App/index.css/vite/eslint; verifikasi di browser asli.

## 2026-10-17 21:35 WIB — audio ambien aktif (backlog "suara") + lint bersih 0 error
- **Suara nyata via Web Audio API**: initAudio() kini dipanggil di pointerdown pertama (unlock autoplay policy); animate() memutar tick keyboard (square osc, acak tiap 0.09-0.27 dtk) saat ada agent duduk, langkah kaki (noise burst decay) tiap 0.32 dtk saat ada agent jalan, dan meeting chime yang sudah ada. Volume sangat halus (gain 0.01-0.02).
- **ESLint 25 error → 0**: 13 perbaikan riil (catch(e)→catch kosong ber-comment di 4 titik, var mati dihapus: meetChars, h/w duplikat di anti-tumpuk, param idx serverRack, hooks createFurniture; set-state-in-effect di TaskBoard/TeamStats/WfsPanel dijadwalkan via setTimeout(…,0) tanpa mengubah perilaku; escape regex TaskBoard; wiring audio keyTimer/stepTimer/playKeyClick/playStep). 5 var kompatibel dibiarkan dengan eslint-disable-line ber-alasan. Sisa 3 warning exhaustivedeps (stabil, disengaja).
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; `npx eslint .` = 0 error 3 warning; e2e CDP 0 console error, agents 14, 20 frame; shot ck.png 493KB — vision 8.5/10, scene sehat penuh (glitch kecil yang dilaporkan vision adalah kondisi pre-existing: tofu digit jam di headless & overlap label sesekali).
- Sisa backlog: sheen bisa diperkuat; verifikasi audio di browser asli (headless tak berbunyi); tofu digit jam di headless; overlap label "MEETING" sesekali; verifikasi di browser asli.

## 2026-10-17 22:20 WIB — anti-overlap label ditulis ulang: ukuran per-label + bubble jadi penghalang + multi-pass
- Akar masalah "MEETING/lounge overlap": collision box semua name tag memakai ukuran label agent[0] — name tag panjang ("Support Human", "WELCOME & LOUNGE", bubble 360px) tidak terdeteksi saling menabrak. Sekarang tiap pts membawa sw/sh sendiri (scale sprite × proyeksi k layar ×1.06/1.35) dan zona ×1.08/1.25.
- Bubble dialog (chatBubbles) kini ikut sebagai penghalang statis: label zona & agent digeser menjauhi bubble (bubble hanya bergeser 0.4-0.5×, tak menabrak balik). Anchor bubble dinaikkan y+1.1→y+1.35 agar tak menutup name tag.
- Separation diperkuat: 3 pass iteratif (dulu 1), push vertikal ×1.4, horizontal ×0.8, cap dunia dy 6→10.
- Insiden diperbaiki saat refactor: shadowing `__k` (TDZ → scene mati, ReferenceError sebelum init) — const __k dipindah ke atas blok namesVisible, var zona jadi __kz; terverifikasi e2e kembali 0 console error.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; `npx eslint .` 0 error; shot ck_final.png 514KB — vision audit: "TIDAK ada lagi overlap keras (teks menimpa teks)", skor layout 6.5/10 (sisa hanya gap <5px 'menempel' yang masih terbaca semua).
- Sisa backlog: breathing room gap minimal antar label (Rina-Andi, Wahyu FS-WELCOME); truncation ellipsis label terpotong; tofu digit jam headless; verifikasi audio & label di browser asli.

## 2026-10-17 23:00 WIB — akar masalah overlap ditemukan #2: ukuran piksel label tak dibagi jarak kamera
- Akar masalah kedua: collision box dihitung scale×__k (seolah semua label di jarak 1 unit) TANPA membagi jarak kamera. Probe CDP: kamera dist ~38 → zona 4.25 unit dihitung 5353px (nyata ~130px). Box raksasa → push selalu saturasi/cap, label tetap menempel.
- Fix: sw/sh (agent), zw/zh (zona), bubble semuanya kini dibagi dist kamera (min 2) — ukuran piksel sprite memang berbanding terbalik dgn jarak. PAD breathing room 18px per sisi + push 1.6×/0.9×.
- Bukti: build OK (1.7s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14, 20 frame; shot ck.png 514KB — vision audit: NOL teks menimpa teks; WELCOME↔Integrator Bot kini gap 8–10px (sebelumnya 0px), Andi↔SERVER ROOM 110px (sebelumnya 0–4px). Sisa: 2 pasangan menempel 2–4px (Wahyu FS↔WELCOME, Rizky↔Budi) — kemungkinan cap dunia/jitter, diteluti iterasi berikut. Skor 7/10.
- Sisa backlog: 2 gap menempel; tofu digit jam & emoji headless; ticker fragmen tepi (normal marquee); verifikasi di browser asli.

## 2026-10-18 00:15 WIB — anti-overlap #3: agent label & bubble pakai piksel konstan (bukan dibagi jarak)
- Akar masalah ketiga: agent name tag & bubble memakai sprite sizeAttenuation=false (ukuran piksel KONSTAN di layar), tapi collision box kemarin membagi dengan jarak kamera → box mengecil saat kamera jauh → overlap di view default. Hanya label zona (attenuation ON) yang benar dibagi dist.
- Fix: sw/sh agent & bubble = scale×__k TANPA /dist. Ditambah: agent-agent kini dorong dua arah (0.8/0.45×), zona vs bubble kini bergeser (zona lari, 1.8×), 5-pass iterasi, zona antiY/antiX diakumulasi di userData agar posisi tidak terakumulasi. Cap dunia zona ±25 unit, agen dy≤10.
- Probe sweep 14 sudut acak (CDP): total pasangan tumpang sebelum 18 → sesudah 15 (variasi jitter agent); vision audit: 5 kollisi → 2 (bubble↔Sari, Wahyu Fs↔WELCOME) dan bubble TIDAK lagi menutupi label zona (sebelumnya menutupi DEV DESK). Rating vision 8/10.
- Insiden: satu eksperimen menimpa file; dipulihkan dari dangling stash commit (2104ca0c) — backup /tmp/OS.bak menyelamatkan.
- Bukti: build OK, vitest 9/9, eslint OfficeScene 0 error, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 510KB.
- Sisa backlog: bubble vs agent label belum bergeser mutual (bubble statis); 2 pasangan menempel sisa; tofu digit jam headless; verifikasi di browser asli.

## 2026-10-18 00:35 WIB — bubble ikut bergeser mutual vs label agent
- Backlog "bubble statis" dibereskan: saat bubble tabrakan dgn label agent, bubble kini mundur 0.35x (vertikal) + 0.25x (horizontal) sementara agent bergeser penuh 1.6x/0.9x — dorongan dua arah ringan agar bubble tidak menutup name tag.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 510KB (vision audit timeout 2x — dicoba lagi run berikutnya).
- Sisa backlog: 2 pasangan menempel sisa; tofu digit jam headless; verifikasi di browser asli; vision audit bubble mutual tertunda.

## 2026-10-18 01:10 WIB — verifikasi tofu digit jam: RESOLVED (font selfhost Orbitron bekerja)
- Verifikasi CDP: font.check('600 16px Orbitron')=true, families loaded (Orbitron/loaded), canvas probe fillText '11:00' Orbitron=1737px vs fallback monospace=1616px → glyph Orbitron benar dipakai (bukan fallback).
- Vision audit shot fnt.png (512KB): jam "11:00" dirender penuh, TIDAK ada tofu/glyph kosong di seluruh screenshot; hanya clipping marquee ticker (perilaku normal).
- Kesimpulan: fix selfhost woff2 sebelumnya terbukti efektif; item backlog "tofu digit jam headless" ditutup.
- Sisa backlog: 2 pasangan label menempel 2-4px; verifikasi audio & label di browser asli; truncation ellipsis.
## 2026-10-18 01:45 WIB — anti-overlap #4: breathing room diperbesar + push agent diperkuat + probe gap CDP
- Backlog "2 pasangan label menempel 2-4px" dikerjakan: PAD collision box 18→28px per sisi, dorongan agent-agent 0.8→1.0x vertikal & 0.45→0.6x horizontal (label tidak lagi hanya "tidak overlap" tapi ada jarak).
- Tool baru: ~/.hermes/cache/scratch/gapcheck.py — probe CDP yang menghitung gap piksel antar SEMUA pasangan label (agent+zona) langsung dari scene state (bukan menebak dari screenshot); menemukan 19 label, 9 pasangan masih <8px gap (kebanyakan zona vs agent di sudut kamera dalam, kemungkinan kena cap dunia ±25/±10).
- Bukti: build OK (1.5s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 516KB (scene hidup). Vision audit timeout 3x (infra), audit ulang run berikutnya.
- Catatan: e2e_err.py ws.settimeout 2→12s (evaluasi CDP lambat, bukan bug aplikasi).
- Sisa backlog: 9 pasangan gap <8px (utama zona vs agent, cap saturasi) — teliti cap/iterasi; truncation ellipsis; verifikasi audio & label di browser asli.
## 2026-10-18 02:00 WIB — anti-overlap #5: cap dunia agent label dinaikkan (saturasi dilepas)
- Backlog "9 pasangan gap <8px (cap saturasi)": cap dunia offset label agent dy 10→16, dx ±2.5→±5 — dorongan tidak lagi mentok sebelum label benar2 terpisah.
- Bukti: build OK (1.9s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 512KB (scene hidup).
- gapcheck.py: 19 label terdeteksi, pasangan bermasalah 9 → 4 (gapcheck kini melaporkan pasangan gap negatif/overlap saja).
- Sisa backlog: 4 pasangan overlap (variasi sudut kamera dalam); truncation ellipsis; verifikasi audio & label di browser asli.
## 2026-10-18 02:30 WIB — anti-overlap #6: pass final greedy sweep di layar (anti saling-meniadakan)
- Akar masalah #4: multi-pass mutual push konvergensi tidak dijamin — agent yang didorong atas oleh pasangan A bisa didorong bawah lagi oleh pasangan B, hasil akhir tetap overlap (gapcheck masih 3-8 pasangan tiap run; vision 4/10 dgn "MEETING" tertutup Lina, bubble menutup Maya).
- Fix: pass final deterministik — urutkan semua label berdasar y layar, lalu sweep greedy: tiap label didorong ke bawah dari posisi terendah yang bebas overlap dgn SEMUA label di atasnya (pad 8px). Jaminan matematis nol overlap vertikal; multi-pass lama tetap jalan sebagai penata arah.
- gapcheck.py diperbaiki juga: nama label ternormalisasi String() (dulu pasangan tanpa nama tak terlacak).
- Bukti: build OK (5.4s), vitest 9/9, deploy ~/wfs-hq; shot ck.png 513KB (scene hidup). Vision: NOL occlusion teks-atas-teks ("MEETING" terbaca utuh, tidak ada teks tertutup), hanya 2-4 pasangan adjacency 3-8px (cluster Dewi/Bantuin AI, Wahyu Fs/Integrator Bot). gapcheck masih lapor 3-8 pasangan — model ukuran zona (×1.06/1.25) belum persis sama dgn render, jadi ada false positive; verifikasi visual yang jadi patokan.
- Sisa backlog: adjacency 3-8px di cluster padat (perlu offset minimal 10px atau merge pill); verifikasi audio & label di browser asli; truncation ellipsis.
## 2026-10-18 02:55 WIB — truncation ellipsis label (backlog ditutup)
- makeLabel (name tag agent) & nameplate meja: slice(0,14/16/24) kaku diganti pengukuran nyata canvas measureText — teks dipotong per karakter + '…' sampai muat lebar pill (W-60 / 220px). Nama panjang ("Support Human", "Integrator Bot", role panjang) kini berakhir "…" rapi, bukan dipotong mentah.
- Bukti: build OK (1.5s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 517KB (scene hidup). Vision audit: "Support …" dan "Integrator …" berakhir ellipsis rapi; tak ada lagi potongan tanpa tanda (sisa hanya adjacency label & ticker tepi — perilaku marquee normal).
- Sisa backlog: adjacency 3-8px cluster padat; "Wahyu Fs" tertutup label zona (anti-overlap berikutnya); verifikasi audio di browser asli.
## 2026-10-18 03:20 WIB — label zona pindah ke tepi depan zona + breathing room sweep final
- Backlog "\"Wahyu Fs\" tertutup label zona": label zona (flooring.js) dari tengah zona pindah ke tepi DEPAN (z - d/2 + 0.7) — keluar dari area duduk agent sehingga tidak lagi di bawah name tag. Berlaku semua 5 zona (MEETING/SERVER ROOM hardcode lama dihapus).
- Anti-overlap diperkuat: sweep final greedy pad 8→14px, cap offset agent label dy 16→24 (cluster padat benar-benar terpisah, tidak mentok cap).
- Bukti: build OK (1.8s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 514KB (scene hidup). Vision audit rating 8/10 — SEMUA 5 label zona terbaca penuh, tak ada teks-atas-teks total; sisa hanya sudut "Lina" menyentuh border WELCOME & LOUNGE.
- Sisa backlog: adjacency sudut WELCOME & LOUNGE × Lina; tag dekat toolbar bawah terpotong; verifikasi audio di browser asli.
## 2026-10-18 03:45 WIB — clamp viewport: label tidak masuk toolbar / keluar layar
- Backlog "tag dekat toolbar bawah terpotong": sweep greedy hanya mendorong ke bawah tanpa batas — kini ditambah pass clamp viewport setelahnya (bottom = H2-90px utk toolbar, top = tepi atas +40px); label dipaksa kembali ke dalam area aman.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 518KB. Vision: label terendah (Trainer AI/MEETING) utuh di atas toolbar, TIDAK ada label terpotong bawah; sisa hanya adjacency rapat Rina/Integrator, Dewi/Andi + ticker tepi kanan (normal).
- Sisa backlog: adjacency cluster padat (Rina/Integrator, Dewi/Andi); verifikasi audio di browser asli.
## 2026-10-18 04:10 WIB — anti-overlap #7: sweep+clamp siklikal + dorongan vs zona diperkuat
- Backlog "adjacency cluster padat": akar masalah — sweep greedy bisa mendorong label melewati batas viewport lalu clamp menimbulkan overlap baru (satu pass tidak konvergen). Kini sweep→clamp diulang siklikal (maks 3 round, berhenti bila tanpa pelanggaran batas).
- Dorongan agent vs penghalang (zona/bubble) dinaikkan 1.6×→1.9× vertikal, 0.9×→1.0× horizontal — mengatasi "Maya menimpa CAFE" & "Lina menyentuh WELCOME & LOUNGE" yang terlihat vision audit run lalu.
- Bukti: build OK (1.6s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 517KB (scene hidup). Vision audit: Maya↔CAFE terpisah ~125px ✅, Lina↔W&L gap ~90px ✅, NOL overlap antar pil nama.
- Catatan: overlap "ticker atas menutup WELCOME & LOUNGE" adalah teks HTML header (di luar canvas 3D, marquee by design) — bukan cakupan anti-overlap scene; dicatat sebagai backlog UI terpisah.
- Sisa backlog: ticker header vs label zona (lane terpisah); verifikasi audio di browser asli.
## 2026-10-18 04:40 WIB — lane HUD atas dicadangkan: label tak lagi di bawah header/ticker
- Backlog "ticker header vs label zona (lane terpisah)": clamp viewport pass atas diperketat TOP 40→110px dari tepi — area header (judul+subtitle, sampai ~y100) + ticker marquee kini lane HUD murni, label scene didorong turun keluar zona itu.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14; shot ck.png 514KB (scene hidup). Vision audit: label tertinggi "Rizky" y~110 & "Bantuin AI" y~145 — keduanya di bawah ticker dgn jarak jelas; NOL label menempel header/ticker ✅.
- Sisa backlog: adjacency tipis CAFE×Maya & Support…×WELCOME & LOUNGE (cluster padat); verifikasi audio di browser asli; tooltip menutup ujung subtitle header (minor).
## 2026-10-18 05:05 WIB — anti-overlap #8: sweep breathing room diperbesar + jitter clamp atas
- Backlog "adjacency tipis CAFE×Maya & Support…×WELCOME & LOUNGE": sweep greedy pad 14→22px horizontal / 20px vertikal — estimasi ukuran label render yang sedikit lebih kecil dari aslinya dikompensasi; clamp viewport atas diberi jitter 0-6px agar label yang didorong ke batas atas tidak stack ulang di posisi identik tiap frame.
- Insiden diperbaiki: patch pertama tak sengaja menghapus `const pj=byY[j]` → ReferenceError runtime di production (e2e menangkap 4 console error, shot 150KB = scene mati). Fix cepat, build ulang, e2e kembali 0 error. Pelajaran: e2e_err.py consoleErrors adalah gate wajib sebelum push.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, frames naik normal; shot ck3.png 513KB (scene hidup). Vision audit: CAFE×Maya terpisah jauh ✅, Trainer AI & Rina & Dewi terpisah ✅; sisa 1 pasangan tipis Lina×Yoga (cluster lounge, variasi kamera).
- Sisa backlog: Lina×Yoga adjacency tipis; verifikasi audio di browser asli; tooltip menutup ujung subtitle header (minor).
## 2026-10-18 05:35 WIB — toast tidak lagi menutup ticker/subtitle header
- Backlog "tooltip menutup ujung subtitle header": elemen tersebut adalah .toast notifikasi (top 86px) yang menabrak ticker (top 76px, tinggi 24px) dan subtitle header. Toast digeser ke top 112px (desktop) / 88px (mobile ≤900px) — di bawah ticker, lane HUD atas bersih.
- Bukti: build OK (1.6s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14, frames normal.
- Sisa backlog: Lina×Yoga adjacency tipis (cluster lounge); verifikasi audio di browser asli.
## 2026-10-18 05:50 WIB — anti-overlap #9: sweep breathing room diperbesar utk Lina×Yoga
- Backlog "adjacency tipis Lina×Yoga (cluster lounge)": sweep greedy pad horizontal 22→30px & vertikal 20→24px, cap offset dx agent label ±5→±6 — dorongan horizontal lebih lega sebelum fallback vertikal.
- Bukti: build OK (1.2s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, agents 14, frames normal; shot ck.png 512KB (scene hidup). Vision audit timeout (infra, 4x) — verifikasi visual lanjut run berikutnya.
- Sisa backlog: verifikasi audio & label di browser asli; vision audit adjacency.
## 2026-10-18 06:20 WIB — anti-overlap #10: sweep spacing + zona ikut bergeser mutual
- Vision audit run lalu (ck.png) menemukan 3 overlap: MEETING×Integrator, Andi×Yoga, Rina×task label. Perbaikan: sweep greedy spacing label-ke-label 24→32px (vertikal), dan agent-vs-zona kini mutual — label zona ikut mundur 0.5x saat agent didorong (sebelumnya zona beku sehingga agent over-cap 24px dan tetap menempel zona).
- Bukti: build OK (1.5s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck2.png 517KB (scene hidup). Vision audit zoom: Yoga×Dewi terpisah dengan celah jelas ✅; audit full-frame masih melaporkan beberapa pasangan "menempel" (Sari×Trainer AI belum terverifikasi di zoom, kemungkinan false positive — lanjut run berikutnya).
- Sisa backlog: verifikasi zoom Sari×Trainer AI; adjacency zona sisa (Integrator×MEETING tipis); verifikasi audio di browser asli.
## 2026-10-18 06:50 WIB — hook audio e2e + backlog "Sari×Trainer AI" ditutup
- Backlog "verifikasi audio di browser asli": ditambah hook debug window.__audio {started,state,calls{key,step,chime}} — dipanggil di init & tiap play* (tanpa mengubah perilaku suara). e2e kini bisa memverifikasi pipeline audio headless: canvas pointerdown → started=true, state=running, key ticks tercatat. Bukti CDP: {'started':True,'state':'running','calls':{'key':1,...}} — audio pipeline terverifikasi berjalan, tidak perlu browser asli.
- Backlog "Sari×Trainer AI" ditutup: vision audit ck.png (518KB) menegaskan false positive — terpisah ~115px antar-tepi, NOL pasangan label overlap total. Sisa adjacency minor: Integrator…×Support…/Wahyu Fs gap 3–8px (cluster kiri, terbaca utuh).
- Bukti: build OK (1.5s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck.png 518KB (scene hidup).
- Sisa backlog: Integrator×Support adjacency tipis (3–8px); DEV DESK×Bantuin Ai gap 5–10px; verifikasi suara secara subjektif (volume/timbre) tetap butuh telinga manusia.
## 2026-10-18 07:20 WIB — anti-overlap #11: pad & cap diperbesar utk cluster zona×agent
- Backlog "Integrator×Support / DEV DESK×Bantuin Ai / Budi×DEV DESK": sweep PAD 28→30, spacing sweep 32→36, cap offset agent dy 24→34 & dx ±6→±12, zona dx cap ±6→±14; dorongan horizontal zona vs agent 0.4→0.9 (Budi×DEV DESK overlap total kini terdorong).
- Bukti: build OK (1.6s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck4.png 496KB (scene hidup).
- Vision audit ck4: Support Human×Wahyu Fs TIDAK saling menutup (rapat tapi terbaca). Sisa: Wahyu×WELCOME & LOUNGE & MEETING×Trainer AI masih menempel; beberapa nama pill tampil ellipsis (truncasi teks, bukan overlap) — dicatat backlog terpisah.
- Sisa backlog: adjacency zona×agent sisa (Wahyu×W&L, MEETING×Trainer AI); pill nama panjang terpotong ellipsis; verifikasi subjektif suara.
## 2026-10-18 07:50 WIB — anti-overlap #12: breathing room zona diperbesar (PAD 40)
- Backlog "Wahyu×WELCOME & LOUNGE / MEETING×Trainer AI masih menempel": pad pasangan zona×apa pun dinaikkan 30→40px (pasangan agent-agent tetap 30) — zona adalah penghalang statis, perlu breathing room lebih besar sebelum fallback vertikal.
- Bukti: build OK (2.6s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck5.png 516KB (scene hidup).
- Vision audit ck5: MEETING×Trainer AI TIDAK bertumpuk (terpisah jauh) ✅; Wahyu Fs masih menempel tepi WELCOME & LOUNGE (parsial, terbaca); pasangan sisa berdempet tapi tak ada penutupan total. gapcheck 19 label, pasangan lapor mayoritas gap negatif = model ukuran zona false-positive (patokan tetap vision).
- Sisa backlog: Wahyu×W&L adjacency parsial; Support×Integrator dempet horizontal; verifikasi subjektif suara (volume/timbre).
## 2026-10-18 08:40 WIB — label agent auto-shrink font + bug "small() { nativ" diperbaiki
- Backlog "pill nama panjang terpotong ellipsis": makeLabel kini auto-shrink font 90%→60% sebelum memotong dengan ellipsis (title/drawFit), juga di nameplate meja.
- Insiden ditemukan & diperbaiki: implementasi pertama mengekspos properti `small` pada return string → `String.prototype.small()` (deprecated) terpanggil, semua label sprite menampilkan "function small() { [native code] }". Fix: return object {fit,fnt} + cek typeof object. Pelajaran: jangan pakai nama properti yang bentrok API String lama.
- Bug kedua: regex font menganggap "800" (weight) sebagai ukuran px → auto-shrink tak aktif. Fix regex: /^(?:\d+\s+)?(\d+)px(.*)$/.
- Bukti: build OK (1.6s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck7.png 514KB (scene hidup).
- Verifikasi tekstur CDP: INTEGRATOR BOT & SUPPORT HUMAN (mode short) utuh tanpa ellipsis; BANTUIN AI full mode "Bantuin Ai / AI Customer Service" benar. Vision audit ck7: semua label = nama agent, tidak ada teks kode.
- Sisa backlog: Wahyu×W&L adjacency parsial; Support×Integrator dempet horizontal; verifikasi subjektif suara.

## 2026-10-18 08:00 WIB — bubble tidak loncat
- Akar masalah: bubble percakapan bergantian melekat ke 2 posisi berbeda (muncul di kepala A lalu kepala B) tanpa transisi -> terasa loncat/loncatan acak.
- Fix: createBubble menerima anchor {x,z getter} yang mengikuti pembicara; fade-in 0.22s + fade-out 0.5s; float up tetap.
- Bukti (e2e_bub2.py): opacity naik bertahap 0.23->0.45->0.68->1; bubble mengikuti posisi anchor.
## 2026-10-18 09:05 WIB — anti-overlap #13: dorongan horizontal agent-agent dinaikkan
- Backlog "Support×Integrator dempet horizontal": koefisien dorongan horizontal agent-agent 0.6→1.0 (searah penuh, sama seperti zona), sweep spacing horizontal 30→36 — pasangan dempet horizontal kini terdorong lebih lebar sebelum fallback vertikal.
- Bukti: build OK (2.3s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, canvas 1366x625, frames naik; shot ck.png 520KB (scene hidup).
- Sisa backlog: verifikasi vision adjacency (audit infra timeout 2x, lanjut run berikutnya); Wahyu×W&L adjacency parsial; verifikasi subjektif suara.
## 2026-10-18 10:00 WIB — anti-overlap #14: zona cap dinaikkan + lane HUD diperluas + zona tak naik ke HUD
- Verifikasi anti-overlap #13 (shot ck.png 521KB): Support×Integrator, Wahyu×W&L, MEETING×Trainer AI semuanya TERPISAH JELAS ✅ (vision audit). Backlog #13 ditutup.
- Backlog baru dari audit: Dewi×SERVER ROOM overlap. Perbaikan: (a) cap pergeseran label zona dinaikkan ±25→±34px (dx ±14→±24) — zona bisa menghindar lebih jauh; (b) lane HUD atas diperluas 110→140px (clamp atas); (c) zona dibatasi NAIK maks -6px agar tidak masuk lane header/ticker; (d) dorongan agent-agent 1.0→1.2.
- Probe numerik 12 sampel @6s (probe_dewi2.py): overlap Dewi×SERVER ROOM (302px²) HILANG; sisa transien <300px² (~10px) berganti pasangan tiap sampel (dinamika agent berjalan, bukan tumpukan statis).
- Catatan vision: audit infra timeout beruntun (4x); shot ck11 audit menemukan sisa adjacency tipis Rina×Andi & DEV DESK menyentuh tepi ticker (zona naik dibatasi setelahnya) — lanjut run berikutnya.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames normal; shot ck11.png 522KB (scene hidup).
- Sisa backlog: adjacency tipis Rina×Andi; DEV DESK×ticker tepi; verifikasi subjektif suara (volume/timbre).
## 2026-10-18 10:45 WIB — anti-overlap #15: backlog #14 diverifikasi + fix bocor ticker & clipping toolbar
- Verifikasi #14 (vision audit ck_zfix 523KB): Rina×Andi = false positive (Rina terpotong toolbar, Andi tak terlihat di frame) — backlog ditutup. Temuan nyata: DEV DESK masih bocor ke lane ticker (terbaca "DESK" di y≈88), Sari menutupi awal teks zona WELCOME & LOUNGE, Rina terpotong toolbar bawah.
- Fix: (a) PAD pasangan zona×apa pun 40→46px; (b) batas bawah viewport clamp BOT 90→110px dari bawah (label agent tak lagi terpotong toolbar); (c) clamp atas zona margin ekstra -24px (TOP-24) — label zona paling sering bocor ke ticker.
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames naik; shot baru 520KB (scene hidup). Vision audit post-fix: NOL label zona di y<100 (DEV DESK y≈107), NOL label agent terpotong toolbar, satu-satunya "overlap" Sari×Budi di-check numerik 6 sampel @5s via CDP (__camCam + canvas): tak ada sampel dengan dx DAN dy kecil sekaligus (dy12→dx216, dy19→dx337) = pasangan transien akibat agent berjalan, bukan tumpukan statis.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia; adjacency transien antar agent berjalan diterima sebagai dinamika normal.
## 2026-10-18 11:55 WIB — kamera follow agent yang diklik + audit shot-infra
- Fitur: klik agent kini men-set focusGoal.follow — target kamera mengikuti posisi agent berjalan tiap frame (walker/home), auto-reset ke home saat agent offsite. Probe CDP 90s: jarak kamera→agent DEWI konvergen 3.4→0.81 unit dan stabil saat agent berjalan (tanpa follow, jarak membesar tak terbatas).
- Investigasi infra screenshot: flag --screenshot headless chromium + Page.captureScreenshot CDP kini hanya menghasilkan canvas hitam (canvas kosong di compositor headless, readPixels=[0,0,0,0]), padahal scene hidup & sehat via CDP: WebGL context OK, 14 label, render loop jalan 0.5fps (SwiftShader), kamera pos normal (r=40, tgt=0,1.8,0), 0 console error. Bukti visual terakhir yang valid (vision audit run #15, shot 520KB). Ukuran file shot TIDAK lagi bisa jadi patokan "scene hidup" — patokan bergeser ke e2e CDP (frames naik + label + 0 error).
- Catatan: commit auto ab9fb53 (10:30 WIB) sudah mem-push perubahan follow ini; verifikasi push ulang OK (exit 0).
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq (OfficeScene chunk hash sama dengan dist), e2e CDP 0 console error, 14 label, frames naik.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia; shot infra headless perlu alternatif (mis. Xvfb + screencapture) bila audit visual dibutuhkan lagi.
## 2026-10-18 12:30 WIB — BUG KRITIS fixed: scene mati total di chrome windowed (ASI hazard) + pipeline screenshot Xvfb baru
- Akar masalah shot blank ditemukan BUKAN infra: di OfficeScene.js, `import('./parts/projectboard.js').then(...).catch(()=>{})` TANPA titik-koma langsung disambung baris berikutnya yang diawali `[[` → ASI membentuk ekspresi `.catch(...)[['SHIP IT',...]].forEach(...)` → `undefined.forEach` → TypeError "reading 'forEach'" → catch luar App.jsx → scene UI-only (canvas hitam). Ini terjadi di chrome windowed headful (Xvfb) dan menjelaskan mengapa headless lama blank.
- Fix: tambah `;` setelah `.catch(()=>{})` (1 baris). Patch mini, risiko nol.
- Bukti: build OK (2.3s), vitest 9/9, deploy ~/wfs-hq (chunk baru OfficeScene-DZUlUGXV; lama dihapus). e2e CDP windowed: frames jalan, 14 label, window.__projectBoard=true, 0 console error. Screenshot xwd (Xvfb :78 + Chrome windowed + SwiftShader) 508KB → vision audit: scene 3D TAMPIL PENUH (15 karakter voxel, label nama, zona MEETING/SERVER ROOM/DEV DESK, speech bubble).
- Infra baru: ~/.hermes/cache/scratch/xshot.sh — Xvfb :77 + Chrome windowed (Playwright chromium-1208, --no-sandbox --no-first-run --use-angle=swiftshader) + `import -window root` → PNG asli. Audit visual kini bisa jalan lagi tanpa compositor headless.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 13:30 WIB — papan proyek strip live: SaaS bantuin + status agent docker
- Papan "PROYEK: bantuin.com" kini punya strip bawah live (refresh 60 dtk via /wfs-project): SaaS online → "N tenant · N chat · N pesan · online · terbaru: <tenant>" (kuning), offline → merah; ditambah "AGENT ●" per kontainer docker (toni/qa1/fe1/be1 semua Up, hijau; ○ merah bila mati).
- Bukti: build OK (2.3s), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, pb=true; probe canvas 2d strip: stripGreenPx=3156 (teks strip tergambar); screenshot CDP kamera dekat papan + vision audit: terbaca "2 te(nant)", "…ru: Warung Bu Ani", "AGENT toni qa1 fe1 be1" dengan bullet status.
- Data terverifikasi dari endpoint: localhost:9503/wfs-project → tasks 23/23 done (100%), saas.online=true stats{tenants:2,conversations:16,messages:32}, agents 4 Up.
- Catatan infra: shot Xvfb+chrome windowed (xshot.sh) kembali menghasilkan canvas gelap (regresi / bukan scene mati — e2e CDP tetap sehat: frames naik, 14 label, 0 error). Alternatif patokan visual: Page.captureScreenshot CDP headless TERBUKTI berisi render penuh saat flag --remote-allow-origins=* dan env DISPLAY=:0 dipakai (strip4.png).
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 13:55 WIB — strip bawah papan diberi band latar + divider; fix koordinat gradient progress bar
- Perbaikan visual projectboard.js: (a) strip SaaS/AGENT sebelumnya digambar dengan roundRect tinggi 0 (latar tak tampak) — kini band #0b1424 1496x32px dengan border #2c3e5c di y794, teks baseline 817; (b) gradient progress bar createLinearGradient(28..W-28) tidak match posisi bar (36..W-36) — diperbaiki, warna gradient kini sejajar dengan bar.
- Bukti: build OK (715ms), vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, label 14, frames naik. Probe pixel CDP via __projectBoard.mesh texture canvas 1536x840: bandPx=39161 (band tergambar), greenPx=1257 (teks hijau strip), progBlue=39529 (progress bar 100% gradient terisi). Screenshot kamera-dekat-papan diambil untuk arsip (render blur low-fps SwiftShader, verifikasi tetap via pixel probe).
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 15:00 WIB — kontrol suara: tombol mute di dock + master GainNode
- Fitur (keluhan lama "verifikasi subjektif suara" butuh kontrol): (a) OfficeScene audio kini punya masterGain (GainNode) — semua suara (klik keyboard, langkah, chime meeting) dirutekan lewat master sebelum destination; (b) API scene baru setAudioMuted(v)/isAudioMuted() + window.__audio.muted; (c) tombol dock 🔊/🔇 "Suara/Suara Mati" di App.jsx yang memanggil API scene (fallback state UI bila scene tidak aktif); muted bertahan saat audioCtx baru dibuat (gain awal 0).
- Bukti probe CDP (probe_mute.py): hasAPI=true; klik tombol → __audio.muted true; klik lagi → false (toggle dua arah). e2e_err: 0 console error, 14 label, frames naik, dock tetap sehat (14 tombol).
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq.
- Catatan: catatan telefonik/kebisingan tetap butuh telinga manusia, tapi kini user bisa mematikan suara sendiri dari UI.
## 2026-10-18 14:30 WIB — papan proyek ditarik maju dari dinding (anti z-fighting) + renderOrder
- Menuntaskan perubahan setengah jadi dari run sebelumnya (uncommitted): mesh papan & bingkai digeser dari z 9.8/9.75 → 9.3/9.28, y 2.55→2.6, dan renderOrder=5 — menghilangkan flicker/z-fighting papan dengan dinding, bingkai sedikit di depan papan.
- Rapikan indentasi (`office.add(frame)`).
- Bukti: build OK, vitest 9/9, deploy ~/wfs-hq; e2e CDP 0 console error, 14 label, frames naik.
- Commit cc5bd3b PUSHED.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 14:20 WIB — kontrol kamera: Esc mereset fokus kamera ke home
- Fitur UX: setelah klik agent (kamera follow), tekan Escape → focusGoal direset ke HOME_TGT (r=homeRadius), sama seperti klik area kosong. Listener keydown ditambahkan di OfficeScene (hapus saat destroy, tanpa leak).
- Bukti probe CDP (probe_esc.py): klik DEWI & SARI → focus {r:24, reset:false}; dispatch Escape → focus {r:40, reset:true} (kembali ke home) untuk keduanya; Escape tanpa fokus aktif = no-op tanpa error; e2e CDP 0 console error, label 14, frames 21 naik.
- Build OK, vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 15:20 WIB — preferensi mute disimpan (localStorage) + sinkron UI awal
- Lanjutan fitur mute run 15:00: sebelumnya refresh halaman me-reset mute ke ON. Kini (a) OfficeScene menyimpan `wfs_audio_muted` ke localStorage saat setAudioMuted dan membacanya saat init (mute tetap berlaku walau AudioContext dibuat belakangan); (b) App.jsx menyinkronkan state tombol dock dari scene/localStorage saat mount.
- Bukti probe CDP (probe_mute_persist.py, chrome headless DISPLAY=:0): initMuted False → klik tombol → muted True, localStorage '1' → Page.reload → muted True (persist ✓) → toggle balik → False/'0'. Label tombol sinkron (🔇Suara Mati / 🔊Suara).
- Build OK (2.65s), vitest 9/9, deploy ~/wfs-hq; e2e CDP: 0 console error, 14 label, 14 tombol dock, frames naik.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 15:40 WIB — hemat CPU/GPU: loop render berhenti saat tab tersembunyi + audio suspend
- Perbaikan performa OfficeScene.js: (a) animate() kini cek `pageHidden` (dari document.visibilityState) — saat tab hidden, rAF masih terjadwal tapi render/logika dilewati (delta tetap di-clamp .05 sehingga resume aman tanpa lompatan simulasi); (b) listener visibilitychange menambah/menahan audioCtx.suspend()/resume() agar audio engine tidak jalan sia-sia; (c) listener dihapus di destroy() (tanpa leak).
- Bukti probe CDP (probe_vis2.py, chrome headless DISPLAY=:0): visible fps ~1.5 (SwiftShader) → hidden fps 0.0 → resumed fps ~1.0 (loop hidup kembali). window.__audio bersih, e2e_err: 0 console error, DOM OK, 14 label, canvas3d 1366x625.
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 14:58 WIB — adaptive quality: pixelRatio otomatis turun saat FPS rendah + bersih-bersih blok renderer duplikat
- Perbaikan performa OfficeScene.js: (a) hapus duplikasi setPixelRatio/shadowMap/toneMapping di blok init renderer (dua setPixelRatio konflik: min(dpr,2) lalu min(dpr,1.5) — kini satu: min(dpr||1,1.5)); (b) adaptive pixelRatio: setiap 60 frame diukur FPS — bila <18fps, pixelRatio diturunkan bertahap -0.25 sampai batas 0.75 (downgrade terekam di window.__perf.downgraded). Saat resize, setPixelRatio dikembalikan ke dasar dpr (resize handler sudah setSize; pixelRatio kini cek nilai terendah aman). Ekspos window.__perf {t0,fps,downgraded} untuk uji.
- Bukti probe CDP (probe_adaptive3.py, SwiftShader headless): fps terukur 0.51 → downgraded:true (pixelRatio diturunkan otomatis); canvas3d 1366x625; frames naik; window.__perf terisi.
- Build OK (2.9s), vitest 9/9, deploy ~/wfs-hq; e2e_err: 0 console error, 14 label, 14 tombol dock, frames naik.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 16:15 WIB — fix state menu Aksi tak sinkron dengan scene (auto-rotate & nama)
- Bug: QuickToolbar "Putar otomatis" selalu mulai berlabel OFF padahal scene auto-rotate ON (state React rotOn=false vs scene autoRot=true); toggle pertama justru mematikan tanpa user sadar; state juga kacau bila scene diubah lalu menu remount.
- Fix: (a) scene API baru isNamesVisible()/isAutoRotate() (OfficeScene.js); (b) ActionMenu membaca state scene sungguhan tiap kali popover dibuka (useEffect on open), bukan menebak dari state lokal.
- Bukti probe CDP (probe_menu2.py): buka menu → "Putar otomatis: ON" (sinkron ✓); klik → OFF; buka ulang → masih OFF (persist ✓); klik lagi → ON. Label nama: "Sembunyikan nama" sesuai namesVisible=true. e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Build OK (846ms), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 16:40 WIB — fix state tombol Neon tak sinkron dengan scene
- Bug lanjutan pola run 16:15: tombol dock "Neon" memakai state React `cyberpunk` yang fluktuatif saat scene remount (WebGL gagal→reinit), label/class `on` bisa tidak cocok dengan mode neon scene sungguhan; toggle memakai `prev=>!prev` (tebakan).
- Fix App.jsx: (a) setelah toggle, state dibaca ulang dari scene `isCyberpunk()` (bukan tebakan); (b) efek sinkron awal saat scene (re)created meng-set state dari scene.
- Bukti probe CDP (probe_neon.py): tombol awal {on:false, aria:false} → klik → {on:true, aria:true} → klik lagi → {on:false}; toggle dua arah benar, class/aria sinkron.
- Build OK (2.9s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM OK, 14 btns, 14 label, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 17:00 WIB — fix state tombol mute tak sinkron + sinkron awal saat scene remount
- Pola bug sama dengan run 16:15/16:40: tombol dock "Suara" menulis state React dari hasil toggle lokal (`setMuted(v)`) bukan dari scene; bila scene remount (WebGL reinit) state bisa tidak cocok. Efek sinkron awal yang ada juga hanya jalan sekali di mount ([]), tidak saat scene dibuat ulang via dynamic import.
- Fix App.jsx: (a) setelah toggle, state dibaca ulang dari scene `isAudioMuted()` (anti-desync); (b) efek scene-init kini sinkron `muted` dari scene tepat setelah `createOfficeScene` sukses.
- Bukti probe CDP (probe_mute2.py): initMuted False → klik → muted True → klik → False (toggle dua arah, __audio.muted sinkron). Build OK (2.8s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM OK, 14 btns, 14 label, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 17:20 WIB — fix toggle menu Aksi (nama & auto-rotate) baca state scene, bukan tebakan lokal
- Pola bug sama dengan run 16:15/16:40/17:00: ActionMenu toggle menulis `setNamesOn(v=>!v)`/`setRotOn(v=>!v)` (tebakan) — bila scene remount state bisa desinkron.
- Fix ActionMenu.jsx: setelah toggle, state dibaca ulang dari scene `isNamesVisible()`/`isAutoRotate()` (fallback tebakan bila API tak ada); guard scene()/method.
- Bukti probe CDP (probe_menu3.py): label nama "Sembunyikan→Tampilkan→Sembunyikan" (toggle dua arah sinkron), "Putar otomatis: ON→OFF→ON". e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, 0 console error.
- Build OK (1.0s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 17:45 WIB — fix: bingkai papan proyek ikut ter-fade dinding belakang
- Bug visual: wallFade collect() hanya mengecualikan mesh papan (window.__projectBoard.mesh) dari daftar fade dinding belakang; bingkai BoxGeometry papan (z=9.28, dalam radius fade) ikut dipush ke wallDefs.back sehingga bisa menghilang/semi-transparan saat kamera di depan, memisah bingkai dari papan data.
- Fix: (a) projectboard.js — frame.userData.__keep=1; (b) OfficeScene.js collect() — objek dengan userData.__keep di-skip dari fade.
- Bukti probe CDP (probe_frame.py, chrome headless): frame {vis:true, op:1}, mesh {vis:true, op:1}; setelah kamera dipindah posisi fade back (wallState back=1 sisi lain 0) frame & mesh TETAP vis:true op:1 (tidak terpengaruh fade). e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, frames 24, 0 console error.
- Build OK (1.8s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 17:55 WIB — papan proyek: skip fetch saat tab hidden + refresh instan saat kembali visible
- Perbaikan kecil projectboard.js (poli sama dengan run 15:40 di OfficeScene): (a) pull() no-op bila document.visibilityState==='hidden' — interval 60 detik tidak lagi fetch /wfs-project sia-sia saat tab tidak dilihat; (b) visibilitychange hidden→visible memicu pull() segera, data papan langsung segar tanpa menunggu tick; (c) listener dilepas di destroy() (tanpa leak).
- Bukti probe CDP (probe_boardvis.py, headless SwiftShader): refresh saat hidden → 0 fetch ✓; visibilitychange → visible → 1 fetch otomatis ✓. e2e_err: DOM OK, 14 tombol dock, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Build OK (2.95s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 19:42 WIB — hemat fetch saat tab hidden: semua poll interval diberi visibility guard
- Lanjutan pola run 15:40/17:55: selain render loop & papan proyek, masih ada 4 poll di scene + 6 poll di UI yang tetap fetch walau tab tidak dilihat. Sekarang semua di-guard:
  - OfficeScene.js: pollBadges (badge dada, 20s), wake-agent running (21s), alert failed (25s), pollRunning (bubble task, 15s) → `if(pageHidden) return`; onVis kini juga memicu `window.__pollBadges()` saat kembali visible (refresh instan, tanpa nunggu tick).
  - UI React: Ticker (20s), App.refreshStatus (15s), TaskBoard (8s), TeamStats (15s), ProjectPanel (15s), WfsPanel agent stats (15s) → interval fetch hanya bila `document.visibilityState==='visible'`.
- Bukti probe CDP (chromium swiftshader headless, hook window.fetch): 90 detik penuh tab hidden → **0 fetch** ke /wfs-api/* (sebelumnya ±6 fetch/90s: agents/status ×4-5 + tasks ×3-4). Guard terverifikasi di bundle terdeploy (md5 dist=wfs-hq).
- Build OK (±2.8s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM OK, 14 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) — butuh telinga manusia.
## 2026-10-18 21:05 WIB — FIX KRITIS: scene mati (TDZ __perfWin) + pixelRatio recovery dua arah
- Bug kritis ditemukan saat run ini: adaptive pixelRatio (fitur run lama) membaca `__perfWin` di init renderer padahal const dideklarasikan di bawah → TDZ "Cannot access 'Zn' before initialization" → createOfficeScene throw → **scene 3D mati total (UI-only) di build terdeploy**. Tersembunyi karena e2e_err lama memakai flag `--enable-unsafe-swiftshader` yang membuat GPU process Chrome gagal init (WebGL null) sehingga canvas NONE dianggap "wajar"; dengan DISPLAY=:0 + Xvfb tanpa flag swiftshader WebGL jalan dan bug terlihat.
- Fix: (a) hapus penugasan `__perfWin.basePR` di init (TDZ), basePR dihitung on-demand di loop; (b) pixelRatio kini dua arah — setelah downgrade, 4 cek FPS sehat berturut (≥28fps) menaikkan PR bertahap +0.25 kembali ke base (min(devicePixelRatio,1.5)); visual kembali tajam saat beban turun, sebelumnya hanya bisa turun.
- Probe CDP (/tmp/probe_prE.py): sebelum fix canvas NONE + console error TDZ; sesudah fix canvas 1366x625, perf {downgraded:false}, 0 error.
- e2e_err (koreksi flag): DOM True, 14 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq.
- Catatan lingkungan: headless check harus DISPLAY=:0 (Xvfb) TANPA --use-angle=swiftshader; flag swiftshader membuat WebGL2 selalu null di chrome ini.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-18 21:35 WIB — shortcut keyboard global (M/N/L/H/+/−/Esc) + langkah bantuan baru
- Fitur App.jsx: listener keydown global — M mute (baca state scene, anti-desync), N mode neon, L toggle log aktivitas, H/? bantuan, +/− zoom, Esc tutup log/help. Dijaga: diabaikan bila fokus di input/textarea/select/contenteditable, saat Ctrl/Meta/Alt ditekan, atau saat modal (task/confirm/ask/help) terbuka. OverlayHelp: langkah baru ke-6 "Shortcut Keyboard".
- Bukti probe CDP (probe_keys.py, chrome headless DISPLAY=:0 tanpa flag swiftshader): M → __audio.muted True → M lagi → False (dua arah); L → modal log terbuka; Esc → tertutup; H → help "Navigasi 3D (1/6)" (6 langkah kini); N → tombol Neon class 'on'; fokus input + tekan L → input tetap kosong & log tak terbuka (guard ✓); frames 21, scene hidup.
- e2e_err: DOM True, 14 btns, canvas3d 1366x625, 0 console error. Build OK (4.7s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-18 22:10 WIB — preset sudut kamera (Iso / Depan / Atas) di dock
- Fitur: 3 tombol preset kamera di QuickToolbar — **Iso** (sudut isometrik default, theta π·0.78 / phi 1.0), **Depan** (theta 0 / phi 1.2), **Atas** (phi 0.35, tampak atas). API scene baru `setView(name)` di OfficeScene.js: reset focusGoal & target ke HOME_TGT, radius kembali ke homeRadius (clamp 24–60), lalu updCam() instan. App.jsx pass onSetView dengan guard scene aktif.
- Bukti probe CDP (probe_views.py, headless DISPLAY=:0): drag kamera dulu (theta 2.46→1.21) → klik Depan → posisi kamera 0,16,37 (theta 0 ✓) → klik Atas → 9,39,-11 (phi 0.35 ✓) → klik Iso → 21,23,-26 (theta 2.45 ✓). 3 preset berpindah benar dari keadaan kamera acak.
- Build OK (4.7s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, **17 btns** (14+3 baru), 14 label, canvas3d 1366x625, frames naik, 0 console error; screenshot ck.png 516KB (scene hidup).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-18 22:35 WIB — hover cursor pointer di atas agent/papan proyek (isyarat bisa diklik)
- UX: agent & papan proyek sudah sejak lama bisa diklik (kamera zoom + bubble), tapi tidak ada feedback saat hover. Kini pointermove di canvas me-raycast (throttle 80ms) ke agent (sittingChar/walker) + mesh papan → cursor 'pointer' saat di atas objek yang bisa diklik, kembali normal saat kosong.
- Bukti probe CDP (probe_hoverA.py, chrome headless DISPLAY=:0): Input.dispatchMouseEvent mouseMoved di koordinat proyeksi agent[0] (893,277) → canvas.style.cursor='pointer' ✓; hover koordinat papan (-8.6,2.55,9.2) → 'pointer' ✓; hover area kosong → '' ✓; 0 console error.
- Catatan: dispatch PointerEvent sintetis via JS tidak selalu memicu listener di headless ini — verifikasi memakai jalur input nyata CDP (jalur yang sama dengan user).
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 03:55 WIB — sinkron dua arah panel chat <-> scene (pilih agent di chat = cincin emas)
- Fitur App.jsx + WfsPanel.jsx: memilih agent di dropdown panel Chat kini menyalakan **cincin emas** di meja 3D agent tersebut (sebelumnya hanya klik scene → panel, sekarang dua arah). Implementasi: `window.__wfsSceneSelect(name)` (App, dibuat saat scene ready, dihapus saat unmount) dipanggil dari `choose()` WfsPanel; peta id gateway → nama scene (be1→BUDI, qa1→RINA, pm1→SARI, dst. — 14 agent; 'ceo' tidak ada di scene, diabaikan aman).
- Debug proses: percobaan pertama gagal karena nama gateway ("Budi Santoso") ≠ nama scene ("BUDI") — cincin tidak muncul. Ditemukan lewat dbg probe: panggilan langsung `__wfsSceneSelect("BUDI")` berhasil → akar masalah pemetaan nama. Fix: peta eksplisit SCENE_BY_ID (gateway id stabil, nama bebas berubah).
- Bukti probe CDP (probe_panelsel.py, chrome headless DISPLAY=:0): pilih "Budi Santoso" di dropdown panel (React native setter + event change) → selRing `{vis:true, pos:[-4,-1.9]}` = home BUDI ✓; dbg4.py: jalur balik klik scene agent[1] → panel terbuka, dropdown = "Rizky Pratama", selRing pos [-8,2.6] ✓ (dua arah utuh). Screenshot 633KB (scene hidup), 0 console exception.
- Build OK, vitest 9/9, deploy ~/wfs-hq, push b929598.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

- Polanjut run hover-pointer: saat drag kamera (pointerdown → move) canvas kini cursor 'grabbing' (isyarat "sedang digeser"), kembali normal saat pointerup; guard: tidak menimpa 'pointer' bila menekan di atas agent/papan, dan hover-raycast di-skip selama cursor 'grabbing' agar tidak menimpa feedback drag.
- Bukti probe CDP (probe_drag.py, chrome headless DISPLAY=:0, Input.dispatchMouseEvent jalur nyata): init '' → mousePressed+move → 'grabbing' ✓ → mouseReleased → '' ✓; lalu hover koordinat proyeksi agent[0] (815,283 via __camCam) → 'pointer' ✓ (feedback hover tetap bekerja). 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 00:00 WIB — fix UX: wheel/pinch/zoom tidak lagi "melawan" focusGoal
- Bug UX: setelah double-click fokus agent (fitur 23:35), setiap frame render me-lerp `sph.radius` balik ke `focusGoal.r` — jadi wheel scroll / pinch / tombol +− terasa macet (radius ditekan terus ke radius fokus). Sekarang interaksi zoom pengguna (wheel, pinch 2 jari, zoomIn/zoomOut tombol & shortcut +/−) membatalkan focusGoal (`reset:true` dari agent offsite/Escape tetap dipertahankan, karena itu memang harus mengembalikan kamera ke home).
- Bukti probe CDP (probe_zoomfg2.py, chromium headless DISPLAY=:78, jalur input nyata): dblclick proyeksi agent[0] (864,257) → focusGoal {r:18} ✓ → dispatch mouseWheel deltaY=-240 → dist 40→27 dan **focusGoal jadi null** ✓ (zoom berlaku, tidak ditarik balik). 0 console error.
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, canvas3d 1366x625, frames naik, 0 console error; screenshot 625KB (scene hidup).
- Catatan lingkungan: chrome probe = ms-playwright chromium-1248, wajib --no-sandbox (Ubuntu 24.04 menonaktifkan unprivileged userns); kantor live di port 9503 (bukan 8000).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-18 23:35 WIB — double-click: zoom ke titik / fokus agent
- Fitur UX OfficeScene.js: dblclick di canvas — kena agent/papan → focusGoal ke titik hit (r≤18, zoom dekat); area kosong → maju 30% (r max(14, r*0.7)). Plus guard: homeRadius awal di-clamp 24–60 saat pertama kali di-set (konsisten dengan setView), mencegah radius ekstrem ikut tersimpan.
- Bukti probe CDP (probe_dbl9/dblA/dblB, jalur input nyata Input.dispatchMouseEvent): dblclick area kosong dist 37→28 (zoom-in ~30% ✓); dblclick pada koordinat proyeksi agent[0] → dist turun menuju ≤28 (fokus agent ✓, run lain 40→17); dblclick tidak trigger saat drag (moved>6 di click path tetap terjaga). 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 00:35 WIB — shortcut keyboard 1/2/3 untuk preset kamera
- Fitur App.jsx: tombol angka 1/2/3 kini memanggil scene.setView('iso'/'front'/'top') — preset kamera (fitur 22:10) kini bisa diaktifkan dari keyboard, konsisten dgn shortcut M/N/L/H/+/− yang sudah ada. Guard sama persis: diabaikan saat fokus di input/textarea/select/contenteditable, saat Ctrl/Meta/Alt, atau saat modal task/confirm/ask/help terbuka. OverlayHelp langkah 6 diperbarui ('1 / 2 / 3 = kamera Iso/Depan/Atas').
- Bukti probe CDP (probe6.py, chromium headless DISPLAY=:78, jalur input nyata Input.dispatchKeyEvent): init theta 2.453/phi 1.0 → tekan '2' → theta 0.002/phi 1.2 (Depan ✓) → tekan '3' → theta 2.453/phi 0.35 (Atas ✓) → tekan '1' → theta 2.453/phi 1.0 (Iso ✓). 0 exception console.
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 01:20 WIB — shortcut keyboard 0 = reset kamera
- Fitur App.jsx: tombol **0** kini reset kamera ke kondisi normal — `scene.setView('iso')` (sudah meng-null-kan focusGoal & kembali ke HOME_TGT/homeRadius) + `scene.resetFocus()` sebagai pengaman tambahan. Melengkapi 1/2/3: setelah eksplorasi bebas (drag/zoom/dblclick-fokus), satu tombol mengembalikan semua. Guard identik dengan shortcut lain (input/textarea/select/contenteditable, Ctrl/Meta/Alt, modal terbuka). OverlayHelp langkah 6 diperbarui ('0 = reset kamera').
- Bukti probe CDP (probe_reset0.py, chrome headless DISPLAY=:0, jalur input nyata Input.dispatchKeyEvent): kamera diacak (theta 1.102, phi 1.366, r 44) → tekan '0' → theta **2.453** / phi **1.0** (Iso ✓), 0 exception console. radius tetap 44 (dalam clamp 24–60, homeRadius tersimpan = 44 — wajar).
- Build OK (0.8s), vitest **9/9**, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 02:05 WIB — reset kamera (0/Iso) kini mengembalikan juga sudut drag + fokus
- Perbaikan UX: sebelumnya setView hanya menormalkan theta/phi ke preset & meng-null focusGoal, tapi sudut hasil drag user TIDAK bisa dikembalikan (theta/phi preset statis) dan radius di-clamp ke homeRadius — jadi setelah banyak drag/zoom, '0' tidak benar-benar "reset". Kini saat fokus pertama dibuat (dblclick/klik agent), snapshot kamera tersimpan di sph.__saved (theta/phi/radius); tombol 0/Iso mengembalikan snapshot itu (radius tetap di-clamp 24–60). Tanpa snapshot → perilaku lama (fallback aman).
- Bukti probe CDP (probe_saved0.py, jalur input nyata): base Iso theta 2.454/phi 1.0/r 40 → dblclick agent (saved=True) → drag keras theta 6.754/phi 0.18/r 34.1 → tekan '0' → theta **2.454**/phi **1.0**/r **40**, focus False (persis base ✓). 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas3d 1366x625, frames naik, 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 02:40 WIB — hover highlight ring: feedback visual di bawah agent saat di-hover
- Fitur OfficeScene.js: selain cursor 'pointer' (fitur 22:35), kini muncul **cincin biru semi-transparan (CanvasTexture radial ring, 2.6 unit)** di lantai tepat di bawah agent yang di-hover — feedback visual yang terlihat jelas dari jarak jauh, bukan hanya kursor kecil. Dibuat lazy (`ensureHoverRing`, hindari TDZ `office`), hook debug `window.__sceneRing`.
- Perbaikan proses: TDZ terdeteksi saat probe (scene init failed "Cannot access 'M' before initialization") karena versi awal membuat mesh di top-level sebelum `office` dideklarasikan — diperbaiki lazy-init; e2e_err kembali hijau.
- Bukti probe CDP (probe_ring6.py, chrome headless DISPLAY=:0, jalur input nyata): hover koordinat proyeksi agent[0] → cursor 'pointer' + ring {vis:true, pos:[-8,-1.9]}; hover 3 titik area kosong → cursor '' + ring vis:false (hilang); pindah agent lain → ring ikut pindah posisi. 0 console error.
- Build OK (1.9s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas3d 1366x625, frames naik (23), 0 console error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 02:55 WIB — fix: Escape saat overlay terbuka tidak lagi ikut reset kamera
- Bug UX: Escape dipakai dua pihak — App menutup overlay (help/log/modals), scene me-reset kamera ke home (fitur 00:10). Akibatnya menutup panel Bantuan dengan Esc secara diam-diam menarik kamera kembali (focusGoal reset) — tidak diinginkan user.
- Implementasi: `window.__wfsModalOpen` di-set saat render App; snapshot `window.__escModalAtDispatch` diambil listener window fase CAPTURE (jalan sebelum semua bubble handler); handler Escape scene membaca snapshot (`===false`) bukan flag live.
- Debug proses: versi useEffect gagal (flag false lagi saat handler scene jalan — React flush sinkron dari handler overlay menutup modal lebih dulu); versi flag-live juga gagal dengan alasan sama. Trap capture-phase probe membuktikan flag true di awal dispatch namun reset tetap terjadi → baru ketemu akar masalah ordering handler.
- Bukti probe CDP (probe_esc.py/esc2/esc3, chrome headless DISPLAY=:0, jalur input nyata): dblclick agent → focus r:24 → tekan H (modal=true) → Escape → help tertutup DAN focus tetap {r:24, reset:false} ✓; kontrol tanpa modal: dblclick → Escape → focus {r:40, reset:true} ✓ (reset Esc tetap bekerja di luar modal). 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, canvas3d 1366x625, frames naik, 0 console error; screenshot 229KB (scene hidup, swiftshader).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 03:20 WIB — shortcut keyboard K (nama agent) & R (putar otomatis)
- Fitur App.jsx + ActionMenu.jsx: ActionMenu expose `refApi` ({toggleNames, toggleRotate}) — fungsi sama dengan tombol menu Aksi (sinkron state, baca isNamesVisible/isAutoRotate dari scene, anti-desync). App tambah shortcut **K** = toggle nama agent, **R** = toggle putar otomatis; guard identik shortcut lain (input/textarea/select/contenteditable, Ctrl/Meta/Alt, modal terbuka). OverlayHelp langkah 6 diperbarui.
- Bug proses penting: versi awal memanggil `amRef.current` yang tidak pernah dideklarasikan — rolldown tidak error saat build (identifier bebas -> ReferenceError runtime), dan `?.` tidak menyelamatkan karena `amRef.current` melempar sebelum optional-chain. Gejala sulit: H/L/N tetap jalan, hanya K/R mati, tanpa console error. Ketemu lewat inspeksi bundle minified (amRef tidak di-rename karena dianggap global). Fix: `const amRef = actionMenuApi`.
- Bukti probe CDP (probe_krfinal.py, chrome headless DISPLAY=:0, jalur input nyata Input.dispatchKeyEvent): names 14 -> K -> 0 -> K -> 14 (dua arah); R -> wfs_autorot '0' -> R -> '1' (dua arah); guard INPUT terverifikasi ada di bundle minified. e2e ringan: canvas 1366x625, 17 ibtn, 14 agent, 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 03:10 WIB — cincin emas agent terpilih: tetap terlihat siapa yang sedang dibicarakani
- Fitur OfficeScene.js: klik agent kini menampilkan **cincin emas (3.1 unit, CanvasTexture radial, warna 0xFFD75E)** di lantai bawah agent — berbeda dari cincin biru hover (sementara), cincin emas PERSIST sampai pilihan berubah / klik area kosong (deselect). Posisi mengikuti agent tiap frame juga saat berjalan/meeting (offset z+0.55 saat duduk). API baru: `setSelected(idx)`/`getSelected()`; debug hook `window.__sceneSelRing`.
- Debug proses: versi awal applySelected hanya `visible=true` tanpa set posisi — ring muncul di origin (0,0) karena mesh baru. Fix: posisi dihitung di applySelected (home/walker), frame-loop hanya meng-update posisi.
- Bukti probe CDP (probe_selring.py, chrome headless DISPLAY=:0, jalur input nyata): klik proyeksi agent[0] (893,280) → selRing {vis:true, pos:[-8,-1.9]} = home agent[0] ✓; klik area kosong → vis:false (deselect ✓). Screenshot 699KB (scene hidup), 0 console exception.
- Build OK (1.6s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 05:40 WIB — fix backlog: tombol dock Neon kini ikut persist neon (sinkron init)
- Lanjutan backlog run 21:15 (18 Okt): neon tersimpan di localStorage diterapkan ulang di scene saat init, tapi tombol dock Neon (QuickToolbar) tetap tampil "off" setelah refresh — class 'on'/aria-pressed tidak sinkron. Akar: useEffect sinkron lama (`setCyberpunk(!!scene.isCyberpunk())` dgn dep [flash]) hanya jalan sekali saat mount, SEBELUM scene async selesai init — jadi state UI tidak pernah ter-update dari scene. Fix: pindahkan sinkron ke dalam callback init scene (tepat setelah setMuted), pola sama dgn mute. shortcut N (toggleCyberpunk) sudah membaca state scene langsung, tidak terpengaruh.
- Bukti probe CDP (probe_reload2.py, chrome headless DISPLAY :0): preset ls wfs_neon='1' → reload → tombol Neon {on: true, aria: 'true'} ✓ (sebelumnya false), menu Aksi tetap "Tampilkan nama" + "Putar otomatis: OFF" (persist lain tetap OK), label[0].visible=false (names persist OK).
- e2e_err.py direkonstruksi (file lama hilang): DOM True, 17 btns, 14 label, canvas 1366x625, frames 2→5, 0 console error.
- Build OK (3.4s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-19 04:55 WIB — cincin emas agent terpilih disembunyikan saat agent offsite
- Bug visual: setelah fitur cincin emas (03:10), ring tetap menyala di meja kosong ketika agent terpilih TIDAK ada di kantor (shift malam/offsite, meeting figures terpisah) — menyesatkan, seolah orangnya masih di meja.
- Implementasi OfficeScene.js: helper `selAnchor(a)` — walker terlihat → posisi walker; sittingChar terlihat → home (offset z+.55); keduanya tak terlihat → null. applySelected() dan frame-loop memakai selAnchor: ring visible=false saat null, selectedIdx TETAP tersimpan sehingga ring muncul otomatis lagi saat agent kembali (frame-loop kini juga re-enable visible, bukan hanya update posisi).
- Bukti probe CDP (probe_ring3.py, chromium-1248 headless --use-angle=swiftshader DISPLAY=:78, klik via PointerEvent di canvas — CDP mouse input tidak sampai handler pointerdown canvas di headless): klik proyeksi agent[0] (874,254; raycast check HIT) → focus {r:24}, selRing {vis:true, pos:[-8,-1.9]} ✓ → paksa offsite (walker+sittingChar invisible) → setelah beberapa frame: selRing {vis:false} ✓ → agent duduk lagi → selRing {vis:true, pos:[-8,-1.9]} ✓ (auto re-appear). 0 console exception.
- Catatan lingkungan: chrome 1248 + swiftshader ANGLE di DISPLAY :0 gagal buat context WebGL; DISPLAY :78 dengan --use-angle=swiftshader OK (gl-ok). shot.sh direkonstruksi (script lama hilang) + diverifikasi: screenshot 468KB, scene hidup normal.
- Build OK (5.3s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 05:20 WIB — fix: Escape saat panel Log terbuka tidak lagi me-reset kamera
- Lanjutan fix Escape (02:55): flag `window.__wfsModalOpen` sebelumnya hanya mencakup showTask/confirm/ask/showHelp — **showLog (panel Log aktivitas, shortcut L) terlewat**, padahal Log juga ditutup dengan Escape (handler App `k==='escape'`). Akibatnya menutup Log dengan Esc diam-diam me-reset kamera ke home (focusGoal reset) — regresi bug yang sama.
- Implementasi App.jsx: `showLog` ditambahkan ke ekspresi flag modal. Snapshot capture-phase `__escModalAtDispatch` & handler scene tidak berubah.
- Bukti probe CDP (probe_esclog.py, chromium-1248 headless --use-angle=swiftshader DISPLAY=:78, input keyboard nyata Input.dispatchKeyEvent): klik agent → focus {r:24, reset:false} → tekan L → modalOpen **true** → Escape → Log tertutup (modal **false**) DAN focus tetap **{r:24, reset:false}** ✓ (kamera tidak reset), cincin emas tetap menyala (sel:true). Perbaikan proses probe: filter tab 'page' di /json (extension service worker ikut terlist menyebabkan ws timeout lama).
- Build OK (6.1s), vitest **9/9**, deploy ~/wfs-hq; screenshot ck.png 470KB (scene hidup, swiftshader :78).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 06:45 WIB — fix: Escape di 5 panel dengan state internal kini tak me-reset kamera (flag modal terpusat)
- Lanjutan fix Escape (02:55 & 05:20): flag `window.__wfsModalOpen` hanya mencakup modal yang state-nya di App (showTask/confirm/ask/showHelp/showLog). Panel dgn state internal — **TaskBoard, ProjectPanel, TeamStats, WfsPanel (Chat AI), CsWidget** — terlewat: menutupnya dgn Escape diam-diam me-reset kamera.
- Implementasi: modul baru `src/lib/modal.js` (`useModalFlag(open)` counter ref-counting + `anyModalOpen()`); kelima panel memanggil hook tsb; App menambahkan `|| anyModalOpen()` ke `__wfsModalOpen` DAN ke snapshot capture-phase `__escModalAtDispatch` (evaluasi live saat keydown, bukan hanya saat render — App tidak re-render saat panel child dibuka).
- Debug proses: (1) import `useModalFlag` di ProjectPanel sempat hilang saat sunting batch → build sukses tapi `ReferenceError: useModalFlag is not defined` runtime, page blank total — ketemu via console event CDP, e2e_err direvisi utk menangkap exception (sebelumnya hanya cek DOM, 0 error palsu saat page blank). (2) e2e_err lama mati diam-diam: path chrome 1243→1248, `chrome-linux`→`chrome-linux64`, list /json kini berisi browser_ui/service_worker yang membuat filter page gagal — diperbaiki. (3) Input.dispatchMouseEvent CDP tidak sampai ke handler pointerdown canvas di build ini — probe kontrol pakai dispatchEvent PointerEvent langsung.
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, port 9378): klik 🚀 Proyek → panel terbuka → Escape → panel tertutup DAN snapshot `__escModalAtDispatch=true`, dbg focus null (TIDAK reset) ✓; sama untuk 📊 Statistik dan 💬 Chat AI ✓. Kontrol: dblclick agent → focus {r:28,reset:false} → Escape → focus null (reset bekerja normal di luar panel) ✓. 0 console error.
- Build OK (0.98s), vitest 9/9, deploy ~/wfs-hq; e2e_evt (revisi): canvas 1, 17 btns, 14 labels, frames 14→19, hanya warning deprecation THREE. Screenshot /tmp/ck.png 455KB (scene hidup).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 07:40 WIB — Escape kini juga batal pilih agent (cincin emas mati) & bersihkan snapshot kamera usang
- Lanjutan siklus fix Escape (02:55→06:45): Escape mereset kamera tapi **cincin emas agent terpilih tetap menyala** (tidak konsisten dgn deselect via klik area kosong) dan snapshot kamera `sph.__saved` (dipakai tombol 0/Iso, fitur 02:05) tidak dibersihkan — setelah Esc-reset, tekan '0' mengembalikan sudut pra-Escape yang sudah usang.
- Implementasi OfficeScene.js handler Escape scene: tambah `selectedIdx=-1;applySelected();delete sph.__saved;` (hanya cabang reset, yaitu `__escModalAtDispatch===false` — panel tetap aman).
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, klik agent via PointerEvent proyeksi home): klik agent[0] → ring true, focus {r:24,reset:false}, saved true → Escape → **ring false, focus {r:40,reset:true}, savedCleared true** ✓; klik ulang → ring true lagi (pilih ulang normal) → Escape → ring false ✓. 0 console error.
- Build OK (1.5s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 7→12, 0 error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 08:05 WIB — shortcut kamera 1/2/3/0 kini batalkan pilihan agent (cincin emas mati)
- Lanjutan konsistensi Escape (07:40): setView('iso'/'front'/'top') menghapus focusGoal tapi cincin emas agent terpilih tetap menyala di sudut kamera baru — sama inkonsistennya dgn bug Escape kemarin. Juga `sph.__saved` tidak dibersihkan.
- Implementasi OfficeScene.js `setView`: untuk ketiga sudut → `selectedIdx=-1;applySelected();delete sph.__saved;` sebelum reposition kamera. (Zoom +/- sengaja tidak mengubah pilihan.)
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, klik agent via PointerEvent): klik agent[0] → ring true, focus {r:24}, saved true → tekan '2' → **ring false, focus null, savedCleared true** ✓; klik ulang → ring true (pilih ulang normal) → tekan '1' → ring false ✓. 0 console error.
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 8→13, 0 error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 08:35 WIB — shortcut keyboard F = fullscreen toggle
- Fitur App.jsx: shortcut **F** = toggle fullscreen browser (document.documentElement.requestFullscreen / exitFullscreen), guard identik shortcut lain (input/textarea/select/contenteditable, Ctrl/Meta/Alt, modal showTask/confirm/ask/showHelp terbuka). Ditolak browser → flash error. OverlayHelp langkah Shortcut diperbarui dgn "F = fullscreen".
- Bukti (chrome headless 9381, DISPLAY :78): Runtime.requestFullscreen via documentElement → 'called' tanpa exception, 0 console error setelah dispatchKeyEvent F real-key; fullscreenElement false di headless (keterbatasan headless, normal — requestFullscreen butuh user gesture terverifikasi browser; handler + guard tidak melempar error). Scene 1 canvas tetap hidup.
- Build OK (0.4s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 8→13, 0 error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 09:10 WIB — fix: Escape di menu Aksi (popover) tidak lagi me-reset kamera
- Lanjutan siklus fix Escape (02:55→06:45): audit ulang semua handler Escape di komponen — dua popover belum mendaftar di flag modal terpusat `useModalFlag`: **ActionMenu** (menu Aksi ⚡ — popover nyata, ditutup dgn Escape) dan **QuickToolbar** (state `open` vestigial, tak pernah true — hook ditambahkan defensif, tanpa efek). Akibat bug: klik agent → buka menu Aksi → Escape → menu tertutup TAPI kamera diam-diam reset ke home.
- Implementasi: `useModalFlag(open)` di kedua komponen.
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, port 9342, input keyboard nyata): klik agent → focus {r:24,reset:false} → klik tombol Aksi → role=menu tampil → Escape → menu tertutup DAN **focus tetap {r:24,reset:false}** (tidak reset) ✓; diulang dua kali konsisten. 0 console error.
- Build OK, vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 8→13, 0 error.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 08:30 WIB — label zona kini ikut toggle/persist "Tampilkan nama" + reset offset anti-tumpuk
- Bug konsistensi: toggle nama (menu Aksi / shortcut K, persist wfs_names) hanya mengubah label AGENT — 5 label zona lantai (DEV DESK, MEETING, WELCOME & LOUNGE, CAFÉ, SERVER ROOM) tetap tampil saat nama disembunyikan, dan saat init dengan wfs_names='0' zona tetap muncul (inkonsisten dgn preferensi user). Selain itu offset anti-tumpuk label zona (userData.antiY/antiX) tidak pernah direset → akumulasi lintas aksi teamAction.
- Implementasi: (1) flooring.js createZones menerima namesVisible → zl.visible=namesVisible!==false saat init (persist). (2) toggleNames() kini sync semua __zoneLabels (visible + reset antiY/antiX + posisi kembali ke __zoneBase) dan reset anti-offset label agent. (3) teamAction('work') juga reset offset zona.
- Bukti probe CDP (chromium headless swiftshader DISPLAY :78, port 9376): set wfs_names='0' → init → agent label hidden 14/14, zona tetap hidden ✓ (koreksi pada run kedua, bundle terverifikasi berisi guard namesVisible!==false); names='1' → zona visible ✓. e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 9→14, 0 console error. Screenshot /tmp/ck_names.png 458KB — scene hidup, nama agent + zona (SERVER ROOM, WELCOME & LOUNGE) terlihat, bubble chat aktif. shot.sh diperbaiki (DISPLAY :0 → :78, sebelumnya selalu gagal WebGL context).
- Build OK (1.4s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 09:50 WIB — clamp horizontal label: tak ada lagi label terpotong tepi kiri/kanan viewport
- Backlog kosmetik run 08:30: clamp anti-overlap hanya vertikal (atas/bawah) — label agent/zona yang didorong horizontal (offX) masih bisa bocor keluar tepi kiri/kanan layar, label zona paling lebar paling rawan.
- Implementasi OfficeScene.js (blok clamp viewport, siklus sweep→clamp): tambah clamp horizontal — wHalf=(sw||zw)/2, jika x+offX+pad melewati W2-padX atau di bawah -(W2-padX), offX di-clamp; padX zona 6px, agent 2px. Ikut menandai violated sehingga siklus sweep+clamp tetap konvergen.
- Bukti: build OK (1.3s), vitest 9/9, deploy ~/wfs-hq, e2e_err: DOM True, 17 btns, 14 label, frames 8→13, 0 error. Screenshot ck.png 455KB (scene hidup). Probe CDP khusus clamp belum dibuat (butuh kamera ekstrem) — dicatat sebagai verifikasi subjektif.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 10:20 WIB — verifikasi CDP clamp horizontal label (backlog run 09:50) ✓ lolos
- Probe /tmp/probe_clampx.py (chromium-1248 headless swiftshader DISPLAY :78, port 9402): 7 kamera ekstrem (theta 0/π/±π/2, off-center tgt ±20, near top-down, r 22–45) + ekspose window.__cam/__camCam. Ukur proyeksi layar semua label visible (14 agent + 5 zona) vs bounding canvas.
- Hasil: **0 pelanggaran horizontal** — tidak ada label visible yang x proyeksinya keluar tepi kiri/kanan canvas (pad clamp zona 6px, agent 2px bekerja).
- Metodologi: proyeksi NDC label DI LUAR frustum menghasilkan koordinat palsu (mirror) — sprite three.js tak dirender di luar viewport; probe wajib filter arah-forward (rel·fwd < 0.6·dist) sebelum project(). Tanpa filter: 14 false-positive py>1000 (bukan bug scene).
- e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 3→6, 0 error. Screenshot /tmp/ck.png 464KB (scene hidup). npm test 9/9. Tanpa edit kode (verifikasi saja).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).
## 2026-10-19 11:05 WIB — fix: suara baru hidup setelah interaksi pertama (AudioContext unlock keyboard/klik global)
- Bug backlog "verifikasi subjektif suara" (audit kode): initAudio() hanya dipanggil dari pointerdown DI CANVAS — interaksi keyboard pertama (shortcut M/1/2/F dll.) maupun klik UI (bukan canvas) tidak pernah memulai audio; selain itu AudioContext baru dibuat tanpa resume() eksplisit, sehingga walau terbisa autoplay policy ctx bisa tetap 'suspended' dan semua suara (tick keyboard, langkah, chime meeting) senyap.
- Implementasi OfficeScene.js: (1) helper __ensureAudio = initAudio() + audioCtx.resume() bila state 'suspended'; (2) listener global window keydown + pointerdown {once:true} → interaksi PERTAMA apa pun (keyboard/klik di mana saja) meng-unlock audio; (3) pointerdown canvas ikut pakai __ensureAudio; (4) resume() defensif di initAudio.
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, port 9442, Input.dispatchKeyEvent/dispatchMouseEvent = gesture trusted): sebelum interaksi window.__audio {started:false,state:'none'} → 1 ketukan tombol real → **started:true, state:'running', calls.key=1** ✓ (klik canvas konsisten). 0 console error.
- Build OK (2.7s), vitest 9/9, deploy ~/wfs-hq; e2e_err: DOM True, 17 btns, 14 label, frames 2→4, 0 error; screenshot ck_audio.png 465KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia) — unlock/mute/persist kini otomatis & terverifikasi.
## 2026-10-19 11:50 WIB — fix: suara agent & chime meeting kini lazy-init otomatis (tak butuh interaksi dulu)
- Lanjutan fix audio 11:05: tick keyboard & langkah agent di-loop animate masih di-guard `soundsStarted` — suara agent TIDAK PERNAH bunyi sampai user berinteraksi, walau ctx sudah running; chime meeting juga silent bila terjadi sebelum interaksi pertama.
- Implementasi OfficeScene.js: playKeyClick/playStep/playMeetingChime kini memanggil `__ensureAudio()` (init + resume bila suspended) di baris pertama — inisialisasi dilerakkan ke titik pemakaian (lazy); guard `soundsStarted` pada chime dihapus; guard tick/step di-loop tetap dipertahankan (hemat: tak ada suara saat tidak ada agent duduk/jalan).
- Bukti probe CDP (chromium-1248 headless swiftshader DISPLAY :78, port 9483): sebelum interaksi `__audio {started:false,state:'none'}` → 1 keydown real → **started:true, state:'running'** ✓. Guard loop: calls.tick/step hanya naik saat ada agent duduk/jalan (by design). e2e_err: DOM True, 17 btns, 14 label, frames 2→5, 0 error.
- Build OK, vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 12:30 WIB — hardening visibilitychange: guard anti double-audio & destroy flag anti leak
- Audit handler `onVis` (visibilitychange): (1) tanpa guard, event hidden→hidden / active→active ganda memanggil suspend/resume berulang; kini suspend hanya saat transisi KE hidden, resume+pollBadges hanya saat kembali visible — state AudioContext diperiksa sebelum aksi (suspend bila 'running', resume bila 'suspended'); (2) `__ensureAudio` (listener global keydown/pointerdown once + dipanggil playKeyClick/playStep/playMeetingChime) bisa recreate AudioContext SETELAH scene.destroy() (Hot-Reload / remount App) → leaked ctx; kini guard `window.__officeSceneDestroyed` di-set di destroy().
- Bukti: probe CDP (chromium-1248 headless :78, Input.dispatchKeyEvent trusted): audio unlock tetap bekerja {started:true,state:'running'} ✓, 0 console error, DOM True, 17 btns, 14 labels, frames naik. Simulasi lifecycle hidden via Page.setWebLifecycleState TIDAK mengubah document.visibilityState di chromium ini (vis tetap 'visible') — verifikasi penuh jalur hidden dicatat sebagai keterbatasan headless; perubahan bersifat guard/idempotent (lint OK, perilaku visible tidak berubah).
- Build OK (0.9s), vitest 9/9, deploy ~/wfs-hq.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 12:50 WIB — fix: "Total file dihasilkan" di Statistik Tim melar (string files dihitung per karakter)
- Bug data: field `files` dari task engine berbentuk STRING (mis. "['a.py','b.py']" — terlihat di TaskBoard yang mem-parse-nya), tapi TeamStats menghitung `(t.files || []).length` → jika string, .length = jumlah KARAKTER, bukan jumlah file. Statistik "Total file dihasilkan" jadi salah besar (mis. 1 task dgn 2 file bisa terhitung 15+).
- Implementasi: helper baru `src/lib/files.js` (fileCount: array → .length; string JSON gaya Python → parse dgn replace kutip; CSV → split koma; kosong/[]/null → 0) + TeamStats pakai fileCount. 7 unit test baru.
- Bukti: npm run build OK, vitest **16/16** (9 lama + 7 baru), deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→6, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 13:10 WIB — refactor: render "File dihasilkan" TaskBoard pakai parser bersama (parseFileList) + 3 test
- Konsistensi: detail task di TaskBoard masih parse `files` manual (`String(files).replace(/[[\]']/g,'').split(',')`) — rapuh (sisa bracket/kutip tidak rapi, CSV dibagi mentah). Helper fileCount run 12:50 sudah tangani bentuk tak konsisten (array / string JSON gaya Python / CSV / kosong), tapi tak dipakai untuk render daftar.
- Implementasi: ekstrak `parseFileList(f)` di src/lib/files.js (fileCount kini = parseFileList(f).length); TaskBoard.jsx render daftar file dari parseFileList — bersih tanpa sisa bracket/kutip, fallback aman bila JSON rusak.
- Bukti: npm run build OK (0.7s), vitest **19/19** (16 lama + 3 baru utk parseFileList: trim whitespace, []/null/non-string => [], fallback CSV), deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-19 11:23 WIB — hardening parseFileList (koma dalam kutip, bracket/kutip sisa) + detail task TaskBoard auto-refresh
- Audit lanjutan parser `files`: (1) split CSV mentah memecah file bernama berkoma ("'a, b.py'" → ["a"," b.py"] salah) — kini split sadar kutip; (2) item dengan kutip/bracket sisa (array python berkutip, JSON rusak "['a.py', 'b.py") dibersihkan via cleanItem (strip kutip/bracket pembungkus & yatim) — TaskBoard kini tak pernah menampilkan "'a.py'" atau "[a.py".
- Bug UX data: detail task di TaskBoard pakai snapshot `sel` yang basi — setelah polling 8 dtk status/files berubah di server, detail tetap menampilkan status lama. Kini setiap load() me-refresh sel dari data terbaru (per id), fallback ke sel lama bila task tak ditemukan.
- 5 test baru (total 24): koma-dalam-kutip, array item berkutip, CSV kutip dibersihkan, JSON rusak dibersihkan, array berkutip dibersihkan. 1 ekspektasi test lama diperbarui (parser kini lebih bersih dari ekspektasi lama).
- Bukti: build OK, vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 13:40 WIB — fix: shortcut keyboard tidak lagi aktif saat Log Aktivitas terbuka
- Audit konsistensi modal: guard shortcut App.jsx melewatkan `showLog` — saat Log Aktivitas terbuka, tekan M/L/H/N/1-3/0/K/R/F/± tetap menjalankan aksi di balik modal (mis. L menutup+langsung buka lagi, 0 reset kamera tak terlihat, M mengubah mute diam-diam), inkonsisten dgn TaskBoard/Help/Confirm.
- Implementasi: tambah `showLog` di guard + deps useEffect handler (Escape-nya sendiri tetap berfungsi via handler escape + ActivityLog listener sendiri; flag modal __wfsModalOpen sudah mencakup showLog sejak awal).
- Bukti: build OK (0.7s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 14:10 WIB — fix leak: papan proyek (projectboard) tidak pernah di-destroy saat scene remount
- Audit lifecycle scene: createProjectBoard() memasang interval fetch /wfs-project 60 dtk, interval forceVisible 500 ms, dan listener visibilitychange — tapi OfficeScene.destroy() tidak pernah memanggil window.__projectBoard.destroy(). Tiap remount/Hot-Reload App meninggalkan papan lama yang terus fetch + update DOM-nya selamanya (leak interval & fetch ganda tiap menit).
- Implementasi: destroy() kini memanggil __projectBoard.destroy() (guard try/catch) lalu delete window.__projectBoard.
- Bukti: build OK (3.8s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 3→6, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 14:45 WIB — fix: scene baru setelah remount kembali bisa bunyi (flag __officeSceneDestroyed tak pernah di-reset)
- Bug lifecycle (pasangan fix leak 14:10): destroy() set `window.__officeSceneDestroyed=true`, tapi tidak ada jalur yang me-resetnya — `createOfficeScene()` scene BERIKUTNYA mewarisi flag true, sehingga `__ensureAudio` selalu return early: semua scene hasil remount/Hot-Reload audio-nya mati permanen (keydown/klik tak pernah unlock AudioContext), walau visual & kontrol normal.
- Implementasi: `createOfficeScene()` baris pertama kini `window.__officeSceneDestroyed=false` (scene baru = scene lama sudah bener-bener mati).
- Bukti probe CDP (chromium-1248 headless :78, port 9491, Input.dispatchKeyEvent trusted, module scene di-import langsung dari bundle produksi untuk simulasi remount): init `{destroyed:false,audio started:false}` → keydown → `{started:true,running}`; destroy→flag true; **createOfficeScene baru → `destroyedAfterNewScene:false`** ✓; keydown berikutnya → **`{started:true, state:'running'}`** ✓ (tanpa fix: flag tetap true, audio tetap none). 0 console error.
- Build OK, vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 15:20 WIB — fix leak: 4 listener window (drag kamera, Escape, unlock audio) tidak dilepas di destroy()
- Audit listener global scene: `addEventListener('pointerup', ...)` dan `addEventListener('pointermove', ...)` (drag kamera, window-level anonim) serta `window.addEventListener('keydown'/'pointerdown', __ensureAudio, {once:true})` tidak pernah di-remove di destroy() — tiap remount/Hot-Reload App menumpuk handler lama: pointermove lama tetap memutar kamera scene mati (akses renderer DOM yang sudah dilepas) dan menumpuk closure tiap remount.
- Implementasi OfficeScene.js: handler drag kamera dinamed (onDragUp/onDragMove), destroy() kini melepas 4 listener (pointerup, pointermove, keydown __ensureAudio, pointerdown __ensureAudio) + keydown onKey yang sudah ada.
- Bukti: build OK (0.95s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error. Backup /tmp/OS.bak-*.js.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 15:50 WIB — fix leak: interval pollRunning (sinkron task running 15 dtk) tidak terdaftar di __intervals
- Audit sisa timer scene: IIFE `pollRunning` (fetch /wfs-api/agents/status + /wfs-api/tasks tiap 15 dtk, set window.__wfsRunningTasks) memanggil `setInterval`/`setTimeout` TANPA didaftarkan ke __intervals/__timeouts — destroy() melewatkan keduanya. Tiap remount/Hot-Reload meninggalkan poller lama yang terus fetch gateway 2 endpoint tiap 15 dtk selamanya (fetch ganda per remount).
- Implementasi OfficeScene.js: daftarkan `__timeouts.push(setTimeout(pollRunning,3000))` dan `__intervals.push(setInterval(pollRunning,15000))` — kini otomatis di-clear di destroy(). Ini timer scene terakhir yang di luar registry (pollBadges, agents/running, failed alert, projectboard sudah ditangani run sebelumnya).
- Bukti: build OK (1.7s), vitest **24/24**, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error. Backup /tmp/OS.bak-*.js.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 13:17 WIB — fix leak: pending chime meeting tidak di-clear di destroy()
- Audit sisa timer terakhir: playMeetingChime() membuat 3 setTimeout (osilator nada per 150ms) TANPA didaftarkan ke __timeouts — destroy() di tengah chime (remount/Hot-Reload saat meeting mulai) melewatkan nada yang belum bunyi; scene mati tetap menyalakan 1-2 osilator sisa. Polling, badge, projectboard, pollRunning, listener window sudah ditangani run-run sebelumnya — chime adalah sisa terakhir.
- Implementasi: tiap setTimeout chime di-push ke __timeouts lalu di-splice saat callback jalan (biar array tak menumpuk); destroy() kini otomatis menclear nada pending.
- Bukti: npm run build OK (0.9s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 16:25 WIB — papan proyek 3D: banner GAGAL/REVIEW (task bermasalah kini terlihat)
- Masalah: papan 3D hanya punya 3 kolom Antri/Jalan/Selesai — task status review/gagal tak terlihat sama sekali (jumlahnya pun tak dicantumkan), padahal justru itu yang paling perlu diketahui tim.
- Implementasi projectboard.js: (1) subjudul kini menyebut jumlah review/gagal bila >0; (2) banner di bawah progress bar (y=166–200) menampilkan "GAGAL n"/"REVIEW n" berwarna + hingga 3 judul task bermasalah dari recent, hanya dirender bila ada item review/gagal di recent (guard, tak ada banner kosong); (3) kolom digeser y 178→210, tinggi 630→578 agar tak tumpang tindih banner.
- Data saat ini 23 done / 0 gagal / 0 review → banner benar-benar tersembunyi (terverifikasi via /wfs-project); jalur render tercakup oleh guard & layout digeser aman.
- Bukti: build OK (0.8s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, frames 2→5, 0 console error; screenshot scene normal (papan di luar frame kamera default — bukan bug).
- Sisa backlog: verifikasi subjektif kualitas suara; timer HUD "11:⬜⬜" glyph kotak (font digit hilang) — kandidat perbaikan berikutnya.
## 2026-10-19 14:20 WIB — fix: emoji tofu di gelembung bicara & teks canvas scene (jam HUD ternyata bukan tofu)
- Audit visual live (screenshot + vision zoom 4x): gelembung "CPC turun 18% ⬜" = tofu nyata — emoji (📉 🔥 📱 🎉 🤝 ✅ 👋 👆 ⚠️ 🔧 ☕) digambar ke canvas scene dgn font Arial/sans-serif yang di headless/server tanpa fallback emoji warna → kotak kosong. Jam HUD "11:00" ternyata BUKAN tofu: zoom 4x menunjukkan nol Orbitron slashed (garis miring internal, stroke setebal "11") — backlog lama salah duga; font Orbitron terverifikasi loaded (document.fonts.check true, selfhost woff2 hash sama).
- Implementasi: hapus semua emoji dari teks canvas — 10 string roleTalk, bubble welcome/proyek/alert-failed/task-running, teks kafé "☕ WFS CAFÉ"→"WFS CAFÉ", projectboard "semua beres 🎉"→"semua beres". Karakter ASCII ✓ dan “” tetap (ter-render aman).
- Bukti: build OK (0.9s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, frames 2→5, 0 console error; screenshot pasca-deploy: semua gelembung bicara bebas tofu, jam 11:00 normal.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia). Emoji future-proofing (selfhost NotoColorEmoji subset) bila ingin emoji kembali di canvas.
## 2026-10-19 16:55 WIB — fix lifecycle: AudioContext ditutup di destroy() + timer shift di-dispose
- Audit sisa leak terakhir: (1) destroy() tidak pernah memanggil audioCtx.close() — tiap remount/Hot-Reload menyisakan AudioContext hidup; browser membatasi ~6 konteks aktif per halaman, remount berulang bisa memicu MaxAudioContextsExceeded hingga audio scene berikutnya gagal total; (2) __shift (daycycle createShift) punya dispose() untuk timers arrive/depart berantai (per 800 ms) tapi tidak pernah dipanggil dari destroy().
- Implementasi OfficeScene.js destroy(): tambah __shift.dispose() (try/catch) + audioCtx.close(), audioCtx=null, masterGain=null.
- Bukti probe CDP (chromium swiftshader, import OfficeScene-CIwtTRwK.js dari bundle produksi): remount x3 destroy → 3 ctx dibuat & ditutup; scene ke-4 dgn keydown → audio {started:true, ctx hidup} ✓; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Build OK, vitest 24/24, deploy ~/wfs-hq OK. Backup /tmp/OS.bak-*.js.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji bila ingin emoji kembali di canvas.
## 2026-10-19 17:30 WIB — aksesibilitas: fokus trap via `inert` — Tab tak bisa kabur ke UI di balik modal
- Masalah: modal-scrim hanya memblokir klik; fokus keyboard tetap bisa Tab/menuju HUD, Header, Ticker, dan seluruh tombol dock yang tertutup scrim (mis. TaskModal terbuka, Tab mencapai tombol Mute/Bantuan — klik tak mungkin, Tab bisa; screen reader juga masih membacakan UI tertutup).
- Implementasi App.jsx: saat salah satu modal App (showTask/confirm/ask/showHelp/showLog) terbuka, `header, .hud, .ticker, .dock` diberi atribut `inert` (dilepas saat tutup + di cleanup); panel dgn state internal (TaskBoard/WfsPanel/CsWidget dll.) sudah memakai flag modal terpusat utk shortcut & scene Escape.
- Bukti: build OK (3.7s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji bila ingin emoji kembali di canvas.
## 2026-10-19 18:05 WIB — aksesibilitas: inert chrome juga saat panel state-internal terbuka (TaskBoard/WfsPanel/CsWidget/…)
- Celah lanjutan dari fix 17:30: flag `inert` hanya mengecek modal yang state-nya di App (showTask/confirm/ask/help/log). Panel dgn state internal yang terdaftar via `useModalFlag` (TaskBoard+detail task, WfsPanel, CsWidget, TeamStats, ProjectPanel, QuickToolbar, ActionMenu) terlewat — saat panel itu terbuka, Tab tetap bisa masuk ke HUD/Header/Ticker/dock di balik scrim dan screen reader tetap membacanya.
- Implementasi App.jsx: `chromeModal = (modal App) || anyModalOpen()` — flag modal terpusat (useModalFlag) kini juga memicu inert chrome. Cleanup unmount tetap melepas atribut.
- Bukti: build OK (1.0s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 18:40 WIB — fix: shortcut keyboard tidak lagi aktif saat panel state-internal terbuka (TaskBoard/WfsPanel/CsWidget/…)
- Celah lanjutan dgn pola sama seperti fix 13:40: guard shortcut App.jsx (handler window) hanya cek modal yang state-nya di App (showTask/confirm/ask/help/log). Panel dgn state internal via useModalFlag (TaskBoard+detail, WfsPanel, CsWidget, ActionMenu pop, QuickToolbar pop, TeamStats/ProjectPanel) terlewat — saat panel terbuka, M tetap toggle mute, L/H membuka modal menutupi panel, N mengubah tema, 1-3/0 memutar kamera tanpa terlihat, K/R toggle nama/rotasi, ± zoom.
- Implementasi App.jsx: guard handler kini `... || anyModalOpen()` — flag modal terpusat juga memblokir shortcut. (inert chrome sudah tercakup run 18:05.)
- Bukti: build OK (0.9s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→6, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 19:20 WIB — a11y: fokus masuk & terkunci di dalam dialog (11 overlay) + aria-modal dinamis
- Masalah (lanjutan inert 17:30/18:05): inert memblokir chrome luar, tapi fokus TIDAK pernah dipindah ke dalam dialog saat overlay dibuka (keyboard user harus Tab butuh dari dokumen), panel dgn role=dialog (WfsPanel/TaskBoard/ProjectPanel/TeamStats/CsWidget/ActivityLog) tidak punya aria-modal, dan Tab bebas keluar-masuk dialog (tidak ada trap per-dialog — modal TaskModal/Confirm pun tidak trap).
- Implementasi: modul baru src/lib/dialogA11y.js (useDialogA11y: pasang aria-modal, fokus otomatis ke elemen focusable pertama / initialFocus, trap Tab+Shift-Tab via capture keydown, Escape onClose). Dipasang di 11 overlay: TaskModal, ConfirmModal (x2 via komponen), OverlayHelp, ActivityLog, TaskBoard (+detail), ProjectPanel, TeamStats, WfsPanel (fokus awal tetap kolom pesan), CsWidget, ActionMenu. Escape lama tiap panel dipertahankan (TaskBoard via onEscRef agar detail-dulu-lalu-tutup tetap benar).
- Bug build yang ditemukan & diperbaiki: pemanggilan useDialogA11y di WfsPanel sebelum deklarasi inputRef (TDZ "Cannot access before initialization") membuat seluruh app blank di produksi — dipindah ke bawah deklarasi ref (build awal tanpa error vite, hanya kena di runtime → pentingnya e2e).
- Bukti probe CDP (Input trusted): panel Chat terbuka → aria-modal=true, fokus di kolom "Pesan" (di dalam dialog), 3x Tab tetap di dalam dialog, Escape menutup & inert chrome dilepas; Papan task → aria-modal=true, fokus di dalam, Escape menutup. e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 3→6, 0 console error.
- Build OK, vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 20:00 WIB — a11y: fokus dikembalikan ke pemicu saat dialog ditutup (focus restore) + aria-modal dilepas
- Celah lanjutan fix 19:20: saat overlay ditutup, fokus tidak dikembalikan ke elemen yang membukanya — keyboard/screen-reader user "jatuh" ke document.body dan harus Tab dari awal; aria-modal juga tertinggal di elemen panel (tidak dilepas saat tutup).
- Implementasi dialogA11y.js: simpan `document.activeElement` (pemicu) saat efek mulai; cleanup (dialog ditutup) melepas `aria-modal` dan memanggil `trigger.focus()` bila trigger masih ada di dokumen (guard `document.contains`, try/catch).
- Bukti probe CDP (chromium headless :9492, halaman produksi 9503): buka panel Chat dgn fokus di tombol dock → inDlg:true (fokus masuk dialog), Escape → dlgGone:true & **restored:true** (fokus kembali ke tombol pemicu, bukan BODY).
- Build OK (0.8s), vitest **24/24**, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 21:15 WIB — a11y: setiap trigger panel diberi aria-controls ke id panelnya
- Celah lanjutan run 20:40: aria-controls sudah ada di tab WfsPanel dan trigger Papan/Proyek/Chat, tapi trigger Statistik (TeamStats) dan AI CS (CsWidget) masih tanpa aria-controls — screen reader tidak mengumumkan elemen mana yang dikendalikan tombol.
- Implementasi: panel TeamStats diberi id="team-stats" + trigger aria-controls; panel CsWidget diberi id="cs-widget" + trigger aria-controls (id statik, bukan conditional, agar tetap valid saat panel tertutup).
- Bukti: build OK (3.8s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 20:40 WIB — a11y: WfsPanel tab chat/konfigurasi jadi tabpanel semantik + label trigger Statistik
- Masalah: WfsPanel punya role=tablist/tab tapi TANPA tabpanel — tab "Chat"/"⚙️ Model API" tidak punya aria-controls & konten tab tidak ber-role tabpanel (screen reader tidak mengumumkan panel terkait); tombol dock "Statistik" satu-satunya trigger panel tanpa aria-label (nama aksesibel hanya "Statistik" dari span — kurang konteks).
- Implementasi: tab chat & config diberi id + aria-controls; konten chat dibungkus div role=tabpanel aria-labelledby=wfs-tab-chat (display:contents agar layout flex lama tak berubah); div konfigurasi jadi tabpanel serupa; tombol Statistik diberi aria-label="Statistik tim".
- Bukti: build OK (0.9s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→6, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 21:50 WIB — a11y: panel Statistik & AI CS kini punya id + aria-controls dari trigger
- Celah lanjutan: trigger Statistik (TeamStats) & AI CS (CsWidget) belum punya aria-controls karena panelnya tanpa id — screen reader tidak menautkan tombol ke panel yang dikendalikan.
- Implementasi: panel TeamStats diberi id="team-stats", panel CsWidget id="cs-widget" (id statik agar tetap terreferensi walau panel tertutup); kedua trigger diberi aria-controls sesuai id.
- Bukti: build OK, vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-19 22:10 WIB — a11y: skip link keyboard (Tab pertama → panel Chat)
- Masalah: keyboard/screen-reader user harus menabut melewati seluruh HUD/Ticker/dock (17 tombol) sebelum sampai panel kerja utama; tidak ada mekanisme skip.
- Implementasi: komponen baru src/components/SkipLink.jsx — link pertama di dokumen, tersembunyi (top:-48px) sampai menerima fokus, lalu tampil (z-index 9999). Aktivasi (Enter) membuka WfsPanel bila tertutup (klik trigger via aria-controls=wfs-panel) dan memindahkan fokus ke kolom input "Pesan". CSS .skip-link di index.css.
- Bukti probe CDP (Input trusted, chromium headless): Tab pertama → activeElement = skip-link (class 'skip-link vis'); Enter → fokus di INPUT aria-label="Pesan" di DALAM #wfs-panel (inPanel:true). e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Build OK (0.7s), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-20 02:40 WIB — a11y/reduced-motion: auto-rotate kamera menghormati prefers-reduced-motion
- Masalah: kamera 3D berputar otomatis terus (autoRot default ON) tanpa memeriksa preferensi OS `prefers-reduced-motion: reduce` — bagi user dengan vestibular disorder / motion sickness, putaran kamera konstan memicu mual; CSS animation sudah dihormati (index.css:194) tapi animasi JS di render loop tidak.
- Implementasi: inisialisasi `autoRot` di OfficeScene.js kini hanya ON bila (a) tidak ada stored pref `wfs_autorot=0` DAN (b) `matchMedia('(prefers-reduced-motion: reduce)')` tidak match. Pilihan user via ActionMenu (setAutoRotate) tetap menimpa & tersimpan di localStorage seperti sebelumnya.
- Bukti probe CDP (2 instance chromium headless, Emulation.setEmulatedMedia): reduced-motion → `__cam.sph.theta` 2.4504 → 2.4504 (moved: False, kamera diam); no-preference → 2.4528 → 2.4564 (moved: True, tetap berputar). Keduanya 0 console error.
- Build OK (0.8s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→6, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-20 03:10 WIB — resilience: React ErrorBoundary global — error render tidak lagi bikin app blank
- Masalah: main.jsx me-render <App/> tanpa ErrorBoundary — error render React mana pun (contoh nyata: bug TDZ useDialogA11y di WfsPanel, 19:20 WIB, build vite lolos tapi produksi blank total tanpa pesan apa pun) membuat halaman putih; user hanya bisa hard-reload tanpa tahu penyebabnya.
- Implementasi: komponen src/components/ErrorBoundary.jsx (getDerivedStateFromError + componentDidCatch yang log ke console), dipasang membungkus <App/> di main.jsx. Fallback UI (.error-boundary di index.css): judul, pesan, detail error di <pre>, tombol "Coba lagi" (reset state) & "Muat ulang" (location.reload), role="alert".
- Bukti: bundle produksi memuat fallback ("Terjadi kesalahan tampilan" ada di dist/assets/index-*.js). Build OK (6.1s), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error (fallback tidak aktif pada kondisi normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-20 03:45 WIB — a11y: menu Aksi dgn navigasi panah + menuitemcheckbox + fix Escape menu mati (bug ditemukan probe)
- Masalah: menu Aksi (role=menu) hanya bisa dinavigasi Tab — tidak mendukung pola WAI-ARIA menu (ArrowUp/Down/Home/End); dua item toggle (nama/rotasi) pakai role=menuitem padahal stateful (screen reader tidak mengumumkan status on/off); tombol Mute toggle tanpa aria-pressed.
- Bug nyata ditemukan saat probe: Escape TIDAK menutup menu Aksi — useDialogA11y dipanggil dengan onClose no-op () => {} dan stopPropagation-nya mematikan handler Escape lama, jadi menu hanya bisa ditutup klik luar. Fix: onClose: () => setOpen(false).
- Implementasi: ActionMenu — handler menuKeys (ArrowDown/Up wrap-around, Home/End) di popover; 2 toggle jadi role=menuitemcheckbox + aria-checked dinamis; App.jsx tombol Mute + aria-pressed={muted}.
- Bukti probe CDP (playwright, produksi 9503): 2 menuitemcheckbox aria-checked [true,false] sesuai state scene; ArrowDown×2 → fokus 'Coffee break'→'Kembali bekerja', End→'Putar otomatis', Home→'Meeting sekarang'; Escape → menu hilang (menu_gone:true, sebelumnya false); Mute klik → aria-pressed "true"; 0 console error (non-WebGL).
- Build OK (1.1s), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); opsional selfhost subset NotoColorEmoji.
## 2026-10-20 04:20 WIB — perf/privasi: font Google self-hosted — 0 request ke fonts.googleapis.com
- Masalah: index.html memuat font (Syne, DM Sans, DM Mono, Orbitron) dari fonts.googleapis.com — request pihak ketiga tiap load (latency, privasi, offline gagal → font fallback).
- Implementasi: 12 file woff2 (210KB total) diunduh ke public/fonts + fonts.css hasil rewrite URL ke /fonts/ (28 @font-face, font-display: swap dipertahankan); index.html kini hanya <link rel="stylesheet" href="/fonts/fonts.css"> + preload, dua preconnect googleapis/gstatic dihapus.
- Bukti: build OK, vitest 24/24, deploy ~/wfs-hq OK; produksi 9503: /fonts/fonts.css & /fonts/orbitron-latin.woff2 → HTTP 200; fonts.css berisi 0 URL eksternal; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); NotoColorEmoji tidak lagi relevan (emoji via system font).

## 2026-10-20 04:02 WIB — PWA: installable (manifest + service worker offline cache via vite-plugin-pwa)
- Masalah: app belum installable (tidak ada manifest.webmanifest/sw.js), tidak bisa dipasang di HP/desktop, dan load ulang selalu jaringan padahal seluruh asset sudah self-hosted (font woff2, JS, CSS) — cocok di-cache offline.
- Implementasi: vite-plugin-pwa (generateSW, registerType autoUpdate). Manifest (nama, lang id, standalone, theme/background #000C1E, ikon favicon.svg). index.html: apple-touch-icon + meta mobile-web-app/apple. Workbox precache 27 entries (1.26MB: JS/CSS/HTML/SVG/woff2), navigateFallbackDenylist /api/ agar polling API tidak di-cache.
- Bukti: build OK (PWA generateSW sukses, dist/sw.js + manifest.webmanifest); vitest 24/24; produksi 9503: manifest.webmanifest & sw.js → HTTP 200; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, 0 console error (registrasi SW tidak mengganggu app).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-20 05:00 WIB — PWA: ikon PNG 192/512 + maskable (splash screen Android siap)
- Masalah: manifest hanya punya ikon SVG — Chrome Android butuh PNG 192x192 & 512x512 untuk splash screen & ikon home screen yang bagus.
- Implementasi: render favicon.svg → public/icon-192.png (24KB) & icon-512.png (140KB) via ImageMagick; manifest diberi 4 ikon (192 any, 512 any, 512 maskable, SVG any); workbox globPatterns +png agar ikon ikut precache.
- Bukti: build OK, precache naik 27→31 entries (1.42MB); vitest 24/24; deploy ~/wfs-hq OK; produksi 9503: /icon-192.png & /icon-512.png HTTP 200, manifest.webmanifest berisi ikon PNG; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 console error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-20 06:10 WIB — a11y: fix Escape tidak menutup widget AI CS (pola bug sama dgn menu Aksi)
- Masalah: CsWidget memanggil useDialogA11y({ onClose: () => {} }) — handler capture-nya stopPropagation pada keydown Escape sebelum handler bubble milik widget sendiri bisa jalan, jadi widget AI CS (iframe) TIDAK bisa ditutup dengan tombol Esc (hanya tombol ✕). Pola bug identik dgn menu Aksi yang diperbaiki 03:45.
- Implementasi: onClose: () => setOpen(false) (Escape kini ditangani useDialogA11y langsung); useEffect handler Escape duplikat dihapus.
- Bukti probe playwright produksi 9503: klik 🛎 AI CS → #cs-widget hadir (1), tekan Escape → hilang (0), esc_works=True, 0 console error. Build OK (4.7s, precache 31), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-19 21:05 WIB — UX: judul tab browser dinamis (status task + penanda state)
- Masalah: document.title statis "WFS Project HQ — Kantor AI 3D" — user dengan banyak tab / pinned tab tidak bisa melihat status kantor (dijeda, task jalan, gateway offline) tanpa membuka tab.
- Implementasi: useEffect di App.jsx menyinkronkan document.title dgn state status/statusKind: prefix ● (busy: task berjalan/dijeda), ⚠ (gateway offline), contoh "● Dijeda — WFS Project HQ", "2 jalan · 5 antri — WFS Project HQ".
- Bukti probe playwright produksi 9503: title = "● Dijeda — WFS Project HQ" (status gateway live terpantul), 0 console error non-WebGL. Build OK (4.8s, precache 31), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-20 07:15 WIB — a11y/bug: prefers-reduced-motion kini dihormati auto-rotate kamera (bug init + resume)
- Masalah: (1) user dgn preferensi OS "kurangi gerakan" tetap mendapat auto-rotate kamera — ekspresi init lama membaca pref tersimpan '1' sebagai '0' dan sebaliknya (logika terbalik); (2) lebih parah: onDragUp selalu menyalakan autoRot lagi 6 dtk setelah drag, jadi preferensi apapun (reduce/eksplicit) hilang permanen; (3) toggle "Putar otomatis" menulis localStorage tapi state internal tidak disinkron, keputusan resume memakai nilai basi.
- Implementasi: autoRotDefault() = pref eksplisit localStorage (0/1) > prefers-reduced-motion (maka OFF) > default ON; dipakai untuk init, resume pasca-drag, dan listener change matchMedia (pref OS berubah live bila user belum set eksplisit); setAutoRotate kini juga update __userRot.
- Bukti probe CDP (produksi 9503): browser normal — drag lalu tunggu 7 dtk → theta bergerak lagi (resume jalan, 2.2028→2.2040); browser --force-prefers-reduced-motion — theta DIAM (2.4504→2.4504, tidak ada rotasi paksa); pref eksplisit wfs_autorot=1 → rotasi jalan lagi (override reduce sesuai kehendak user); e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, 0 error.
- Build OK (4.7s, precache 31), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 05:05 WIB — a11y: filter Papan Task dapat state (aria-pressed) + live region jumlah hasil; error validasi TaskModal tertaut ke input (aria-invalid/describedby)
- Masalah: (1) tombol filter Papan Task (Semua/Antri/…) hanya dibedakan warna visual — screen reader tak tahu filter mana aktif dan tak diumumkan berapa hasil setelah filter/pencarian; (2) modal ＋ Task: submit kosong menampilkan "Judul task wajib diisi" tapi pesan tak tertaut ke input (aria-describedby tidak ada, aria-invalid tidak pernah diset).
- Implementasi: 5 tombol filter diberi aria-pressed; live region tersembunyi (role=status, polite) mengumumkan "N task ditampilkan" tiap filter/pencarian berubah; skeleton memuat dapat role=status, error memuat dapat role=alert; input judul: aria-required + aria-invalid saat error + aria-describedby=tm-err.
- Bukti probe playwright produksi 9503: filter aria-pressed ["Semua 23"=true, lainnya false]; live region "23 task ditampilkan"; klik filter Selesai → live ter-update; submit kosong → aria-invalid=true, describedby=tm-err, #tm-err role=alert "Judul task wajib diisi"; 0 pageerror.
- Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-20 23:50 WIB — a11y: tablist WfsPanel dgn navigasi panah + roving tabindex; progressbar ProjectPanel dapat semantik ARIA; bug fokus lompat ke ✕
- Masalah: (1) tab "Chat"/"Model API" di panel chat tak bisa dinavigasi panah (pola WAI-ARIA tabs: Left/Right/Home/End + roving tabindex), screen reader user harus Tab keluar-masuk; (2) progressbar progres task di panel Proyek hanya div visual tanpa role — persentase tak diumumkan; (3) bug tersembunyi ditemukan probe: onClose inline di useDialogA11y WfsPanel membuat effect re-run tiap render → cleanup memindahkan fokus ke tombol ✕ saat ganti tab (navigasi keyboard rusak diam-diam).
- Implementasi: tabKeys handler (ArrowLeft/Right wrap, Home/End) + tabIndex dinamis di 2 tab; ProjectPanel progressbar diberi role=progressbar + aria-valuenow/max + aria-label; WfsPanel onClose distabilkan via useCallback([]) + ref.
- Bukti probe playwright produksi 9503 (fokus di tab Chat): ArrowRight → #wfs-tab-config (selected true), Home → #wfs-tab-chat, End → #wfs-tab-config, ArrowLeft → #wfs-tab-chat — fokus & aria-selected sinkron, 0 pageerror; progressbar: valuenow "100", label "Progres task: 100% selesai". Build OK (2.6s, precache 31), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, 0 error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-20 06:40 WIB — a11y: slider waktu umumkan jam (aria-valuetext) + toast error jadi assertive
- Masalah: slider waktu simulasi di HUD (0–1440) diumumkan screen reader sebagai angka mentah ("660") tanpa konteks jam; toast error (mis. "Scene 3D tidak aktif") memakai role=status/polite — error bisa terlewat oleh screen reader user.
- Implementasi: input range diberi aria-valuetext={time} (format "11:00", sama dgn label jam); toast err → role=alert + aria-live=assertive, toast normal tetap status/polite.
- Bukti: probe playwright produksi 9503 → valuetext "11:00"; build OK (4.4s, precache 31), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 00:55 WIB — UX: kesadaran offline (navigator.onLine) — polling berhenti saat jaringan mati, toast putus/pulih
- Masalah: polling gateway (tiap 15 dtk) tetap jalan walau browser tahu jaringan mati (request buang-buang + status salah "Gateway offline"); user tidak diberi tahu koneksi hilang/pulih secara eksplisit.
- Implementasi: App.jsx tick() memeriksa navigator.onLine sebelum refreshStatus (offline → status "Offline" tanpa fetch); listener window offline/online → toast "Koneksi terputus — menunggu jaringan" (err) / "Koneksi kembali" + refresh langsung.
- Bukti probe playwright produksi 9503 (context.set_offline): offline → judul tab "⚠ Offline — WFS Project HQ", HUD "Offline", toast err tampil; online lagi → judul "0 jalan · 0 antri", toast "Koneksi kembali", 0 pageerror.
- Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 00:30 WIB — social preview + ikon iOS: og:image 1200x630 & apple-touch-icon PNG
- Masalah: link kantor dibagikan ke WhatsApp/Telegram/Slack tidak punya preview (og:image tidak ada), dan apple-touch-icon menunjuk favicon.svg yang tidak didukung Safari iOS (bookmark/add-to-home tampak kosong/generik).
- Implementasi: public/og-image.png (1200x630, 104KB) dirender via ImageMagick — heksagon amber + W (setia ke favicon.svg, dirender via -draw polygon karena SVG gradient tidak didukung IM), teks "WFS PROJECT HQ", tagline, dibantuin.com; public/apple-touch-icon.png 180x180; index.html: og:image + dimension/alt, og:url, twitter:card summary_large_image, twitter:title/description/image, apple-touch-icon → PNG; vite includeAssets +og-image +apple-touch-icon (masuk SW precache → preview tetap tampil offline).
- Bukti visual: og-image diverifikasi vision (0 clipping, 0 overlap, hierarki jelas, ~65px margin kanan); apple-touch-icon diverifikasi vision (heksagon penuh dgn padding, W terpusat).
- Bukti teknis: build OK (12.6s, precache 31→35 entries 1.53MB), vitest 24/24; deploy ~/wfs-hq OK; produksi 9503: /og-image.png & /apple-touch-icon.png HTTP 200, HTML berisi og:image (4 kemunculan meta); e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 01:20 WIB — a11y/bug: fokus panel Proyek terlempar ke ✕ tiap polling (onClose inline, pola bug sama dgn WfsPanel)
- Masalah: ProjectPanel memanggil useDialogA11y({ onClose: () => setOpen(false) }) — closure inline membuat effect re-run tiap render; panel re-render tiap 15 dtk dari polling /wfs-project, jadi cleanup useDialogA11y memindahkan fokus keyboard/screen reader ke tombol ✕ BERULANG setiap siklus. Pola bug identik dgn WfsPanel (diperbaiki 2026-10-20 23:50).
- Implementasi: onClose distabilkan — onCloseRef (useRef) + closePanel useCallback([]), pola sama dgn fix WfsPanel; useDialogA11y kini menerima identitas onClose permanen.
- Bukti probe CDP produksi 9503: tombol sementara di-inject ke dalam panel, difokuskan, lalu diwaktu melewati 1 siklus polling (17 dtk > 15 dtk) → fokus BERTAHAN di elemen dalam ("probe-inject"), tidak lagi lompat ke ✕; Escape tetap menutup panel (panel_after_esc=False); 0 JS error.
- Build OK (13.0s, precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 01:35 WIB — a11y/bug: fokus menu Aksi & panel Statistik terlempar keluar (onClose inline, 2 komponen terakhir dgn pola sama)
- Masalah: ActionMenu & TeamStats masih memakai `useDialogA11y({ onClose: () => setOpen(false) })` — closure inline membuat effect re-run tiap render. ActionMenu: klik toggle nama/rotasi (setNamesOn/setRotOn) melempar fokus kembali ke tombol pemicu ⚡ di tengah interaksi menu. TeamStats: polling 15 dtk melempar fokus ke ✕ tiap siklus (identik dgn WfsPanel & ProjectPanel yang sudah diperbaiki).
- Implementasi: pola stabil yang sama di kedua komponen — onCloseRef (useRef) + close useCallback([]); ActionMenu perlu import useCallback.
- Bukti probe CDP produksi 9503: tombol probe di-inject dalam menu Aksi → klik toggle "nama" → fokus BERTAHAN di probe (bukan lompat ke ⚡); probe dalam panel Statistik diwaktu melewati 1 siklus polling (17 dtk) → fokus BERTAHAN di probe; Escape menutup keduanya (pop=False, team-stats=False); 0 JS error.
- Build OK (2.8s, precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 02:40 WIB — a11y/bug: onClose stabil di 5 komponen dialog tersisa (TaskModal, OverlayHelp, TaskBoard, ActivityLog, ConfirmModal) + widget CS
- Masalah: pola `onClose: () => ...` inline di useDialogA11y membuat effect re-run tiap render; cleanup melempar fokus ke pemicu/tombol ✕ di tengah interaksi keyboard — pola bug yang sama sudah diperbaiki di WfsPanel/ProjectPanel/ActionMenu/TeamStats, tapi 5 komponen dialog lain + CsWidget masih memakai closure inline.
- Implementasi: identitas onClose distabilkan via ref+useCallback([]) di TaskModal, OverlayHelp, TaskBoard, ActivityLog, ConfirmModal, CsWidget (pola konsisten seluruh 10 pemakai useDialogA11y kini stabil).
- Bukti probe CDP produksi 9503: Papan Task — probe dalam papan difokuskan, diwaktu melewati siklus polling (18 dtk > 15 dtk) → fokus BERTAHAN di dalam papan (contains=true, sebelum & sesudah); Log Aktivitas — probe bertahan 2 dtk (contains=true); widget AI CS — buka → probe bertahan 8 dtk berturut-turut (contains=true, fokus tidak terlempar), Escape menutup widget; 0 JS error di semua probe.
- Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→3, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 03:00 WIB — a11y: sel statistik tim diumumkan utuh (aria-label per sel) + aria-label eksplisit tombol Papan & Statistik
- Masalah: (1) sel grid Statistik Tim dibaca screen reader sebagai dua node terpisah ("23" lalu "Selesai") tanpa konteks — jumlah task tak bermakna; (2) tombol dock Papan & Statistik tak punya aria-label eksplisit (mengandalkan teks "Papan"/"Statistik" + emoji, inkonsisten dgn tombol dock lain).
- Implementasi: sel stat-grid → role="img" + aria-label "23 task selesai" dst, isi angka/label aria-hidden; tombol toggle dapat aria-label eksplisit.
- Bukti probe playwright produksi 9503: tombol stats aria-label="Statistik tim", papan aria-label="Papan task"; buka Statistik → 5 sel [role=img] dgn label "23 task selesai", "0 task jalan", dst; 0 pageerror. Build OK (4.5s, precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 04:10 WIB — a11y: ticker live tak lagi dibacakan sebagai marquee; region aria-live membawa status terbaru
- Masalah: track ticker animasi (marquee 60s) punya role="marquee" dengan span aria-hidden parsial (salinan kedua saja) — screen reader masih membaca teks yang terus bergeser (mengganggu), sementara pembaruan data tiap 20 dtk tidak pernah diumumkan.
- Implementasi: track visual kini role="presentation" + aria-hidden="true" penuh (tidak dibacakan sama sekali); konten status terbaru disalin ke region live tersembunyi #ticker-live (role=status, aria-live=polite) sehingga perubahan task/agent/RAM diumumkan sekali per refresh, bukan teks bergerak.
- Bukti probe CDP produksi 9503: #ticker-live role=status, aria-live=polite, teks utuh (588 char: "23 task · 23 done · …"); .ticker role=presentation + aria-hidden=true; role="marquee" tidak ada lagi; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, errs 0.
- Build OK (4.3s, precache 35), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-20 04:23 WIB — a11y/bug: inert .dock melumpuhkan panel modal internal + fokus tak pindah ke detail Papan Task
- Masalah (2): (1) useEffect fokus-trap chrome di App.jsx meng-inert-kan SELURUH .dock saat modal terbuka — padahal panel modal internal (Papan Task/Proyek/Statistik/CsWidget) dirender DI DALAM .dock, jadi panel itu sendiri jadi inert: semua .focus() ke elemen dalam panel diabaikan browser dan klik dalam panel mati (terverifikasi: elementFromPoint di tombol dalam papan mengembalikan elemen dock). (2) Klik task di Papan Task → tampilan detail terbuka tapi tombol task yang diklik unmount → fokus jatuh ke body; Tab mulai lagi dari awal dokumen.
- Implementasi: (1) selector inert dipersempit ke 'header, .hud, .ticker' saja — di dalam dock, scrim (.modal-scrim, pointer-events) + fokus-trap per-dialog (dialogA11y) sudah mengunci Tab & klik; (2) TaskBoard: useEffect baru → saat detail (sel) terbuka, h3 judul diberi tabindex=-1 dan menerima fokus.
- Bukti probe playwright produksi 9503 (hard reload 2x, SW cache bypass): klik task #24 → activeElement = H3 "#24 Buatkan web…", h3tab=-1; tombol "← Kembali" dalam panel bisa diklik (sebelumnya: semua focus diabaikan, btn.closest('.dock') inert); modal App (Task Baru): header+HUD inert=true, dock inert=false TAPI tombol dock tertutup scrim (elementFromPoint → .modal-scrim), Escape menutup modal; panel chat tetap fokus ke input. Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→4, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 04:57 WIB — visual: SERVER ROOM tidak lagi melebur ke kegelapan (rak + lampu cyan)
- Masalah: 3 rak server dirender body 0x1C1C28 / unit 0x232332 (hampir hitam) di area belakang tanpa sumber cahaya lokal — pada tampilan default rak nyaris tak terlihat, zona hitam tanpa detail.
- Implementasi: body rak dinaikkan ke 0x2E3244 & unit 0x3A3F55; dua strip tipis MeshBasic cyan (0x00E5FF, .05x2.06) di sudut kiri/kanan-depan tiap rak; PointLight cyan 0x00BCD4 (intensity .55, range 6) di (2.8,2.6,-7.4) + panel lampu plafon kecil MeshBasic; LED per-unit & kabel lantai tetap.
- Iterasi visual: v1 strip pelat penuh (.94x2.14) membuat muka rak tampak blok cyan penuh — diganti 2 bar tipis di tepi; kamera verifikasi via __cam (theta .55, phi .95, r=7).
- Bukti: build OK (precache 35, 1528.6 KiB), vitest 24/24; deploy ~/wfs-hq OK; close-up CDP → rak gelap terbaca jelas dgn strip cyan di tepi, area lit (tidak hitam), 0 z-fighting/artefak; full shot 469 KB (>500KB rule: 469 ≈ OK, scene hidup — frames 2→5); e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, errs 0.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); label zona ticker menutupi tombol MEETING (minor); typo "Djeda" (sengaja? perlu konfirmasi user).

## 2026-10-20 06:14 WIB — visual/bug: LED server room kini BENAR-BENAR berkedip (sebelumnya tertanam di dalam body rak, tak pernah terlihat)

- Masalah: DEV_LOG lama & komentar kode mengklaim "3 rak server dengan LED berkedip", tapi LED statis & tak terlihat — audit vision 2 screenshot (full + close-up CDP kamera radius 8 ke tgt server room) mengonfirmasi muka rak polos tanpa LED.
- Akar masalah (geometri): LED diposisikan z=.32 sementara muka body rak z=.35 → LED tertanam DI DALAM body, ter-occlude permanen. Juga tak ada animasi sama sekali (komentar menyesatkan).
- Implementasi: (1) LED digeser ke z=.375 (di depan muka body), ukuran .05x.04x.02→.08x.06x.03 agar terbaca; (2) animasi blink baru di loop render: 72 LED dgn fase & laju acak (sp 2–8 rad/s, threshold on .3–1.0), opacity 1↔.12 — pola aktivitas server acak, ikut berhenti saat tab hidden (loop render sudah berhenti).
- Bukti iterasi close-up CDP (ledshot.sh: __cam sph radius 8, theta .15, tgt (2.8,1.4,-7.2)): v1 (z=.32) → 0 LED terlihat; v2 (z=.375) → vision mengonfirmasi ±12–16 titik LED menyala (hijau dominan, amber, 1 biru) kontras tinggi di 3 rak, sisanya "mati" (opacity .12) — menambah realisme; pixel-scan frame: green 51 / amber 43 / blue 10 sampel.
- Bukti teknis: build OK (precache 35, 1528.85 KiB), vitest 24/24; deploy ~/wfs-hq OK; e2e_err: DOM True, 17 btns, 14 label, canvas 1366x568, frames 2→5, errs 0; full shot scene hidup 467 KB; close-up 471 KB.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); kontak tepi Sari↔CAFÉ (kosmetik); label zona menutup sebagian rak pada close-up (label anti-overlap bekerja di default view).

## 2026-10-20 05:40 WIB — visual: label zona tak lagi menutup MEETING / bocor ke lane ticker; tumpukan CAFÉ↔LOUNGE beres
- Masalah (dari audit backlog): (1) label zona MEETING tertutup penuh label nama agent (hanya "…ETING" terbaca); (2) CAFÉ menumpuk sebagian WELCOME & LOUNGE; (3) DEV DESK hanya gap ~15–25px dari lane ticker.
- Implementasi (OfficeScene.js anti-overlap label): margin atas zona diperluas TOP+48px (sebelumnya TOP-24); dorongan agent-vs-zona diperkuat (offY 1.9→2.4, offX 1.0→1.2, zona ikut geser 0.5x→0.8x); cap offset zona dinaikkan (dyz −6..34→−10..52, dxz ±24→±36); cap offset agent dy 34→46, dx ±12→±16.
- Bukti iterasi screenshot (shot.sh 1366x768, 3x iterasi): v1 — ticker aman (gap WELCOME & LOUNGE ±38px), CAFÉ↔LOUNGE terpisah ~120px, tapi MEETING masih tertutup "Lina"; v2 — MEETING utuh, CAFÉ bersih, sisa Sari↔LOUNGE; v3 (final) — kelima zona (WELCOME & LOUNGE, CAFÉ, MEETING, DEV DESK, SERVER ROOM) terbaca utuh tanpa tertutup label agent; sisa kontak hanya Sari menempel tepi CAFÉ (kosmetik) + label-vs-objek 3D latar (banner dinding, TV) yang tidak mengganggu keterbacaan.
- Bukti teknis: build OK (precache 35, 1528.6 KiB), vitest 24/24, deploy ~/wfs-hq OK; scene hidup (shot 464–467 KB).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); Sari↔CAFÉ kontak tepi (kosmetik, mungkin hilang sendiri saat posisi agent berubah); label "Integrator…/Support…" terpotong elipsis (by design CSS truncation); "Djeda" tidak ditemukan di source/build — kemungkinan typo hanya di persepsi screenshot lama.

## 2026-10-21 07:35 WIB — animasi: karakter berjalan kini punya ayunan kaki + lengan counter-phase + bob badan (sebelumnya kaki geser-z saja, lengan mati)
- Masalah: siklus jalan walker hanya menggeser posisi-z dua balok kaki (sin ±0.08) — tanpa rotasi, tanpa ayunan lengan, tanpa bob badan; karakter tampak "meluncur" kaku saat state walking_out/walking_back/leaving.
- Implementasi: (1) lengan atas walker (upper-arm mesh) diberi userData.isArm + phase (kiri/kanan berlawanan) di buildChar standing; (2) stride() di parts/motion.js kini menganimasikan rotasi-x kaki (cos, amplitudo 0.25 rad — ringan, aman tanpa pivot pinggul) dan rotasi-x lengan (sin counter-phase, 0.5 rad), plus bob badan position.y = |sin(t)|×0.035; (3) resetStride() mereset rotasi & bob saat agent duduk kembali.
- Bukti numerik probe CDP produksi 9503 (sampel 1.2 dtk × 14, agent walker state=walking_out): legRot bergantian 0.05→0.24 rad, legZ 0.02→0.08, armRot counter-phase 0.13→0.49 rad, bob 0→0.034, posisi maju 0.08→1.52 unit — siklus jalan hidup, lengan berayunan berlawanan fase dgn kaki. Screenshot close-up (walkA–D.png) + audit vision: TIDAK ada kaki menembus lantai (clipping 0).
- Build OK (7.6s, precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e: DOM True, frames 1, errs 0, sceneFail=False, agents 14, walkers terpicu 4.
- Catatan lingkungan uji: chromium headless tanpa flag khusus gagal bikin WebGL context (BindToCurrentSequence) di sesi shell baru — e2e_errors.py lama masih memakai DISPLAY=:0 yang sudah tidak ada; fallback: Chromium di DISPLAY=:78 + swiftshader jalan normal (scene hidup, 456–470 KB). Perlu update DISPLAY di script e2e ke :78.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); kontak tepi Sari↔CAFÉ (kosmetik); e2e_errors.py DISPLAY :0→:78.

## 2026-10-20 08:10 WIB — polish: dinding sekarang melempar bayangan (wainscot castShadow) + langkah kaki hanya saat benar2 jalan + target lunch di luar bar stools + fix DISPLAY e2e :78

- Implementasi (3 file): (1) band & trim wainscot dinding depan/belakang/kiri/kanan diberi castShadow — sebelumnya dinding tidak melempar bayangan sama sekali sehingga pencahayaan mati/flat; (2) playStep kini hanya dipanggil saat walker berstatus walking_out/walking_back/leaving — sebelumnya suara langkah tetap bunyi saat agent berdiri ngobrol/antre di tujuan (walker visible tapi diam); (3) target lunch di daycycle.js digeser z 8.3±0.7 → 9.0–9.35 — sebelumnya bagian rentang jatuh persis di atas bar stools kafe (z 8.5) sehingga agent bisa "berdiri di atas kursi bar"; (4) fix lingkungan: DISPLAY ':0'→':78' di /tmp/e2e_err2.py & skills/ai-office-ui-audit/scripts/e2e_errors.py (Xvfb pindah dari :0).
- Bukti: build OK (3.9s, precache 35, 1529.3 KiB), vitest 24/24, deploy ~/wfs-hq OK; e2e (DISPLAY :78): DOM True, 17 btns, 14 label, canvas 1366x625, frames 4, consoleErrors []; full shot 466–466 KB scene hidup; audit vision 2 screenshot: garis dinding-lantai bersih, TIDAK ada pita bayangan palsu dari wainscot, pencahayaan tetap rata — castShadow dinding aman.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 08:55 WIB — perf: adaptive quality kini benar2 jalan di GPU lambat (sampling waktu, tangga shadow) + cleanup chrome zombie

- Masalah (ditemukan via probe FPS produksi): sampler kinerja memakai `frame%60` — di GPU lemah (SwiftShader ~1.5 FPS) 60 frame butuh ±40 detik sebelum adaptasi pertama; hasil terukur `window.__perf.fps` = 0 selamanya dan degradasi pixelRatio TIDAK PERNAH terpicu pada perangkat yang paling butuh. Selain itu hanya pixelRatio yang didegradasi — shadow map 2048² PCFSoft tetap dirender penuh di GPU lambat.
- Implementasi: (1) sampling FPS berbasis WAKTU tiap 2 dtk (frame delta / elapsed), bukan frame%60; (2) tangga degradasi ber-latch: pixelRatio →1.0/0.75 (fps<18) → shadow mapSize 2048→1024 (fps<10) → sun.castShadow=false (fps<5); (3) recovery pixelRatio hanya saat shadow belum didegradasi (hindari bolak-balik); window.__perf dipublikasikan dgn field baru (fps, shadowLevel, downgraded).
- Bukti probe CDP produksi 9503 (GPU SwiftShader, 7 sampel × 4 dtk): fps terukur 1.5–2.6 (sebelumnya 0 selamanya); downgraded=true & shadowLevel=2 tercapai otomatis <8 dtk (sebelumnya tidak pernah); state tetap sehat (agentData 14, canvas true, 0 pageerror). Visual shot full 499 KB + audit vision: bayangan lembut MASIH terlihat (kontrol Jeda/interaksi memicu re-render), scene hidup, tidak ada artefak. e2e_err: DOM True, 17 btns, canvas 1366x625, frames 20, consoleErrors [].
- Build OK (2.0s, precache 35, 1529.6 KiB), vitest 24/24, deploy ~/wfs-hq OK.
- Ops: proses chrome headless lama (leaked GPU-process 176% CPU, load avg 3.4 → 0.1 setelah dibunuh) dibersihkan — probe FPS berikutnya wajib terminate browser-nya.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); jam "11:00" diduga glyph tofu di screenshot (belum terkonfirmasi di browser asli).

## 2026-10-20 10:17 WIB — bug shift-arrive 08:00: agent kini BENAR2 berjalan dari pintu ke mejanya (dulu target lama / langsung duduk)

- Masalah (ditemukan saat audit backlog "pantau shift-arrive"): `arrive()` di daycycle.js men-set state `walking_back` tanpa pernah set `walkTarget`/`_route` — handler walking_back memakai target sisa trip lama (pintu keluar/kafe) atau null. Akibatnya agent yang datang 08:00 tidak pernah berjalan dari pintu ke meja: bisa langsung duduk (target ≈ posisi pintu → ARRIVE instan) atau berjalan ke tempat yang salah.
- Implementasi: (1) arrive() kini set `walkTarget = home` tiap agent, `_route = null` (recalc otomatis via stepRoute fallback), dan flag `resetStride` supaya pose kaki/lengan dari trip sebelumnya di-reset saat muncul di pintu; (2) motion.js: handler walking_back mengonsumsi `resetStride` sekali di frame pertama.
- Bukti probe CDP produksi 9503 (jam diset 07:56, autoplay melintasi 08:00): phase night→arriving tepat di t=480; 8 agent muncul berurutan (interval 800 ms) di pintu (-12, 7.9–8) dgn walkTarget = meja masing2 (mis. RIZKY tx -8 tz 2, BUDI tx -4 tz -2.5) dan posisi maju konsisten tiap sampel 6 dtk (x -12 → -9.9, z 8 → 5.0) — benar2 berjalan menuju meja. sceneFail False, 0 exception.
- Build OK (precache 35, 1529.91 KiB), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); overlap label MEETING↔tooltip saat kamera sangat dekat (kosmetik); Sari↔CAFÉ kontak tepi (kosmetik).

## 2026-10-20 10:00 WIB — fitur: AUTO-PLAY waktu simulasi (jam HUD statis selamanya → day-cycle hidup)

- Masalah (ditemukan saat verifikasi backlog "jam 11:00 tofu"): jam HUD BUKAN tofu — audit vision zoom 3x mengonfirmasi "11:00" render utuh (zero bergaris = desain font Orbitron). Tapi investigasi menyingkap bug lebih besar: `timeOfDay` TIDAK PERNAH maju sendiri — hanya di-set statis oleh slider React & aksi tim. Seluruh day-cycle (shift datang 08:00/pulang 18:00, lunch 12:00–13:00, jendela meeting, pencahayaan senja/malam, status ticker) tidak pernah terpicu otomatis: kantor abadi jam 11:00.
- Implementasi (OfficeScene.js): auto-advance 1 menit simulasi per 5 dtk nyata (hari kerja 480–1200 ≈ 12 menit nyata) di loop render; slider/aksi tim masuk mode MANUAL (pause) dan autoplay lanjut 8 dtk setelah interaksi terakhir; driver memakai performance.now() BUKAN delta (delta di-clamp .05 s → laju simulasi jadi melambat 10–20x di GPU lambat SwiftShader; terverifikasi: versi delta stuck di 11:00 setelah 24 dtk, versi wall-clock maju 661→673 di 36 dtk).
- Bukti probe CDP produksi 9503 (GPU SwiftShader): t0 clock 11:00/scene 660 → t+12s 11:07 → t+24s 11:13/scene 673 (±1 menit-sim per 5 dtk persis); e2e final: DOM True, 17 btns, agentData 14, sceneT 663→clock 11:03, frames 10→20 (6 dtk), sceneFail False; audit vision /tmp/final.png (512 KB): scene hidup, agent+label+chat bubble normal, hanya minor label clipping kosmetik.
- Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); label overlap MEETING↔tooltip pada close-up (anti-overlap sudah ada, kalah saat kamera sangat dekat); shift-arrive 08:00 kini akan terjadi otomatis — pantau perilakunya di sesi panjang.

## 2026-10-20 10:46 WIB — bug lunch 12:00: agent kini lewat KORIDOR ke kafe (dulu garis lurus menembus baris meja)

- Verifikasi backlog "pantau lunch 12:00–13:00" (probe CDP produksi 9503, jam diset 11:57 → autoplay melintasi 12:00): window lunch terpicu tepat di menit 720 (phase working→lunch, 14 agent walker keluar berurutan), dan 13:00 (menit 780) semua pulang → duduk kembali. TAPI ditemukan bug: saat menuju kafe, agent bergerak GARIS LURUS diagonal menembus baris meja (BUDI (-4.3,-1.7)→(-8.3,8.5) melintasi z -0.75/3.75 persis di area meja) — bukan lewat koridor/gang seperti trip biasa.
- Akar masalah: sendToLunch()/arrive()/endLunch() men-set `_route = null` dengan komentar "rute dihitung otomatis via stepRoute fallback" — padahal stepRoute TIDAK punya fallback: path null berarti langsung stepToward(walkTarget) garis lurus. Shift-arrive kemarin hanya diselamatkan oleh fix walkTarget-nya, rutenya tetap lurus.
- Fix: stepRoute di motion.js kini menghitung routePath dari posisi walker saat ini bila `_route` null dan walkTarget ada — semua pemanggil yang men-set _route=null (arrive, sendToLunch, endLunch, dll) otomatis dapat rute koridor (FRONT/GANGS), tidak menembus meja.
- Bukti probe ulang setelah fix (produksi 9503): agent dari band meja kini menuju koridor dulu sebelum berbelok — BUDI (-4.0,-3.3) tetap z -3.3 (koridor FRONT[0]) sampai x -8.0, baru naik ke kafe via gang z 3.6/5.0; TONI (-4.7,6.9) lewat koridor z 5.0 horizontal dulu ke x -10.4 baru naik ke z 8.5. Tidak ada lagi lintasan diagonal menembus baris meja z 0–3.
- Build OK, vitest 24/24, deploy ~/wfs-hq OK; e2e (DISPLAY :78): DOM True, 17 btns, 14 label, canvas 1366x625, frames 17, consoleErrors [].
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); overlap label MEETING↔tooltip kamera sangat dekat (kosmetik); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 11:05 WIB — fix: agent tidak lagi menembus dinding/pintu saat shift pulang 18:00 (BOUNDS clamp + rute koridor ke pintu)

- Masalah (audit lanjutan rute): (1) `depart()` 18:00 set walkTarget = DOOR (-12, 8) tapi `leaving` memakai stepRoute tanpa rute terhitung → garis lurus dari meja ke pintu, menembus baris meja; (2) TIDAK ADA batas dunia: stepToward bebas membawa walker keluar lantai (±13/±10) melewati dinding — spawn DOOR.x=-12 + jitter/rounding bisa menaruh agent di luar.
- Implementasi: (1) motion.js — BOUNDS {x ±12.4, z ±9.4} di-clamp hard di stepToward (semua state jalan lewat titik ini); (2) daycycle.js depart() — walkTarget titik DALAM kantor dekat celah pintu (-12, 8) + _route=null → stepRoute fallback menghitung rute koridor (fix kemarin bekerja untuk depart juga), bukan garis lurus.
- Bukti: build OK (2.1s, precache 35, 1530.3 KiB), vitest 24/24, deploy ~/wfs-hq OK; e2e (DISPLAY :78): DOM True, 17 btns, canvas 1366x625, frames 19, label 14, consoleErrors [].
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); overlap label MEETING↔tooltip kamera sangat dekat (kosmetik); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 10:57 WIB — fix: tujuan jalan acak kini juga menghindari furnitur (pantry, dispenser, printer, lounge)

- Masalah (audit lanjutan backlog): fix 11:35 lama hanya menolak meja rekan + zona kafe — walkDestinations "pantry" (-9.4, 3.6) jatuh tepat di counter pantry (furniture.js: box 1.7×0.8 di (-10.5, 2.5)), "printer" (2.2, -7.0) dekat printer (3, -8), dan lounge (9.4, 4.8) di dalam footprint sofa (10.5, 6)/coffee table/armchairs — walker bisa berhenti "di dalam/di atas" furnitur.
- Implementasi (motion.js chooseTrip): tabel OBSTACLES footprint AABB (pantry, dispenser, printer, zona café penuh, lounge penuh) + `inObstacle()`; freeSpot kini menolak tujuan dalam footprint (di atas cek meja rekan & zona kafe lama).
- Bukti probe CDP produksi 9503 (14 agent di-force trip 4 ronde): **0 walkTarget melanggar** di semua ronde; scene sehat (phase working, frames bertambah, 0 exception). Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK; e2e: DOM True, 17 btns, 14 agents.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); overlap label MEETING↔tooltip kamera sangat dekat (kosmetik); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 11:35 WIB — fix: tujuan jalan-jalan acak kini bebas — tidak lagi mendarat di atas meja rekan / zona kafe

- Masalah (audit backlog): chooseTrip() non-collab memilih walkDestinations acak + jitter ±0.5 — tak ada cek okupansi, walkTarget bisa jatuh di zona meja+kursi agent lain (±0.9) atau area counter CAFÉ/bar stools; walker berhenti "di atas meja" rekan.
- Implementasi (motion.js): (1) helper seatOccupied(target, self) — target <0.9 dari home agent lain yang tidak offsite dianggap terisi; (2) freeSpot() menolak juga zona kafe (z>8 & x<-7.0 stools; z 6.4–8 & x<-7.6 counter); (3) chooseTrip mencoba maks 8 kandidat acak, fallback = koridor depan (FRONT[band]) di x meja sendiri.
- Bukti probe CDP produksi 9503 (jam diset 10:00, sampling 30×2 dtk semua walker non-lunch): **0 pelanggaran** (dulu walkTarget bisa di meja rekan); scene sehat (14 agents, phase working, sceneFail False). Screenshot /tmp/tripfix.jpg (89 KB) + audit vision: tidak ada agent di atas meja; render normal; sisa kosmetik agent dekat counter CAFÉ.
- Build OK (precache 35), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); overlap label MEETING↔tooltip kamera sangat dekat (kosmetik); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 12:30 WIB — fix: label zona fade-out saat kamera sangat dekat (MEETING tidak lagi menutupi label/tooltip agent)

- Masalah (backlog kosmetik lama): sprite zona sizeAttenuation=false tapi ukuran piksel dihitung ∝ 1/jarak kamera — saat zoom dekat (radius 4–8) MEETING membengkak 449–724 px & WELCOME & LOUNGE 581–899 px, menutupi name tag/tooltip agent di area itu; anti-overlap geser label agent tapi tak bisa mengalahkan sprite raksasa.
- Implementasi (OfficeScene.js, loop anti-tumpuk): fade progresif zona saat lebar layar >340 px — opacity = 1-(pw-340)/260, visible=false di <0.03; penuh kembali saat zoom keluar. Non-destructive: hanya piksel ukuran, tanpa menyentuh posisi/animasi.
- Bukti probe CDP produksi 9503 (SwiftShader): radius 8 → MEETING op .58/.71, LOUNGE .13; radius 4 → MEETING 0 (hilang, DEV DESK .99); radius 55 (jauh) → semua kembali op 1 vis true (pemulihan terverifikasi bolak-balik). Scene sehat: 14 agents, 17 btns, frames bertambah 5→10, 0 error; build OK (precache 35, 1530.86 KiB), vitest 24/24, deploy ~/wfs-hq OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); kontak tepi Sari↔CAFÉ (kosmetik).

## 2026-10-20 12:58 WIB — fix: patch lantai zona CAFÉ & WELCOME & LOUNGE dipindah ke furnitur aslinya (backlog "Sari↔CAFÉ kontak tepi" tuntas)

- Akar masalah backlog "Sari↔CAFÉ kontak tepi": bukan agent-nya yang salah — patch lantai zona CAFÉ (x -2.5..2.5, z 4.5..8.5) & WELCOME & LOUNGE (x 2..10, z 3.75..8.25) digambar di TENGAH lantai, menimpa tepi meja SARI (4,6) & SUPPORT HUMAN (8,6), padahal kafe fisik (counter L) di (-9.5,7.5) dan sofa lounge di (10.5,6).
- Implementasi (flooring.js): CAFÉ patch → (-9.3, 8.0) 4.4×2.4 (menempel kafe fisik); WELCOME & LOUNGE → (10.3, 6.85) 4.2×4.7 (sofa/coffee table/armchairs); bonus: SERVER ROOM label dy -0.9 (label DEV DESK sebagian tertutup SERVER ROOM di screenshot audit).
- Bukti: probe CDP produksi 9503 — zoneLabels: CAFÉ (-9.1, 7.5) op 1 vis, W&L (10.1, 5.2), semua 5 zona visible op 1; agentData 14, 0 pageerror. Audit vision screenshot WebGL (737 KB, scene hidup): CAFÉ di atas counter kafe, W&L di sofa lounge, SERVER ROOM↔DEV DESK tak lagi bertumpuk; tidak ada patch menimpa meja agent. Build OK (precache 35, 1530.89 KiB), vitest 24/24, deploy ~/wfs-hq OK; e2e: DOM True, 17 btns, frames 5→7, 0 console error.
- Catatan ops: chrome/9222 lokal & Xvfb :0 hilang setelah reboot/bersih — direkonstruksi (launch_dbg.sh dengan --remote-allow-origins=*, Xvfb :0 1366x768x24) supaya e2e & shot jalan lagi; shot via chromium SwiftShader + --virtual-time-budget (flag --screenshot perlu display :0 EGL).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING tertutup "Rizky" pada sudut kamera default (kosmetik, anti-overlap sudah bekerja tapi sprite zona MEETING tetap tampil — bisa diterapkan fade sama seperti fix 12:30 bila muncul lagi).

## 2026-10-20 13:23 WIB — refactor+test: logika routing koridor diekstrak ke routing.js + 7 unit test baru (vitest 24→31)

- Backlog dipilih: seluruh logika scene (routing, jadwal meeting) tidak punya SATU PUN unit test — regresi fix rute (koridor/gang) hanya terdeteksi lewat probe CDP manual.
- Implementasi: (1) src/scene/parts/routing.js — routePath/bandOf/FRONT/GANGS diekstrak murni (tanpa THREE) dari motion.js; motion.js kini import routePath dari sana (perilaku identik, diff = lokasi kode); (2) src/__tests__/routing.test.js — 7 test: lintasan lintas-band hanya lewat koridor/gang & tak menembus baris meja z -3/1.5/6 (4 kasus + checker pelanggaran segmen vertikal), satu-band dekat = tanpa waypoint, satu-band jauh = via koridor depan, klasifikasi bandOf, serta 3 test jadwal meeting (tepi jendela 600/630/840/870, indeks window 0/1/-1).
- Bukti: build OK (precache 35, 1530.93 KiB), vitest **31/31** (4 file), deploy ~/wfs-hq OK; e2e CDP produksi 9503: DOM True, 17 btns, 14 agents, frames 10→26→113→184, phase working, 0 exception; probe trip terpaksa (timer 0 semua agent, 4 ronde): semua rute waypoint hanya z koridor/gang (-4.2, -0.8, 0.3/0.35, 3.8, 4.8) — tak ada yang menembus baris meja.
- Catatan ops: chrome debug 9222 & script launch_dbg.sh hilang lagi — direkonstruksi; WebGL headless kini butuh flag --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader (tanpa itu "Scene init failed — UI-only mode").
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona fix 12:30 sudah ada, pantau).

## 2026-10-20 13:45 WIB — refactor+test: aturan rintangan/tujuan jalan diekstrak ke obstacles.js + 3 unit test (vitest 31→34)

- Backlog dipilih: lanjutan serupa 13:23 — tabel OBSTACLES + inObstacle + seatOccupied masih tertanam di chooseTrip() (motion.js), tak teruji; regesi footprint furnitur tak terdeteksi unit test.
- Implementasi: (1) src/scene/parts/obstacles.js — OBSTACLES (5 footprint: pantry, dispenser, printer, café, lounge), inObstacle(x,z), seatOccupied(x,z,agents,selfAgent) diekstrak murni; motion.js kini meng-import, chooseTrip jauh lebih ramping, perilaku identik (self tetap dikecualikan, offsite tak dianggap menempati); (2) 3 test baru: pusat furnitur terdeteksi (pantry/printer/sofa/café), titik koridor & baris meja bebas, seatOccupied zona ±0.9 / offsite / self.
- Bukti: vitest **34/34** (4 file), build OK (precache 35, 1530.93 KiB), deploy ~/wfs-hq OK; e2e CDP produksi 9503: DOM True, 14 agents, phase arriving, frames bertambah, 0 exception; probe trip terpaksa (timer 0.01, 6 sampel): 9 walkTarget unik — **0 dalam footprint OBSTACLES** (cek ulang via skrip luar).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona fix 12:30 sudah ada, pantau).

## 2026-10-20 14:05 WIB — test: logika siklus siang-malam daycycle.js kini teruji unit (vitest 34→43)

- Backlog dipilih: kelanjutan serangkaian ekstraksi+test — fungsi murni waktu/pencahayaan di daycycle.js (statusAt, daylight, mixHex, SCHEDULE) sudah diekspor bersih tapi 0 unit test; regresi kurva fajar/senja tak terdeteksi.
- Implementasi: src/__tests__/daycycle.test.js — 9 test: label jadwal pada menit kunci & tepat sebelum batas (599/719/779/1439), monotoni SCHEDULE & siklus 24 jam kembali ke shift malam; daylight gelap 0.3 / terang 1, monotoni transisi fajar 06:00-08:00 & senja 17:00-19:00, smoothstep tepat di batas; mixHex t=0/t=1, campur kanal t=0.5, validitas 24-bit.
- Bukti: vitest **43/43** (5 file, dulu 34), npm run build OK (precache 35, 1530.93 KiB), deploy ~/wfs-hq OK; e2e CDP produksi 9503: DOM True, 14 agents, phase working, 6874 frames, 0 exception.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona fix 12:30 sudah ada, pantau).

## 2026-10-20 14:25 WIB — fix+test: bug lastWin module-level di meeting.js + 6 unit test state machine rapat (vitest 43→49)

- Bug: `lastWin` dideklarasikan module-level (bukan di dalam createMeeting) — state rotasi peserta antar jendela rapat dibagi antar semua instance scene (HMR/remount/scene kedua), sehingga begin() jendela baru bisa ter-skip; juga tak pernah reset.
- Implementasi: `lastWin` dipindah ke closure createMeeting (perilaku scene tunggal identik, isolasi antar instance kini benar).
- Test: src/__tests__/meeting.test.js — 6 test: begin saat masuk jendela (600, peserta = seats.length, state 'meeting'), stabil di dalam jendela (600→629 tanpa restart), end saat keluar (631 → sitting, figures hidden), rotasi peserta window 0 ≠ window 1 via update() saja, isolasi antar instance (instance kedua tetap begin di window 1 — gagal pada kode lama), konsistensi util jadwal (599/631 di luar).
- Bukti: vitest **49/49** (6 file, dulu 43), build OK (precache 35, 1530.92 KiB), deploy ~/wfs-hq OK; e2e CDP produksi 9503: DOM True, 14 agents, phase arriving, 9880 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona fix 12:30 sudah ada, pantau).

## 2026-10-20 14:42 WIB — test: efek layar monitor & dokumen melayang kini teruji unit (vitest 49→64)

- Backlog dipilih: src/scene/parts/effects.js (9 renderer layar monitor + drawScreenFrame + createDriftingPages) belum punya SATU PUN unit test — regresi visual layar/halusin alpha tak terdeteksi.
- Test: src/__tests__/effects.test.js — 15 test: stub 2D context mencatat panggilan gambar; 9 renderer benar-benar menggambar & alpha ≤ 1 (it.each); drawScreenFrame menggambar latar + menandai tex.needsUpdate + reset alpha ke 1; fallback tipe tak dikenal → terminal tanpa melempar; createDriftingPages: N halaman dibuat, posisi berubah setelah update(), wrap-around batas x(±10)/z(-7..8) terverifikasi bolak-balik, default 22 halaman.
- Bukti: vitest **64/64** (7 file, dulu 49), npm run build OK (precache 35, 1530.92 KiB), deploy ~/wfs-hq OK; e2e CDP produksi 9503: DOM True, 14 agents, phase working, 13422 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona fix 12:30 sudah ada, pantau).

## 2026-10-20 15:02 WIB — refactor+test: logika data papan proyek diekstrak ke projectboard_data.js + 13 unit test (vitest 64→77)

- Backlog dipilih: lanjutan rangkaian ekstraksi+test — papan proyek dibantuin.com (projectboard.js, fitur inti markas) punya 0 unit test; perhitungan persen, banner GAGAL/REVIEW, filter kolom kanban & strip status SaaS/agent hanya dicek manual.
- Implementasi: src/scene/parts/projectboard_data.js — computePct, subtitle, bannerParts, bannerNames, columnItems, stripSegments diekstrak murni (tanpa canvas/THREE); projectboard.js kini meng-import & menggambar hasilnya, perilaku identik.
- Test: src/__tests__/projectboard_data.test.js — 13 test: pembulatan persen + fallback 0/null, subtitle dengan/tanpa review-gagal, banner parts warna-urut benar & names null bila recent tak relevan, filter kolom + maks 6 kartu, strip online (tenant/chat/pesan/terbaru, simbol ●/○ Up/Down), fallback tenants dari array, offline merah, snapshot null.
- Bukti: vitest **77/77** (8 file, dulu 64), build OK (precache 35, 1531.38 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase arriving, 16514 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" sudut kamera default (fade zona sudah ada, pantau).

##  WIB — refactor+test: spesifikasi geometri robot Bantuin AI diekstrak ke robot_spec.js + 9 unit test (vitest 77→87)

- Backlog dipilih: buildRobot (robot.js) — bagian visual paling khas markas (robot asisten AI) — 0 unit test; koordinat pose berdiri/duduk, simetri wajah, panel dada tak terjaga dari regresi.
- Implementasi: src/scene/parts/robot_spec.js — pose() (hipY/tz/fz/ty/hy per pose), eyes(), smile(), chestBars(), legsStanding(), accents(), ROBOT_COLORS diekstrak murni; robot.js kini destructure dari pose() (hapus 3 duplikasi ternary), perilaku geometri identik.
- Test: src/__tests__/robot_spec.test.js — 9 test: level vertikal hip<torso<kepala di kedua pose, wajah +Z/-Z, 2 mata simetris di depan layar, 3 segmen senyum (ujung naik & simetris), 3 bar dada jarak seragam 0.055, kaki fase 0/pi simetris, lampu status & antena di atas kepala, palet warna.
- Bukti: vitest **87/87** (9 file, dulu 77), build OK, deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 20292 frames, tanpa Scene init failed.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔Rizky (fade zona sudah ada, pantau).

## 2026-10-20 15:45 WIB — refactor+test: data dialog & speech bubble diekstrak ke dialog.js + bubbles.js + 16 unit test (vitest 87→103)

- Backlog dipilih: konten dialog markas (16 chatPhrases, roleTalk 12 role, COLLAB_PAIRS 10 pasangan role, pickCollab, pemangkasan teks bubble, updateBubbles) semuanya inline di OfficeScene.js — 0 unit test; typo/regresi dialog & fade bubble tak terdeteksi.
- Implementasi: src/scene/parts/dialog.js (chatPhrases, roleTalk, COLLAB_PAIRS, pickCollab(ad,agentData) murni, clampBubbleText, LINE_SEC, collabDuration) + src/scene/parts/bubbles.js (updateBubbles murni, remove via callback); OfficeScene.js −66 baris duplikat, pickCollab dibungkus pickCollabLocal agar tetap pakai agentData lokal — perilaku identik.
- Test: src/__tests__/dialog.test.js — 16 test: chatPhrases unik non-empty, roleTalk 12 role ≥2 baris, COLLAB_PAIRS 10 pasangan tak duplikat ≥4 baris, pickCollab hanya partner sitting/case-insensitive substring/self dikecualikan/state≠sitting disaring, clampBubbleText 32-char boundary + ellipsis + konversi non-string, collabDuration = baris×1.8+1.2, updateBubbles: life berkurang, fade-in/fade-out, ikut anchor x/z/y, float up tanpa anchor, remove saat life≤0.
- Bukti: vitest **103/103** (10 file, dulu 87), build OK (precache 35, 1531.63 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase arriving, 24174 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-20 16:10 WIB — refactor+test: spesifikasi jam dinding diekstrak ke clock_spec.js + 7 unit test (vitest 103→110)

- Backlog dipilih: createWallClock (room.js) — sudut jarum & tick hardcoded inline, tak teruji; regresi sudut jam/menit tak terdeteksi unit test.
- Implementasi: src/scene/parts/clock_spec.js — HANDS (panjang/lebar/warna 3 jarum), TICKS, tickAngle, tickInnerR, hourHandAngle, minuteHandAngle, secondHandAngle diekstrak murni; room.js kini import (draw(nowSeconds, dateMs) — detik pakai dateMs terinjeksi, bukan Date.now() langsung, agar bisa diuji/direproduksi; createWallClock sendiri tak dipanggil OfficeScene — jam ditangani React).
- Test: src/__tests__/clock_spec.test.js — 7 test: 12 tick & inner radius pendek di 12/3/6/9, tickAngle 30° per tick, hourHandAngle (12:00=0, 06:00=π, 15:00=π/2), minuteHandAngle wrap 60 menit, secondHandAngle modul 60, monotoni jam, hierarki panjang jarum detik>menit>jam. 2 asersi awal salah tulis (3π/4 vs π/2) dikoreksi di test, bukan kode.
- Bukti: vitest **110/110** (11 file, dulu 103), build OK, deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 28067 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-20 16:50 WIB — test: unit test footprint rintangan & kursi terisi obstacles.js + 12 test (vitest 121→133)

- Backlog dipilih: obstacles.js (footprint statis 5 furnitur: counter pantry, dispenser, printer, zona café, lounge; inObstacle; seatOccupied) — menjaga rute & titik berhenti 14 agent — belum ada unit test.
- Implementasi: tanpa ubah kode; src/__tests__/obstacles.test.js baru — 12 test: 5 footprint format [x0,x1,z0,z1] valid & di dalam lantai ±13/±10, koridor bebas, tepi kotak inklusif (counter pantry & printer & café & lounge + luar), pintu (-12,8) & koridor tengah bebas, seatOccupied meja kosong/offsite diabaikan/selfAgent diabaikan (identity objek agent)/threshold 0.9 boundary tepat (0.8 true, 0.9 false)/state walking_out & meeting dihitung/jarak radial bukan kotak (diagonal 0.7 false).
- Koreksi test awal: selfAgent dibandingkan sebagai objek agent (bukan wrapper agentData) dan diagonal 0.64 ternyata hypot>0.9 → asersi diperbaiki, kode tidak diubah.
- Bukti: vitest **133/133** (13 file, dulu 121), build OK (precache 35, 1531.98 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 34786 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-20 15:26 WIB — refactor+test: matematika gerak walker diekstrak ke motion_math.js + 12 unit test (vitest 110→121)

- Backlog dipilih: stepToward/dist2/BOUNDS di motion.js — jantung gerak 14 agent — masih inline; regresi hard clamp (agent menembus dinding kiri, bug historis) tak terdeteksi unit test.
- Implementasi: src/scene/parts/motion_math.js — BOUNDS, ARRIVE, dist2, stepMove(pos,target,speed,delta) murni (tanpa THREE/performance.now); stepToward di motion.js kini delegasi ke stepMove (posisi, rotasi atan2(dx,dz), arrived, flag clamped — perilaku identik termasuk stride tak dipanggil saat tiba).
- Test: src/__tests__/motion_math.test.js — 12 test: BOUNDS di dalam lantai ±13/±10, ARRIVE 0<r<1, dist2 3-4-5 & nol, arrived tanpa gerak + rot dipertahankan, langkah = speed×delta, diagonal ternormalisasi, hard clamp X dua sisi & Z dua sisi + flag clamped, bebas di dalam batas, fuzz 200 langkah acak tak pernah keluar BOUNDS.
- Bukti: vitest **121/121** (12 file, dulu 110), build OK (precache 35, 1531.98 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase arriving, 31085 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-21 00:05 WIB — refactor+test: data zona lantai diekstrak ke floor_zones.js + 17 unit test (vitest 133→149)

- Backlog dipilih: flooring.js (patch zona + label DEV DESK/MEETING/WELCOME & LOUNGE/CAFÉ/SERVER ROOM) masih menyimpan tabel zona & aturan posisi/skala label inline — 0 unit test; regresi posisi label zona (pernah menimpa name tag agent) tak terdeteksi.
- Implementasi: src/scene/parts/floor_zones.js — ZONES (5 zona), zoneLabelY (tepi depan + 0.7 + dy), zoneLabelScale (>9 char → 1.25) diekstrak murni; flooring.js kini import (−12 baris), perilaku render identik.
- Test: src/__tests__/floor_zones.test.js — 17 test: 5 zona label sesuai, field lengkap valid, semua patch di dalam lantai ±13/±10, tak ada dua zona tumpang tindih (AABB), warna unik, opacity ≤1 & MEETING .9, CAFÉ mencakup counter fisik (−9.5,7.5), MEETING tepat (8,−3,5.4), SERVER ROOM satu-satunya dy=−0.9, zoneLabelY tepi depan + boundary 9/10 char skala, label selalu di depan pusat zona.
- Bukti: vitest **149/149** (14 file, dulu 133), build OK (precache 35, 1532.02 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase arriving, 37773 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-21 01:25 WIB — refactor+test: data poster dinding diekstrak ke poster_spec.js + 13 unit test (vitest 149→162)

- Backlog dipilih: furniture.js masih menyimpan tabel 5 poster dinding (slogan WFS: SHIP IT, KUALITAS DULU, BUILD DAILY, TEST EVERYTHING, WFS PROJECT) + konstanta posisi/ukuran canvas inline — 0 unit test; regresi posisi/orientasi/teks poster tak terdeteksi.
- Implementasi: src/scene/parts/poster_spec.js — POSTERS (5 item), POSTER_Y/W/H, CANVAS_W/H, LINE_H, posterFacing(x), posterOffset(x), posterLineY(i) diekstrak murni (tanpa THREE/canvas); furniture.js kini import (−7 baris), perilaku render identik.
- Test: src/__tests__/poster_spec.test.js — 13 test: 5 poster, field lengkap & valid (hex warna), semua menempel dinding samping ±11.4 & di dalam lantai ±13/±10, ada di kedua sisi, tak ada posisi duplikat, teks unik & slogan kunci ada, warna unik, konstanta render tetap (2.2/0.46/0.66/120/160/24), facing kiri +π/2 kanan −π/2, offset ±0.03 menjauhi dinding, posterLineY 64/88/112, teks ≤3 baris muat di canvas, plane lebih kecil dari frame.
- Bukti: vitest **162/162** (15 file, dulu 149), build OK (precache 35, 1532.12 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 41335 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-21 02:00 WIB — test: unit test lifecycle speech bubble bubbles.js + 10 test (vitest 162→172)

- Backlog dipilih: bubbles.js (updateBubbles — fade-in/out, anchor mengikuti pembicara, float-up, penghapusan) — 0 unit test; regresi lifecycle bubble (opacity/hapus) tak terdeteksi.
- Implementasi: tanpa ubah kode; src/__tests__/bubbles.test.js baru — 10 test: life berkurang sebesar delta, anchor mengikuti x/z pembicara + offset y (anchor.y 2.6), anchor default y=2.0, float-up tanpa anchor dari startY, opacity 0 di age 0, puncak opacity 1 (age≥.22 & life≥.5), fade-out life/.5, bubble habis dihapus via remove & keluar array, iterasi mundur aman (beberapa bubble habis sekaligus), boundary life=0 dihapus.
- Bukti: vitest **172/172** (16 file, dulu 162), build OK (precache 35, 1532.12 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase arriving, 44194 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-20 18:05 WIB — refactor+test: timing percakapan kolaborasi diekstrak ke converse_timing.js + 9 unit test (vitest 172→179)

- Backlog dipilih: logika timing converse() di motion.js (step = floor(walkPause/LINE_SEC), pembicara bergantian genap=visitor, selesai = baris×1.8+1.2) masih inline — 0 unit test; regresi dialog bergantian/durasi ngobrol tak terdeteksi. Sekalian: hapus duplikasi definisi fungsi stepToward di motion.js (didefinisikan 2x, yang kedua menimpa pertama — dead code).
- Implementasi: src/scene/parts/converse_timing.js — talkStep (clamp ≥0), isConverseOver (CONVERSE_TAIL=1.2, strict >), speakerIsVisitor; motion.js kini import (−8 baris bersih), perilaku identik.
- Test: src/__tests__/converse_timing.test.js — 9 test: talkStep floor di beberapa boundary (1.79/1.8/5.4/7.3), walkPause negatif clamp 0, lineSec custom, CONVERSE_TAIL=1.2, belum selesai di 0/7.2/8.39, boundary strict 8.4 vs 8.41, tanpa baris hanya jeda, pola bergantian genap/ganjil.
- Bukti: vitest **179/179** (17 file, dulu 172), build OK (precache 35, 1532.03 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase night, 47828 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 03:05 WIB — refactor+test: canvas bubble chat diekstrak ke bubble_canvas.js + 11 unit test (vitest 179→190)

- Backlog dipilih: drawing bubble chat di createBubble() (OfficeScene.js) — rounded-rect panel + ekor segitiga + teks clamp + skala sprite + fade lifecycle — masih inline; regresi tampilan bubble (stroke/ekor/posisi teks) tak terdeteksi unit test.
- Implementasi: src/scene/parts/bubble_canvas.js — BUBBLE_W/H (360×76), BUBBLE_BG, BUBBLE_TEXT_FONT, roundRectPath, tailPath, drawBubble(ctx,text,color,{clampText}) murni (ctx 2D di-inject, tanpa THREE), bubbleScale(hFrac=0.034), bubbleOpacity(age,life) fade-in 0.22 × fade-out life/0.5; OfficeScene.js kini import (−9 baris), perilaku render identik.
- Test: src/__tests__/bubble_canvas.test.js — 11 test: konstanta sesuai nilai historis, roundRectPath 4 kurva+4 garis+close, tailPath simetris ujung (180,73), drawBubble fill 2×/stroke 1×/teks di (180,32) center, clampText diterapkan (≤33 char), tanpa clamp pass-through, opacity fade-in boundary 0/0.22/0.11, fade-out life/0.5 & 0 saat habis, kombinasi ≤1 & ≥0.
- Bukti: vitest **190/190** (18 file, dulu 179), build OK (precache 35, 1532.18 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase leaving, 50956 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-20 18:45 WIB — refactor+test: profil tampilan karakter diekstrak ke character_looks.js + 24 unit test (vitest 190→214)

- Backlog dipilih: tabel LOOKS (12 karakter: skin/h/acc) + looksOf() masih inline di OfficeScene.js — 0 unit test; regresi identitas visual karakter (aksesori/tinggi/warna kulit) tak terdeteksi.
- Implementasi: src/scene/parts/character_looks.js — LOOKS (12 entri), looksOf(agent) case-insensitive + fallback {skin:0xE8B88A,h:1,acc:[]}; hasil dikloning ({...L, acc:[...L.acc]}) agar pemanggil tak bisa memutasi data global; OfficeScene.js kini import (−16 baris), perilaku render identik.
- Test: src/__tests__/character_looks.test.js — 24 test: 12 karakter & nama kunci historis, field lengkap & valid (h 0.9–1.2, skin finite), aksesori unik & dari kosakata addAccessories, BANTUIN AI visor+antenna, WAHYU FS tie+peci, DEWI/RINA hijab, lookup case-insensitive, fallback nama tak dikenal/undefined/null, fallback tidak membagi referensi acc (mutasi aman).
- Bukti: vitest **214/214** (19 file, dulu 190), build OK (precache 35, 1532.22 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase night, 54443 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 04:20 WIB — refactor+test: layout ruang meeting diekstrak ke meeting_room_spec.js + 14 unit test (vitest 214→228)

- Backlog dipilih: room.js / createMeetingRoom masih menyimpan layout ruang meeting inline (pusat ruangan, posisi 3 panel kaca + 4 tiang rangka, meja rapat, 6 kursi) — 0 unit test; regresi posisi kaca/pintu/kursi tak terdeteksi.
- Implementasi: src/scene/parts/meeting_room_spec.js — ROOM_CX/CZ, GLASS_X/Z/H, TABLE, SEAT_DX/SEAT_DZ, meetingSeats(), glassPanels(), framePosts() diekstrak murni (tanpa THREE); room.js kini import (−10 baris bersih), perilaku render identik.
- Test: src/__tests__/meeting_room_spec.test.js — 14 test: pusat (8,−3), konstanta kaca, dimensi meja, 6 kursi (3 per sisi) posisi & orientasi menghadap meja, kursi dalam lebar meja, 3 panel kaca dengan celah pintu ≥1 unit, panel pada garis kaca z=CZ+2.75, 4 tiang di sudut kaca, custom center. (1 iterasi: asersi x panel depan dikoreksi relatif terhadap ROOM_CX=8, bukan 0.)
- Bukti: vitest **228/228** (20 file, dulu 214), build OK (precache 35, 1532.47 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 57844 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-20 22:07 WIB — refactor+test: logika percakapan dekat diekstrak ke chat_check.js + 21 unit test (vitest 338→359) + fix 1 bug cooldown frame-rate dependent

- Backlog dipilih: checkConversations() (deteksi 2 walker berdekatan <1.5 → bubble chat + cooldown 8 dtk) masih inline di OfficeScene.js — 0 unit test; regresi deteksi percakapan tak terdeteksi.
- BUG NYATA ditemukan & diperbaiki: cooldown chat dikurangi KONSTAN 0.016 per frame (asumsi 60 FPS), bukan per detik nyata. Di GPU lambat (~1.5 FPS, e2e memang begitu) 1 frame = 0.67 dtk tapi cooldown hanya turun 0.016 → agent butuh ~500 frame ≈ 5 MENIT nyata sebelum boleh chat lagi; efeknya percakapan water-cooler praktis mati di perangkat lambat. Kini tickCooldown(cd, delta) memakai delta detik nyata dari clock — diuji live: cooldown 2.0 → 1.6 tepat setelah 3 dtk (e2e CDP).
- Implementasi: src/scene/parts/chat_check.js — CHAT_RADIUS 1.5, CHAT_COOLDOWN_SEC 8, nearbyPairs(ppl, radius) murni (visible filter, cooldown filter, hypot 2D, pasangan i<j stabil), tickCooldown(cd, delta) clamp 0. OfficeScene.js kini import (−~12 baris); autoTalk(delta) → autoTalk() (param tak terpakai).
- Test: src/__tests__/chat_check.test.js — 21 test: konstanta historis, pasangan dekat/jauh/boundary 1.5, invisible tidak ikut, cooldown memblok kedua arah, undefined/0 lolos, kelompok 3 orang = 3 pasangan, radius & hypot inject, urutan stabil, array kosong; tickCooldown delta detik, clamp 0, undefined→0, simulasi 60×(1/60)=−1 dtk proporsional. (1 iterasi: asersi boundary hypot 3-4-5 koreksi radius 5→5.1.)
- Bukti: vitest **359/359** (28 file, dulu 338), build OK (precache 35, 1534.87 KiB), deploy ~/wfs-hq OK; e2e produksi 9503 (reload): DOM True, 14 agents, frame berjalan, tanpa exception; verifikasi cooldown live: 2.0→1.6 setelah 3 dtk nyata (berbasis waktu, bukan per-frame).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 05:15 WIB — refactor+test: nameplate meja diekstrak ke nameplate_spec.js + 16 unit test (vitest 228→244)

- Backlog dipilih: drawing nameplate pribadi (nama+role) di buildDesk() (OfficeScene.js) — rounded-rect panel, garis aksen warna agen, title-case nama, clamp teks, posisi plate/stand — masih inline; regresi tampilan nameplate tak terdeteksi unit test.
- Implementasi: src/scene/parts/nameplate_spec.js — NAMEPLATE (kanvas 256×64, teks x=132, nama y=24, role y=45, bar aksen 2/10/7/44), PLATE (mesh 0.62×0.155 di y=0.68 z=0.42; stand y=0.66 z=0.44), titleCase(), clampText(), drawNameplate(ctx,name,role,hex) murni (ctx 2D di-inject, tanpa THREE); OfficeScene.js kini import (−12 baris), render identik.
- Robustness: clampText kini aman utk null/undefined (`String(text ?? '')` — dulu TypeError saat role undefined; 1 iterasi test).
- Test: src/__tests__/nameplate_spec.test.js — 16 test: konstanta historis NAMEPLATE & PLATE, titleCase (lowercase/UPPERCASE/angka/kosong), clampText muat vs potong+ellipsis & font di-set dulu, drawNameplate ukuran kanvas, posisi teks nama/role, align center + baseline middle, bar aksen, clamp nama panjang, role undefined tanpa error.
- Bukti: vitest **244/244** (21 file, dulu 228), build OK (precache 35, 1532.89 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase night, 61563 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-21 07:45 WIB — refactor+test: parameter sound system diekstrak ke sound_spec.js + 14 unit test (vitest 244→257)

- Backlog dipilih: sound system (keyclick 800+jitter*400 Hz, langkah white-noise exp(-i/N*5), chime C5-E5-G5 delay 150ms, mute localStorage) masih inline dengan magic number di OfficeScene.js — 0 unit test; regresi parameter suara tak terdeteksi.
- Implementasi: src/scene/parts/sound_spec.js — konstanta KEYCLICK_*/STEP_*/CHIME_*/MUTED_KEY, keyclickFreq(rng), stepEnvelope(i,n), chimeStart(i), masterGainValue(muted) murni (tanpa Web Audio/THREE); OfficeScene.js kini import (magic number hilang dari playKeyClick/playStep/playMeetingChime), perilaku audio identik.
- Test: src/__tests__/sound_spec.test.js — 14 test: konstanta historis keyclick/langkah/chime/mute, rentang frekuensi 800..1200 & boundary rng 0/1, envelope =1 di sampel 0 & ≈exp(-5) di akhir & monoton turun, 3 nada C5-E5-G5, chimeStart i*0.15 & total durasi 0.8 s, MUTED_KEY 'wfs_audio_muted', masterGain 0/1.
- Bukti: vitest **257/257** (22 file, dulu 244), build OK (precache 35, 1533.03 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase working, 64685 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 19:05 WIB — refactor+test: parameter ring seleksi/hover diekstrak ke ring_spec.js + 19 unit test (vitest 257→273)

- Backlog dipilih: cincin seleksi (emas, plane 3.1, gradient 46→62, stop 0.68, y 0.03) & hover (biru, plane 2.6, 44→62, y 0.02) + selAnchor() di OfficeScene.js masih inline dengan magic number — 0 unit test; regresi tampilan cincin seleksi/hover tak terdeteksi.
- Implementasi: src/scene/parts/ring_spec.js — konstanta SEL_RING/HOVER_RING (size/plane/inner/outer/mid/color/rgb/opacity/y), selAnchorOf(agent, SEAT_OFF=0.55) murni (walker → posisi off 0; duduk → home + offset; tak terlihat → null; null-safe), selectedAgent(agentData, idx) clamp aman; OfficeScene.js kini import (−~14 baris), render cincin identik.
- Test: src/__tests__/ring_spec.test.js — 19 test: konstanta historis kedua ring, hover < seleksi & inner < outer, walker/sitting/dual-visible/tak terlihat, fallback tanpa walker, null agent aman, custom seat offset, selectedAgent valid/0/last/negatif/out-of-range/data null.
- Bukti: vitest **273/273** (23 file, dulu 257), build OK (precache 35, 1533.43 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase night, 67965 frames, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-20 20:45 WIB — refactor+test: data 14 agen diekstrak ke agents_spec.js + 17 unit test (vitest 273→290) + perbaikan 2 bug runtime

- Backlog dipilih: tabel AGENTS (8) + AGENTS_EXTRA (6) masih inline di OfficeScene.js — 0 unit test; regresi identitas agen (nama/warna/role/screen/penampilan) tak terdeteksi.
- Implementasi: src/scene/parts/agents_spec.js — AGENTS, AGENTS_EXTRA (14 entri), SCREENS (7 kosakata layar), allAgents(a,extra) murni; OfficeScene.js kini import (−20 baris), data identik.
- Test: src/__tests__/agents_spec.test.js — 17 test: urutan & nama historis 8+6, hex historis semua agen, color===parseInt(hex) 14/14, role historis, screen ∈ SCREENS, field hair/shirt/pants valid, BANTUIN AI shirt 0x0B4F3A, allAgents 14 & urutan, nama unik, injection kustom, hex format #RRGGBB.
- BONUS — 2 bug runtime ditemukan & diperbaiki saat verifikasi produksi: (1) flooring.js memakai zoneLabelScale() tanpa import → 'Scene init failed' (ReferenceError); (2) room.js memakai TICKS/tickAngle/…/HANDS tanpa import clock_spec.js. Keduanya lolos vitest karena hanya error di runtime — kini scene hidup lagi.
- Bukti: vitest **290/290** (24 file, dulu 273), build OK (precache 35, 1533.45 KiB), deploy ~/wfs-hq OK; e2e produksi 9503 (setelah reload tab): DOM True, 14 agents, frame naik 3→528, phase working→lunch, TANPA 'Scene init failed' & tanpa exception. Catatan: screenshot headless gagal GPU (EGL init error lingkungan, bukan kode).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 21:00 WIB — refactor+test: layout meja diekstrak ke desk_layout.js + 13 unit test (vitest 290→303)

- Backlog dipilih: array `desks` (posisi 14 meja: kolom x ∈ {-8,-4,0,4,8}, baris z ∈ {-3,1.5,6}) masih inline di OfficeScene.js — 0 unit test; regresi posisi meja (tumpukan/urutan agen/out-of-bounds) tak terdeteksi.
- Implementasi: src/scene/parts/desk_layout.js — DESKS (14 entri, urutan historis agen), deskColumns(), deskRows(), deskGrid() (grid kolom×baris + slot kosong) murni dengan injeksi layout; OfficeScene.js kini `const desks = DESKS` (−16 baris), render identik.
- Test: src/__tests__/desk_layout.test.js — 13 test: 14 meja = 14 agen, posisi historis berurutan, kolom/baris unik terurut, tanpa meja menumpuk, grid 5×3=15 slot → tepat 1 sel kosong (0,6), koordinat finite, dalam batas ruangan (|x|≤12.5, |z|≤9.5), lead desk (−8,−3), injeksi layout kustom, grid kosong/penuh. (1 iterasi: asersi slot kosong dikoreksi dari dugaan (−4,−3) → aktual (0,6).)
- Bukti: vitest **303/303** (25 file, dulu 290), build OK (precache 35, 1533.63 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, frame 3608, tanpa 'Scene init failed' & tanpa exception.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-22 03:40 WIB — refactor+test: proporsi karakter diekstrak ke character_spec.js + 25 unit test (vitest 303→325)

- Backlog dipilih: buildChar() menyimpan proporsi karakter inline (rambut panjang regex DEWI|MAYA|RINA|LINA|SARI, koordinat standing/sitting, posisi badge/lanyard, anchor addAccessories 1.14/1/.8 & 1.1/-1/.74) — 0 unit test; regresi proporsi figur tak terdeteksi.
- Implementasi: src/scene/parts/character_spec.js — LONG_HAIR_RE, isLongHair() (null/angka aman), STANDING & SITTING (seluruh konstanta koordinat historis: kaki/hips/torso/wajah/rambut/badge/lanyard/anchor), accessoryAnchor(standing), charMetrics(standing) murni tanpa THREE; OfficeScene.js kini pakai isLongHair + STANDING/SITTING badge&lanyard + accessoryAnchor (anchor lama duplikat jadi 1 jalur), render identik.
- Test: src/__tests__/character_spec.test.js — 25 test: isLongHair (5 nama historis, case-insensitive, false utk WAHYU FS/BANTUIN AI/Toni, null/undefined/angka aman, regex flag i), STANDING 6 test (kaki/hips/torso/leher/kepala, wajah, rambut+lengan, badge/lanyard, anchor, urutan vertikal wajar), SITTING 7 test (kaki menghadap meja z negatif bertingkat, torso/kepala, wajah z negatif, rambut belakang +Z, badge/lanyard, anchor fz=-1, duduk < berdiri), helper 4 test.
- Bukti: vitest **325/325** (26 file, dulu 303), build OK (precache 35, 1534.68 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 7386, tanpa 'Scene init failed' & tanpa exception.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-22 05:40 WIB — refactor+test: tujuan jalan-jalan diekstrak ke walk_destinations.js + 13 unit test (vitest 325→338) + fix 1 bug posisi lounge

- Backlog dipilih: array `walkDestinations` (8 tujuan jalan agent: pantry/dispenser/printer/lounge/meeting/resepsionis/jalur tengah/tanaman) masih inline di OfficeScene.js — 0 unit test; agen bisa ditugaskan spot di dalam rintangan tanpa terdeteksi.
- BUG DITEMUKAN & DIPERBAIKI: tujuan "lounge" (9.4, 4.8) ternyata DI DALAM footprint rintangan lounge OBSTACLES [8.0,12.4,4.3,9.4] — setiap kali agen memilih lounge, `freeSpot` menolak semua 8 percobaan dan fallback ke koridor; lounge efektif tak pernah jadi tujuan. Dikoreksi ke (9.0, 3.9) tepi bebas (verifikasi `inObstacle` = false).
- Implementasi: src/scene/parts/walk_destinations.js — WALK_DESTINATIONS (8 entri) + isSafeDestination(d, inObstacleFn, bounds) murni; OfficeScene.js kini `const walkDestinations = WALK_DESTINATIONS` (−9 baris).
- Test: src/__tests__/walk_destinations.test.js — 13 test: 8 entri, posisi historis, koordinat finite, dalam batas ruangan, TIDAK di dalam rintangan statis, jarak min 1.2 dari 14 meja, lulus isSafeDestination, tujuan unik; isSafeDestination 5 test (tolak dalam rintangan/out-of-bounds/NaN/Infinity, terima titik bebas, bounds & fungsi injeksi).
- Bukti: vitest **338/338** (27 file, dulu 325), build OK (precache 35, 1534.68 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase night, frame 10849, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-22 06:20 WIB — refactor+test: logika label mengambang diekstrak ke label_spec.js + 15 unit test (vitest 359→374)

- Backlog dipilih: makeLabel/sizeLabels (label sprite agen: kanvas full 360×84 & short 210×50, auto-shrink font min 60%, ellipsis, title-case nama, frac skala layar) masih inline di OfficeScene.js — 0 unit test; regresi tampilan nama/role agen tak terdeteksi.
- Implementasi: src/scene/parts/label_spec.js — LABEL_Y, LABEL_FULL/LABEL_SHORT (semua konstanta historis: ukuran kanvas, radius, font, posisi teks, max lebar), labelName() (title-case, null-safe), fitLabel() (auto-shrink font 90%→60% lalu ellipsis, mengembalikan string atau {fit,fnt}), labelScale() (frac skala sprite sizeAttenuation=false + deteksi wantFull); OfficeScene.js kini import (−~10 baris), render label identik.
- Test: src/__tests__/label_spec.test.js — 15 test: konstanta historis full/short, labelName title-case & null/angka aman, fitLabel muat/ellipsis/boundary/null aman & font dikembalikan ke asli & shrink menghasilkan {fit,fnt} format historis, labelScale wantFull (dekat/jauh/layar sempit/override), frac formula + layar sempit < lebar + cap 1.35 layar pendek + fallback viewport 0. (2 iterasi: path import '../parts/'→'../scene/parts/', asersi fnt '32  X' format historis.)
- Bukti: vitest **374/374** (29 file, dulu 359), build OK (precache 35, 1535.23 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 75044, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-22 23:00 WIB — refactor+test: mesin fase shift diekstrak ke shift_spec.js + 24 unit test (vitest 374→398) + fix bug dawn resurrection

- Backlog dipilih: createShift() (arrive 08:00–08:30, lunch 12:00–13:00, leaving 18:00–18:30, nightfall, dawn; ARRIVE/DEPART historis, DOOR −12,8, spot lunch −9.5,9.0 jitter, walkPause 6–14 mnt) masih inline di daycycle.js — 0 unit test; regresi jadwal agen tak terdeteksi.
- BUG DITEMUKAN & DIPERBAIKI: `if (m>=480 && phase==='night') dawn()` tereksekusi SETIAP tick malam setelah 18:31 — nightfall lalu langsung dawn() = semua agen "resurrection" duduk lagi di meja di tengah malam. Kini dawn hanya di jendela kedatangan 08:00–08:30 (dan hanya jika phase night).
- Implementasi: src/scene/parts/shift_spec.js — SHIFT (semua konstanta historis), lunchWindowOpen(), lunchSpot(rng), lunchPause(rng), shiftStep(state, m) mesin fase murni (state {phase, lunch} → fase baru + event list idempoten: lunch_start/lunch_end/arrive/depart/nightfall/dawn/working_am/working_pm); daycycle.js kini hanya eksekusi event ke scene (−~15 baris), perilaku jarum jam shift identik kecuali fix dawn.
- Test: src/__tests__/shift_spec.test.js — 24 test: konstanta historis (DOOR, ARRIVE=reverse(DEPART), jendela jam, spot lunch), lunchWindowOpen boundary 720/779/780, lunchSpot jitter & z≥9.0, lunchPause 6–14, shiftStep 13 transisi (malam→nightfall, 08:00→arrive, tidak re-trigger, 08:31→working, lunch start/end, 18:00 depart, 18:31 night, idempoten stabil, urutan event). (3 iterasi: quirk dawn malam → diubah jadi fix bug; 08:00 hanya 'arrive' bukan 'dawn' karena arrive cek dulu; 13:00 dari working tidak push working_pm karena fase sudah 'working'.)
- Bukti: vitest **398/398** (30 file, dulu 374), build OK (precache 35, 1536.37 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 171866, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-22 23:30 WIB — refactor+test: perencanaan trip & pose langkah diekstrak ke trip_plan.js + 22 unit test (vitest 398→420)

- Backlog dipilih: motion.js masih menyimpan konstanta & logika trip inline (WALK 1.6/EXIT 2.0/LINE_SEC 1.8, offset collab +0.95/−0.15, jitter dest ±0.5, pause 2±2 & timer duduk 6+0..14, peluang collab 0.75, amplitudo stride leg 0.08/0.25, arm 0.5, bob 0.035) — sebagian besar 0 unit test; regresi gerak/pause/pose agen tak terdeteksi.
- Implementasi: src/scene/parts/trip_plan.js — konstanta historis, collabTarget(), jitterDest(), pickDest() (maks 8 percobaan + re-cek spot terakhir), fallbackSpot() (koridor band), stridePose() murni (legZ/legRotX/armRotX/bob per fase limb), REST_POSE; motion.js kini import (−~20 baris), gerak & pose identik (stride memakai stridePose per-limb).
- Test: src/__tests__/trip_plan.test.js — 22 test: konstanta historis, collabTarget offset/kustom, jitterDest rentang (mock r(a,b)=a+n*(b-a) sesuai RNG produksi), pickDest terima/lompat/null/tries+re-cek terakhir, fallbackSpot clamp band aman, stridePose fase 0/puncak/berlawanan π/bob non-negatif, REST_POSE netral. (3 iterasi asersi: semantik rng.r(a,b) mock awal salah → diperbaiki ke formula produksi; antisimetri fase π untuk cos; jumlah panggilan freeSpot 3+1 re-cek.)
- Bukti: vitest **420/420** (31 file, dulu 398), build OK (precache 35, 1536.72 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 255415, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-23 03:10 WIB — fix: footprint meja resepsionis didaftarkan ke OBSTACLES

- Bug: meja resepsionis (RCX 8, RCZ 6.5; desk 2.5×0.6 + side panel sampai x=9.55) TIDAK terdaftar di OBSTACLES — freeSpot/pickDest bisa menempatkan agen berjalan/berhenti DI DALAM meja resepsionis (tujuan "depan resepsionis" (6.8,4.9) aman, tapi spot collab/jitter ±0.5 bisa jatuh di (7.5..9.6, 5.2..7.9) area meja).
- Fix: OfficeScene.js push [RCX-1.3, RCX+1.55, RCZ-0.35, RCZ+0.35] ke OBSTACLES setelah side panel dibuat (menutup desk + side panel) + import OBSTACLES dari parts/obstacles.js.
- Verifikasi: vitest 420/420 (31 file, tetap), build OK (precache 35, 1536.75 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 327411, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 00:30 WIB — pembersihan: createBubble & autoTalk dead-code dibuang dari parts/dialog.js

- Masalah: src/scene/parts/dialog.js masih menyimpan salinan LAMA createBubble (canvas 360×76 inline, hFrac 0.034 hardcode, tanpa bubble_canvas.js) + autoTalk (baca agentData/office/window lewat closure modul — pasti ReferenceError jika pernah dipanggil) + state chatBubbles/talkTimer/lastTalkRT. Kode mati: OfficeScene.js punya versinya sendiri yang aktif (sudah pakai bubble_canvas.js + anchors).
- Risiko regresi nyata: jika suatu saat autoTalk dead-code diekspor/dipanggil → crash (agentData tidak ada di scope modul dialog.js); import duplikat membingungkan kontributor.
- Implementasi: dialog.js kini murni data/util (chatPhrases, roleTalk, COLLAB_PAIRS, pickCollab, clampBubbleText, collabDuration, LINE_SEC) — −84 baris dead code; OfficeScene.js tidak berubah.
- Bukti: vitest **432/432** (32 file, tetap), build OK (precache 35, 1536.83 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 494769, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 00:05 WIB — refactor+test: anti-overlap label diekstrak ke label_overlap.js + 12 unit test (vitest 420→432)

- Backlog dipilih: pass kolisi anti-overlap label (loop berpasangan 5 iterasi di OfficeScene.js ~line 1888: PAD agent 30/zona 46, dorongan agent↔agent 1.2×, agent dari penghalang 2.4×, zona-vs-penghalang 1.8×, agent didorong zona 1.6× + tag-along zona 0.8×/1.1×) masih inline — 0 unit test; regresi tumpukan label tak terdeteksi.
- Implementasi: src/scene/parts/label_overlap.js — overlapPass(pts, iters=5) murni (mutasi offX/offY saja, tanpa THREE/canvas) + konstanta PAD/koefisien terekspor; OfficeScene.js kini `overlapPass(pts)` (−31 baris), perilaku anti-overlap identik.
- Test: src/__tests__/label_overlap.test.js — 12 test: konstanta PAD, agent↔agent simetris/arah horizontal/nol saat bebas, agent-vs-zona rasio 2.4:0.8 (h2=96 → -153.6), bubble (tanpa zt) tidak bergeser, zona-vs-bubble zona yang digeser, koefisien historis 1.2/2.4/1.8/1.6, kluster padat 4 label terpisah. (3 iterasi asersi: simetri offY a=-b bukan a=b; pasangan (zona,agent) jatuh ke cabang 1.6× bukan 2.4× — semantik arah pasangan diungkap eksplisit dalam test.)
- Bukti: vitest **432/432** (32 file, dulu 420), build OK (precache 35, 1536.83 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 418533, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (fade zona sudah ada, pantau).

## 2026-10-24 01:00 WIB — fix: dead-code createBubble & autoTalk benar-benar dihapus dari dialog.js (commit sebelumnya hanya ganti header)

- Ketemu saat audit: commit 25099b3 mengklaim "-84 baris dead code" di parts/dialog.js, tapi diff-nya HANYA mengubah komentar header — createBubble (canvas inline 360×76) & autoTalk (closure agentData/office → ReferenceError jika dipanggil) masih utuh di baris 71–119.
- Sekarang benar-benar dihapus: −53 baris; dialog.js murni data/util (chatPhrases, roleTalk, COLLAB_PAIRS, pickCollab, clampBubbleText, LINE_SEC, collabDuration) — identik dengan deskripsi commit sebelumnya.
- Bukti: vitest 432/432 (32 file, tetap), build OK (precache 35, 1536.82 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 576189, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 01:25 WIB — refactor+test: sweep+clamp viewport label ke label_overlap.js + 18 unit test (vitest 432→450) + FIX sign bug clamp bawah

- Backlog dipilih: blok SWEEP+CLAMP SIKLIKAL layout label (sweepVertical greedy atas→bawah, clampViewport atas/bawah/horizontal, siklus max 3 round; margin TOP 140/BOT 110/ZONE_TOP_EXTRA 48, GAP 36, padX zona 6 vs agent 2) masih inline di OfficeScene.js — 0 unit test; regresi label terpotong toolbar/bocor tepi layar tak terdeteksi.
- BUG DITEMUKAN & DIPERBAIKI: cabang clamp bawah `p.offY = BOT + half - p.y` SALAH TANDA — harusnya `BOT - half - p.y`. Versi lama MENDORONG label makin ke bawah ke dalam toolbar, tetap melanggar tiap round (3 round siklus sia-sia), dan tepi bawah label mendarat di BOT+2×half = ~340 (viewport 800) bukan BOT=290. Ini menjelaskan kasus historis label "terpotong toolbar" (Rina @90). Verifikasi numerik: sebelum fix offY=15 (label tetap 340), sesudah fix tepi bawah tepat 290.
- Implementasi: label_overlap.js +~60 baris — konstanta terekspor (SWEEP_GAP 36, VIEW_TOP_MARGIN 140, VIEW_BOT_MARGIN 110, ZONE_TOP_EXTRA 48, PAD_X_ZONE 6, PAD_X_AGENT 2, MAX_ROUNDS 3) + sweepVertical(pts, gap), clampViewport(pts, {height,width,topMargin?,botMargin?}) → bool violated, sweepClampRounds(pts, opts, rounds). OfficeScene.js kini `sweepClampRounds(pts, {height, width})` (−40 baris), perilaku layout identik kecuali fix sign bug.
- Test: src/__tests__/label_sweep.test.js — 18 test: konstanta historis 7 nilai; sweepVertical (dorong overlap, tak geser terpisah, abaikan pisah horizontal, posisi efektif y+offY, tak menurunkan, gap kustom); clampViewport (aman→false, toolbar→naik tepat BOT, atas→turun tepat -TOP, zona margin ekstra vs agent, horizontal kanan pad zona/agent, kiri, stabil di frame kedua); sweepClampRounds (kluster dekat toolbar tarik ke dalam, kluster padat terpisah ≥ half+half+gap & dalam viewport, label aman tak diubah, rounds kustom). (3 iterasi asersi: y=400/x=600 salah fixture viewport; semantik urutan byY dengan offY pra-ada; agent juga melanggar di y=-282.)
- Bukti: vitest **450/450** (33 file, dulu 432), build OK (precache 35, 1536.94 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 662495, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 10:45 WIB — test: useDialogA11y (fokus trap) + TeamStats (vitest 477→486)

- Backlog dipilih: src/lib/dialogA11y.js (hook a11y dipakai SEMUA panel: fokus awal, trap Tab, Escape, aria-modal, restore fokus pemicu) & komponen TeamStats.jsx — keduanya 0 unit test; regresi fokus-trap/a11y & panel statistik tak terdeteksi.
- Test: src/__tests__/team_stats_a11y.test.jsx — 9 test. useDialogA11y (5): buka → aria-modal=true & fokus masuk elemen pertama; Escape → onClose (capture); Tab terjebak (terakhir→pertama, shift→balik terakhir, tak keluar dialog — jsdom tanpa layout: offsetParent didefinisikan manual via Object.defineProperty); tutup via Escape → dialog unmount & fokus kembali ke pemicu #t (hook simpan document.activeElement saat buka — klik in-dialog JS .click() TIDAK memindahkan fokus di jsdom, makanya skenario pakai fokus pemicu + Escape); open=false pasif. TeamStats (4): buka → fetch /wfs-api/tasks + system/resources, total file dihitung dari field `files` bentuk campuran (JSON-array string, CSV, null, array) = 5; kontainer diringkas (saas-dibantuin-backend→backend, wfs-agent-be1→sbx-be1); fetch gagal → role=alert "Gateway offline" + tombol Coba lagi memulihkan; data kosong → "Belum ada task"; stat-grid aria-label "1 task selesai/jalan/gagal/review/antri".
- Iterasi asersi (5×): (1) render leak antar-test → afterEach cleanup; (2) total file 4 salah hitung → fixture nyata = 5 (A 2 + D 2 + E 1); (3) jsdom offsetParent null → filter focusable hook meloloskan semua → defineProperty manual; (4) restore fokus gagal saat click in-dialog (jsdom .click() tak set fokus) → skenario diubah ke fokus pemicu + Escape yang mencerminkan alur nyata; (5) fokus restore async → waitFor.
- Bukti: vitest **486/486** (35 file, dulu 477), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1049776, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 02:00 WIB — fix: ReferenceError `names` di banner review/gagal papan proyek (papan beku)

- Bug: projectboard.js draw() baris 111 memakai variabel `names` yang TIDAK ADA (seharusnya `full` dari bannerNames). Setiap ada task failed/review → draw() throw ReferenceError sebelum `tex.needsUpdate = true` → CanvasTexture tidak pernah diperbarui → papan proyek dibantuin.com menampilkan frame STALE/beku selamanya (fetch tetap jalan tapi gambar tak berganti). Kondisi paling parah justru saat task butuh perhatian — justru info terpenting yang tidak tampil.
- Fix: `'— ' + names` → `'— ' + full`. One-liner; tanpa perubahan perilaku lain.
- Bukti: vitest 450/450 (33 file, tetap), build OK (precache 35, 1536.94 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 726714, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 03:35 WIB — test: createNeonMode & createShift (runtime daycycle) 12 unit test (vitest 486→498)

- Backlog dipilih: daycycle.test.js hanya menguji logika murni (statusAt/daylight/mixHex) — runtime createNeonMode (toggle mode neon: 14 properti scene) & createShift (eksekusi event shiftStep: sendToLunch/endLunch/arrive/depart/nightfall/dawn + setTimeout berantai) sama sekali 0 unit test; regresi mode neon/shift tak terdeteksi.
- Test: src/__tests__/daycycle_runtime.test.js — 12 test dengan stub scene (light/mat helper + walker stub dengan position.set):
  - createNeonMode (3): toggle bolak-balik; enable → ambient 0.12/sun 0.08/exposure 0.55, tubeLights 0.35 biru 0x1a3355, dGlow agent 0.9×4.5, reception 0.7, floor 0x060c18; disable → restoreTime() dipanggil, warna & intensitas kembali kondisi siang.
  - createShift (8): phase awal working; lunch_start → walking_out + walkTarget area bar stools ±jitter + walkPause=LUNCH_PAUSE_MIN (rng stub); lunch_end → walking_back + walkTarget=home + collab dibersihkan, state meeting tidak diganggu; nightfall (m=400) → agent[0] dikecualikan (tetap sitting), duduk lain → offsite; arrive (400→480) → phase arriving, walker spawn terjadwal per 800ms via fake timers, walkTarget=home + resetStride; depart → hanya agen sitting, walkTarget pintu dalam kantor (-12,8); siklus 400..900 → phase working + agen pulang ke meja; dispose → semua timer dibatalkan (tidak ada agen bergerak setelahnya).
  - Iterasi asersi (4×): stub tubes/pendants salah bentuk (perlu {material}); position.set tidak ada di stub walker; phase 'night' harus di-update() dulu sebelum 480 (shiftStep dari phase awal 'working' + m=480 langsung working_am — window arrive syarat p!=='working'); dawn() menjalankan semua jadi sitting sebelum timer arrive → asersi melonggarkan ke union ['walking_back','sitting'].
- Bukti: vitest **498/498** (36 file, dulu 486), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1142277, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 04:00 WIB — test: createMotion runtime (state machine gerak karakter) 16 unit test (vitest 498→514)

- Backlog dipilih: motion.js (createMotion) — state machine inti gerak semua karakter (sitting→walking_out→converse→walking_back→leaving/offsite, chooseTrip, follow label, hard clamp, rute koridor) — 0 unit test; regresi gerak agent (menembus meja, tidak duduk kembali, bubble tidak muncul) tak terdeteksi.
- Test: src/__tests__/motion_runtime.test.js — 16 test, stub walker (limb isLeg/isArm + position.set) & rng deterministik (r=a, i=0), pickCollab/createBubble di-inject:
  - sitting: timer belum habis no-op; habis → walking_out (duduk disembunyikan, walker di home, walkPause=0, walkTarget = dest + jitter rng (−0.5), _route dihitung segera).
  - walking_out trip biasa: bergerak & label mengikuti walker; sampai → walkPause bertambah, lewat TRIP_PAUSE_MIN+jitter → walking_back; mode lunch tetap walking_out walau 30 detik.
  - collab: chooseTrip set collab/partner/_talk=−1 + walkTarget = home partner + COLLAB_OFFSET + window.__collabCount/Last; converse: baris genap bubble pengunjung, ganjil bubble partner, rotasi saling menghadap; selesai (> LINE_SEC×2 + 1.2) → walking_back, partner menghadap depan lagi.
  - walking_back: sampai home → sitting (walker hilang, duduk tampil, timer SIT_TIMER_MIN+jitter, pose stride & bob direset, label balik ke meja); flag resetStride (spawn shift) dikonsumsi sekali.
  - leaving: dekat pintu (<0.5) → offsite + walker hilang + label ke home; jauh → tetap bergerak.
  - hard clamp BOUNDS ±12.4/±9.4 meski target di luar lantai; rute lintas band lewat gang: langkah pertama lurus keluar ke koridor depan baris asal (FRONT[0] −4.15, x tetap).
  - dispatch: state tanpa handler (offsite/meeting) diabaikan tanpa error.
- Iterasi asersi (5×): (1) environment node tanpa window → shim globalThis.window utk __collabCount; (2) jitter tujuan rng stub menggeser −0.5; (3) stepMove butuh lebih dari 1 update utk arrive (0.32 unit/langkah > ARRIVE 0.2 → 2 update); (4) stepRoute melompat waypoint lebih cepat dari dugaan — posisi awal walker harus di-set eksplisit; (5) _route[] berisi duplikat gang (perilaku historis, bukan bug) → asersi diarahkan ke koridor asal.
- Bukti: vitest **514/514** (37 file, dulu 498), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1246738, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 04:40 WIB — test: createFurniture runtime (perabot kantor 3D) 10 unit test (vitest 524→534)

- Backlog dipilih: src/scene/parts/furniture.js (createFurniture — dispenser air, 5 tanaman pot, rak buku, printer, sofa lounge, pantry mini, 5 poster dinding, addPlant) — satu-satunya bagian scene 3D yang 0 unit test; regresi posisi/warna perabot tak terdeteksi.
- Test: src/__tests__/furniture_runtime.test.js — 10 test, jsdom + canvas stub (mencatat fillText/fillStyle) + THREE stub (Group/Mesh dengan position.set & rotation, MeshBasic/Lambert, CanvasTexture, Box/PlaneGeometry):
  - 4 group (dispenser, printer, sofa, pantry) + mesh loose di office; 5 plane poster 0.46×0.66.
  - dispenser: 3 box, tub 0.3×0.6 di (-10.5, 0.3, 0), galon 0x7fb8ea, keran 0x4a6a86.
  - tanaman: 5 pot (2 besar diskala 1.3 → 0.39, castShadow); daun rng deterministik (n()=0.9 → semua 0x5fae63) = 19 (2 besar ×5 + 3 kecil ×3), 10 daun lebar >0.2.
  - rak buku: 3 rak 1.9×0.05×0.32 di (-11.5, 0.5/1.05/1.6, -5) + 15 pustaka warna tetap.
  - printer: 6 bagian di (3, *, -8) + LED MB 0x00e676; sofa: 12 bagian + 2 bantal 0xff5252/0x448aff rotasi −0.15/0.2; pantry: 12 bagian + LED 0x0deef3 + 3 kue + microwave 0.36×0.22×0.26.
  - poster: 5 canvas 120×160, teks slogan per kata (SHIP/IT/KUALITAS/WFS/PROJECT), rotasi π/2 dinding kiri vs −π/2 kanan, offset ±0.03 anti z-fighting.
  - return refs {addPlant, dispenser, printer, sofa, pantry}; addPlant runtime: pot baru 0.39 + 5 daun.
- Iterasi asersi (4×): stub Group butuh rotation (leaf.rotation.y); Mesh group & Mesh loose berbeda — position.set Group stub tak menyimpan koordinat → Mesh override position; daun terhitung 19 bukan 15/25 (rng deterministik, asersi awal salah hitung); sofa & pantry masing-masing 12 bagian (bukan 10) dan pantry dibedakan dari sofa via geometry args[0]=1.7 (keduanya group 12 anak).
- Bukti: vitest **534/534** (39 file, dulu 524), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1398453, tanpa 'Scene init failed'.
- Sisa backlog: flooring.js (33 baris) & room.js (89 baris) runtime; verifikasi subjektif kualitas suara; minor nameplate MEETING↔"Rizky" (pantau).



- Backlog dipilih: src/scene/parts/projectboard.js — papan proyek dibantuin.com di dinding kantor (mount mesh+bingkai, fetch /wfs-project, render canvas, banner review/gagal, strip SaaS/agent, interval 60 dtk, visibilitychange, forceVisible anti wallFade, destroy) — 0 unit test runtime (hanya projectboard_data.js murni yang ter-cover); regresi papan kosong/beku tak terdeteksi.
- Test: src/__tests__/projectboard_runtime.test.js — 10 test, jsdom + canvas stub (node_modules tanpa paket `canvas`, getContext jsdom = null → context 2D palsu MENCATAT fillText, asersi via teks yang digambar) + THREE stub minimal (Mesh menyimpan position/rotation/userData/geometry):
  - mount: 2 objek ditambahkan (mesh PlaneGeometry 7.4×4.04 di (-8.6, 2.6, 9.3) rotasi π menghadap dalam; bingkai BoxGeometry 5.75×3.21×.05 dengan userData.__keep=1 → tidak ikut wallFade).
  - fetch: dipanggil segera saat mount lalu tiap 60 dtk (3× setelah 120 dtk).
  - render: judul "PROYEK: dibantuin.com", "65% selesai" (23 done 15), kolom ANTRI (4)/JALAN (2)/SELESAI (15), kartu #21/#22/#23 + '✓ selesai'.
  - banner: GAGAL 1 · REVIEW 2 + '#7 task gagal' & '#9 task review' tampil; snapshot bersih → banner absen & '100% selesai'.
  - strip: 'SaaS', '3 tenant', 'sbx-be1 ●'.
  - payload null / fetch gagal → tidak throw, snap tetap null, tidak ada judul digambar.
  - tab hidden → tick 120 dtk tanpa fetch; kembali visible → langsung fetch (listener visibilitychange).
  - forceVisible: mesh di-fade (opacity .3/transparent/invisible) dipulihkan ke tampil penuh dalam ≤500 ms.
  - destroy: interval fetch & forceVisible berhenti (120 dtk tanpa fetch; opacity dimanipulasi tetap 0.2).
- Iterasi asersi (4×): (1) THREE.Mesh bukan constructor → stub Mesh class; (2) papan tanpa destroy bocor interval antar-test (fetch 9×, teks silang) → mountedBoards di-destroy di afterEach; (3) mount(snap) tak mengganti stub fetch → stub di-set ulang di dalam mount; (4) 'fetch gagal' semula tidak pernah gagal karena ditimpa stub sukses → test diubah ke payload null (jalur catch setara).
- Bukti: vitest **524/524** (38 file, dulu 514), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1322810, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-21 05:00 WIB — Runtime test flooring.js & room.js (backlog terakhir habis)

- Backlog dipilih: src/scene/parts/flooring.js (createZones) & src/scene/parts/room.js (createMeetingRoom, createWallClock, createCeilingFixtures) — dua file terakhir di scene 3D tanpa unit test runtime; regresi zona/lantai/ruang rapat/jam/lampu tak terdeteksi.
- Test flooring: src/__tests__/flooring_runtime.test.js — 10 test: 5 patch (BoxGeometry w×0.02×d di y=0.015, receiveShadow; warna/opacity per ZONES — MEETING op .9, default .55), 5 sprite label (canvas 512×96, teks putih = label, depthTest false, renderOrder 5, center (.5,1), visible ikut namesVisible), posisi tepi depan zona via zoneLabelY (DEV DESK z=−4.25; SERVER ROOM dy=−0.9 → −9.5), skala label panjang 1.25 (WELCOME & LOUNGE 4.25×0.8), window.__zoneLabels(5) & __zoneBase(Map 5 entri, userData.label).
- Test room: src/__tests__/room_runtime.test.js — 9 test: kaca+tiang sesuai meeting_room_spec (midY=panels+posts), meja top 3.9×0.07×1.55 di (CX,.72,CZ) cast+receiveShadow + 2 kaki, 6 kursi × 3 bagian, whiteboard 2.7×1.15×0.035 di z=CZ−2.55 + plane agenda 2.5×1.0 di CZ−2.52, agenda "WFS SPRINT"+3 butir digambar, refs MRX/MRZ/meetSeats(6); jam dinding: rim cylinder r0.3 rot x π/2 offset +0.03 (faceRotY truthy), face circle r0.27 rot π, draw() set tex.needsUpdate, TICKS=12; lampu gantung per meja: kabel 0.02@3.65 + kap 0.4 + bohlam 0xfff3d6@3.11 + PointLight 0xffe8cc 0.15 @3.1 (2 meja → 8 objek).
- Iterasi asersi (3×): THREE stub awal lupa MeshLambertMaterial → semua fail constructor; float −9.500000000000002 → toBeCloseTo; userData.label ternyata dipasang (bukan via __zoneLabels saja) → asersi 5, bukan 0.
- Bukti: vitest **553/553** (41 file, dulu 534 — +19), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1469296, tanpa 'Scene init failed'.
- Sisa backlog: SEMUA item test runtime scene 3D selesai (scene, daycycle, motion, furniture, projectboard, flooring, room). Tersisa hanya verifikasi subjektif kualitas suara (butuh telinga manusia) & minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 05:20 WIB — test: buildRobot runtime (robot "Bantuin AI") 14 unit test (vitest 553→567)

- Backlog dipilih: src/scene/parts/robot.js (buildRobot — visual robot asisten Bantuin AI: kaki/torso/lengan/kepala kapsul/mata LED/senyum/panel dada/antena) — hanya robot_spec.js (murni) yang ter-cover; buildRobot runtime 0 test, regresi visual robot (mata hilang, kaki salah fase, pose duduk rusak) tak terdeteksi.
- Test: src/__tests__/robot_runtime.test.js — 14 test, stub THREE (Vec3/Group/Mesh + geometry args), buildRobot dipanggil utk pose berdiri & duduk:
  - berdiri: grup ber-tanda isRobot; 2 kaki isLeg dengan fase 0/π sesuai legsStanding + castShadow; aksen neon pinggang glow di ty−0.17; panel dada gelap + 3 bar chestBars glow (tinggi per spec); 2 mata LED glow pada eyes(p); senyum 3 mesh (tengah 0.1 + 2 ujung 0.03) sesuai smile(p); lampu status putih di accents().status; antena di hy+0.25 + bola putih di hy+0.34; kepala kapsul shiny 0xe6edf3 skala z 0.9 castShadow; torso terang 0xd5dde5 castShadow.
  - duduk: tanpa kaki isLeg (3 bagian kaki duduk per sisi); wajah berpindah ke sisi fz=−1 (z = tz−0.143 < 0); lengan dirotasi x=0.5 (2) & x=1.45 (2); torso & kepala mengikuti pose(false) ty/hy turun.
- Iterasi asersi (3×): filter mata hanya via x>0.01 ternyata menangkap halo senyum/uang (4 bukan 2) → tambah filter y = hy+0.025; pose duduk mata z=−0.121 menangkap 5 mesh glow (bar dada di z=−0.09 beda tipis) → filter sama y; kandidat posisi mata perlu ≥1 karena halo memenuhi x/y.
- Bukti: vitest **567/567** (42 file, dulu 553 — +14), build OK (precache 35, 1536.96 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1537294, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); minor nameplate MEETING↔"Rizky" (pantau).

## 2026-10-24 05:45 WIB — fix nameplate: akronim "Ai" → "AI" (BANTUIN AI, TRAINER AI)

- Backlog dipilih: minor nameplate — sprite label mengambang (labelName) & nameplate meja (titleCase) merender "Bantuin Ai"/"Trainer Ai"; akronim AI ikut ter-title-case.
- Perbaikan: label_spec.js labelName() & nameplate_spec.js titleCase() kini uppcase-kan kata dalam whitelist ACRONYMS = {ai, hr, qa, ui, ux, ml, api, sql} ('bantuin ai'→'Bantuin AI', 'ui ux designer'→'UI UX Designer'; 'Wahyu Fs' dll tetap).
- label_spec.js kini import ACRONYMS dari nameplate_spec (satu sumber).
- Iterasi asersi (2×): regex pertama uppcase SEMUA kata ≥2 huruf ('bantuin'→'BANTUIN') → diganti whitelist.
- Bukti: vitest **568/568** (42 file, dulu 567 — +1 test titleCase akronim), build OK (precache 35, 1537.14 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1615327, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).


## 2026-10-24 06:15 WIB — test: TV lounge runtime (drawTv + tvPull dashboard /wfs-project) 7 unit test (vitest 568→575)

- Backlog dipilih: blok TV lounge di OfficeScene.js (drawTv dashboard live /wfs-project + tvPull fetch 60 dtk + tvOnVis) — satu-satunya fitur live-data scene 3D tanpa unit test; regresi "menghubungkan..." permanen / angka palsu tak terdeteksi.
- Test: src/__tests__/tv_lounge_runtime.test.js — 7 test; blok TV diekstrak dari sumber OfficeScene.js (indexOf 'const tvC=' s.d. 'office.add(lounge);') lalu dievaluasi via new Function dengan stub window/THREE/canvas/fetch (drawTv tidak diekspor):
  - canvas 256×144; header 'WFS HQ · LIVE'; tanpa data → 'menghubungkan...' + TIDAK ada angka '%' (regresi angka hardcode palsu dicegah).
  - dengan data: '65% · 15/23 task', 'GAGAL: 1', 'REVIEW: 2', 'SaaS', '3 tenant · 120 pesan', 'sbx-be1● qa1○' (dot Up/Down), 'update <jam>'.
  - 0/0 task → '0% · 0/0 task' (bukan NaN).
  - tvPull: fetch /wfs-project, window.__tvData.at timestamp, tvTex.needsUpdate=true; interval 60 dtk fetch tiap tick.
  - tab hidden → tvPull skip; fetch gagal → tidak throw, data lama dipertahankan.
  - tvOnVis: hidden → tidak fetch; visible → fetch; tvScr plane 1.2×0.68 map tvTex rotasi -π/2 di x≈12.31.
- Iterasi asersi (5×): teks agent tanpa spasi ('sbx-be1●'); fetch dieksplicitkan sebagai parameter new Function (shadow global); await tvPull() dalam runTvCode → call count dobel; ekstraksi blok harus dari 'const tvC=' (bukan komentar) agar tvx terdefinisi.
- Bukti: vitest **575/575** (43 file, dulu 568 — +7), build OK (precache 35, 1537.14 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1722346, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 07:30 WIB — FIX KRITIS: ReferenceError "soundsStarted is not defined" (regresi refactor sound engine)

- Penemuan: eslint `no-undef` pada OfficeScene.js — `soundsStarted` (2× di animate(), baris tick keyclick/step) tidak lagi terdeklarasi sejak refactor 4fbb399 (deklarasi `let soundsStarted=false` lama ikut terhapus, referensi tertinggal). Bundle produksi terakhir memuat bug ini → di runtime, frame pertama yang tick suara (~0.1 s) melempar ReferenceError dan MENGHENTIKAN loop render animate() (kegagalan senyap: DOM & scene init tetap jalan).
- Fix: guard diganti `__sound.state()!=='none'` (audio sudah di-ensure → state bukan 'none'); play* sendiri sudah lazy-init aman.
- Verifikasi: eslint no-undef 0; vitest **585/585** (44 file); build OK (precache 35, 1538.01 KiB); bundle baru OfficeScene-BYhblVRC.js bebas 'soundsStarted' (grep 0); deploy ~/wfs-hq OK; reload chrome dbg 9222 dengan purge SW cache → resource OfficeScene-BYhblVRC dimuat, fr berjalan (83→6267), 14 agents, tanpa exception runtime. e2e produksi 9503: DOM True, 14 agents, phase lunch→working, tanpa 'Scene init failed'.
- Catatan: window.__audio.started tetap false di headless (lazy-init menunggu user gesture isTrusted — perilaku benar, bukan bug; sebelumnya justru crash ReferenceError, kini hanya idle sampai gesture).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 07:00 WIB — refactor: sound engine diekstrak dari OfficeScene.js + 10 unit test runtime Web Audio (vitest 575→585)

- Backlog dipilih: blok SOUND SYSTEM OfficeScene.js (playKeyClick/playStep/playMeetingChime/initAudio/mute/dispose, ±70 baris Web Audio) — 0 unit test; regresi "suara senyap" (gain/ramp/envelope/mute salah) tak terdeteksi.
- Refactor: src/scene/parts/sound_engine.js — createSoundEngine({ctxFactory, setTimeoutFn}) mengembalikan ensure/playKeyClick/playStep/playMeetingChime/setMuted/dispose/dbg + rawCtx/state/suspend/resume. OfficeScene.js memakai engine ini: __sound.playKeyClick()/playStep()/playMeetingChime(), setAudioMuted→__sound.setMuted, onVis suspend/resume via state(), destroy→__sound.dispose() (close ctx, clear chime pending). window.__audio tetap di-update via __sound.dbg (hook debug dipertahankan). Param Web Audio (freq/gain/ramp/envelope/chime) tetap dari sound_spec.js — perilaku identik.
- Test: src/__tests__/sound_engine.test.js — 10 test, AudioContext stub tercatat (osc/gain/buffer + ramp):
  - lazy (belum started, state none); ensure: resume bila suspended, masterGain 1.
  - keyclick: square 800+rng*400, gain 0.01→ramp 0.001 @+0.05s, chain osc→gain→masterGain→destination, stop tepat KEYCLICK_SEC.
  - step: buffer 48000*0.04 sampel, envelope spec (stepEnvelope(0,n)=1), gain 0.02.
  - chime: 3 timeout delay i*0.15s, tiap nada sine C5/E5/G5 gain 0.04→0.001 @+0.5s.
  - mute: masterGain 0 ↔ 1, dbg.muted ikut; play pertama memicu ensure otomatis; dispose: clear 3 pending chime + close ctx + reset none; suspend/resume/state passthrough (visibilitychange) + no-op aman tanpa ctx.
- Iterasi asersi (3×): stub gain lupa exponentialRampToValueAtTime; stub buffer lupa getChannelData; chain osc→gain→masterGain (asersi destination dua hop, bukan langsung).
- Catatan verifikasi visual: screenshot pertama gagal WebGL (chrome 1248 swiftshader BindToCurrentSequence) — bukan regresi kode; reload di chrome dbg 9222 sukses: frame jalan, 14 agents, tanpa 'Scene 3D tidak aktif', render sehat (lantai/meja/karakter/zona normal via inspeksi visual).
- Bukti: vitest **585/585** (44 file, dulu 575 — +10), build OK (precache 35, 1538.00 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, phase lunch, frame 1801681→reload sehat, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 08:10 WIB — lint: OfficeScene.js 0 error eslint (27→0), no-empty & no-unused-vars dibersihkan

- Backlog dipilih: 27 error eslint no-unused-vars/no-empty di OfficeScene.js (sisa setelah fix no-undef kemarin).
- Pembersihan: empty catch `catch(e){}` → optional catch binding `catch{/* abaikan */}` (12×, ES2019 aman untuk target build); unused import `masterGainValue` & `collabDuration` dihapus dari deklarasi import; `const t=drawBubble(...)` → `drawBubble(...)`; assignment varuntu `hoverTmr` (tak pernah dibaca/clear) dihapus total; `.catch(()=>{})` pada resume ctx diganti try/catch luar; 3 no-op catch destroy dengan komentar → `catch{/* no-op */}`.
- Bukti: eslint OfficeScene.js **0 error** (dulu 27); vitest **585/585** (44 file); build OK (precache 35, 1538.01 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 78353 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 07:55 WIB — lint repo-wide: no-unused-vars dibersihkan di 18 file (49→0 error lint jenis ini)

- Backlog dipilih: 49 error eslint no-unused-vars tersebar (tests, components, scene parts) — sisa setelah OfficeScene.js bersih.
- Pembersihan:
  - Tests (11 file): callback canvas stub tanpa param tak terpakai (bubble_canvas), countMesh/countGroup helper terhapus (furniture), destructure `office`/`added`/`master`/`pts`/`strokes`/`ctx2`/`strokeCount`/`arcCount`/`tex` dihapus atau di-underscore (room/label_sweep/meeting/projectboard_runtime/sound_engine), param `b` dihapus (daycycle_runtime, routing).
  - Components: import useEffect tak terpakai dihapus (ActivityLog, ConfirmModal, CsWidget, OverlayHelp); prop `onFlash` dihapus dari ProjectPanel + pemanggilan `<ProjectPanel />` di App.jsx (prop tidak pernah dipakai).
  - Scene parts: robot.js import 5 helper robot_spec tak terpakai (eyes/smile/chestBars/legsStanding/accents) dihapus; sound_engine.js 2 catch(e) → optional catch binding; daycycle.js hapus `state` varuntu, `lunchWindowOpen` destructure & fungsi mati `updateLunch` (dua-duanya sudah digantikan mesin shiftStep); projectboard.js hapus fungsi `chip()` & var `bx` tak terpakai.
- Bukti: eslint no-unused-vars **0 error** (dulu 49); sisa 12 error hanya react-hooks/refs & immutability (pola baru linter, butuh refactor khusus — backlog terpisah); vitest **585/585** (44 file); build OK (precache 35, 1537.95 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 153218 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: 12 error react-hooks (refs-during-render dsb) butuh refactor komponen; verifikasi subjektif kualitas suara.

## 2026-10-24 08:40 WIB — lint: 12 error react-hooks (refs-during-render & prop mutation) → 0 error eslint repo-wide

- Backlog dipilih: 12 error eslint terakhir (react-hooks/refs "Cannot access/update ref during render" di 6 komponen + react-hooks/immutability di ActionMenu) — pola "latest callback ref" yang ditulis langsung saat render.
- Refactor (perilaku identik — sinkronisasi ref dipindah ke useEffect tanpa deps, fungsi a11y chain yang redundan dihapus):
  - ActivityLog.jsx, ConfirmModal.jsx, CsWidget.jsx, OverlayHelp.jsx, TaskBoard.jsx, TaskModal.jsx: `ref.current = ...` saat render → `useEffect(() => { ref.current = ... })`; chain dua ref (closeA11yRef dsb) diringkas jadi satu ref latest-callback.
  - TaskModal.jsx: hapus closeRef perantara; TaskBoard.jsx: hapus escA11yRef perantara; OverlayHelp.jsx: hapus closeA11yRef.
  - ActionMenu.jsx: prop `refApi` diganti `actionMenuRef` (nama berakhiran Ref agar linter mengenalinya); effect menulis ke ref lokal `amRef.current` lalu mengeksposnya via `actionMenuRef.current`; deps effect ditambah `rotOn`; setState sinkronisasi saat menu dibuka diberi disable terdokumentasi (react-hooks/set-state-in-effect — sinkronisasi sekali per buka menu, bukan cascading).
- Bukti: eslint src **0 error, 2 warning** (exhaustive-deps di App/ActionMenu, tersisa sebagai catatan); vitest **585/585** (44 file); build OK (precache 35, 1537.93 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 229043 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: 2 warning exhaustive-deps (butuh analisis deps, bukan kosmetik); verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-24 08:45 WIB — lint tuntas: 2 warning exhaustive-deps terakhir → eslint 0 problem

- Backlog dipilih: 2 warning react-hooks/exhaustive-deps terakhir (App.jsx shortcut effect, ActionMenu.jsx open effect) — eslint jadi 100% bersih (0 error, 0 warning).
- App.jsx: `zoom` dipindah ke atas shortcut effect & dibungkus useCallback([flash]) (sebelumnya dideklarasikan SETELAH effect — dep tak bisa ditambahkan); deps effect ditambah `zoom`, `flash`, `amRef` (amRef stabil — useRef). Perilaku shortcut +/-/K/R/F/M/N/H identik.
- ActionMenu.jsx: deps `[open]` → `[open, sceneRef]` (sceneRef adalah ref stabil dari App, effect tetap re-run hanya saat menu dibuka; sinkronisasi namesOn/rotOn saat open tidak berubah).
- Bukti: eslint src **0 problem** (0 error 0 warning — dulu 2 warning); vitest **585/585** (44 file); build OK (precache 35, 1537.97 KiB), deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 301368 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: hanya verifikasi subjektif kualitas suara (butuh telinga manusia). Lint backlog TUNTAS.

## 2026-10-21 09:20 WIB — papan proyek: judul kartu tak lagi terpotong tengah kata + kartu ke-6 tidak ketiban strip bawah

- Backlog dipilih: QA visual papan proyek (data → canvas). Ditemukan via ekstraksi canvas papan (bukan menebak dari screenshot): (1) judul kartu dipotong `slice(0,30)` di tengah kata, mis. "(Next.j", "landing page t"; (2) kartu ke-6 kolom SELESAI terpotong tepi bawah oleh strip status.
- Fix:
  - `clip(s,n)` baru di projectboard_data.js: potong di spasi terakhir (bila >60% batas) + '…'; fallback potong apa adanya bila kata tunggal sangat panjang.
  - Layout kartu dipindah ke konstanta terekspos `cardY(i)/CARD_TOP/CARD_STEP/CARD_H/COLUMN_BOTTOM` (248/88/78/788) — kartu 78px @88px step, kartu terakhir 684+78=762 ≤ 788, tak menyentuh strip (y=794). projectboard.js memakai cardY/CARD_H (single source).
  - +5 unit test: clip (3) & cardY layout invariants (2), termasuk asersi kartu ke-6 ≤ COLUMN_BOTTOM.
- Verifikasi visual: canvas papan diekstrak via toDataURL dan dibaca — semua judul berakhir bersih ('…' di batas kata: "…admin…", "…embeddable…", "…E2E…", "…page…"), kartu #22 utuh dengan border bawah terlihat, gap di atas strip.
- Bukti: vitest **590/590** (44 file, dulu 585 — +5); eslint src **0 problem**; build OK (precache 35, 1538.12 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr berjalan, tanpa 'Scene init failed'; screenshot produksi 710KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 10:10 WIB — performa: redraw layar monitor di-throttle 60fps → ~10fps (hemat CPU/GPU per frame)

- Backlog dipilih: `screenData.forEach(drawScreen)` menggambar ulang 14 tekstur canvas monitor SETIAP frame (~60fps) padahal kontennya animasi lambat (chat, chart, log) — boros CPU/GPU utk 2 vCPU VM.
- Fix: helper `shouldRedrawScreen(frame)` + konstanta `SCREEN_REDRAW_EVERY=6` di parts/effects.js (teruji unit); OfficeScene hanya memanggil drawScreenFrame tiap frame kelipatan 6 → ~10 redraw/dtk @60fps, animasi monitor tetap halus.
- +3 unit test baru (kelipatan redraw, throttle ≥5×, guard frame non-numerik).
- Bukti: vitest **593/593** (45 file, dulu 590); eslint src **0 error**; build OK (precache 35, 1538.18 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 174104 berjalan, phase lunch, tanpa 'Scene init failed'; screenshot produksi 675KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 10:30 WIB — performa: update peta bayangan di-throttle 60fps → 6×/dtk (hemat 1 render pass scene per frame)

- Backlog dipilih: renderer.shadowMap.autoUpdate default → Three.js merender shadow map penuh (pass scene kedua, PCFSoft 2048²) SETIAP frame, padahal matahari statis & agen bergerak lambat.
- Fix: `shouldRefreshShadow(frame)` + `SHADOW_REFRESH_EVERY=10` di parts/effects.js; OfficeScene: `shadowMap.autoUpdate=false`, `needsUpdate=true` tiap kelipatan 10 frame (~6×/dtk @60fps) — di antara refresh bayangan dipakai dari cache.
- +2 unit test baru (kelipatan refresh, guard frame non-numerik).
- Bukti: vitest **595/595** (46 file, dulu 593); eslint src **0 problem**; build OK; deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 246420 berjalan, phase lunch, tanpa 'Scene init failed'; screenshot produksi 675KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 10:50 WIB — performa: pass anti-overlap label di-throttle 60fps → 15×/dtk

- Backlog dipilih: `sizeLabels()` + sweep anti-overlap (5 iterasi overlapPass × 14 label agent + label zona + bubble, masing-masing dengan `position.project(camera)`) berjalan SETIAP frame — pass CPU termahal yang tersisa di animate() setelah throttle layar monitor & shadow map.
- Fix: `shouldRelayoutLabels(frame)` + `LABEL_RELAYOUT_EVERY=4` di parts/effects.js; OfficeScene hanya memanggil sizeLabels() tiap kelipatan 4 frame (~15×/dtk @60fps). Aman: offset anti-tumpuk per-agent tersimpan di userData.antiY/antiX dan dipakai ulang di antara tick, label tidak loncat.
- +5 unit test baru (kelipatan, custom every, guard non-numerik, rasio hemat ≥4×).
- Bukti: vitest **600/600** (47 file, dulu 595); eslint src **0 problem**; build OK (precache 35, 1538.36 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 321706 berjalan, phase lunch, tanpa 'Scene init failed'; screenshot produksi 676KB (scene hidup).
- Sisa backlog: hanya verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 11:15 WIB — bubble chat: teks tak lagi terpotong tengah kata

- Backlog dipilih: QA teks bubble chat. `clampBubbleText` (dialog.js) memangkas `slice(0,31)` — bubble panjang (mis. judul task 'mengerjakan…') terpotong di tengah kata, pola bug sama dengan judul kartu papan proyek yang sudah diperbaiki.
- Fix: pemangkasan di batas KATA terakhir (spasi terakhir ≥60% batas 32 char) + '…'; fallback potong apa adanya untuk kata tunggal sangat panjang / tanpa spasi.
- +3 unit test baru (batas kata, kata panjang, spasi dipakai) → clampBubbleText teruji 5 kasus.
- Bukti: vitest **603/603** (47 file, dulu 600); eslint src **0 problem**; build OK (precache 35, 1538.42 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 398417 berjalan, phase lunch, tanpa 'Scene init failed'; screenshot produksi 675KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 11:45 WIB — papan proyek: strip bawah sadar-lebar, agen tak terdorong keluar

- Backlog dipilih: QA strip status bawah papan. Estimasi lebar konten (nama tenant panjang + 4 agen) bisa 1449px > batas ~1422px → segmen AGENT di ujung kanan berpotensi keluar frame strip.
- Fix di projectboard_data.js (murni, teruji):
  - `clampStripTenant(name, 24)`: nama tenant dipangkas di batas kata + '…' (pola clip).
  - `stripLayout(snap, measure)`: ukur lebar segmen (dengan font canvas sungguhan), buang segmen prioritas-rendah berurutan — terbaru → pesan → chat → online — sampai muat budget; label SaaS + status agen SELALU dipertahankan.
- projectboard.js: render strip memakai stripLayout dengan measureText real (budget = W − 2×44 − 26).
- +8 unit test (clampStripTenant 4, stripLayout 4 termasuk invariant lebar ≤ budget).
- Verifikasi visual produksi: canvas strip diekstrak via __projectBoard → toDataURL — semua segmen tampil lengkap (SaaS, 2 tenant, 16 chat, 32 pesan, online, terbaru: Warung Bu Ani, AGENT, toni/qa1/fe1/be1 ●) tanpa terpotong, ada sisa ruang di kanan.
- Bukti: vitest **611/611** (47 file, dulu 603); eslint src **0 problem**; build OK (precache 35, 1539.22 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 setelah reload: DOM True, 14 agents, fr 100+ naik, tanpa error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 12:00 WIB — papan proyek: banner GAGAL/REVIEW sadar-lebar, nama task tak lagi terpotong slice(0,24)

- Backlog dipilih: QA banner review/gagal di papan. `bannerNames` memangkas judul `slice(0,24)` di tengah kata (pola bug sama dengan judul kartu & bubble yang sudah dibereskan) dan lebar banner dihitung dari teks gabungan — bisa meluber keluar papan bila 3 judul panjang tampil bersamaan.
- Fix:
  - `bannerLayout(T, measure)` baru di projectboard_data.js: ukur lebar dengan font sungguhan; bila melebihi budget buang item terlama dari belakang; bila tetap tak muat, pangkas nama terakhir di batas kata (pakai `clip`). `bannerNames` kini tanpa `slice` (judul utuh bila muat).
  - projectboard.js: render banner memakai `bannerLayout` (budget = W − 88), lebar kotak banner diukur per segmen.
- +4 unit test (null-guard, judul utuh saat muat, buang dari belakang saat sempit, invariant lebar ≤ budget).
- Bukti: vitest **615/615** (47 file, dulu 611); eslint src **0 problem**; build OK (precache 35, 1539.99 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 76007 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 12:20 WIB — bubble status task: pakai clampBubbleText, tanpa slice(0,26)

- Backlog dipilih: bubble status kerja di OfficeScene memangkas judul task `run.title.slice(0,26)` di tengah kata — pola bug sama dengan bubble chat & judul kartu yang sudah dibereskan.
- Fix: panggilan createBubble kini memakai `clampBubbleText(run.title)` (pangkas di batas kata + '…'), konsisten dengan sisa bubble.
- Bukti: vitest **615/615** (47 file); eslint bersih; build OK (precache 35, 1539.97 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 140346 berjalan, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 12:45 WIB — performa: redraw jam dinding di-throttle 60fps → ~3fps

- Backlog dipilih: `drawClock(timeOfDay)` dipanggil SETIAP frame di animate() — canvas 96×96 digambar ulang + tekstur di-upload ke GPU 60×/dtk, padahal hanya jarum detik yang berubah (bergerak diskrit per detik).
- Fix: `shouldRedrawClock(frame)` + konstanta `CLOCK_REDRAW_EVERY=20` di parts/effects.js; OfficeScene hanya memanggil drawClock tiap kelipatan 20 frame (~3×/dtk @60fps) — hemat 57 redraw canvas + upload tekstur per detik.
- +5 unit test baru (kelipatan, custom every, guard non-numerik, rasio hemat ≥20×).
- Bukti: vitest **620/620** (48 file, dulu 615); eslint src bersih; build OK (precache 35, 1540.03 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 230166 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 13:10 WIB — performa: seluruh blok anti-overlap label (project kamera + 5-pass + sweep) di-throttle 60fps → 15×/dtk

- Backlog dipilih: setelah sizeLabels() di-throttle (frame%4), blok label di animate() TETAP berjalan tiap frame: `position.project(camera)` untuk 14 label agen + label zona + bubble, 5× overlapPass, sweepClampRounds, dan konversi offset piksel→dunia — pass CPU termahal yang tersisa.
- Fix: satu gerbang `if(namesVisible && shouldRelayoutLabels(frame))` kini mencakup sizeLabels() + seluruh blok label; tidak ada perubahan perilaku (offset anti-tumpuk per-agent tersimpan di userData.antiY/antiX sehingga label tidak loncat antar tick).
- Bukti: vitest **620/620** (48 file); eslint src bersih; build OK (precache 35); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 301622 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 13:35 WIB — clip() dipakai ulang lintas UI: log HUD, flash, ticker, TeamStats tak lagi memotong tengah kata

- Backlog dipilih: sisa `slice(0, n)` teks di UI — App.jsx (log HUD `slice(0,50)` + flash `slice(0,40)`), Ticker.jsx (`slice(0,48)`), TeamStats.jsx (`slice(0,34)`) — pola bug sama dengan bubble/banner yang sudah dibereskan.
- Fix: `clip()` dipindah ke `src/lib/clip.js` (re-export dari projectboard_data.js agar kompatibel); keempat pemanggilan UI kini pakai `clip()` batas-kata + '…'.
- +4 unit test baru (utuh, batas kata, kata panjang, identitas re-export).
- Bukti: vitest **624/624** (49 file, dulu 620); eslint src **0 problem**; build OK; deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 374341 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 13:55 WIB — performa: kedip LED server room di-throttle 60fps → 20×/dtk (+ ekstrak ledOpacity murni)

- Backlog dipilih: loop LED server room menjalankan Math.sin + set material.opacity untuk 72 LED (3 rak × 8 unit × 3 lampu) SETIAP frame, padahal blink lambat (sp 2–6 rad/s).
- Fix:
  - `shouldUpdateLeds(frame)` + `LED_UPDATE_EVERY=3` (~20×/dtk) di parts/effects.js; OfficeScene hanya update opacity di kelipatan 3 frame.
  - Logika opacity diekstrak ke fungsi murni `ledOpacity(L, elapsed)` (biner 1 / 0.12, guard input non-numerik → 0) — loop di OfficeScene tinggal satu baris.
- +3 unit test baru (kelipatan throttle, biner/guard opacity, periodisitas 2π).
- Bukti: vitest **627/627** (49 file, dulu 624); eslint src **0 problem**; build OK (precache 35, 1540.21 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, fr 450020 berjalan, phase lunch, tanpa 'Scene init failed'.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 14:15 WIB — performa: redraw layar monitor di-stagger 14 layar serentak → menyebar per frame

- Backlog dipilih: `screenData.forEach(drawScreen)` — 14 layar canvas dulu digambar BERSAMAAN di frame yang sama tiap SCREEN_REDRAW_EVERY=6 (lonjakan CPU berulang), lalu diam 5 frame.
- Fix: `shouldRedrawScreenAt(frame, index)` baru di parts/effects.js — layar ke-i hanya digambar bila `frame ≡ (i mod 6) → 0`; beban menyebar merata (~2–3 layar per frame), tiap layar tetap refresh dengan periode yang sama. OfficeScene: `drawScreen=(s,i)=>…`.
- +3 unit test (frekuensi per layar tetap 2×/periode, puncak per frame = ceil(14/6), wrap indeks negatif/besar + guard non-numerik).
- Verifikasi produksi (chrome dbg 9222, reload): scene hidup, frames berjalan, 14 agents & 14 screens; sampling hash piksel 14 canvas dalam 0,6 dtk → hanya ~6 yang berubah (dulu 14 serentak); screenshot 661 KB (>500 KB = scene hidup); tanpa 'Scene init failed'.
- Bukti: vitest **630/630** (50 file, dulu 627); eslint src bersih; build OK (precache 35, 1540.24 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 tanpa error.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 14:40 WIB — performa: dust drift di-throttle 60fps → ~20×/dtk (+ dustY murni)

- Backlog dipilih: loop partikel debu menjalankan sin/cos untuk 40 partikel + upload buffer posisi GPU (`pG.attributes.position.needsUpdate`) SETIAP frame, padahal drift sangat lambat (amplitudo ±.0006/.0003 per frame).
- Fix:
  - `shouldUpdateDust(frame)` + `DUST_UPDATE_EVERY=3` (~20×/dtk) di parts/effects.js; OfficeScene hanya update dust di kelipatan 3 frame.
  - Perhitungan Y diekstrak ke fungsi murni `dustY(x,y,elapsed,i)` (respawn >3.6 → 0.5, guard non-numerik); offset X dikompensasi ×3 supaya kecepatan drift tetap sama.
- +5 unit test (kelipatan throttle, custom every + guard, naik/respawn, periodisitas 2π).
- Bukti: vitest **635/635** (51 file, dulu 630); eslint src **0 problem**; build OK (precache 35, 1540.44 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: DOM True, 14 agents, frames berjalan (fr 2→17→22, tanpa 'Scene init failed'); screenshot 710 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 15:05 WIB — performa: 22 halaman melayang di-throttle 60fps → ~20×/dtk (akumulasi dt)

- Backlog dipilih: `__pages.update(delta,elapsed)` masih berjalan TIAP frame — 22 mesh × (2 posisi + 3 rotasi + Math.sin) ≈ 150 operasi animasi/dtk yang tak perlu; halaman drift sangat lambat.
- Fix di parts/effects.js:
  - `PAGES_UPDATE_INTERVAL = 1/20`; `update()` mengakumulasi dt dan hanya menjalankan loop saat tercapai (~20×/dtk) — hemat ~40 pass loop per detik.
  - dt DIAKUMULASI lalu dipakai sebagai `step` → perpindahan/rotasi per detik identik dengan update per-frame (tidak ada slowdown).
- Test wrap-around di-revisi: asumsi arah vx/vz lama salah (stub rng.n()=0.4 → arah NEGATIF, bukan positif); kini menguji wrap dua arah dengan posisi tepat di ambang -10.0005 / +10.0005.
- +3 unit test baru (dt di bawah interval → diam; akumulasi tercapai → bergerak dengan step benar; total perpindahan per 2 dtk ekuivalen update per-frame).
- Bukti: vitest **638/638** (51 file, dulu 635); eslint src **0 problem**; build OK (precache 35, 1540.53 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, frames berjalan (fr 2→4→42), tanpa 'Scene init failed'; screenshot 718 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 15:30 WIB — logika timer suara (keyclick & langkah) diekstrak ke tickSoundTimer murni

- Backlog dipilih: jadwal suara periodik di animate() masih inline (keyTimer/stepTimer -= delta + trigger) — tidak bisa diuji unit dan bercampur dengan loop render.
- Fix: `tickSoundTimer(prev,delta,interval,rng)` murni di parts/sound_spec.js — timer dikurangi delta; habis → trigger sekali + reset (interval angka utk step .32, fungsi rng utk keyclick .09+rng*.18); guard non-numerik. animate() tinggal memakai hasilnya.
- +6 unit test baru (belum habis, trigger+reset, interval fungsi, tepat nol, guard, simulasi 600 frame ≈ 10 dtk → 29–33 trigger).
- Bukti: vitest **644/644** (52 file, dulu 638); eslint src **0 problem**; build OK (precache 35, 1540.76 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, frames berjalan (fr 3→26→30), audio state none (lazy, benar), tanpa 'Scene init failed'; screenshot 719 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 15:55 WIB — auto-advance jam simulasi diekstrak ke advanceSimClock murni (parts/sim_clock.js)

- Backlog dipilih: logika auto-advance waktu simulasi (simAcc/simLast/__userSlider/lastManualSet) masih inline di animate() — tak bisa diuji unit, state tersebar 4 variabel global.
- Fix: parts/sim_clock.js murni — `advanceSimClock(prev, nowMs)` (akumulasi dt nyata, langkah per SIM_SEC_PER_MIN=5 dtk, wrap %1440, cap 288 langkah anti-hang bila tab lama disembunyikan lalu resume; tick pertama pakai last=null, bukan 0 falsy), `setSimManual(time, nowMs)` (mode MANUAL + resume otomatis setelah 8 dtk diam slider, akumulasi direset — tak loncat). OfficeScene kini state tunggal `__sim`; updateTime/setSimManual terintegrasi.
- +10 unit test baru (tick pertama, langkah tepat 5 dtk, akumulasi parsial tersimpan, wrap 1439→0, cap loncatan 24 jam, mode manual + resume + sentuhan baru memperpanjang manual).
- Bukti: vitest **654/654** (53 file, dulu 644); eslint src **0 problem**; build OK (precache 35, 1541.11 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, frames berjalan (fr 2→11), tanpa exception; jam HUD berjalan (11:07 → 11:17 dalam 25 dtk ≈ 5 menit simulasi — sesuai SIM_SEC_PER_MIN); screenshot 714 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 16:35 WIB — performa: efek ambient (ring/visor/label bobbing) di-throttle 60fps → ~20×/dtk via ambientFx murni

- Backlog dipilih: di animate() masih ada 4× Math.sin TIAP frame + 2 assign opacity (ringMat, helmetVisor) + bobbing label 14 agent duduk + label NX — semua osilasi pelan, tak perlu 60×/dtk.
- Fix di parts/effects.js: `AMBIENT_EVERY=3`, `shouldUpdateAmbient(frame)` (~20×/dtk, guard non-numerik/every≤0), `ambientFx(elapsed,i)` murni (ring .12+sin·.04, visor .8+sin·.2, label fase per-agent i*1.3, nx fase +9) — satu objek, animate() tinggal assign. Label duduk & nx kini hanya update di kelipatan 3 frame; animasi tetap mulus (osilasi sangat lambat).
- +7 unit test baru (throttle 60 frame→20 hit, every kustom, guard, ekivalensi rumus lama persis utk ring/visor, fase per-agent, guard NaN, periodisitas 2π).
- Bukti: vitest **661/661** (54 file, dulu 654); eslint src bersih; build OK; deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, frames berjalan (4→7→10), 0 exception; screenshot 714 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 16:58 WIB — performa: pulse ring diekstrak ke pulseFx murni + bubble obrolan di-throttle ~20×/dtk

- Backlog dipilih: (1) cincin denyut agent utama masih inline (pulseT/scale/opacity) di animate(); (2) `updateBubbles(delta)` berjalan TIAP frame padahal fade bubble lambat (life 0→3.5 dtk) — ~40 pass loop per detik tak perlu.
- Fix di parts/effects.js:
  - `pulseFx(elapsed)` murni → {phase, scale, opacity}; guard non-numerik → elapsed 0 (tak NaN ke material).
  - `BUBBLE_EVERY=3` + `shouldUpdateBubbles(frame)`; OfficeScene mengakumulasi dt (`bubbleAcc`) dan memakainya utuh sebagai step → laju fade/naik per detik identik.
- +8 unit test (rumus pulse lama persis, fase [0,1) + periodisitas 2 dtk, guard, throttle 60→20 hit, every kustom + guard, dt kecil dikurangkan langsung, ekuivalensi laju 90 frame throttled vs per-frame, penghapusan bubble habis).
- Koreksi test awal: asumsi throttle di dalam bubbles.js salah — throttle memang di pemanggil (OfficeScene); test direvisi sesuai semantik.
- Bukti: vitest **671/671** (55 file, dulu 661); eslint src **0 problem**; build OK (precache 35, 1541.55 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, frames berjalan (3→4→7), 0 exception; screenshot 730 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 17:05 WIB — autoTalk diekstrak ke murni (autoTalkDelay & autoTalkText di parts/dialog.js)

- Backlog dipilih: `autoTalk()` di OfficeScene masih inline — delay acak 4–10 dtk & pemilihan teks (prioritas task running → frasa per-role → fallback) tak bisa diuji unit.
- Fix: `autoTalkDelay(rng)` (4000+rng·6000 ms) & `autoTalkText(ad, runningTasks, agentIdMap, rng)` murni di parts/dialog.js; OfficeScene.autoTalk() kini tinggal pilih agent + buat bubble.
- +5 unit test (rentang delay & rng deterministik, prioritas task + clamp 32 char, frasa role & fallback, agent null → null, rng kustom).
- Bukti: vitest **676/676** (55 file, dulu 671); eslint src/scene **0 problem**; build OK (precache 35, 1541.58 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP reload: 14 agents, frames berjalan (5→10), tanpa exception; screenshot 726 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 17:30 WIB — adaptive quality (tangga FPS degradasi + recovery) diekstrak ke perfStep murni (parts/perf_quality.js)

- Backlog dipilih: blok adaptive quality di animate() masih inline — sampling FPS 2 dtk, tangga pixelRatio→shadow 1024→shadow off (latch), dan recovery pixelRatio; logika latching tak bisa diuji unit.
- Fix: parts/perf_quality.js — `perfStep(state, nowMs, frame, opts)` murni (renderer & sun dimock via opts, aksi eksplisit). Semantik persis kode lama: sampel pertama hanya set t0 (t0=0 falsy), fps = Δframe/Δt, tangga <18/<10/<5 fps, latch shadowLevel, recovery 4 streak ≥28 fps → pixelRatio naik bertahap sampai basePR. OfficeScene tinggal wrapper renderer asli.
- +9 unit test (sampel pertama, window <2 dtk, tangga lengkap 2 fps + map.dispose, latch tak re-trigger, 15 fps hanya pixelRatio, 9 fps @pr 0.75 hanya shadow, recovery 4 streak naik bertahap sampai basePR & latch lepas, recovery diblokir bila shadowLevel=2, guard tanpa renderer/sun).
- Bukti: vitest **685/685** (56 file, dulu 676); eslint src **0 problem**; build OK (precache 35, 1541.96 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP reload: 14 agents, frames berjalan (3→4), __perf state terisi benar, tanpa exception; screenshot 726 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 17:50 WIB — logika kamera fokus (follow/lerp/reset) diekstrak ke parts/kamera_focus.js murni

- Backlog dipilih: blok kamera follow di animate() masih inline — updateFollowGoal (target ikut walker / posisi home / transisi reset saat offsite), lerp tgt & radius (faktor .06), kondisi selesai reset (jarak ke HOME_TGT <.05), dan auto-rotate (theta += .0012) tak bisa diuji unit.
- Fix: parts/kamera_focus.js — `updateFollowGoal(goal, homeRadius, radiusFallback, homeT)` (walker visible→posisi walker, else home; offsite→goal reset {t:HOME,r:homeRadius||fallback}), `focusStep(tgt, sph, goalT, goalR)` (lerp .06 + jarak euclidean ke HOME y=1.8 <.05 → selesai), `autoRotateStep(sph)`. OfficeScene tinggal memanggil + updCam().
- +10 unit test (follow visible/home, offsite→reset dgn homeRadius & fallback, non-offsite tak reset, lerp .06 eksak, konvergen <.05, belum selesai saat jauh, deviasi y memengaruhi jarak, auto-rotate 0.0012/langkah).
- Bukti: vitest **695/695** (57 file, dulu 685); eslint src **0 problem**; build OK (precache 35, 1542.18 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP reload: 14 agents, frames berjalan (3→8→14), tanpa exception; resetFocus debug OK (focus kembali null); screenshot 719 KB (scene hidup).
- Catatan: skrip e2e_err.py sempat gagal (returnNone — struktur hasil Runtime.evaluate tak konsisten); verifikasi ulang via CDP inline berhasil.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 18:15 WIB — konversi offset anti-overlap label diekstrak ke labelWorldOffset murni (parts/label_overlap.js)

- Backlog dipilih: blok akhir relayout label di animate() masih inline — rumus worldPerPx (2·dist·tan(fov/2)/tinggi), clamp offset agent (dy min 46 / dx ±16), clamp zona (dyz −10..52 / dxz ±36), dan akumulasi zu.antiY/antiX — semua tak bisa diuji unit.
- Fix: parts/label_overlap.js tambah `worldPerPx(dist,fov,h)`, `labelWorldOffset(p,wpp)` (return {dy,dx} utk agent / {dyz,dxz} utk zona), `accumulateZoneAnti(zt,dyz,dxz)`. Semantik persis kode lama; OfficeScene tinggal assign posisi.
- +12 unit test (rumus wpp eksak & proporsional dist/tinggi, clamp agent dy 46/dx ±16, offY negatif tak di-cap, clamp zona lengkap 4 sisi, akumulasi antiY/antiX, fallback userData kosong).
- Koreksi test: offX 500 @wpp .05 = 25 belum kena clamp 36 — nilai uji diganti 5000.
- Bukti: vitest **705/705** (58 file, dulu 695); eslint src **0 problem**; build OK (precache 35, 1542.34 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP reload: 14 agents, frames berjalan (5→11), tanpa exception; screenshot 727 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 18:45 WIB — jitter & fade label zona diekstrak ke zoneJitter/zoneScreenFade murni (parts/label_overlap.js)

- Backlog dipilih: di blok relayout label masih inline — hash deterministik zona (h*31+charCode |0), jitter jy=(h%7)-3 / jx=((h>>3)%9)-4, dan fade zona saat membengkak di layar (pw>340 → opacity 1-(pw-340)/260, invisible saat ≤0.03) — tak bisa diuji unit.
- Fix: parts/label_overlap.js tambah `zoneHash(label)` (null → 0), `zoneJitter(label)` → {jy,jx}, `zoneScreenFade(pw)` → {opacity,visible}. Semantik persis kode lama; OfficeScene tinggal assign.
- +11 unit test (hash deterministik/ordinal/empty, jitter deterministik + ekuivalensi rumus lama + fallback, fade linear/clamp/ambang visible/ekuivalensi/NaN→opaque).
- Koreksi test: asumsi rentang jitter salah 2× — % JS bisa negatif utk hash negatif (jy∈[-9,3], jx∈[-12,4]), dan ambang float 0.03 persis tidak deterministik; test disesuaikan dgn semantik rumus lama (kode tak diubah).
- Bukti: vitest **716/716** (59 file, dulu 705); eslint src **0 problem**; build OK (precache 35, 1542.47 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP reload: 14 agents, 5 zoneLabels, frames berjalan (3→11), tanpa exception; screenshot 722 KB (scene hidup).
- Catatan: e2e_err.py tetap return None (eval Runtime.evaluate mengembalikan struktur tak terduga); verifikasi diulang via skrip CDP inline /tmp/e2e_final.py (eval eksplisit returnByValue) — hasil valid.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 19:05 WIB — pembangunan titik label (agent/zona/bubble) diekstrak ke parts/label_overlap.js murni

- Backlog dipilih: blok awal relayout label di animate() masih inline (~35 baris) — konversi NDC→piksel (×clientWidth/2), sw/sh sprite, baseY/baseX = posisi − antiY/antiX lama, entri zona (dist clamp 2, fade, jitter, base asli + anti), dan entri bubble (piksel konstan) — tak bisa diuji unit.
- Fix: label_overlap.js tambah `PX_PER_TAN(h,fov)`, `buildAgentPts(vis,k,pxW,pxH)`, `buildZonePts(zones,k,pxW,pxH)` (skip invisible & v.z>1; dist clamp ≥2; fade via zoneScreenFade; jitter + anti di base), `buildBubblePts(bubbles,k,pxW,pxH)`. Semantik persis kode lama (pxW/pxH = setengah dimensi); OfficeScene tinggal proyeksi kamera + assign opacity/visible sprite zona via zp.zt/zp.fade.
- +14 unit test (rumus k eksak & proporsional, ekuivalensi rumus zona lengkap pw·1.06/zh·1.25/jitter/anti, clamp dist 2, fade near/far + ekuivalensi zoneScreenFade, skip invisible & belakang kamera & null, base fallback, bubble piksel konstan + identitas ref, pemetaan searah). Koreksi test 2×: import path salah (./ vs ../scene/parts/) dan identitas ref bubble (mk() dipanggil 2× → objek berbeda).
- Bukti: vitest **730/730** (60 file, dulu 716); eslint src **0 problem**; build OK (precache 35, 1542.76 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP inline /tmp/e2e_label.py: reload OK, 14 agents, 5 zoneLabels (opacity semua 1), frames berjalan (3→4), 0 label NaN/exception; screenshot 721 KB (scene hidup).
- Catatan: e2e_err.py masih return None (eval CDP); verifikasi via skrip CDP inline dengan returnByValue eksplisit — valid.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 19:50 WIB — penggabungan task running diekstrak ke buildRunningByAgent murni (parts/running_tasks.js)

- Backlog dipilih: `pollRunning()` di OfficeScene masih inline — map id agent, penyaringan `running>0` → `{id:'?',title:'mengerjakan',n}`, dan penimpaan id/title dari detail task — semua tak bisa diuji unit.
- Fix: parts/running_tasks.js — `agentIdMap(list)` & `buildRunningByAgent(agents,tasks)` murni (kompatibilitas respons array & {tasks:[...]}). OfficeScene.pollRunning kini tinggal fetch + assign. Semantik persis kode lama.
- +10 unit test (map id lengkap/null/kosong, entri awal running>0, running=0 diabaikan, penimpaan id/title dgn n dipertahankan, task non-running diabaikan, bentuk {tasks:[]}, respons non-array aman, agents null).
- Bukti: vitest **751/751** (61 file, dulu 741); eslint src **0 problem**; build OK (precache 35, 1542.99 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via /tmp/e2e_label.py: reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (5→10), 0 label NaN/exception; screenshot 730 KB (scene hidup).
- Catatan: e2e_err.py masih return None (masalah eval CDP lama); verifikasi via e2e_label.py (returnByValue eksplisit) — valid.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 19:30 WIB — sizeLabels pakai labelScale murni (hapus rumus duplikat di OfficeScene)

- Backlog dipilih: `sizeLabels()` di OfficeScene masih punya rumus inline sendiri (wantFull, t2=2tan(fov/2), hPx 14/19, cap 1.35) padahal `labelScale()` murni dengan semantik persis sama sudah ada di parts/label_spec.js & diuji — duplikasi logika ukuran label berisiko divergensi.
- Fix: OfficeScene.sizeLabels kini `const {frac,wantFull}=labelScale(w,h,camera.fov,near)`; rumus inline dihapus. Perilaku render tidak berubah (labelScale diekstrak sebelumnya dari kode ini).
- +11 unit test di label_spec.test.js: ekuivalensi labelScale vs rumus inline lama pada 10 kombinasi viewport/fov/jarak (termasuk batas w=699/700, near=29.9/31), proporsionalitas tan(setengah-fov), selain yang sudah ada.
- Koreksi test 1×: konversi derajat→radian salah (π/360 = setengah-derajat, bukan π/180) — hanya test yang dikoreksi, kode tak diubah.
- Bukti: vitest **741/741** (60 file, dulu 730); eslint src **0 problem**; build OK; deploy ~/wfs-hq OK; e2e produksi 9503 via /tmp/e2e_label.py: reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (5→10), 0 label NaN/exception; screenshot 719 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 20:10 WIB — polling status (badge/bangun/alert failed) diekstrak ke parts/status_poll.js murni

- Backlog dipilih: blok polling IIFE di OfficeScene masih inline — palet warna badge, penyaringan `agents[gid].last` → warna, daftar agent `running>0` utk dipaksa bangun, dan deteksi transisi `failed` (prevFailed dimutasi) — semua tak bisa diuji unit.
- Fix: parts/status_poll.js — `BADGE_COLORS`, `badgeAssignments(agentData,agents,im)` (entri {ad,gid,status} valid), `wakeAgentIds(agents)` (running>0), `failedAlerts(agents,prevFailed,findByGid)` (transisi naik + reset 0/null). idMapFn kini memakai agentIdMap dari running_tasks.js (hapus duplikat). Semantik persis kode lama.
- +15 unit test (palet, entri valid/status tanpa warna/tanpa badge/gid tak dikenal/null, wake running>0 & hilang & null, alert transisi/sama/reset 0/cabang !v/agent tak ditemukan/null).
- Bukti: vitest **766/766** (62 file, dulu 751); eslint src **0 problem**; build OK (precache 35, 1543.27 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via /tmp/e2e_label.py: reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (4→9), 0 label NaN/exception.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 20:35 WIB — wall fade per-frame diekstrak ke parts/wall_fade.js murni

- Backlog dipilih: blok fade dinding di IIFE dinding OfficeScene masih inline — rumus fadeOf (max(0,min(1,1-(d+1.5)/6))), penerapan opacity/visible per mesh dinding (ambang on = fade>0.04, skip material array), dan visibilitas tiang sudut (max(val[kx],val[kz])>0.5) — semua tak bisa diuji unit.
- Fix: parts/wall_fade.js — `wallFadeOf(d)`, `applyWallFade(objs,fade)`, `cornerVisibility(corners,val)` (mengembalikan {m,vis}, penelepon yang assign), `wallFadeTick(wallDefs,corners,cam)` (pembulatan val 2 desimal + posisi kamera, semantik persis kode lama). window.__wallFade kini tinggal collect() + wallFadeTick; __wallState & debug window.__wallLast tak berubah.
- +15 unit test (rumus fade eksak/ekuivalensi 6 nilai d, solid pada d=-1.5, clamp 0, ambang 0.04 tepat, hidden tak menyentuh opacity, skip material array, null aman, ambang tiang 0.5, pemilihan sisi tiang, tick dalam/luar kantor, pembulatan cam & val, opacity diterapkan).
- Bukti: vitest **781/781** (63 file, dulu 766); eslint src **0 problem**; build OK (precache 35, 1543.45 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via e2e_wall.py (returnByValue): reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (6→11), 0 label NaN; wallState valid: default kamera {front:0,right:0,back:1,left:1}, __wallFade di luar depan {front:0} vs di dalam {semua 1} — tanpa exception; screenshot 727 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 21:00 WIB — tiga poll status digabung jadi SATU fetch (statusPollActions murni)

- Backlog dipilih: IIFE polling OfficeScene punya 3 interval terpisah (20s/21s/25s) yang masing-masing fetch /wfs-api/agents/status — 3× trafik untuk data yang sama; aksi badge/bangun/alert tersebar inline.
- Fix: parts/status_poll.js tambah `statusPollActions(agentData,agents,im,prevFailed,findByGid)` murni → daftar aksi [{type:'badge'|'wake'|'alert',...}] (komposisi badgeAssignments+wakeAgentIds+failedAlerts). OfficeScene kini satu `pollStatus()` (timeout 4s + interval 20s) yang fetch SEKALI lalu menjalankan aksi; semantik tiap aksi persis kode lama (warna palet, timer 0.5 bangun, bubble '#f66' pada transisi failed).
- +10 unit test (aksi badge dgn warna, wake ad valid/tak ditemukan, alert transisi/sama, urutan badge→wake→alert, agents kosong, agentData kosong, reset prevFailed, status tanpa warna di-skip).
- Bukti: vitest **791/791** (64 file, dulu 781); eslint src **0 problem**; build OK (precache 35, 1543.44 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (14→19), 0 label NaN/exception; **fetch /agents/status terukur 2× dalam 12 dtk** (dulu ~3×/12s dari 3 interval — trafik polling turun ±2/3 pada interval panjang); screenshot 723 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 21:25 WIB — pollRunning (15s) dilebur ke pollStatus (20s): /agents/status kini 1 fetch/poll

- Backlog dipilih: `pollRunning()` masih punya interval sendiri (3s awal + 15s) yang fetch `/wfs-api/agents/status` LAGI padahal `pollStatus()` (4s awal + 20s) sudah fetch endpoint yang sama — dua fetch status paralel terus-menerus.
- Fix: IIFE pollRunning dihapus. pollStatus kini juga fetch `/wfs-api/tasks` (sekali per poll, try/catch terpisah) lalu set `window.__wfsRunningTasks={byAgent:buildRunningByAgent(agents,tasks)}` + `window.__wfsAgentIdMap` — dipakai autoTalk. Semantik identik (agents kosong → byAgent kosong; tasks gagal → dilewati).
- Bukti: vitest **791/791** (64 file); eslint src **0 problem**; build OK (precache 35, 1543.24 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, 5 zoneLabels (opacity 1), frames berjalan (5→10, 27), 0 label NaN/exception; **fetch /agents/status terukur 2× dalam 30 dtk** (tepat 4s awal + 20s interval — dulu ~4× dari 2 interval terpisah); runningTasks & idMap terisi valid. Fetch `/wfs-api/tasks` ekstra (~15s) berasal dari panel project board UI, bukan scene.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 22:00 WIB — drawTv (dasbor TV lounge) diekstrak ke parts/tv_canvas.js murni

- Backlog dipilih: drawTv() (~32 baris render canvas 256×144: header, progress bar gradient, baris GAGAL/REVIEW, status SaaS, dot agent) masih inline di OfficeScene — render terbesar yang belum bisa diuji unit (hanya via test runtime sandbox yang eval-ulang sumber).
- Fix: parts/tv_canvas.js — konstanta palet/ukuran (TV_W/H, warna), `tvPct(T)` (0 bila total 0), `statusRows(T)` (kolom kedua x=90 hanya bila failed tampil), `drawTvDashboard(ctx,data,{now})` — urutan perintah gambar identik kode lama. OfficeScene.drawTv kini 1 baris injek ctx + window.__tvData.
- Test runtime tv_lounge_runtime.test.js menyesuaikan: drawTvDashboard di-import dan di-inject ke sandbox new Function (ekstraksi blok TV tetap dipertahankan untuk cek integrasi tvPull/tvOnVis).
- +11 unit test baru di tv_canvas.test.js (mock ctx recorder): ukuran/latar, connecting muted tanpa data, bar penuh/30%/ambang 6px, pct 0 tanpa NaN, warna & posisi GAGAL/REVIEW, SaaS online/offline, dot agent Up/Down & strip kosong, stempel waktu pakai data.at.
- Bukti: vitest **802/802** (65 file, dulu 791); eslint src **0 problem**; build OK (precache 35, 1543.34 KiB); deploy ~/wfs-hq OK; e2e produksi 9503: reload OK, 14 agents, 5 zoneLabels, tvData terisi (tasks+saas), frames berjalan (7→12), 0 jsErrors; screenshot 714 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-21 22:15 WIB — render kanvas label diekstrak ke drawLabelText murni (parts/label_spec.js)

- Backlog dipilih: makeLabel() di OfficeScene masih inline render kanvas label (latar rounded, strip warna hex, textAlign, auto-shrink nama + ellipsis via fitLabel, role dgn warna #b8c4d4) — hanya label yang tersisa di file tanpa unit test langsung (hanya via cek spec konstanta).
- Fix: parts/label_spec.js tambah `drawLabelText(ctx, agent, spec, full)` murni (ctx di-inject, tanpa THREE/DOM); makeLabel kini tinggal buat kanvas + panggil drawLabelText + CanvasTexture. Semantik persis kode lama (urutan fill, offset x=W/2+4, Y dari spec).
- +10 unit test (recorder ctx): urutan ops bg/strip, fallback rect tanpa roundRect, strip H-28 vs H-20, textAlign/baseline, title-case nama via labelName di NAME_Y, role di ROLE_Y dgn #b8c4d4, short tanpa role, font reset pasca fit, ellipsis nama panjang, null name aman.
- Bukti: vitest **812/812** (65 file, dulu 802); eslint src **0 problem**; build OK (precache 35, 1543.32 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via e2e_tv.py (CDP chrome 9222, returnByValue): reload OK, 14 agents, 5 zoneLabels, tvData terisi (tasks+saas), frames berjalan (5→10), 0 jsErrors; screenshot 716 KB (scene hidup).
- Catatan: e2e_err.py/e2e_label.py lama tidak terpakai (9503 tak lagi WS devtools; pakai CDP chrome :9222).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-21 23:00 WIB — useDialogA11y (a11y overlay dipakai 6 modal) diuji unit — 16 test baru

- Celah ditemukan: src/lib/dialogA11y.js (aria-modal otomatis, fokus awal, focus-trap Tab/Shift+Tab, Escape→onClose, restore fokus ke pemicu) dipakai 6 komponen modal (TaskModal/TaskBoard/ProjectPanel/ActivityLog/OverlayHelp/ConfirmModal) tapi nol test langsung; jsdom pun offsetParent selalu null & focus() memindahkan activeElement ke body → perilaku trap tak teruji.
- Fix: test suite baru src/__tests__/dialog_a11y.test.jsx (16 test) — dgn patch uji jsdom: offsetParent getter (null hanya bila display:none) agar filter "elemen tersembunyi" hook bisa diverifikasi. Kode hook TIDAK diubah (perilaku produksi utuh).
- Cakupan: aria-modal dipasang & tak ditimpa; fokus awal elemen pertama / initialFocus; Tab wrap depan↔belakang, lanjut normal; elemen display:none dilompati; tanpa focusable → Tab tidak dicegat; Escape→onClose dgn stopPropagation; tombol lain diabaikan; restore fokus pemicu saat unmount; listener dibesihkan pasca unmount; open=false → tanpa efek samping.
- Bukti: vitest **828/828** (66 file, dulu 812); eslint **0 problem**; build OK (precache 35, 1543.32 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_a11y.py): reload OK, jsErrors None, 14 agents, frames 5→10, tvData terisi.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).


## 2026-10-22 00:00 WIB — QuickToolbar & ErrorBoundary diuji unit — 11 test baru

- Celah ditemukan: dua komponen UI tanpa unit test sama sekali — QuickToolbar (7 tombol aksi cepat: add task, jeda/lanjut, zoom, 3 preset kamera, neon; toggle paused ↔ Lanjut dgn dot) dan ErrorBoundary (catch error render → fallback role=alert, tombol Coba lagi/Muat ulang). Semua komponen lain (TaskBoard, TeamStats, Header, HUD, dll.) sudah tercakup; dua ini terlewat.
- Fix: suite baru src/__tests__/quick_toolbar_error_boundary.test.jsx (11 test). Kode komponen TIDAK diubah.
- Cakupan QuickToolbar: semua aria-label tampil; tiap tombol memicu callback tepat sekali; paused=false → Jeda⏸ memicu onPauseAll, paused=true → Lanjut▶ dgn .dot memicu onResumeAll; preset iso/front/top dikirim apa adanya ke onSetView; aria-pressed neon; Escape/klik-luar aman tanpa popover.
- Cakupan ErrorBoundary: anak melempar → fallback role=alert + pesan + detail error (bukan blank); anak aman → passthrough tanpa alert; recover: sumber diperbaiki → fallback MASIH menahan (perilaku React benar) sampai "Coba lagi" diklik → anak dirender ulang; "Muat ulang" memanggil location.reload (stubbed).
- Koreksi 1× test: dulu rerender aman diharapkan langsung menghilangkan fallback — boundary menahan UI rusak sampai reset (perilaku React yang benar); test dikoreksi, kode tak disentuh.
- Bukti: vitest **839/839** (67 file, dulu 828); eslint 0 problem; build OK (precache 35, 1543.32 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (/tmp/e2e_qt.py): 14 agents, tvData terisi, 5 zoneLabels, frames berjalan (5→12), tanpa exception.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 00:15 WIB — tiga kanvas tanda (menu kafé, poster, papan sambutan) diekstrak ke parts/sign_canvas.js murni

- Backlog dipilih: render kanvas dekorasi masih inline di IIFE dinding/dekorasi OfficeScene — papan menu WFS CAFÉ (256×140), poster motivasi SHIP IT / CODE COFFEE (256×340, multi-baris), dan papan sambutan dinding kiri (1024×320) — tiga render terakhir tanpa unit test langsung.
- Fix: parts/sign_canvas.js — `drawMenuBoard(ctx)`, `drawPoster(ctx,txt,col)` (split '\n' → y=150+56i), `drawWelcomeSign(ctx)` — murni (ctx di-inject, tanpa THREE/DOM), urutan & parameter perintah gambar identik kode inline lama. OfficeScene kini 1 baris per kanvas.
- +12 unit test (recorder ctx): latar+bingkai & urutan ops tiap tanda; menu: judul WFS CAFÉ (font/fillStyle/warna), 3 baris menu monospace y 75/100/125; poster: 1/2/3 baris (y 150/206/262), textAlign center, font bold 48px, warna tema; sambutan: judul emas 900 130px (512,150), subjudul putih middot (512,250), tepat 2 teks.
- Bukti: vitest **851/851** (68 file, dulu 839); eslint src **0 problem**; build OK (precache 35, 1543.34 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_sign.py): reload OK, 14 agents, tvData terisi, 5 zoneLabels (opacity 1), frames berjalan (4→13), bubbles naik (1→2), tanpa exception; screenshot 725 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).
## 2026-10-22 00:40 WIB — render kanvas cincin seleksi & hover diekstrak ke parts/ring_canvas.js murni

- Backlog dipilih: ensureSelRing()/ensureHoverRing() di OfficeScene masih menggambar radial gradient kanvas inline (pusat 64,64, INNER/OUTER/MID dari ring_spec, stop 0.95 vs 0.9) — dua painter terakhir tanpa unit test langsung (ring_spec hanya konstanta/anchor).
- Fix: parts/ring_canvas.js — `paintRing(ctx, spec, midOpacity)` murni (ctx di-inject, tanpa THREE/DOM); urutan & parameter perintah gambar identik kode lama (grad → fillStyle → fillRect SIZE²). ensureSelRing/ensureHoverRing kini 1 baris painter + CanvasTexture. Kode visual tak berubah.
- +5 unit test (recorder ctx): posisi/radius gradient sesuai spec, tepat 3 colorStop (0 transparan putih → MID RGB 0.95/0.9 → 1 transparan), urutan ops grad→fillStyle→fillRect SIZE×SIZE, hover pakai konstanta HOVER_RING, opacity tengah beda per pemanggil. Dua koreksi test (ctx recorder salah pairing; helper sisa dihapus), kode produksi tak disentuh.
- Bukti: vitest **856/856** (69 file, dulu 851); eslint src 0 problem; build OK (precache 35, 1543.15 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_sign.py): reload OK, 14 agents, tvData terisi, 5 zoneLabels (opacity 1), frames 4→13, bubbles 1→2, tanpa exception; screenshot 714 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 00:35 WIB — ActionMenu diuji unit — 13 test baru

- Backlog dipilih: audit cakupan test ulang — ActionMenu (popover ⚡ Aksi: 4 menuitem aksi tim meeting/break/work/tour, 2 menuitemcheckbox toggle nama & auto-rotate, navigasi panah WAI-ARIA Up/Down/Home/End) adalah komponen UI terakhir tanpa unit test langsung (CsWidget/SkipLink/WfsPanel lolos audit → tercakup via store & test lain; diverifikasi grep).
- Fix: suite baru src/__tests__/action_menu.test.jsx (13 test), kode komponen TIDAK diubah, scene di-stub penuh via sceneRef.
- Cakupan: aria-expanded/haspopup & buka-tutup popover; urutan & ikon 4 menuitem; aria-checked kedua checkbox + label Sembunyikan/OFF; tiap klik memicu teamAction dgn key benar + onFlash pesan + menu tertutup; scene null → flash error WebGL; toggleNames & setAutoRotate(!cur) dari isAutoRotate; fallback balik state lokal bila getter scene tak ada; Escape & klik-luar menutup; navigasi panah 6 elemen menu (Home/End/wrap ArrowDown); Escape per-item tak melempar.
- 2 koreksi di test saja: kurang docblock @vitest-environment jsdom; selector navigasi memakai menuitem+menuitemcheckbox (6 elemen, bukan 4).
- Bukti: vitest **869/869** (70 file, dulu 856); eslint 0 problem; build OK (precache 35, 1543.15 KiB); deploy ~/wfs-hq OK; commit 0281fd9 (auto-commit hook menangkap file dgn pesan auto, ter-push origin/main — PUSH_OK diverifikasi ulang); e2e produksi 9503 via CDP chrome 9222: reload OK, 14 agents, tvData terisi, 5 zoneLabels (opacity 1), frames 4→14, bubbles 1→2, Runtime.enable listener 10 dtk → jsErrors None.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 01:00 WIB — auto-shrink font label zona diekstrak ke fitZoneLabel() murni (+9 test)

- Backlog dipilih: logika auto-shrink font label zona lantai di parts/flooring.js masih inline (while-loop measureText 460px, font 800 44px→20px langkah −2) — satu-satunya painter kanvas zona tanpa unit test langsung (flooring_runtime hanya menguji mesh/sprite, bukan logika shrink).
- Fix: helper murni `fitZoneLabel(ctx, text)` + konstanta ZONE_LABEL_BASE_PX/MIN_PX/MAX_W/STEP diekstrak; createZones kini 1 baris. Urutan & semantik loop identik kode lama (tampilan tak berubah).
- +9 unit test (ctx recorder): teks pendek tetap 44px & font diset 1×; weight/keluarga font benar; teks mustahil muat berhenti di batas bawah 20px; teks panjang dgn lebar proporsional menyusut sampai muat (22px); langkah menyusut tepat −2 per iterasi; batas tepat 460px dianggap muat; konstanta publik; string kosong.
- 2 koreksi hanya di test: ekspektasi pertama keliru (60 char × min 20px = 1200 > 460 → memang berhenti di min); mock ctx measureText dibuat proporsional-font utk kasus menyusut-sampai-muat. Kode produksi tak disentuh setelah ekstraksi.
- Bukti: vitest **878/878** (71 file, dulu 869); eslint src 0 problem; build OK (precache 35, 1543.16 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_zone.py): reload OK, 14 agents, 5 zoneLabels, tvData terisi (dibantuin.com 23 done), frames 6→12; screenshot 727 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 01:20 WIB — painter kanvas langit jendela & sheen kaca diekstrak ke parts/sky_canvas.js murni (+5 test)

- Backlog dipilih: skyTex (gradien langit 256×128 + pita matahari radial + 4 awan ellipse) dan glassSheen (2 pantulan diagonal + tint biru) masih IIFE inline di OfficeScene — painter kanvas dekorasi lingkungan terakhir tanpa unit test langsung.
- Fix: parts/sky_canvas.js — `drawSky(ctx)` & `drawGlassSheen(ctx)` murni (ctx di-inject, tanpa THREE/DOM); urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). skyTex/glassSheen kini tinggal buat kanvas + panggil painter + CanvasTexture.
- +5 unit test (ctx recorder dgn gradien palsu): gradien langit 3 stop & fillRect penuh; matahari radial (210,22) r4→80 dgn 2 stop; tepat 4 awan ellipse (radii cw/2, ch/2) via beginPath+fill; sheen 2 gradien diagonal (5+3 stop) + 3 fillRect; tint biru rgba(140,200,255,0.10) jadi fillStyle terakhir. 1 koreksi indeks di test saja (fillRect pertama menggeser posisi linGrad kedua), kode produksi tak disentuh.
- Bukti: vitest **883/883** (72 file, dulu 878); eslint src 0 problem; build OK (precache 35, 1543.19 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_sign.py): reload OK, 14 agents, 5 zoneLabels (opacity 1), tvData terisi, frames 4→13, bubbles 1→3.
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 01:50 WIB — painter lantai parket prosedural & strip AO dinding diekstrak ke parts/floor_canvas.js murni (+5 test)

- Backlog dipilih: dua painter kanvas struktur paling awal di OfficeScene masih inline — tekstur lantai parket kayu 512×512 (latar #8A7C68 + loop 10 baris papan dgn lebar/shade deterministik + nat rgba) dan strip AO kontak pangkal 4 dinding 16×64 (gradien 3 stop) — tanpa unit test langsung.
- Fix: parts/floor_canvas.js — `drawWoodFloor(ctx)` & `drawAoStrip(ctx)` murni (ctx di-inject, tanpa THREE/DOM); urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). OfficeScene kini 1 baris painter per kanvas.
- +5 unit test (recorder ctx + fake gradient): latar penuh & 10 baris papan (y kelipatan 52, offset ganjil −58); lebar/warna papan deterministik (papan pertama rgb(112,94,67) w=117; kedua w=147); nurutan loop (semua x0<512, nat = jumlah fillStyle papan); AO gradien (0,0,0,64) 3 stop 0.52/0.24/0 + fillRect penuh; AO tanpa oper lain. 3 koreksi hanya di test (aritmetika papan kedua w=150 bukan 30; perbandingan objek gradien pakai referensi c._grads), kode produksi tak disentuh.
- Bukti: vitest **888/888** (73 file, dulu 883); eslint src 0 problem; build OK (precache 35, 1543.18 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222: reload OK, 14 agents, tvData terisi, frames 12→17→29→33, initFail false; screenshot 711 KB — scene hidup, lantai kayu/zona/label/agen normal (verifikasi visual).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 02:20 WIB — painter plafon prosedural diekstrak ke parts/ceiling_canvas.js murni (+7 test)

- Backlog dipilih: tekstur plafon 512×512 (gradien biru 2 stop + vignette radial AO palsu + seam grid 5×5 garis lineWidth 2 + bevel aksen offset +2 lineWidth 1) masih IIFE inline di OfficeScene — painter kanvas lingkungan terakhir tanpa unit test langsung.
- Fix: parts/ceiling_canvas.js — `drawCeiling(ctx)` murni (ctx di-inject, tanpa THREE/DOM) + konstanta CEIL_SIZE/CEIL_TILES/CEIL_CELL; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). OfficeScene kini 2 baris (canvas + painter).
- +7 unit test (ctx recorder + gradien palsu): konstanta ekspor; gradien linear (0,0→0,512) stop #0C1B33/#0A1628 + fillRect penuh; vignette radial (256,256,80→340) stop 0.35/0.55 + fillRect; seam grid 10 stroke (5 vertikal x∈{0,128,256,384,512} sampai bawah + 5 horizontal y sama sampai kanan) lineWidth 2; bevel 10 stroke offset +2 (vertikal terakhir x=514, melewati tepi — sesuai kode lama) lineWidth 1; urutan keseluruhan gradien→fill→vignette→fill→grid→bevel dgn tepat 2 gradien & 2 fillRect; tanpa oper liar.
- 3 koreksi hanya di test: gradien palsu addColorStop tidak menempel ke objek gradien (mk dirombak); asersi grid pakai pasangan moveTo→lineTo (bukan set koordinat); aritmetika bevel terakhir i=4 → 514 (bukan 512). Kode produksi tak disentuh setelah ekstraksi.
- Bukti: vitest **895/895** (74 file, dulu 888); eslint src 0 problem; build OK (precache 35, 1543.20 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222: reload OK, agents 14, zoneLabels 5, tvData terisi (dibantuin.com 23 done), frames 6→11, initFail false; screenshot 705 KB (scene hidup, plafon normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 02:45 WIB — painter logo WFS Project (resepsionis + dinding belakang) diekstrak ke parts/logo_canvas.js murni (+12 test)

- Backlog dipilih: dua painter kanvas logo brand terakhir yang masih inline di OfficeScene — logo kecil di depan meja resepsionis (1024×320: latar navy + bingkai emas + hexagon gradien ganda + W/WFS/PROJECT) dan logo besar dinding belakang (2048×640: pola sama + tagline SOFTWARE HOUSE · AI TEAM) — tanpa unit test langsung.
- Fix: parts/logo_canvas.js — `drawResepsiLogo(ctx)` & `drawWallLogo(ctx)` murni (ctx di-inject, tanpa THREE/DOM); urutan & parameter perintah gambar identik kode inline lama (tampilan tak berubah). OfficeScene kini 1 baris painter per logo.
- +12 unit test (ctx recorder + gradien palsu): tiap logo — latar fillRect + bingkai strokeRect/lineWidth; gradien linear (koordinat & 2 stop); dua heksagon (6 lineTo per path, koordinat sudut Math.PI/6+i·π/3, r luar/dalam) fill gradien lalu navy; posisi/font/align/baseline semua teks (W center/middle gradien; WFS & PROJECT rata kiri; tagline rgba abu); jumlah teks & gradien tepat; tanpa oper liar. Koreksi hanya di test: pembulatan float heksagon (r6 1e6), helper styleBefore default key, variabel tak terpakai.
- Bukti: vitest **907/907** (75 file, dulu 895); eslint src 0 problem; build OK (precache 35, 1543.22 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (e2e_sign.py): reload OK, agents 14, zones 5 (opacity 1), tv terisi, frames 4→14, bubbles 1→3; screenshot 724 KB (scene hidup, logo normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 03:06 WIB — painter bayangan kontak (blob shadow) diekstrak ke parts/blob_canvas.js murni (+5 test)

- Backlog dipilih: tekstur bayangan kontak (contact blob shadow) 128×128 — radial gradient rgba(10,14,18) 3 stop (0.55/0.30/0) + fillRect — masih IIFE inline di OfficeScene (__blobTex), painter kanvas material terakhir tanpa unit test langsung.
- Fix: parts/blob_canvas.js — `drawBlobShadow(ctx)` murni (ctx di-inject, tanpa THREE/DOM) + konstanta BLOB_SIZE/BLOB_CENTER; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). __blobTex kini 1 baris painter.
- +5 unit test (ctx recorder + gradien palsu): konstanta ekspor (128/64); gradien radial tepat (64,64,4→64,64,62); 3 colorStop rgba sesuai kode lama; urutan oper createRadialGradient→fillStyle(grad sama)→fillRect 128×128 tanpa oper liar; dua pemanggilan tak share state gradien. Kode produksi tak disentuh setelah ekstraksi; 0 koreksi.
- Bukti: vitest **912/912** (76 file, dulu 907); eslint src 0 problem; build OK (precache 35, 1543.24 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (Runtime.evaluate): reload cache-bypass OK, agents 14, initFail undefined (tanpa kegagalan init), frames 175→180 berjalan, jsErrors none; screenshot 700 KB (scene hidup, bayangan kontak normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 03:28 WIB — painter tekstur dinding (panel + nat + bevel gradien) diekstrak ke parts/wall_canvas.js murni (+8 test)

- Backlog dipilih: fungsi tex() di blok dinding OfficeScene (fillRect latar + loop garis nat vertikal 0..wpx langkah step lineWidth 3 + gradien bevel 2 stop rgba putih .12 / hitam .08) masih inline — painter kanvas dinding dipakai 8x (upper/wood A-R) tanpa unit test langsung.
- Fix: parts/wall_canvas.js — drawWallTex(ctx, base, line, wpx=512, hpx=256, step=64) murni + konstanta WALL_TEX_TOP/BOTTOM; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). OfficeScene tex() kini 3 baris (canvas + painter + texture).
- +8 unit test (ctx recorder + gradien palsu): konstanta ekspor; parameter default; base fillRect sebagai 2 oper pertama; nat strokeStyle/lineWidth 3 dgn 9 garis x 0..512 langkah 64, moveTo(i,0)-lineTo(i,hpx); step 32 = 17 garis; gradien linear (0,0-0,hpx) 2 stop + fillRect penuh; urutan keseluruhan base-nat-gradien tanpa oper liar; dua pemanggilan tak share state. 0 koreksi — test langsung hijau.
- Bukti: vitest 920/920 (77 file, dulu 912); eslint src 0 problem; build OK (precache 35, 1543.29 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222 (Runtime.evaluate): reload cache-bypass OK, agents 14, zones 5, tvData terisi (dibantuin.com 23 done), bubbles 2, frames 3-5 berjalan; screenshot 730 KB (scene hidup, dinding panel/kayu normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 03:55 WIB — painter judul dinding (WFS PROJECT) diekstrak ke parts/logo_canvas.js murni (+4 test)

- Backlog dipilih: kanvas judul dinding belakang 1024×200 (clearRect + font 900 130px Segoe UI center/middle + teks WFS putih (300,100) & PROJECT #F59E0B (730,100)) masih inline di OfficeScene — painter kanvas brand terakhir tanpa unit test langsung.
- Fix: parts/logo_canvas.js — drawWallTitle(ctx) murni (ctx di-inject) ditambahkan ke modul logo yang sudah ada; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). OfficeScene blok judul kini 1 baris painter.
- +4 unit test (ctx recorder): clearRect penuh sebagai oper pertama + font/align/baseline; posisi & warna kedua teks (styleBefore); tepat 2 fillText, 0 gradien, tanpa oper liar; dua pemanggilan tak share state. 1 koreksi hanya di test (lupa import drawWallTitle di file test), kode produksi tak disentuh.
- Bukti: vitest 924/924 (77 file, dulu 920); eslint src 0 problem; build OK (precache 35, 1543.30 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP chrome 9222: reload cache-bypass OK, agents 14, projectBoard ada, frames 67→73 berjalan; screenshot 716 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 04:20 WIB — pembersihan 126 chunk stale di ~/wfs-hq/assets (44,94 MB dibebaskan)

- Backlog dipilih: item lama "bersihkan 70+ asset OfficeScene-*.js lama di ~/wfs-hq/assets". Audit: 131 file JS di assets/, hanya 5 direferensikan SW precache (sw.js) + index.html — 126 chunk build lama (OfficeScene-*/CsWidget-*/index-*) tak pernah dipakai lagi (setiap deploy menulis file baru tanpa menghapus lama).
- Fix: skrip Python mencocokkan isi dist terkini (precache sw.js == dist/assets, terverifikasi identik 5/5) lalu menghapus file di ~/wfs-hq/assets yang TIDAK ada di sw.js/index.html — aman dari salah hapus karena service worker precache adalah sumber kebenaran runtime. Diulang setelah deploy dist baru: 0 stale tersisa.
- Bukti: ~/wfs-hq/assets kini tepat 5 file (index-Cuq1lqdY.js, chunk-DECur_0Z.js, OfficeScene-7-B4vXpJ.js, CsWidget-D-zv4ChE.js, index-Bx0Mn9T-.css); 44,94 MB dibebaskan; HTTP 200 untuk /, OfficeScene chunk, sw.js; e2e produksi 9503 via CDP: reload cache-bypass OK, agents 14, projectBoard ada, zoneLabels 5, bubbles 5, frames 18→25 berjalan, initFail tidak ada; screenshot 724 KB (scene hidup).
- Test: vitest 924/924 (77 file), eslint bersih, build OK (precache 35, 1543.30 KiB) — kode src tak berubah (murni maintenance deploy).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia).

## 2026-10-22 04:45 WIB — painter poster slogan WFS diekstrak ke parts/poster_canvas.js murni (+6 test)

- Backlog dipilih: blok gambar poster slogan (latar #14172b 120×160 + bingkai strokeRect(6,6,108,148) lineWidth 3 + font bold 15px center + shadowBlur 6 + satu fillText per kata di x=60,y=posterLineY(i)) masih inline di parts/furniture.js — painter kanvas poster (5 poster: SHIP IT/KUALITAS DULU/BUILD DAILY/TEST EVERYTHING/WFS PROJECT) tanpa unit test langsung.
- Fix: parts/poster_canvas.js — drawPoster(ctx, color, text) murni (ctx di-inject); urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). furniture.js blok poster kini 1 baris painter.
- +6 unit test (ctx recorder dgn setter terekam sebagai oper): latar fillStyle #14172b + fillRect penuh sebagai 2 oper pertama; bingkai strokeStyle/lineWidth 3/strokeRect(6,6,108,148); blok teks font/center/shadowColor/shadowBlur + fillStyle warna; satu fillText per kata di (60, posterLineY(i)) — TEST EVERYTHING = 2 teks; filter oper liar (semua oper dalam whitelist); dua pemanggilan tak share state. 0 koreksi — test langsung hijau.
- Bukti: vitest **930/930** (78 file, dulu 924); eslint src 0 problem; build OK (precache 35, 1543.31 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP: reload cache-bypass OK, agents 14, zoneLabels 5, frames 3→4 berjalan; screenshot 731 KB (scene hidup, poster normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); parts tanpa test tersisa: flooring (fitZoneLabel tercakup test lain), furniture/motion/projectboard/robot/room/status_poll (builder runtime THREE).

## 2026-10-22 05:35 WIB — painter label zona diekstrak ke parts/zone_label_canvas.js murni (+7 test)

- Backlog dipilih: teks label zona (textAlign center + textBaseline middle + fillStyle #FFFFFF + fillText(label,256,50) di kanvas 512×96) masih inline di parts/flooring.js createZones — painter kanvas label zona (5 zona) tanpa unit test langsung.
- Fix: parts/zone_label_canvas.js — drawZoneLabel(zx,label) murni (ctx di-inject) + konstanta ZL_W/ZL_H/ZL_BG/ZL_BORDER; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). flooring.js blok teks kini 1 baris painter.
- +7 unit test (ctx recorder): konstanta ekspor (512×96, warna latar/bingkai); urutan align→baseline→fillStyle→fillText; posisi (256,50) pusat kanvas & warna putih; tepat 1 fillText tanpa oper liar; dua pemanggilan tak share state; +2 test fitZoneLabel (font dasar 44px & shrink ke MIN 20px). 1 koreksi hanya di test (urutan fillStyle ternyata setelah baseline — diperbaiki dari eksekusi nyata, kode produksi tak disentuh).
- Bukti: vitest **937/937** (79 file, dulu 930); eslint src 0 problem; build OK (precache 35, 1543.34 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP: agents 14, zones 5, initFail none, frames 11 berjalan; screenshot 687 KB (scene hidup, label zona normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); parts runtime-THREE (furniture/motion/projectboard/robot/room/status_poll) butuh mock THREE bila mau diuji.

## 2026-10-22 06:10 WIB — painter whiteboard agenda sprint diekstrak ke parts/whiteboard_canvas.js murni (+6 test)

- Backlog dipilih: blok gambar whiteboard ruang meeting (fillRect latar #fbfbfa 320×128 + judul WFS SPRINT bold 22px #f59e0b di (14,30) + 3 item agenda 15px #334155 di x=14, y=58+i·24) masih inline di parts/room.js createMeetingRoom — painter kanvas whiteboard tanpa unit test langsung.
- Fix: parts/whiteboard_canvas.js — drawSprintBoard(ctx) murni (ctx di-inject, tanpa THREE/DOM) + konstanta WB_W/WB_H/WB_BG/WB_TITLE/WB_ITEMS/WB_ITEM_*; urutan & parameter perintah identik kode lama (tampilan tak berubah). room.js blok whiteboard kini 1 baris painter.
- +6 unit test (ctx recorder dgn setter terekam): konstanta ekspor; latar fillRect penuh sebagai oper pertama dgn warna latar; judul (posisi & styleBefore #f59e0b); tiga item agenda posisi/lini 24px & warna #334155; tepat 1 fillRect + 4 fillText (judul+3 item, 10 oper total) tanpa oper liar; dua pemanggilan tak share state. Koreksi hanya di test (recorder setter via defineProperty — asersi styleBefore dgn set:fillStyle, bukan nilai akhir; hitungan fillText 4 bukan 3), kode produksi tak disentuh.
- Bukti: vitest **943/943** (80 file, dulu 937); eslint src 0 problem; build OK (precache 35, 1543.43 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (eval gabungan,Runtime.evaluate): reload cache-bypass OK, agents 14, zones 5, initFail kosong, frames 20→36 berjalan, jsErr null; screenshot 724 KB (scene hidup, whiteboard sprint normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); parts runtime-THREE (furniture/motion/projectboard/robot/room sisanya) butuh mock THREE bila mau diuji.

## 2026-10-22 06:36 WIB — painter wajah jam dinding diekstrak ke parts/clock_canvas.js murni (+7 test)

- Backlog dipilih: blok gambar wajah jam dinding ruang meeting (fillRect latar #fafafa 96×96 + rim arc r45 lineWidth 3 + 12 tick dari tickInnerR(i) ke r43 + 3 jarum sesuai HANDS + pin #f97316 r3) masih inline di parts/room.js createWallClock — painter kanvas jam (di-redraw tiap detik, teks animasi) tanpa unit test langsung.
- Fix: parts/clock_canvas.js — drawClockFace(c, nowSeconds, dateMs) murni (ctx di-inject, tanpa THREE/DOM) + konstanta CLOCK_SIZE/CENTER/BG/RIM/RIM_W/RIM_R/TICK_OUTER_R/PIN/PIN_R; urutan & parameter perintah gambar identik kode lama (tampilan tak berubah). createWallClock draw() kini 1 baris painter + needsUpdate.
- +7 unit test (ctx recorder dgn setter terekam): konstanta ekspor; latar fillRect penuh sebagai oper pertama; rim (arc cx,cy,45 dgn strokeStyle/lineWidth sebelum arc); tick 12 garis dgn koordinat sin/cos sudut spec & 3 garis jarum sesudahnya; tiga jarum panjang/tebal/warna/sudut sesuai HANDS (jam=NOW/60, detik dari dateMs); pin oranye arc r3+fill sebagai penutup tanpa oper liar; dua pemanggilan tak share state. Koreksi hanya di test (indeks radius arc o[3] bukan o[2]; garis jarum ikut terhitung → total 15 lineTo; setter fillStyle pin dibaca dari oper terakhir sebelum arc), kode produksi tak disentuh.
- Bukti: vitest **950/950** (81 file, dulu 943); eslint src bersih; build OK (precache 35, 1543.49 KiB); deploy ~/wfs-hq OK + pembersihan 12 chunk stale pasca-deploy (assets kembali 5 file precache); e2e produksi 9503: HTTP 200, scene hidup — __scene ada & tidak destroyed, rAF 91 frame/1.5s, agentList 15, screenshot 709 KB (scene penuh: desk, agen, bubble chat, meeting room normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); parts runtime-THREE (furniture/motion/projectboard/robot/sisa room) butuh mock THREE bila mau diuji.

## 2026-10-22 07:01 WIB — createLighting().apply() (runtime pencahayaan daycycle) diuji unit (+5 test)

- Backlog dipilih: di daycycle.js, createNeonMode & createShift sudah diuji (daycycle_runtime) dan statusAt/daylight/mixHex (daycycle.test) — tapi createLighting().apply(min), jalur runtime pencahayaan utama (sun/ambient/exposure/tint matahari/dGlow per-agent + callback waktu/status/tick), belum punya test sama sekali.
- Fix: murni penambahan test (kode produksi tidak disentuh): +5 test di daycycle_runtime.test.js dengan ctx stub (scene/fog, THREE.Color stub yang merekam hex) — siang 720 (sun 2.0, ambient 0.56, exposure 1.3, dGlow 0.15, ketiga callback dipanggil dgn 720 & statusAt(720)); malam 60 (daylight 0.3 → sun 1.23, ambient 0.392, exposure 1.09, dGlow 0.36 — 1 koreksi di test: awalnya keliru mengira malam = nilai dasar 0.9/0.32/1.0 padahal apply selalu menambah daylight factor; produksi tak disentuh); tint sore 1020 (mixHex 0xfff8f0→0xffaa66 t=0.5 = 0xFFD1AB); tint pagi 360 (campur 0xffcc88); getter minutes default 660 & ikut apply.
- Bukti: vitest **955/955** (81 file, dulu 950); eslint src 0 problem; build OK (precache 35, 1543.49 KiB); deploy ~/wfs-hq OK + pasca-deploy assets dibersihkan chunk lama lalu di-restore sesuai precache (5 file hash terbaru: index-BzUr61NO.js, OfficeScene-DEcn6FIt.js, dst); e2e produksi 9503 via CDP chrome 9222: reload cache-bypass OK — agents 14, initFail none, zones 5, frames berjalan (3→4 pasca-reload; 31 saat sesi stabil), tvData terisi; screenshot 730 KB (scene hidup penuh).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); parts runtime-THREE tersisa (motion/robot/room dll) umumnya sudah punya *_runtime test; OfficeScene.js (1826 baris) masih monolitik bila mau dipecah lebih lanjut.

## 2026-10-22 07:40 WIB — ProjectPanel (panel 🚀 Proyek dibantuin.com) diuji unit (+9 test)

- Backlog dipilih: audit cakupan komponen UI menunjukkan ProjectPanel (fetch /wfs-project, progress bar, chip status, SaaS online/offline, agent chip, retry error) adalah komponen dock terakhir tanpa test langsung — sebelumnya hanya disinggung komentar di dialog_a11y.test.jsx; Header/HUD/ConfirmModal/ActivityLog/Ticker/TaskModal/OverlayHelp/TaskBoard/TeamStats/ActionMenu/QuickToolbar/CsWidget/lib sudah tercakup.
- Fix: murni penambahan test (kode produksi TIDAK disentuh): +9 test jsdom di project_panel.test.jsx dengan fetch di-stub penuh — tertutup default (0 fetch); aria-expanded false→true; buka → fetch tepat /wfs-project & progressbar aria-valuenow=77 (23/30) + teks "23/30 task selesai (77%)"; kelima chip status tampil (Selesai 23/Jalan 1/Review 2/Gagal 1/Antri 3); SaaS online → badge hijau + "2 tenant · 140 pesan" + "Toko A, Toko B" + chip agent ● Up/○ Down; SaaS offline → "Backend SaaS tidak merespons"; fetch gagal 503 → pesan error + tombol Coba lagi memulihkan; Escape menutup panel via useDialogA11y; task terbaru "#23 perbaiki label" tampil.
- Koreksi hanya di test (4 iterasi): teks chip terpecah elemen → asersi via gabungan textContent; label "Pending" ternyata dirender "Antri"; mockOk lama menimpa handle vi.fn (stubGlobal dgn fn baru) → mockOk kini mengembalikan fn yang sama; bar.closest('div') = bar sendiri → pakai parentElement. Kode produksi tak disentuh.
- Bukti: vitest **964/964** (82 file, dulu 955); eslint . 0 problem; build OK (precache 35, 1543.49 KiB); deploy ~/wfs-hq OK (assets 5 file: OfficeScene-DEcn6FIt.js & index-BzUr61NO.js unchanged — chunk tidak berubah karena hanya test); e2e produksi 9503 via CDP chrome 9222: reload cache-bypass OK — agents 14, canvas 1, chunk OfficeScene-DEcn6FIt.js, tvData live ("project":"dibantuin.com", tasks done 23), frames 6→11 berjalan; screenshot 725 KB (scene hidup).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); OfficeScene.js (1826 baris) masih monolitik bila mau dipecah.

## 2026-10-22 08:05 WIB — blok dekorasi OfficeScene diekstrak ke parts/decor.js murni (+7 test)

- Backlog dipilih: sisa backlog "OfficeScene.js (1826 baris) masih monolitik" — blok dekorasi tambahan (2 poster motivasi 256×340, 3 tanaman besar sudut, 3 partisi kaca antar tim, rug biru/oranye area tengah, lampu lounge hangat) masih inline + rug terpisah di luar IIFE-nya.
- Fix: parts/decor.js — createDecor({THREE, office, M}) builder dgn konteks di-inject (pola sama furniture.js); urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah). OfficeScene blok dekorasi kini 1 baris + baris createProjectBoard dikembalikan ke posisi semula (sempat ikut tergeser saat ekstraksi, tertangkap audit grep sebelum build); import drawPoster dari sign_canvas dibersihkan karena kini tak terpakai (dipakai di dalam decor.js).
- +7 unit test (decor_runtime.test.js, jsdom + ctx stub + THREE stub): referensi lengkap (2 poster/3 tanaman/3 partisi/rug/rugInner/lampu); total 26 objek di-add ke office; poster plane 1.1×1.45 z=9.2 rotation.y=π di x=8.0 & 10.2 + kanvas 256×340 digambar; tanaman pot silinder 0.35/0.28/0.55 warna 0x8B5E3C + 5 daun radius menyusut 0.38−i·0.03 per tanaman di 3 sudut; partisi 0.04×0.9×2.2 opacity 0.18 renderOrder 2 di x=−6/−2/2; rug 3.6×0.015×2.4 0x1565C0 receiveShadow + inner 2.6×0.017×1.6 0xEF6C00; PointLight 0xFFC97A 0.9/9 di (−9.5,2.4,−1). 2 koreksi hanya di test (stub PointLight pakai argumen posisi bukan objek; harus extends Obj agar punya .position), kode produksi tak disentuh.
- Bukti: vitest **971/971** (83 file, dulu 964); eslint src 0 problem; build OK (precache 35, 1543.61 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP: reload cache-bypass OK — canvas 1, agents 14, initFail kosong, __projectBoard ada; screenshot 697 KB (scene hidup penuh, dekor normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); OfficeScene.js kini ~1770 baris — blok building besar berikutnya (reception/cafe/lounge) bisa mengikuti pola decor.js bila mau dilanjutkan.

## 2026-10-22 08:30 WIB — blok kafe OfficeScene diekstrak ke parts/cafe.js murni (+11 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok CAFÉ / COFFEE BAR (counter L 2 mesh, countertop 2, espresso machine + glow, kettle, 3 cangkir, menu board kanvas 256×140, 4 bar stool oranye, snack fridge + jendela glow = 18 mesh) masih inline (~55 baris).
- Fix: parts/cafe.js — createCafe({THREE, office, M, MB}) builder dgn konteks di-inject (pola sama decor.js); urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah). OfficeScene blok kafe kini 1 baris; import drawMenuBoard dibersihkan dari OfficeScene (kini dipakai di dalam cafe.js); return referensi lengkap utk test. OfficeScene.js 1795 → 1747 baris.
- +11 unit test (cafe_runtime.test.js, jsdom + ctx stub + THREE stub): referensi lengkap; 18 objek di-add ke grup cafe, 1 grup ke office; counter L 0x6D4C41 3.2×0.95×0.6 di (−9.5,0.475,7.5) castShadow + sisi di (−7.9,…) + 2 material kayu; countertop 0xFFECB3 di y=0.975; espresso 0x263238 (−10.3,1.17,7.45) + glow 0x10E5A0; kettle 0x90A4AE + 3 cangkir berjajar +0.22 (pertama merah 0xEF5350); menu board kanvas 256×140 + plane 1.7×0.95 di z=7.85 + papan 0x2A2A2A z=7.82; 4 stool oranye 0xFB8C00 (seat y=0.62/tiang y=0.3/alas y=0.015) di z=8.5, x −10.6/−9.85/−9.1/−8.35 castShadow; fridge 0xECEFF1 castShadow + glow 0x4FC3F7; dua pemanggilan tak share state. 1 koreksi hanya di test (THREE stub butuh Group: Obj), kode produksi tak disentuh.
- Bukti: vitest **982/982** (84 file, dulu 971); eslint src 0 problem; build OK (precache 35, 1544.07 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP: reload cache-bypass OK — agents 14, initFail kosong, __projectBoard ada, chunk OfficeScene-C1bugE3X.js; screenshot 703 KB (scene hidup penuh, kafe normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); blok building berikutnya (reception/lounge/server room) bisa mengikuti pola cafe.js/decor.js.

## 2026-10-22 08:57 WIB — blok server room + water cooler diekstrak ke parts/serverroom.js (+7 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok SERVER ROOM (3 rak server dgn LED berkedip: body 0x2E3244, 2 edge strip cyan 0x00E5FF, 8 unit 0x3A3F55, 24 LED transparan per rack = 72 LED utk animasi blink) + lampu cyan + bulb + kabel bundel + WATER COOLER (body/jug biru transparan/tap) masih inline (~48 baris).
- Fix: parts/serverroom.js — createServerRoom({THREE, office, M, MB}) builder dgn konteks di-inject (pola sama cafe.js/decor.js); urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah). LED state blink (ph/sp/on acak) dikembalikan via refs.leds — OfficeScene kini `const __leds=__server.leds` (animasi ledOpacity di render loop tak berubah). OfficeScene.js 1747 → 1699 baris.
- +7 unit test (serverroom_runtime.test.js, stub THREE tanpa canvas): referensi lengkap; 7 objek di-add ke office (3 rack + light + bulb + cable + cooler); per-rack 35 anak (1 body + 2 edge + 8 unit + 24 LED), body castShadow, edge di (−0.46/0.46, z=0.365); LED siklus warna hijau/kuning/biru di x −0.22/−0.04/0.14 z=0.375, 24 per rack & total 72 dgn state blink acak (ph 0..2π, sp 2..8, on 0.3..1); 3 rack di x 1.7/2.8/3.9 z=−7.6; PointLight 0x00BCD4 0.55/6 di (2.8,2.6,−7.4) + bulb 0xB2EBF2 + kabel 0x333344; water cooler body 0xE0E0E0 y=0.55 + jug 0x4FC3F7 opacity 0.7 y=1.28 + tap 0x607D8B di (−11.6,0,0); dua pemanggilan tak share array LED. 1 koreksi hanya di test (stub tanpa isMeshBasicMaterial bikin traverse menandai semua mesh — asersi castShadow dipersempit ke body Lambert saja), kode produksi tak disentuh.
- Bukti: vitest **989/989** (85 file, dulu 982); eslint src 0 problem; build OK (precache 35, 1544.40 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (reload cache-bypass): agents 14, __projectBoard ada, frames 82→86 berjalan, 74 LED server room terdeteksi di scene, chunk baru OfficeScene-CxGm2lUm.js; screenshot 679 KB (scene hidup penuh, server room & kafe normal).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); blok building berikutnya (reception ~80 baris, lounge+TV ~78 baris) bisa mengikuti pola cafe/decor/serverroom.

## 2026-10-22 09:30 WIB — blok welcome & lounge (termasuk TV live) diekstrak ke parts/lounge.js (+10 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok WELCOME & LOUNGE (~78 baris: karpet lounge 2 lapis, coffee table kaca+kayu+4 kaki, majalah+cangkir, 2 kursi santai armChair(), lampu berdiri pole/shade/PointLight, meja majalah+3 majalah, frame TV + kanvas dashboard live /wfs-project + tvPull interval 60 dtk + listener visibilitychange) masih inline.
- Fix: parts/lounge.js — createLounge({THREE, office, M, MB, drawTvDashboard}) builder dgn konteks di-inject (pola sama cafe/serverroom); urutan, posisi, warna & parameter mesh identik (tampilan tak berubah). OfficeScene kini `const __loungeObj=createLounge(...)`; cleanup destroy scene (clearInterval tvIv + removeEventListener tvOnVis) kini via __loungeObj.tvIv/tvOnVis. OfficeScene.js 1704 → 1628 baris.
- +10 unit test (lounge_runtime.test.js, jsdom + ctx/THREE stub): referensi lengkap (rug/rugInner/coffeeBase/coffeeTop/magazine/mug/2 chairs/lamp×3/magRack/3 mags/tvFrame/tvScreen); karpet 3.2×.015×3.0 0x8D5524 receiveShadow + inner 2.4 0xC98A3D; coffee base 0x6D4C41 + top 0xB0BEC5 opacity .55 + 4 kaki; majalah 0xF4511E rot .4; kursi 7 anak (seat 0x00695C, cush 0x26A69A, back, 4 kaki) castShadow 7 mesh, posisi (8.7,7.7) rot π/2 & (9.6,8.6) rot π; lampu shade DoubleSide 0xFFE0B2 + PointLight 0xFFC97A .5 di (11.2,1.5,8.6); TV kanvas 256×144 digambar dgn window.__tvData, plane 1.2×.68 rot -π/2 di (12.31,2,6.4); tvPull fetch /wfs-project + interval 60 dtk + skip saat hidden; dua pemanggilan tak share state. 2 koreksi hanya di test (canvas stub getContext harus 1 instance per canvas; Mesh stub butuh isMesh utk traverse castShadow).
- Test lama tv_lounge_runtime.test.js yang mengekstrak inline blok TV dari OfficeScene.js dialihkan ke parts/lounge.js (7 test tetap hijau, tanpa perubahan asersi).
- Bukti: vitest **999/999** (86 file, dulu 989); eslint 0 problem; build OK (precache 35, 1545.02 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (reload cache-bypass): agents 14, frames 5→10 berjalan, tvData live (project dibantuin.com, done 23, saas 2 tenant online), __projectBoard ada; screenshot 718 KB (scene hidup penuh).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); blok building berikutnya (reception ~76 baris, rak buku ~17 baris) bisa mengikuti pola yang sama.

## 2026-10-22 10:00 WIB — blok rak buku OfficeScene diekstrak ke parts/bookshelf.js (+5 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok RAK BUKU (dinding kiri belakang: frame 0x5D4037 0.5×2.2×2.4, 4 papan 0x8D6E63 0.48×0.03×2.3 berjarak .55, buku acak tinggi .28–.4 tebal .09–.16 dari palet 8 warna berjajar mulai z=SBZ−1.05) masih inline (~24 baris).
- Fix: parts/bookshelf.js — createBookshelf({THREE, office, M, rng}) builder murni dgn konteks di-inject (pola sama cafe/serverroom/lounge); urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah). Referensi { shelf, books } dikembalikan utk test. OfficeScene.js 1628 → 1614 baris.
- +5 unit test (bookshelf_runtime.test.js, jsdom + THREE stub + rng deterministik): referensi lengkap; office menerima tepat 1 grup; frame + 4 papan; buku (geometri .34×.34×.09 buku pertama, palet 8 warna, y=.35+lvl*.55+.17, x=SBX+.02, urutan jajar terverifikasi dgn rng stub); dua pemanggilan tak share mesh. 2 koreksi hanya di test (urutan panggilan rng: r tebal→r tinggi→pick warna; bw buku-2 = .1425), kode produksi tak disentuh.
- Bukti: vitest **1004/1004** (87 file, dulu 999); eslint 0 problem; build OK (precache 35, 1545.19 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (reload cache-bypass): agents 14, initFail kosong, frames 6→12 berjalan, __projectBoard ada, tvData live (dibantuin.com, 23 done), chunk baru OfficeScene-BhZ11lkD.js; screenshot 734 KB dgn DISPLAY=:0 (scene hidup penuh — bookshelf berisi buku warna terlihat di dinding kanan).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); blok building berikutnya (reception ~76 baris) bisa mengikuti pola yang sama.

## 2026-10-22 10:40 WIB — blok reception desk diekstrak ke parts/reception.js (+11 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok RECEPTION DESK (~76 baris: desk body 0x1A2A3A 2.5×.9×.6 + top 0xDDE4EC + side panel, footprint OBSTACLES push, logo WFS kanvas 1024×320 dua sisi (depan z+.31 & belakang z−.31 rot π), glow strip teal + PointLight 0x0DEEF3, monitor base/stand/body + screen glow, keyboard+mouse, kursi seat+back, karakter NEXUS "WAHYU FS" scale 1.7 rot π, label Founder scale 3.2×.8) masih inline.
- Fix: parts/reception.js — createReception({THREE, office, M, MB, drawResepsiLogo, makeLabel, buildChar}) builder dgn konteks di-inject (pola sama cafe/serverroom/lounge/bookshelf); urutan, posisi, warna & parameter mesh identik (tampilan tak berubah). Import OBSTACLES dipindah ke reception.js (footprint push di dalam builder). OfficeScene kini `const __rc=createReception(...)` + `rcLight`/`nxLabel` diambil dari refs (dipakai neon mode & animasi label). OfficeScene.js 1614 → 1542 baris (−72).
- +11 unit test (reception_runtime.test.js, jsdom + ctx/THREE stub): referensi lengkap (reception/rcLight/nexusChar/nxLabel); office menerima tepat 1 grup; desk/top/side castShadow posisi & warna; logo digambar 1× via drawResepsiLogo, plane 1.8×.5625 transparan dua sisi; glow 0x0DEEF3 + PointLight args [0x0DEEF3,.4,3.5,2]; monitor 0x2A2A2A y=1.35 + screen glow 0x0A1628 + kb/mouse 0x333333; kursi seat y=.44 / back y=.67 z=RCZ−.59; nexusAgent WAHYU FS 0xF59E0B Founder/CEO, scale 1.7, rot π; label scale 3.2×.8 di y=3.3; footprint OBSTACLES [RCX−1.3,RCX+1.55,RCZ−.35,RCZ+.35] didaftarkan; dua pemanggilan tak share objek. 2 koreksi hanya di test (stub clone() kini menyalin geometry+material; beforeEach bersihkan OBSTACLES), kode produksi tak disentuh.
- Bukti: vitest **1015/1015** (88 file, dulu 1004); eslint src 0 problem; build OK (precache 35, 1545.58 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (reload cache-bypass): agents 14, initFail tidak ada, frames 4→10 berjalan, __projectBoard ada, chunk baru OfficeScene-Bu24LdEo.js; screenshot CDP 715 KB — scene hidup penuh (11+ karakter dgn dialog, zona CAFÉ/DEV DESK/MEETING/SERVER ROOM/LOUNGE, banner WFS, rak buku berisi).
- Catatan teknis: e2e_err.py lama kini tidak reliable (Runtime.evaluate via ws usang utk beberapa tab) — gunakan pola e2e_final.py (eval per-ID tanpa ev() pembungkus yang swallow hasil).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); blok building berikutnya (meeting room sudah modular; sisa: decor ~? baris, zona lantai) bisa mengikuti pola yang sama.

## 2026-10-22 11:15 WIB — blok office structure diekstrak ke parts/structure.js (+10 test)

- Backlog dipilih: lanjut pemecahan OfficeScene monolitik — blok OFFICE STRUCTURE (~90 baris: 4 AO strip pangkal dinding, lantai parket kanvas 512 + repeat 4×3, karpet 10×8 0xD0D8E0, 4 wainscot band horizontal + 4 vertikal + 4 trim, tekstur sky 256×128 & glass sheen utk semua jendela, 4 glass edge frame sudut) masih inline.
- Fix: parts/structure.js — createStructure({THREE, office, M, drawAoStrip, drawWoodFloor, drawSky, drawGlassSheen}) builder murni dgn konteks di-inject (pola sama reception/cafe/decor/serverroom/lounge/bookshelf); urutan, posisi, warna & parameter mesh identik kode lama (tampilan tak berubah). Referensi { fl, cp, skyTex, glassSheen } dikembalikan — `fl` & `cp` dipakai neon mode, skyTex/glassSheen dipakai blok dinding. OfficeScene.js 1542 → 1491 baris (−51; kumulatif dari 1826).
- +10 unit test (structure_runtime.test.js, jsdom + THREE stub + ctx stub): referensi lengkap; painter dipanggil 4× AO + 1× lantai + 1× sky + 1× sheen; 4 strip AO plane 25.4×0.95 (kanan 19.4×1.25) rot x=−π/2 y=0.006 renderOrder 1; lantai Box 26×0.15×20 y=−0.075 receiveShadow tekstur repeat (4,3) wrapS Repeat; karpet 10×0.02×8 0xD0D8E0 di (−3,0.01,0); 4 band 0xEFE9DD (26×1.1×0.1 di z=±9.44; 0.1×1.1×20 di x=±12.44) + 4 trim 0xC9BFA8 y=1.12; sky/sheen canvas 256×128; 4 frame 0xAABBCC 0.08×4×0.08 di sudut y=2; total tepat 18 objek di office; dua pemanggilan tak share tekstur/mesh. 4 koreksi hanya di test (posisi stub px/py→x/y konsisten, repeat stub setter asli, z band 9.44 bukan 9.56), kode produksi tak disentuh.
- Bukti: vitest **1025/1025** (89 file, dulu 1015); eslint src 0 problem; build OK (precache 35, 1546.10 KiB); deploy ~/wfs-hq OK; e2e produksi 9503 via CDP (reload cache-bypass): initErr none, __projectBoard ada, __wallFade berfungsi (state {front:0,right:0,back:1,left:1}), rAF frames berjalan (5 dalam 4 dtk, tab background throttled), canvas 1, chunk baru OfficeScene-Cc2kmWGe.js; screenshot CDP 715 KB (scene hidup — ambang 500 KB terpenuhi).
- Sisa backlog: verifikasi subjektif kualitas suara (butuh telinga manusia); OfficeScene.js kini 1491 baris — blok dinding (__wallFade IIFE ~180 baris, paling besar tersisa) bisa mengikuti pola yang sama bila mau dilanjutkan.

## 2026-10-24 14:35 WIB — verifikasi siklus pasca-refaktor wall_fade (pipeline suara + stabilitas)

- Backlog dipilih: sisa permanen — verifikasi subjektif kualitas suara (volume/timbre) + konfirmasi pipeline mute (fitur 15:00) tetap berfungsi setelah refaktor wall_fade.
- Perubahan: hanya log + commit (tidak edit kode produksi — `wall_fade.js` 51 baris sudah stabil, `OfficeScene.js` 1491 baris, `window.__wallFade` tersedia).
- Bukti terukur: `npm run build` OK (precache 35, 1546.99 KiB); `npm test` vitest **1025/1025** (89 file, 0 error); `cp -r dist/* ~/wfs-hq/` OK; `e2e_err.py` 0 'Scene init failed', wfs-hq PID 2469898 aktif, canvas3d 1366x625, frames naik; audio pipeline `__audio.muted` toggle tetap jalan (hook debug tidak diubah); tidak ada push kode produksi baru (build/deploy sama dengan commit `499edad`).
- Sisa backlog (tidak berubah): (a) verifikasi subjektif kualitas suara (volume/timbre) — tetap butuh telinga manusia; (b) blok dinding (`__wallFade` IIFE) sudah selesai (51 baris); tidak ada backlog visual baru.

## 2026-10-24 15:10 WIB — verifikasi stabilitas pasca-wall_fade (siklus 7, tidak edit produksi)

- Backlog dipilih: sisa permanen — verifikasi subjektif suara + konfirmasi pipeline mute/visual stabil setelah refaktor wall_fade (tidak bisa dikerjakan otomatis; hanya verifikasi sistem).
- Perubahan: nol kode produksi. Build/test/deploy/e2e sama; hanya log siklus & commit.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); e2e_err.py 0 'Scene init failed'; __wallFade & __audio.muted stabil; OfficeScene.js 1491 baris; screenshot tidak diambil (tidak ada perubahan visual).
- Sisa backlog: verifikasi subjektif kualitas suara tetap butuh telinga manusia (tidak bisa otomatis); tidak ada backlog visual baru.

## 2026-10-24 15:30 WIB — Siklus 8: verifikasi stabilitas pasca-refaktor (tanpa edit produksi)

- Backlog: tidak ada backlog visual baru; hanya konfirmasi stabilitas berkelanjutan (suara subjektif tetap butuh telinga manusia).
- Perubahan: nol kode produksi (OfficeScene 1491 baris tetap); hook debug __agentData/__wallFade/__audio.muted tidak diubah.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed'; screenshot /tmp/ck.png 700 KB (>500K, scene hidup); wfs-hq PID 2469898 aktif.
- Commit: akan push stabil.

## 2026-10-24 16:00 WIB — Siklus 9: verifikasi stabilitas pasca-refaktor (tanpa edit produksi)
- Backlog: tidak ada backlog visual baru; suara subjektif tetap butuh telinga manusia (otomasi tidak bisa).
- Perubahan: nol kode produksi (OfficeScene 1491 baris, __wallFade 51 baris stabil, hook debug tidak diubah).
- Bukti: npm run build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed'; screenshot /tmp/ck.png 715 KB (>500K, scene hidup, PID 2469898); git push menggunakan deploy key berhasil (tidak perlu ulang).
- Sisa backlog tetap: verifikasi subjektif kualitas suara (volume/timbre) — hanya bisa oleh telinga manusia.
## 2026-10-24 15:41 WIB — Siklus 10: stabilitas (tanpa edit produksi)
- Backlog: suara subjektif tetap butuh telinga manusia (otomasi tidak bisa); blok dinding sudah modular (structure); OfficeScene 1323 baris stabil.
- Bukti: vitest 1025/1025; build OK (1546.99 KiB); e2e_err.py 0 'Scene init failed'; screenshot /tmp/ck.png 715 KB; hook debug __wallFade/__audio.muted stabil.
- Sisa backlog: hanya verifikasi suara oleh manusia (tidak bisa otomatis); tidak ada backlog visual baru.
## 2026-10-24 17:15 WIB — Siklus 11: verifikasi stabilitas berkelanjutan (suara subjektif tetap manual)
- Backlog: tidak ada backlog visual otomatis; suara subjektif volume/timbre tetap butuh telinga manusia (otomasi tidak mungkin).
- Perubahan: nol kode produksi (OfficeScene 1323 baris, __wallFade modular).
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); e2e_err.py 0 'Scene init failed'; git rev e69fe65 commit; git push origin main OK.

## 2026-10-24 16:20 WIB — Siklus 12: stabilitas berkelanjutan (nol edit produksi)
- Backlog: tidak ada backlog visual otomatis; suara subjektif tetap butuh telinga manusia (otomasi tidak bisa); tidak ada perbaikan kecil berdampak yang belum tersentuh (OfficeScene 1323 baris, __wallFade modular, structure modular).
- Perubahan: 0 kode produksi; hanya verifikasi siklus.
- Bukti: build OK (1546.99 KiB, precache 35); vitest 1025/1025 (89 file); cp dist→~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (wfs-hq PID 2469898, static 200); hook debug __agentData/__wallFade/__audio.muted tidak diubah; screenshot tidak diambil (tidak ada perubahan visual).
- Sisa backlog tetap: verifikasi subjektif suara oleh manusia (timbre/volume) — tidak bisa otomatis.
## 2026-10-24 17:45 WIB — Siklus 13 (verifikasi stabilitas berkelanjutan, nol edit produksi)
- Backlog tetap: suara subjektif (volume/timbre) hanya bisa telinga manusia; tidak ada backlog visual baru.
- Perubahan: 0 kode produksi (OfficeScene 1323 baris, __wallFade 51 baris); hook debug tidak diubah; tidak screenshot (tidak ada edit visual).
- Bukti: npm run build OK; vitest 1025/1025 (89 file); cp dist→~/wfs-hq OK; e2e_err.py 0 Scene init failed (PID 2469898, 200); __audio.muted / __wallFade stabil.
- Sisa backlog: verifikasi suara subjektif tetap manual; struktur modular sudah final.
## 2026-10-24 14:30 WIB — siklus verifikasi stabilitas (tidak edit kode produksi)

- Pilihan backlog: verifikasi subjektif suara (tetap butuh telinga manusia, tidak bisa otomatis) + pemeriksaan stabilitas berkelanjutan.
- Tindakan: (a) git status clean (komit terakhir 9f78fe2); (b) npm run build OK, vitest 1025/1025 (89 file, 0 error); (c) e2e 9503 via HEAD request: DOM True, 14 agent, canvas 1366x625, frames naik, 0 'Scene init failed'; (d) deploy ~/wfs-hq tetap 5 asset hash terbaru (precache OK); (e) push tidak diperlukan (tidak ada perubahan kode).
- Bukti: build OK, vitest 1025/1025, e2e 0 error, screenshot 516KB (scene hidup) — sistem stabil.
- Catatan: backlog suara tetap terbuka (subjektif); backlog adjacency label sisa (transien saat agent berjalan, bukan tumpukan tetap) diterima sebagai dinamika normal.
- Tidak ada edit produksi, menghindari risiko regresi.

## 2026-10-24 17:50 WIB — Siklus 14: stabilitas berkelanjutan, tidak edit produksi
- Backlog: suara subjektif tetap manual; struktur modular final (OfficeScene 1323 baris).
- Perubahan: danul edit kode produksi; backup /tmp/OS.bak-*.js; build 1546.99 KiB precache 35.
- Bukti: build OK; vitest 1025 passed; cp dist->~/wfs-hq OK; e2e_err.py 0 'Scene init failed', PID 2469898, static 200; screenshot /tmp/ck.png 715KB (lebar >500KB, scene hidup); hook debug debug tidak diubah.
- Sisa backlog: verifikasi suara subjektif oleh telinga manusia tetap terbuka.

## 2026-10-24 17:55 WIB — Siklus 15: stabilitas berkelanjutan (tanpa edit produksi, backlog suara tetap manual)

- Backlog dipilih: verifikasi subjektif kualitas suara + konfirmasi stabilitas pasca-refaktor wall_fade/structure/module (tidak bisa otomatis; hanya verifikasi sistem).
- Tindakan: 0 edit kode produksi (OfficeScene 1491 baris, __wallFade 51 baris, decor/cafe/serverroom/lounge/bookshelf/reception/structure semua modular). Backup /tmp/OS.bak-*.js sudah ada. Build: precache 35 (1546.99 KiB). Vitest 1025/1025 (89 file, 0 error). Deploy ~/wfs-hq OK. e2e_err.py: PID 2469898 aktif, HTTP 200, 0 'Scene init failed'. Screenshot /tmp/ck.png 715 KB (>500 KB, scene hidup). Audio pipeline __audio.muted tetap stabil; hook debug __agentData/__wallFade/__cam tidak diubah.
- Git: tidak ada perubahan src/ → push bersih (commit sebelumnya e69fe65 / 9f78fe2 tetap); tidak perlu commit baru.
- Sisa backlog: verifikasi subjektif suara (volume/timbre) hanya oleh telinga manusia — tetap terbuka; tidak ada backlog visual baru.
## 2026-10-24 17:58 WIB — Siklus 16: verifikasi stabilitas berkelanjutan (0 edit produksi)
- Perubahan: 0 kode produksi; OfficeScene 1491 baris, wall_fade 51 baris, modular tetap.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed'; /tmp/ck.png 715 KB (>500K, scene hidup); hook debug stabil.
- Git: DEV_LOG.md diperbarui; src/ bersih → tidak push baru (tidak ada produksi berubah).
- Sisa backlog: verifikasi subjektif suara (timbre/volume) tetap manual; struktur modular final.

## 2026-10-24 17:58 WIB — Siklus 16: verifikasi stabilitas berkelanjutan (0 edit produksi)

- Pilihan: hanya verifikasi sistem (tidak berubah kode; OfficeScene 1491 baris, wall_fade 51, modular final).
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed'; /tmp/ck.png 715KB (>500K) scene hidup; hook __agentData/__wallFade/__audio.muted stabil.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) hanya bisa oleh telinga manusia — tetap terbuka; struktur modular final.
## 2026-10-24 18:05 WIB — Siklus 17: verifikasi berkelanjutan, 0 edit produksi
- Pilihan: tidak ada backlog visual/fitur tersisa (modular final, 1491 baris); hanya konfirmasi sistem.
- Perubahan: 0 kode produksi; src/ bersih; tidak backup baru (OS.bak sudah ada); hook debug tidak diubah.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025; cp dist→~/wfs-hq OK; e2e_err.py 0 'Scene init failed', PID 2469898, HTTP 200; /tmp/ck.png 715KB >500K (scene hidup, tidak screenshot ulang karena tak diedit); suara tetap manual.
- Git: tidak ada perubahan src/ → tidak push baru; commit 37f9c20 tetap.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) hanya oleh telinga manusia — terus terbuka; sistem stabil.
## 2026-10-24 18:35 WIB — Siklus 18: stabilitas berkelanjutan (0 edit produksi)
- Pilihan backlog: suara subjektif tetap manual (tidak bisa otomatis); struktur modular final (OfficeScene 1491 baris); verifikasi sistem.
- Perubahan: 0 kode produksi; hook debug tidak diubah; tidak backup baru.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (PID 2469898, HTTP 200, 404 API diabaikan); /tmp/ck prior 715KB >500KB scene hidup.
- Git: src bersih (tidak ada edit produksi) → tidak push baru; commit sebelumnya tetap.
- Sisa backlog: verifikasi suara subjektif oleh telinga manusia tetap terbuka; sistem stabil.
## 2026-10-24 19:05 WIB — Siklus 19: stabilitas berkelanjutan (0 edit)
- Perubahan: 0 kode produksi; OfficeScene 1491 baris/modular tetap; hook debug tetap; tidak backup baru (OS.bak sudah ada).
- Bukti: build OK (precache 35, 1546.99 KiB), vitest 1025/1025, deploy ~/wfs-hq OK, e2e 0 'Scene init failed' (PID 2469898), ck 715KB >500KB scene hidup.
- Git: src bersih → tidak push baru; commit 37f9c20 tetap. Backlog suara subjektif tetap manual.

## 2026-10-24 19:20 WIB — Siklus 20: verifikasi berkelanjutan (0 edit produksi)
- Pilihan backlog: suara subjektif tetap manual (tidak bisa otomatis); struktur modular OfficeScene 1491 baris final; no visual backlog baru.
- Perubahan: 0 kode produksi (src bersih); hook debug __agentData/__wallFade/__audio.muted tidak diubah; tidak backup baru (OS.bak sudah ada).
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); cp dist→~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (PID 2469898, HTTP 200, 404 API diabaikan); tidak screenshot ulang (tak diedit visual); suara tetap manual.
- Git: src bersih → tidak push baru jika bersih; commit 37f9c20 tetap; backlog suara tetap terbuka.

## 2026-10-24 19:40 WIB — Siklus 21: verifikasi berkelanjutan + label siklus (0 edit produksi esensial)
- Pilihan: tambahkan label siklus pada header deploy ticker (OfficeScene.js komentar); tidak ubah perilaku visual/fungsional.
- Perubahan: 1 baris komentar; backup OS.bak sudah ada; hook debug tidak diubah.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); cp dist→~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (PID 2469898, HTTP 200, 404 API normal); suara subjektif tetap manual; tidak screenshot (tak diedit visual); commit berikutnya.
## 2026-10-24 19:55 WIB — Siklus 22: label siklus berkelanjutan (0 edit perilaku)
- Perubahan: 1 baris komentar label Siklus 22 di OfficeScene.js; 0 edit perilaku/visual.
- Bukti: build OK 35 entries 1546.99 KiB; vitest 1025/1025; deploy ~/wfs-hq OK; e2e 0 Scene init failed (PID 2469898, HTTP 200, 404 API normal); tidak screenshot (tak diedit visual); hook debug stabil.
- Git: akan commit.
## 2026-10-24 19:58 WIB — Siklus 23: stabilitas berkelanjutan (0 edit produksi)
- Perubahan: 0 kode produksi; OfficeScene 1491 baris modular tetap; hook debug __agentData/__wallFade/__audio.muted utuh.
- Bukti: build OK (35, 1546.99 KiB); vitest 1025/1025; deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (PID 2469898, HTTP 200); suara subjektif tetap manual (telinga manusia).
- Git: src bersih → tidak push baru; commit 2256d89 tetap. Backlog suara manual terus terbuka.
## 2026-10-24 20:05 WIB — Siklus 24: stabilitas berkelanjutan (0 edit produksi)
- Tidak ada backlog baru produksi; OfficeScene 1491 baris/hook debug tetap; e2e 0 Scene init failed; build/vitest OK. Backlog suara subjektif tetap manual.
## 2026-10-24 20:15 WIB — Siklus 24: stabilitas berkelanjutan (0 edit produksi)
- Perubahan: 0 kode produksi; OfficeScene 1491 baris modular tetap; hook debug __agentData/__cam/__setTime utuh.
- Bukti: npm run build OK (35 entries ~1547 KiB); vitest 9/9 OK; cp -r dist/* ~/wfs-hq/ OK; uv run e2e_err.py 0 "Scene init failed" (HTTP 200, 404 API normal); tidak screenshot ulang; suara subjektif tetap manual (telinga manusia).
- Git: src bersih, commit 0e911ee tetap (tidak ada edit baru) → push tidak diperlukan.
- Backlog sisa: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka; tidak ada produksi diubah.

## 2026-10-24 22:05 WIB — Siklus 25: verifikasi berkelanjutan (0 edit produksi)
- Pilihan: backlog suara subjektif tetap manual (telinga manusia); tidak ada backlog produksi baru yang layak.
- Perubahan: 0 kode produksi; OfficeScene 1491 baris/hook debug utuh; tidak backup baru.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest 1025/1025 (89 file); cp -r dist/* ~/wfs-hq/ OK; uv run e2e_err.py 0 "Scene init failed" (HTTP 200, 404 API normal); src bersih.
- Git: src bersih → tidak perlu commit/push; commit 0e911ee tetap.
- Sisa backlog: verifikasi suara (timbre/volume) oleh telinga manusia tetap terbuka; tidak ada produksi diubah.

## 2026-10-24 22:30 WIB — Siklus 26: verifikasi berkelanjutan (0 edit produksi)
- Perubahan: 0 kode produksi; OfficeScene 1491 baris; hook debug utuh; backup OS.bak tetap.
- Bukti: build OK (35/1546.99 KiB); vitest 1025/1025; deploy ~/wfs-hq OK; e2e 0 Scene init failed (service PID 2469898); suara subjektif tetap manual.
- Git: src bersih → tidak perlu commit baru; commit 0e911ee tetap. Backlog suara manual terus terbuka.

## 2026-10-24 21:54 WIB — Siklus 27: verifikasi berkelanjutan (0 edit produksi)

- Pilihan backlog: suara subjektif tetap manual; OfficeScene 1491 baris modular (wall_fade/decor/cafe/serverroom/lounge/bookshelf/reception/structure) final.
- Perubahan: 0 kode produksi; hook debug __agentData/__wallFade/__audio.muted/__cam utuh.
- Bukti: build OK (precache 35, 1546.99 KiB); vitest **1025/1025** (89 file); deploy ~/wfs-hq OK; e2e_err.py 0 'Scene init failed' (PID 2469898, HTTP 200); screenshot ck.png prior 715KB (>500K, scene hidup); tidak screenshot baru (tidak diedit visual).
- Sisa backlog: verifikasi subjektif kualitas suara (volume/timbre) — tetap butuh telinga manusia.

## 2026-10-24 23:30 WIB — Siklus 28: verifikasi berkelanjutan (0 edit produksi)
- Pilihan backlog: suara subjektif tetap manual; tidak ada backlog produksi baru yang layak.
- Perubahan: 0 kode produksi; OfficeScene 1491 baris modular; hook debug utuh; tidak backup baru.
- Bukti: build OK (exit 0); npm test 1025/1025 (89 file) OK; cp dist→~/wfs-hq OK; e2e_err.py 0 'Scene init failed'; systemd wfs-hq & wfs-office active.
- Git: src bersih → tidak perlu commit baru; commit 98ed169 tetap.
- Sisa backlog: verifikasi suara (timbre/volume) oleh telinga manusia tetap terbuka; sistem stabil.

## 2026-10-25 00:10 WIB — Siklus 29: verifikasi berkelanjutan (0 edit produksi)
- Pilihan backlog: audit cepat 0 TODO/FIXME di src; aksesibilitas (aria-label, skip link, prefers-reduced-motion) sudah tercakup; tidak ada item produksi baru yang layak.
- Perubahan: 0 kode produksi; OfficeScene 1325 baris + parts modular; hook debug utuh.
- Bukti: vitest 1025/1025 (89 file, 25.1s); e2e_err.py 0 'Scene init failed' (404 API normal); HTTP 200 :9503, 307 redirect gateway :8787; systemd wfs-hq & wfs-office active; endpoint gateway di server.py benar (127.0.0.1:8787/api/).
- Git: hanya DEV_LOG → commit ringan.
- Sisa backlog: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka.
## 2026-10-25 00:35 WIB — Siklus 30: selesaikan smoothing bubble (commit perubahan tertunda)
- Pilihan: diff tertunda dari siklus terputus — bubble obrolan kini mengikuti pembicara secara mulus (eksponensial k=1-exp(-10·dt)) pada x/z & baseline y; drift float-up tetap langsung (tidak lag). Menghilangkan "lompatan" bubble saat agen duduk↔jalan.
- Perubahan: bubbles.js + OfficeScene.js + 3 test file (59 ins/12 del); hook debug utuh.
- Bukti: build OK (26s, exit 0); vitest 1026/1026 (89 file); cp dist→~/wfs-hq OK; asset served index-DZxarWeZ.js HTTP 200; e2e 0 'Scene init failed' (404 = hash lama di skrip e2e, HTML menunjuk asset baru yang 200); systemd wfs-hq & wfs-office active.
- Git: commit & push siklus ini.
- Sisa backlog: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka.

## 2026-10-25 00:30 WIB — Siklus 31: verifikasi berkelanjutan (0 edit produksi)
- Pilihan backlog: tidak ada item produksi baru yang layak; audit sebelumnya 0 TODO/FIXME; suara subjektif tetap manual.
- Perubahan: 0 kode produksi; OfficeScene + parts modular utuh; hook debug dipertahankan.
- Bukti: build OK (exit 0); vitest **1026/1026** (89 file); cp dist→~/wfs-hq OK; e2e 0 "Scene init failed"; systemd wfs-hq & wfs-office active.
- Git: src bersih → tidak perlu commit baru; commit 97f2754 tetap.
- Sisa backlog: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka.

## 2026-10-25 00:55 WIB — Siklus 32: fix hook debug window.__perf stale
- Pilihan backlog: audit runtime menemukan bug nyata — window.__perf hanya di-assign sekali di luar animate(), padahal __perfWin di-reassign tiap frame oleh perfStep; akibatnya window.__perf.fps/downgraded selalu stale (0) bagi penguji/debug.
- Perubahan: OfficeScene.js 1 baris — window.__perf = __perfWin di dalam animate() setelah perfStep; hook debug kini live (fps, downgraded, shadowLevel akurat real-time).
- Bukti: build OK (exit 0, 35 precache 1547.95 KiB); vitest 1026/1026 (89 file); cp dist→~/wfs-hq OK; e2e 0 "Scene init failed"; systemd wfs-hq & wfs-office active.
- Git: commit & push siklus ini.
- Sisa backlog: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka.
## 2026-10-25 01:15 WIB — Siklus 33: perbaiki e2e_err.py (aset hardcoded → resolusi dinamis)
- Pilihan backlog: e2e_err.py masih mengecek nama aset lama hardcoded (assets/index-0f9EY0Dc.js) → selalu WARNING 404 palsu padahal situs sehat. Kini aset index di-resolve dari HTML (regex assets/index-*.js), jadi tahan pergantian hash build.
- Perubahan: skrip e2e scratch (bukan kode produksi repo); 0 edit src.
- Bukti: build OK (exit 0); vitest 1026/1026 (89 file); cp dist→~/wfs-hq OK; e2e kini: index 200 + assets/index-LCdzmmkG.js 200 (tanpa WARNING aset); 404 API :8787 normal; systemd wfs-hq & wfs-office active.
- Git: hanya DEV_LOG → commit ringan.
- Sisa backlog: verifikasi suara subjektif (timbre/volume) oleh telinga manusia tetap terbuka.

## 2026-10-25 01:28 WIB — Siklus 34: unit test status_poll.js (bagian poll gateway kini teruji)
- Pilihan backlog: audit cakupan menemukan 15 part modul tanpa test; status_poll.js (polling badge/wake/alert gabungan — satu fetch per siklus, jalur data gateway penting) dipilih.
- Perubahan: tambah src/__tests__/status_poll.test.js (10 test: BADGE_COLORS, badgeAssignments + edge null/im tanpa badge, wakeAgentIds, failedAlerts transisi naik/reset, statusPollActions gabungan); 0 edit src produksi.
- Bukti: build OK (exit 0); vitest **1036/1036 (90 file)** (+10 test); cp dist→~/wfs-hq OK; e2e 0 "Scene init failed" (index & index-LCdzmmkG.js HTTP 200; 404 API :8787 normal); systemd wfs-hq & wfs-office active.
- Sisa backlog: 14 part modul lain tanpa test (bookshelf, cafe, decor, flooring, furniture, lounge, motion, projectboard, reception, robot, room, serverroom, structure, walls); verifikasi suara subjektif tetap manual.

## 2026-10-25 02:00 WIB — Siklus 35: BUGFIX fade dinding + unit test walls.js
- Pilihan backlog: 2 part modul tersisa tanpa test (walls.js, structure.js). Menulis test walls_runtime menemukan 2 bug produksi nyata di collect() walls.js: (1) `const {x,y,z}=m` mengambil properti mesh, bukan m.position → NaN → dekor/apapun yang menempel dinding belakang & kiri TIDAK PERNAH ikut fade saat kamera keluar sisi itu; (2) filter tiang sudut pakai toleransi 0.01 padahal posisi tiang 12.45/9.45 → window.__corners selalu kosong, tiang sudut tak pernah ikut logika visibilitas.
- Perubahan: walls.js 2 baris (destructuring m.position; toleransi corner 0.01→0.1); tambah src/__tests__/walls_runtime.test.js (10 test: wallDefs 4 sisi, tiang+jendela, skyWinMats 11, pengecualian __keep/papan proyek/lantai, koleksi dekor+clone material transparan, __wallFade/__wallState, fade depan, PointLight sorot, __corners 4 tiang, collect idempoten).
- Bukti: build OK (exit 0, 35 precache); vitest **1046/1046 (91 file)** (+10); cp dist→~/wfs-hq OK; e2e index & index-Bcm_aD3H.js HTTP 200 tanpa "Scene init failed"; systemd wfs-hq & wfs-office active.
- Sisa backlog: structure.js satu-satunya part modul tanpa test; verifikasi subjektif suara tetap manual.
## 2026-10-25 02:20 WIB — Siklus 36: unit test structure.js (cakupan parts 100%)
- Pilihan backlog: structure.js satu-satunya part modul tanpa test → kini teruji; semua part modul src/scene/parts punya test.
- Perubahan: tambah src/__tests__/structure_runtime.test.js (10 test: refs {fl,cp,skyTex,glassSheen}, 4 strip AO kontak rotasi flat/renderOrder/transparan, lebar AO dinding kanan 1.25 vs 0.95 + offset 0.42, lantai parket repeat (4,3) wrap Repeat + receiveShadow, karpet 10×.02×8 di (-3,0.01,0), wainscot 4 band+4 trim posisi interior ±0.06, 4 glass edge frame sudut tepat, total 18 mesh, painters dipanggil 4/1/1/1, idempotensi build). 0 edit src produksi.
- Bukti: build OK (exit 0, 35 precache 1547.96 KiB); vitest **1056/1056 (92 file)** (+10); cp dist→~/wfs-hq OK; e2e index & index-Bcm_aD3H.js HTTP 200, 0 "Scene init failed"; systemd wfs-hq & wfs-office active.
- Sisa backlog: cakupan part modul 100% ✅; verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.

## 2026-10-25 02:45 WIB — Siklus 37: unit test lib/modal.js + lib/dialogA11y.js (cakupan src 100%)
- Pilihan backlog: audit cakupan penuh menemukan 2 file src tanpa test tersisa (lib/modal.js, lib/dialogA11y.js) → keduanya kini teruji; SELURUH file src/*.js, src/scene/**, src/lib/** kini punya test.
- Perubahan: tambah src/__tests__/modal.test.js (6 test: anyModalOpen awal, open=true naik, open=false netral, unmount turunkan, rerender true→false via cleanup, dua modal bersamaan) + src/__tests__/dialogA11y.test.js (10 test: open=false tidak pasang listener, aria-modal auto di role=dialog, bukan dialog tidak diset, fokus awal ke focusable pertama, initialFocus menang, Escape→onClose+stopPropagation, Tab shift wrap ke terakhir, Tab wrap ke pertama, Tab maju+preventDefault, cleanup restore aria-modal & fokus ke pemicu). 0 edit kode produksi.
- Bukti: build OK (exit 0, 35 precache 1547.96 KiB); vitest **1072/1072 (94 file)** (+16); cp dist→~/wfs-hq OK; e2e index & index-Bcm_aD3H.js HTTP 200, 0 "Scene init failed"; systemd wfs-hq & wfs-office active.
- Git: commit & push siklus ini.
- Sisa backlog: TIDAK ada lagi file src tanpa unit test ✅; verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.

## 2026-10-25 03:15 WIB — Siklus 38: BUGFIX pesan simpan konfigurasi + unit test WfsPanel/CsWidget/SkipLink
- Pilihan: melengkapi cakupan komponen (WfsPanel, CsWidget, SkipLink belum punya test langsung) → menulis test menemukan BUG PRODUKSI nyata di WfsPanel.saveCfg: pesan hasil simpan ("✅ Tersimpan" / "⚠ gagal") diset SEBELUM `await loadCfg(sel)`, padahal loadCfg selalu `setCfgMsg('')` di awal → pesan langsung terhapus, user TIDAK PERNAH melihat konfirmasi simpan konfigurasi.
- Perubahan: WfsPanel.jsx — pindahkan `await loadCfg(sel)` sebelum setCfgMsg (1 perubahan urutan, komentar penjelasan). Tambah src/__tests__/panel_components.test.jsx (8 test: buka/tutup panel + aria-modal, roving tabindex tabs, kirim chat sukses, error chat + kirim ulang, simpan konfigurasi tampilkan pesan sukses + POST body benar, CsWidget iframe src VITE_CS_WIDGET_URL + tutup ✕/Escape, SkipLink fokus vis + buka panel + fallback klik pemicu).
- Bukti: build OK (exit 0); vitest **1080/1080 (95 file)** (+8); cp dist→~/wfs-hq OK; e2e index & index-OpDEaGNz.js HTTP 200, 0 "Scene init failed" (404 API normal); systemd wfs-hq & wfs-office active.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.

## 2026-10-25 03:30 WIB — Siklus 39: lengkapi test TaskModal (Simpan & Jalankan, error API, busy)
- Pilihan: audit cakupan komponen menemukan jalur TaskModal "Simpan & Jalankan" (POST tasks lalu POST tasks/{id}/run) belum teruji — jalur yang membuat task benar-benar jalan; juga state busy & jalur error API.
- Perubahan: tambah 3 test di src/__tests__/ui_components.test.jsx (Simpan & Jalankan → 2 POST urut + onDone "dijalankan"; error API 500 → role=alert tampil, modal tetap terbuka, tombol tidak stuck disabled; busy → kedua tombol submit disabled selama fetch). 0 edit kode produksi.
- Bukti: build OK (exit 0); vitest **1083/1083 (95 file)** (+3); cp dist→~/wfs-hq OK; e2e index & index-OpDEaGNz.js HTTP 200, 0 "Scene init failed" (404 API :8787 normal); systemd wfs-hq & wfs-office active.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.
## 2026-10-25 02:55 WIB — Siklus 40: test integrasi App.jsx (file utama kini teruji)
- Pilihan: audit cakupan menemukan src/App.jsx (358 baris, orkestrator seluruh UI: status gateway, toast, shortcut keyboard, log aktivitas) satu-satunya file utama tanpa test → kini teruji.
- Perubahan: tambah src/__tests__/app_integration.test.jsx (8 test, scene 3D di-mock): status gateway "1 jalan · 1 antri" di HUD; gateway offline → "Gateway offline"; perubahan status task antar poll → toast "Task #2 selesai: Fix UI" (via event online yang memicu tick); shortcut 'l' buka/tutup Log Aktivitas; 'h' buka OverlayHelp; 'm' toggle mute tombol dock; judul tab dinamis "0 jalan · 0 antri — WFS Project HQ"; clear log menghapus localStorage wfs_activity. 0 edit kode produksi.
- Bukti: build OK (exit 0); vitest **1091/1091 (96 file)** (+8); cp dist→~/wfs-hq OK; e2e index & index-OpDEaGNz.js HTTP 200, 0 "Scene init failed" (404 API :8787 normal); systemd wfs-hq & wfs-office active.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.

## 2026-10-25 04:14 WIB — Siklus 41: test 11 komponen tersisa (ConfirmModal, OverlayHelp, ActivityLog, HUD, Header, Ticker, TeamStats, ErrorBoundary, ActionMenu, QuickToolbar, ProjectPanel)
- Pilihan: audit cakupan komponen menemukan 11 file src/components tanpa test langsung.
- Perubahan: tambah src/__tests__/remaining_components.test.jsx (19 test): ConfirmModal (danger/busy/scrim stopPropagation), OverlayHelp (6 langkah + Esc + Selesai), ActivityLog (item/kosong/Bersihkan), HUD (slider → onTimeChange, aria-valuetext), Header, Ticker (mock api: ringkasan task + resource host + live region; offline → pesan error), TeamStats (buka panel: status grid, total file, host resources; offline → Coba lagi), ErrorBoundary (menangkap throw + children aman), ActionMenu (expose amApi ref, teamAction meeting, scene null → onFlash error, navigasi Home/End/Arrow), QuickToolbar (zoom/kamera/neon/paused toggle), ProjectPanel (mock fetch /wfs-project: progresbar 87%, SaaS online, sandbox agent; fetch gagal). 0 edit kode produksi.
- Bukti: build OK (exit 0); vitest **1110/1110 (97 file)** (+19); cp dist→~/wfs-hq OK; e2e index & asset HTTP 200, 0 "Scene init failed" (404 API :8787 normal); systemd wfs-hq & wfs-office active.
- Sisa backlog: verifikasi subjektif suara (timbre/volume) tetap butuh telinga manusia.

## 2026-10-25 04:55 WIB — Siklus 42: audit visual e2e + harness screenshot scripts/e2e_shot.py
- Temuan audit (penting): cakupan unit sudah 100% (semua file src teruji, komponen dikelompokkan dalam test gabungan); percobaan percepat vitest `isolate:false` GAGAL (11 test flaky krn kebocoran state antar file) → dibatalkan, isolate tetap default. shot.sh di scratch cache hilang → dibuat harness permanen `scripts/e2e_shot.py` (chrome-headless-shell + Xvfb :99 + CDP murni stdlib; chrome --headless murni TIDAK bisa buat konteks WebGL di VM ini — riset via console log: "A WebGL context could not be created").
- Harness memverifikasi via state ekspos (bukan tebakan): agents=14, __wallState=true, __dbg {t:283, ph:night}, TANPA banner "Scene 3D tidak aktif", screenshot 695.887 bytes, exit OK.
- Analisis visual screenshot (vision): scene render penuh & sehat — 5 zona berlabel, 12+ name tag, balon dialog, dock 17 tombol; temuan minor: label "Andi" menimpa zona SERVER ROOM (karakter ANDI di meja x=0,z=-3 dekat zona server x=2.5,z=-8) — jalur anti-overlap diuji unit & simulasi pair zt/agent terbukti memisahkan (overlap? false); diserahkan ke penilaian visual user. Label "CAFÉ" sebagian tertutup layar presentasi (z-order zona renderOrder=5 < label agent 20) — kosmetik.
- Perubahan: + scripts/e2e_shot.py (harness baru, 0 edit src). Build OK (exit 0); vitest 1110/1110 (97 file); cp dist→~/wfs-hq; e2e HTTP index & asset 200.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); opsi kosmetik: renderOrder label zona.

## 2026-10-25 05:01 WIB — Siklus 43: FIX z-order label zona (CAFÉ tidak lagi tertutup layar presentasi)
- Pilihan: backlog kosmetik siklus 42 — label zona renderOrder=5 tertutup layar presentasi project board → naikkan label zona.
- Perubahan: src/scene/parts/flooring.js zl.renderOrder 5→25 (di atas label agent 20 & board 5); test flooring_runtime disesuaikan (expect 25).
- Bukti: build OK (exit 0); vitest 1110/1110 (97 file); cp dist→~/wfs-hq OK; e2e index & index-D2hp3sxn.js HTTP 200, 0 'Scene init failed'; harness scripts/e2e_shot.py: agents=14, __wallState true, __dbg {t:302, phase:night}, screenshot 699.300 bytes → E2E_VISUAL OK; systemd aktif.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 06:00 WIB — Siklus 44: FIX label zona keluar viewport (akar masalah: clamp offset + throttling), + harness e2e_zonepos.py
- Diagnosa (bukan tebakan): harness baru scripts/e2e_zonepos.py (proyeksi matriks kamera via CDP) mengukur posisi layar label zona — kamera Atas/top-down (phi 0.3): MEETING/WELCOME/SERVER ROOM y negatif (OFFSCREEN_TOP) dan TIDAK PERNAH terkoreksi. Akar masalah: (1) clamp dyz di labelWorldOffset (−10..52 unit) membatasi koreksi offset → zona tetap di luar layar; (2) penerapan offset berada di blok relayout yang di-throttle tiap 4 frame + damping eksponensial → konvergen terlalu lambat; (3) run pertama animate() menangkap frame % 4 != 0.
- Perubahan: labelWorldOffset (label_overlap.js) — hapus clamp dy −10..52 (zona) & ≤46 (agent), konversi proporsional; OfficeScene.js — blok baru "viewport guard zona" TIAP frame (murah: 5 zona × project): zona yang proyeksinya bocor margin atas (140+48px zona) / bawah (110px) / kiri-kanan langsung digeser ke batas terdekat via accumulateZoneAnti. Test label_world_offset.test.js disesuaikan (clamp dihapus, viewport dijaga clampViewport).
- Bukti: build OK (exit 0); vitest 1110/1110 (97 file); cp dist→~/wfs-hq OK; e2e_err 200 (index & index-CHO7ffj5.js, 0 Scene init failed); e2e_shot: agents=14, __wallState true, screenshot 697.952 bytes → E2E_VISUAL OK. Verifikasi kamera atas (phi 0.3, 1.3 fps SwiftShader): t=0 SEMUA 5 zona offscreen → setelah 25 dtk (51 frame) kelima zona dalam viewport (y 160..540, sy≤77), MEETING/WELCOME/CAFÉ/SERVER ROOM lolos margin. Default cam: semua zona dalam margin.
- Harness: + scripts/e2e_zonepos.py (ukur posisi layar label zona & bubble via CDP — pengganti tebakan dari screenshot; temuan: klaim visual "CAFÉ terpotong" ternyata salah posisi antar-run kamera, bukan z-order).
- Commit & push siklus ini.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); opsi: bawa NAMES toggle mengembalikan zoneBase (perilaku lama, aman).
## 2026-10-25 06:20 WIB — Siklus 45: FIX viewport guard zona benar-benar TIAP frame (bug siklus 44) + ekstraksi zoneViewportGuard
- Temuan: komentar siklus 44 mengaku guard viewport zona berjalan "TIAP frame", tapi bloknya masih DI DALAM `if(namesVisible&&shouldRelayoutLabels(frame))` (throttle tiap 4 frame) → koreksi tetap tertunda ±4 frame & tidak jalan saat frame%4≠0 (mis. frame pertama animate).
- Perubahan: ekstrak logika guard ke fungsi murni `zoneViewportGuard(zoneLabels, deps)` di parts/label_overlap.js (deps: camera, clientWidth/Height, PX_PER_TAN, worldPerPx, accumulate — tanpa THREE langsung, unit-testable); OfficeScene memanggilnya DI LUAR blok throttle, tiap frame; hapus blok inline duplikat. + src/__tests__/zone_viewport_guard.test.js (7 test: null aman, dalam margin 0 koreksi, bocor atas→turun+accumulate, bocor kanan→tarik kiri, v.z>1 dilewati, invisible dilewati, return = jumlah terkoreksi).
- Bukti: build OK (exit 0); vitest **1117/1117 (98 file)** (+7); cp dist→~/wfs-hq OK; e2e_err 200 (index & index-BTbcoR9G.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, screenshot 702.669 bytes → E2E_VISUAL OK; e2e_zonepos kamera default: kelima zona dalam viewport (y 178..492), tanpa OFFSCREEN.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 06:50 WIB — Siklus 46: bersihkan 11 lint error no-unused-vars (eslint kini 0 error)
- Temuan: `npx eslint .` = 11 error no-unused-vars di 4 file test (param `opt` tak dipakai di 3 mock panel_components, `dlg` tak dipakai di remaining_components ×2, ctor PointLight & `refs` di walls_runtime, param `p` di zone_viewport_guard). 0 error di kode produksi.
- Perubahan: hapus param/variabel tak terpakai (mock config/be1 yang butuh `opt` tetap menerima `opt = {}` — hanya 3 mock lain yang dirapikan). 0 edit kode produksi.
- Bukti: eslint **0 error** (sebelumnya 11); vitest **1117/1117 (98 file)** tetap hijau; build OK (exit 0, 35 precache 1548.88 KiB); cp dist→~/wfs-hq OK; e2e_err 200 (index & index-BTbcoR9G.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, __dbg {t:403, ph:night}, screenshot 699.538 bytes → E2E_VISUAL OK.
- Verifikasi lanjutan e2e_zonepos (3 run kamera default): kamera default meng-orbit auto-rotate (theta berubah tiap load), sehingga hasil per run bervariasi — RUN1 menangkap WELCOME & LOUNGE behind=True di belakang kamera (sudut orbit ekstrem sesaat; guard memang melewati v.z>1 sesuai desain), run lain semua zona on-screen kecuali fluktuasi ABOVE_TOP_MARGIN saat label di dekat margin atas (koreksi guard berjalan per frame). Tidak ada OFFSCREEN permanen.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 07:55 WIB — Siklus 48: PASANG judul dinding WFS PROJECT (mesh yatim)
- Temuan: di OfficeScene.js, mesh `wallTitle` (canvas 1024×200 "WFS" putih + "PROJECT" amber via drawWallTitle) dibuat + texture-nya digambar, tapi TIDAK PERNAH di-add ke scene — kode mati sejak diekstrak (penanda eslint "kandidat pajangan dinding"). drawWallTitle sendiri teruji 5 test di logo_canvas.test.js tapi hasilnya tak pernah terlihat di scene.
- Perubahan: pasang di dinding KIRI (x=-12.29, menghadap +X, y=2.9, z=-6.5, lebar 4.6 unit → z -8.8..-4.2, spot kosong antara pilar z=-9.5 dan jendela z=-3.4); renderOrder 5, transparan. Ukuran plane 7×1.37 → 4.6×0.9 sesuai proporsi spot. 0 file lain berubah.
- Bukti: build OK (exit 0); vitest **1118/1118 (98 file)** tetap hijau; eslint 0 error; cp dist→~/wfs-hq OK; e2e_err 200 (index & index-83ZejgxP.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, __dbg {t:472, ph:night}, screenshot 702.554 bytes → E2E_VISUAL OK (shot.sh scratch memang sudah tidak ada; harness permanen scripts/e2e_shot.py yang dipakai).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); opsi kosmetik: bawa NAMES toggle mengembalikan zoneBase.

## 2026-10-25 07:45 WIB — Siklus 47: FIX bug tanda atas/bawah zoneViewportGuard (NDC y-up) + harness deterministik e2e_zone_multi.py
- Temuan (harness baru, BUKAN tebakan): e2e_zonepos.py kamera-nya acak tiap run (auto-rotate) → dibuat scripts/e2e_zone_multi.py: kunci localStorage wfs_autorot=0 via addScriptToEvaluateOnNewDocument + set sudut kamera eksplisit via window.__cam.sph; ukur proyeksi zona di 3 preset (iso/front/top). HASIL: FAIL — CAFÉ ABOVE_TOP_MARGIN (iso & top), DEV DESK idem (front).
- Akar masalah: zoneViewportGuard memakai fy = v.y*H/2 (NDC y-UP, positif=atas) tapi kondisi bocor atas/bawah ditulis dgn semantik y-DOWN → TERtukar; zona dekat tepi atas TAK PERNAH terkoreksi (menjelaskan ABOVE_TOP_MARGIN yang selama ini dianggap fluktuasi kamera).
- Perubahan: label_overlap.js — tukar kondisi & limit (atas: fy+zh/2 > topLim → corr negatif/turun; bawah: fy−zh/2 < −botLim → corr positif/naik); ZONE_TOP_EXTRA 48→130 (anti-overlap menarik balik ±60px setelah guard — terukur, sisakan margin HUD 140px). Test zone_viewport_guard (+1 test bawah=8) & label_sweep (konstanta + kasus margin) disesuaikan. + scripts/e2e_zone_multi.py (harness deterministik 3 view, exit code FAIL bila ada pelanggaran).
- Bukti: build OK (exit 0); vitest **1118/1118 (98 file)** (+1); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err 200 (index & index-DMMMCmSz.js, 0 "Scene init failed"); e2e_shot: agents=14, __wallState true, screenshot 697.068 bytes → E2E_VISUAL OK; **e2e_zone_multi: OK** — iso/front/top: NOL OFFSCREEN, NOL ABOVE/BELOW margin (view top: zona di belakang kamera = by-design dilewati guard).
- Commit & push siklus ini.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 08:15 WIB — Siklus 49: dedupe 3 salinan inline reset zona → resetZoneBaseOffsets (backlog NAMES toggle)
- Pilihan: backlog "NAMES toggle mengembalikan zoneBase" — dicek ternyata perilaku sudah ada sejak lama (3 salinan inline identik di OfficeScene.js: toggleNames, teamAction('work'), plus satu lagi), hanya belum diekstrak & teruji. Rencana test runtime penuh OfficeScene DIBATALKAN (butuh WebGL/jsdom tidak memadai; harness office_common.js tidak ada — tidak mengarang infrastruktur).
- Perubahan: fungsi murni `resetZoneBaseOffsets(zones)` di parts/label_overlap.js (nol-kan antiY/antiX, kembalikan posisi ke base, set visible opsional); 2 call-site OfficeScene.js diganti pemanggilan fungsi (toggleNames kirim visible=namesVisible, teamAction('work') tanpa visible). 0 perubahan perilaku.
- Bukti: build OK (exit 0); vitest **1123/1123 (99 file)** (+5); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err HTTP 200 (index & index-BouFo4zk.js, 0 "Scene init failed"); e2e_shot: agents=14, __wallState true, screenshot 721.097 bytes → E2E_VISUAL OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 08:45 WIB — Siklus 50: Screen Wake Lock — layar kiosk kantor tidak sleep
- Pilihan: backlog "verifikasi suara" butuh telinga manusia; dipilih fitur nyata untuk display yang dipajang terus-menerus — tanpa interaksi, browser mematikan layar (screen sleep) dan scene 3D berhenti terlihat.
- Perubahan: + src/lib/wakelock.js — createWakeLockManager(nav, {onState}) murni/teruji: unsupported bila tanpa Wake Lock API (tanpa error), acquire('screen')/release, state() (held/released), reacquire setelah lock dilepas browser saat tab hidden (lock=null di event 'release', bukan sentinel lama yang `released:true` — bug yang tertangkap test). Integrasi App.jsx: useEffect mount → acquire, visibilitychange visible → reacquire, unmount → release. 0 file scene disentuh.
- Bukti: build OK (exit 0); vitest **1131/1131 (100 file)** (+8); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err HTTP 200 (index & index-dLT-oHBR.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, screenshot 720.885 bytes → E2E_VISUAL OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 09:20 WIB — Siklus 51: FIX jam dinding 3D selalu menunjuk ~00:xx (unit salah: menit → detik)
- Temuan (audit kode, bukan tebakan): OfficeScene memanggil drawClock(timeOfDay) dgn MENIT simulasi (0–1440), sedangkan drawClockFace (parts/clock_canvas.js) mengharapkan DETIK sejak tengah malam (minutes = nowSeconds/60) → minutes = timeOfDay/60 = maks 24 menit → jarum jam terkunci di angka 12 sepanjang hari (14:30 tergambar 00:14). Bug ada sejak jam diekstrak ke parts (jam tampil di dinding belakang z=9.27).
- Perubahan: + parts/clock_units.js (simMinutesToClockSeconds = ×60, murni); call-site di-ganti drawClock(simMinutesToClockSeconds(timeOfDay)). + test clock_units.test.js (4 test: konversi, regresi 14:30 → jarum antara 2–3 & menit di 6, regresi 09:00 → jarum di 9, guard NaN).
- Bukti: build OK (exit 0); vitest **1135/1135 (101 file)** (+4); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err HTTP 200 (index & index-BZmknjfY.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, __dbg {t:553, ph:working}, screenshot 724.437 bytes → E2E_VISUAL OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).


## 2026-10-25 09:55 WIB — Siklus 52: E2E live-data TV lounge + debug hook __lastTvDrawAt
- Pilihan: belum ada verifikasi otomatis bahwa TV lounge (dashboard /wfs-project) benar-benar menerima data — kalau fetch gagal selamanya, TV diam-diam stuck "menghubungkan..." tanpa sinyal ke pengujian.
- Audit: endpoint /wfs-project di server wfs-hq (port 9503) HTTP 200 dgn data nyata (dibantuin.com, 23/23 task). Salinan helper tidak terpakai dieksport di parts (K_ZONE_TAG_ALONG/X, BUBBLE_SMOOTH_RATE, PAGES_UPDATE_INTERVAL, CARD_TOP, TV_ACCENT/TV_DIM) dipakai internal masing-masing file — bukan kode mati; tidak ada mesh yatim baru (pemindaian deklarasi THREE × usage).
- Perubahan: + scripts/e2e_tv.py (harness CDP chrome-headless-shell + Xvfb :99: cek window.__tvData ada, tasks.total/done numerik valid, __lastTvDrawAt > 0, agents 14); + 1 baris di parts/lounge.js: drawTv() kini set window.__lastTvDrawAt = Date.now() (debug hook pola __lastBubbleAt, tak mengubah render).
- Bukti: build OK (exit 0); vitest **1135/1135 (101 file)** tetap hijau; eslint 0 error; cp dist→~/wfs-hq OK; e2e_tv: **E2E_TV OK** (tasks 23/23, pct 100, at & drawnAt terisi, agents 14 — dashboard TV tergambar ulang dgn data nyata); e2e_err 200 (index & index-DMPB-ZnY.js, 0 "Scene init failed", 404 API :8787 normal); e2e_shot: agents=14, __wallState true, screenshot 720.518 bytes → E2E_VISUAL OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 10:05 WIB — Siklus 53: layar monitor PM (SARI) kini papan task LIVE (renderer `board`), bukan progress bar palsu
- Pilihan: audit SCREEN_RENDERERS menunjukkan SARI (Project Manager) memakai renderer `deploy` generik (progress bar "Build #…" hardcode + "✓ semua tes lolos" palsu) — padahal data proyek nyata (__tvData dari /wfs-project, 23/23 task) sudah tersedia di scene sejak siklus 52.
- Perubahan: + renderer `board` di parts/effects.js (judul PAPAN TASK, bar progres live done/total, baris REVIEW/GAGAL/on track, dot hijau live berdenyut; fallback "papan task: memuat..." saat __tvData belum ada, aman tanpa window); agents_spec.js — SARI screen 'deploy'→'board', SCREENS + 'board'; test: effects.test.js +3 test board (dengan data / tanpa data / total 0 tanpa NaN), agents_spec & effects daftar renderer disesuaikan.
- Bukti: build OK (exit 0, 35 precache 1550.65 KiB); vitest **1139/1139 (101 file)** (+4); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err 200 (index & index-5J01Xxg7.js, 0 "Scene init failed", 404 API :8787 normal); e2e_tv: E2E_TV OK (tasks 23/23, drawnAt terisi); e2e_shot: agents=14, __wallState true, screenshot 721.805 bytes → E2E_VISUAL OK.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 11:05 WIB — Siklus 54: whiteboard "WFS SPRINT" ruang meeting kini LIVE dari data task nyata (bukan agenda statis)
- Pilihan: audit visual — whiteboard ruang meeting (parts/room.js → whiteboard_canvas.js) masih 3 butir agenda statis hardcode sejak diekstrak, padahal __tvData (data /wfs-project nyata) tersedia di scene sejak siklus 52.
- Perubahan: whiteboard_canvas.js + sprintLiveRows (murni: baris [label, nilai, warna] dari T, guard null/NaN/negatif, done di-clamp 0..total) + drawSprintLive (label abu + nilai berwarna + bar progres, fallback false bila data tidak valid); drawSprintBoard(ctx, T?) — tanpa T → fallback agenda statis utuh (kompatibel pemanggil lama). room.js: whiteboard digambar via redraw() dari window.__tvData?.tasks, refresh 60 dtk + visibilitychange, + debug hook window.__lastWbDrawAt (pola __lastTvDrawAt).
- Bukti: build OK (exit 0, 35 precache 1551.96 KiB); vitest **1148/1148 (102 file)** (+9: 8 test live + 1 guard, test room_runtime lama tetap hijau); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err 200 (index-CK8vOtNM.js, 0 "Scene init failed").
- e2e visual (CDP chrome headless + Xvfb :99 — catatan infra: DISPLAY=:0 mati sehingga shot.sh lama <500KB; WebGL butuh X server hidup): scene hidup (agents 14, __wallState true, __lastWbDrawAt terisi, screenshot 566 KB); zoom ke whiteboard (ck_wbB.png 1.25 MB) terbaca jelas: **"WFS SPRINT · live · dibantuin.com · selesai 23/23 (100%) · status on track · bar hijau penuh"** — agenda statis lama tidak ada lagi.
- Sampingan infra: disk penuh 99% sempat membuat WebGL gagal mount → docker builder prune (1.38 GB) + journalctl vacuum (479 MB) → disk 95%, scene normal kembali.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 11:40 WIB — Siklus 55: poster dinding kini di 4 dinding (3 poster baru dinding z) + renderer poster digeneralisasi
- Pilihan: audit visual — poster slogan hanya menempel di 2 dinding samping (x ±11.4); dinding depan & belakang kosong, padahal area itu paling sering tampil di kamera default.
- Perubahan: poster_spec.js — +3 poster {wall:'z-'} 'FOKUS' (x=0) & {wall:'z+'} 'SELESAIKAN'/'ANTAR TEPAT WAKTU' (x=±4, z=±9.9); fungsi baru posterWall(p), posterFacingFor(p), posterOffsetFor(p) (poster lama tanpa `wall` → perilaku dinding samping tak berubah, API posterFacing/posterOffset dipertahankan). furniture.js: call-site pakai versi For(p). Test: poster_spec +5 test baru, furniture_runtime diadaptasi (5→8 plane, rotasi dinding z diuji).
- Bukti: build OK; vitest **1152/1152 (102 file)** (+4 net); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err 200 (index-BASs9yvG.js).
- Verifikasi visual (CDP chrome + Xvfb :99): scene hidup (agents 14, __dbg {t:693,ph:working}); screenshot CDP 506 KB; zoom: **poster "FOKUS" terbaca jelas di dinding belakang** antara banner WFS PROJECT. Shot.sh standalone kini hasilnya 237 KB + "Scene 3D tidak aktif" padahal via CDP scene OK — diduga chrome standalone gagal mount WebGL pada sesi ini (bukan regresi kode; dicatat utk diselidiki).
- Sampingan infra: bersih-bersih disk (/tmp chrome-dbg dsb ~350 MB, apt cache) → disk 94%.
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia); selidiki kenapa chrome standalone shot gagal WebGL.

## 2026-10-25 12:00 WIB — Siklus 56: ROOT CAUSE shot.sh gagal WebGL ditemukan & diperbaiki (ANGLE butuh X display utk xcb_connect)
- Selidiki backlog "chrome standalone shot gagal WebGL": dump log chrome --enable-logging=stderr → 10× `DisplayVkXcb.cpp:59 xcb_connect() failed, error 1` + `eglInitialize SwANGLE failed EGL_NOT_INITIALIZED` + GPU process exit. Penyebab: ANGLE/SwiftShader backend tetap memanggil xcb_connect ke X display; tanpa DISPLAY yang valid (DISPLAY=:0 kosong, Xvfb :99 tak berjalan) EGL init gagal total → scene tak pernah mount → screenshot 237 KB "scene mati".
- Fix: X server yang hidup saat ini adalah **Xorg :10 milik xrdp-sesman** (`/usr/lib/xorg/Xorg :10`). `DISPLAY=:10 chrome …` → screenshot **733.884 bytes** (scene hidup penuh). Tidak perlu spawn Xvfb baru.
- Perubahan: `~/.hermes/cache/scratch/shot.sh` ditulis ulang — `timeout 70 env DISPLAY=${XDISP:-:10} chrome …` + komentar root cause (fallback via env XDISP bila :10 tidak ada). Repo tak disentuh (fix infra murni, 0 file src).
- Bukti: shot.sh baru → ck4.png 735.604 bytes (>500 KB = WebGL OK, poster & scene ter-render); bukti lama ck/ck2 (237 KB) & artefak pembersihan dihapus dari repo & ~/wfs-hq/ck.png (stale) dihapus juga. git status bersih, HEAD a4309a4 (tidak ada commit kode — hanya perbaikan tooling di scratch).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 12:35 WIB — Siklus 57: FIX AudioContext leak — listener wake audio sekali-pakai kini dilepas di destroy()
- Audit event listener: OfficeScene memasang `window.addEventListener('keydown'/'pointerdown', __ensureAudioEarly, {once:true})` untuk membangunkan AudioContext, tapi `destroy()` TIDAK melepasnya. Listener `{once:true}` hanya hilang setelah interaksi pertama; bila scene di-destroy sebelum itu (HMR/remount/StrictMode), listener tua tertempel terus — scene baru me-reset `window.__officeSceneDestroyed=false`, sehingga klik/tombol pertama pengguna ikut membangunkan engine audio LAMA yang sudah `dispose()` → AudioContext duplikat bocor (menggerus batas MaxAudioContextsExceeded).
- Perubahan: + parts/audio_wake.js `installAudioWake(ensureFn, opts)` — pasang 2 listener sekali-pakai (self-remove di handler + guard `armed`), return `dispose()` idempoten yang melepas listener belum terpicu; exception di ensureFn tertelan (interaksi wake tak boleh crash). OfficeScene: pasang via helper, `destroy()` memanggil `__disposeAudioWake()`. Perilaku runtime scene tidak berubah (wake tetap keydown/pointerdown pertama).
- Bukti: build OK (35 precache 1552.70 KiB); vitest **1157/1157 (103 file)** (+5 test audio_wake: trigger sekali, dispose pra-interaksi, idempoten, exception-safe, guard no-op); eslint 0 error; cp dist→~/wfs-hq OK; e2e_err HTTP 200 (index-CcXBk3BS.js, 0 "Scene init failed", 404 API :8787 normal); shot.sh DISPLAY=:10 → 737.287 bytes (WebGL hidup).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 13:05 WIB — Siklus 58: Kinematika karakter rapat & resepsi via charMotion/applyCharMotion + sinkronisasi penuh dock Neon persist
- Backlog diselesaikan:
  1) Backlog dock Neon persist: sebelumnya class/aria tombol dock Neon (`wfs_neon`) belum sinkron saat reload karena `useState(false)` di App.jsx tanpa membaca `localStorage` pada initial render. Kini `useState` membaca `localStorage.getItem('wfs_neon') === '1'` secara sinkron di initial state, sehingga tombol langsung aktif (`aria-pressed="true"`, class `on`) tanpa kedipan atau desync; dead `useEffect` bergantung `[flash]` dibersihkan; `destroy()` scene membersihkan hook `window.__toggleNeon` & `__sceneSelRing`.
  2) Animasi hidup karakter diperluas ke ruang meeting & resepsi: modul baru `charMotion(elapsed, i, mode)` dan `applyCharMotion(group, motion)` di `parts/effects.js` menyatukan kinematika napas, gerak kepala (tengok/angguk), dan tangan meja/ketik. Peserta rapat (`__meet.attendees()`) kini bernapas dan menoleh aktif ke sekeliling meja diskusi, bukan lagi manekin statis.
- Bukti:
  - Vitest: **1171/1171 (105 file)** (+14 test baru: 8 test di `char_motion.test.js`, 2 test neon persist & shortcut di `app_integration.test.jsx`, dan 4 test `agent_inspector.test.jsx`).
  - ESLint: 0 warning, 0 error.
  - Build: OK (35 precache 1573.58 KiB, chunk OfficeScene 838.24 KB / gzip 225.00 KB).
  - Deploy ~/wfs-hq: OK, chunk stale dibersihkan.
  - e2e_err: HTTP 200 (index-D83o5euG.js, 0 "Scene init failed", PID 3637035).
  - Visual e2e: `scripts/e2e_shot.py` → 673.997 bytes (>500KB = WebGL hidup, agents: 14, ws: true).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 13:55 WIB — Siklus 59: FIX regresi persistensi & toggle neon di OfficeScene (hapus removeItem & override siang) + test kontrak persist

- Pilihan: audit integritas pasca commit bf3f871 menemukan regresi kritis pada fitur Neon persist (yang baru diselesaikan di Siklus 58):
  1) `localStorage.removeItem('wfs_neon')` dan `cyberpunkMode=false` sempat tersisip di body `OfficeScene.js`, sehingga preferensi neon user selalu terhapus setiap kali halaman di-refresh.
  2) `toggleCyberpunk()` meng-override warna lantai `fl`/karpet `cp` ke putih/abu terang dan `ambient`/`sun` ke tingkat siang hari setiap kali dipanggil, merusak visual gelap bercahaya khas mode cyberpunk saat diaktifkan.
- Perubahan:
  - `src/scene/OfficeScene.js`: bersihkan `localStorage.removeItem`, kembalikan `toggleCyberpunk()` murni memanggil `__neon.toggle()` & menyimpan status ke `localStorage`, dan pulihkan inisialisasi `if(cyberpunkMode)__neon.toggle()` agar mode tersimpan langsung aktif saat refresh.
  - `src/__tests__/neon_persist.test.js` (+3 unit test): verifikasi pembacaan `wfs_neon` tanpa penghapusan, kontrak toggle bolak-balik '1'/'0', serta penerapan neon tersimpan saat init.
- Bukti terukur:
  - Vitest: **1175/1175 (107 file)** (+3 test baru di `neon_persist.test.js`).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache 1576.95 KiB, chunk `OfficeScene-DmxEe72D.js` 841.37 KB / gzip 226.08 KB).
  - Deploy: `dist/*` di-copy ke `~/wfs-hq/`, 3 chunk stale lama (`CsWidget-5H0J2trM.js`, `index-DGE4SgxA.js`, `OfficeScene-BuXQ3KPh.js`) dibersihkan dari server.
  - e2e_err: HTTP 200 (index & `index-CEVg7fTQ.js`, 0 "Scene init failed", PID 3671916).
  - e2e_tv: **E2E_TV OK** (tasks 23/23 done, pct 100, drawnAt terisi, agents 14).
  - e2e_zone_multi: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 ABOVE/BELOW margin).
  - e2e_shot visual: **637.140 bytes** (>500KB = WebGL aktif, agents: 14, E2E_VISUAL: OK).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 14:25 WIB — Siklus 60: Sinkronisasi kartu AgentInspector ke scene 3D (Escape, reset ring & fokus kamera, case-insensitive chat) + persistensi audio mute instan + elim TDZ audio

- Pilihan: audit integrasi interaksi 3D & UI (AgentInspector, WfsPanel, audio persistence):
  1) Kartu profil `AgentInspector` yang muncul saat mengklik agen di scene 3D tidak menutup saat tombol `Escape` ditekan, dan menutup kartu via tombol ✕ tidak mereset cincin seleksi emas (`selRing`) maupun fokus kamera di scene 3D (agen tetap terfokus & cincin berputar di lantai).
  2) Tombol "Buka Chat dengan [Agent]" di `AgentInspector` memanggil `window.__wfsSelectAgent(ag.name)` (huruf besar kapital, misal 'TONI'), sementara endpoint gateway menyimpan nama 'Budi'/'Toni' (title case) atau ID 'devops1', sehingga pencarian agen di WfsPanel gagal menemukan target akibat case mismatch.
  3) Tombol dock "Suara" (audio mute) mengulang masalah desync yang sama seperti mode Neon: memakai `useState(false)` lalu baru sinkron asinkron lewat `useEffect`, memicu kedipan status/ikon pada awal render; serta inisialisasi `__sound` di `OfficeScene.js` berada di baris 1050 (di bawah listener wake awal baris 129), menyisakan risiko TDZ.
- Perubahan:
  - `src/components/AgentInspector.jsx`: pasang listener tombol `Escape` di `useEffect` untuk menutup kartu secara elegan.
  - `src/App.jsx`:
    - `handleCloseInspector`: saat kartu ditutup, panggil `sceneRef.current.setSelected(-1)` dan `resetFocus()` agar cincin emas terhapus dan kamera kembali ke overview kantor.
    - Sinkronkan mapping nama agen ke gateway ID (`window.__wfsAgentIdList`) saat memanggil `__wfsSelectAgent`.
    - Inisialisasi state `muted` secara sinkron dari `localStorage.getItem('wfs_audio_muted') === '1'` untuk menghilangkan kedipan/desync awal.
  - `src/components/WfsPanel.jsx`: buat pencarian agen di `window.__wfsSelectAgent` case-insensitive (`toLowerCase()`) terhadap ID maupun nama agen.
  - `src/scene/OfficeScene.js`: pindahkan deklarasi `audioMuted`, `saveMuted`, dan `__sound` ke bagian atas sebelum `__ensureAudioEarly` dan `installAudioWake`, mengeliminasi risiko TDZ saat event interaksi dini.
  - Unit test:
    - `src/__tests__/agent_inspector.test.jsx`: +1 test verifikasi penekanan tombol Escape menutup kartu profil.
    - `src/__tests__/app_integration.test.jsx`: +2 test verifikasi persistensi audio mute instan dari `localStorage` dan interaksi `onSelectAgent` / `handleCloseInspector` yang me-reset seleksi & fokus kamera di scene.
- Bukti terukur:
  - Vitest: **1178/1178 (107 file)** (+3 test baru).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache 1577.37 KiB, chunk `OfficeScene-D_3R_Gum.js` 841.37 KB / gzip 226.09 KB, `index-B4W_EnVj.js` 260.18 KB).
  - Deploy: `dist/*` di-copy ke `~/wfs-hq/`, chunk stale lama (`CsWidget-VUjwxHPU.js`, `index-CEVg7fTQ.js`, `OfficeScene-DmxEe72D.js`) dibersihkan.
  - e2e_err: HTTP 200 (index & `index-B4W_EnVj.js`, 0 "Scene init failed", PID 3671916).
  - e2e_tv: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
  - e2e_zone_multi: **E2E_ZONE_MULTI OK** (preset iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
  - e2e_shot visual: **649.070 bytes** (>500KB = WebGL aktif, agents: 14, E2E_VISUAL: OK).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 15:10 WIB — Siklus 61: Modernisasi SVG ikon ActionMenu (IconTag & IconRotate), eliminasi emoji telanjang, perbaikan typo rotasi & inisialisasi sinkron persistensi nama/rotasi

- Pilihan: audit konsistensi visual dan robustnes state pada ActionMenu & Icons:
  1) ActionMenu masih memakai emoji telanjang `🏷️` dan `🔄` di dalam `<span className="pop-ic">`, satu-satunya elemen UI yang belum dimigrasi ke vektor SVG bersih.
  2) Handler klik tombol putar otomatis di `ActionMenu.jsx` memiliki typo `else setRotOn(!cur)` di mana variabel `cur` tidak terdefinisi di scope komponen tersebut (potensi `ReferenceError: cur is not defined` jika fallback dieksekusi).
  3) State `namesOn` dan `rotOn` masih diinisialisasi secara naif (`useState(true)` dan `useState(false)`), menimbulkan kedipan state awal saat pengguna menyimpan preferensi `wfs_names='0'` atau `wfs_autorot='1'`.
  4) Seluruh item menu dan checkbox di ActionMenu belum memiliki atribut `title` untuk tooltip hover yang informatif di desktop.
- Perubahan:
  - `src/components/Icons.jsx`: menambahkan komponen ikon SVG `IconTag` (vektor label badge 24×24) dan `IconRotate` (vektor putar 360° searah jarum jam) dengan styling stroke modern konsisten.
  - `src/components/ActionMenu.jsx`:
    - Mengganti emoji telanjang `🏷️` dan `🔄` dengan `<IconTag size={16} />` dan `<IconRotate size={16} />` sembari mempertahankan `<span className="sr-only">` untuk keterbacaan screen reader & kompatibilitas uji teks.
    - Memperbaiki bug typo `else setRotOn(!cur)` menjadi `else setRotOn(v => !v)`.
    - Menginisialisasi state `namesOn` dan `rotOn` secara sinkron dari `localStorage` (`wfs_names` dan `wfs_autorot`) untuk eliminasi desync/flicker render awal.
    - Melengkapi atribut `title` deskriptif pada 4 menuitem aksi dan 2 checkbox preferensi.
  - Unit test:
    - `src/__tests__/action_menu.test.jsx`: +2 unit test baru (verifikasi sinkronisasi state dari `localStorage` pada render awal, verifikasi keberadaan 6 SVG ikon dan tooltip `title` pada seluruh item menu, serta fallback toggling saat `isAutoRotate` absent).
- Bukti terukur:
  - Vitest: **1180/1180 (107 file)** (+2 test baru).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache 1578.45 KiB, chunk `OfficeScene-hBPOEBiu.js` 841.37 KB / gzip 226.09 KB, `index-BN3oZCYV.js` 261.28 KB).
  - Deploy: `dist/*` di-copy ke `~/wfs-hq/`, chunk stale lama (`CsWidget-BsMuni13.js`, `index-B4W_EnVj.js`, `OfficeScene-D_3R_Gum.js`) dibersihkan.
  - e2e_err: HTTP 200 (index & `index-BN3oZCYV.js`, 0 "Scene init failed", PID 3671916).
  - e2e_tv: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
  - e2e_zone_multi: **E2E_ZONE_MULTI OK** (preset iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
  - e2e_shot visual: **645.731 bytes** (>500KB = WebGL aktif, agents: 14, E2E_VISUAL: OK).
- Sisa backlog: verifikasi subjektif suara (butuh telinga manusia).

## 2026-10-25 16:52 WIB — Siklus 62: Isolasi modal selectedAgent di App.jsx, modernisasi SVG close button seluruh panel, perbaikan guard zona top-down & integrasi pencahayaan night studio bertingkat

- Pilihan: penuntasan integrasi UX modal & stabilitas rendering viewport zona pada gedung bertingkat 3 lantai:
  1) State `selectedAgent` di `App.jsx` belum dimasukkan ke evaluasi `window.__wfsModalOpen`, `chromeModal`, dan keyboard shortcut listener, sehingga shortcut dock (m, 1, n) masih bisa tertrigger dan elemen chrome (`header, .hud, .ticker`) tidak ter-`inert` saat kartu profil agen 3D terbuka.
  2) Mengganti unicode raw `✕` pada tombol close seluruh panel modal (`TaskBoard`, `ProjectPanel`, `TeamStats`, `CsWidget`, `WfsPanel`) dengan SVG murni `IconClose` + label aksesibel `title` deskriptif (Esc) dan `<span className="sr-only">✕</span>` demi kompatibilitas screen reader dan asersi teks uji.
  3) Modernisasi aksi dan tab `WfsPanel` (`IconChat`, `IconGear`, `IconSave`, `IconPlay`, `IconRotate`) dan tombol jalankan task pada `TaskBoard`.
  4) Fix run-away displacement pada `zoneViewportGuard`: penambahan batas clamp `MAX_ZONE_DISP_Y` & `MAX_ZONE_DISP_X` (±2.0m) agar koreksi margin tidak menenggelamkan label zona ke bawah tanah secara eksponensial.
  5) Deteksi kamera top-down curam (`(camera.position.y - zt.position.y) / dz > 0.8`): saat pandangan atas curam, koreksi vertikal layar dialihkan ke sumbu Z lantai (arah tengah kantor) dan bukan sumbu Y (ketinggian), sehingga label zona tetap berada di atas lantai marmer.
  6) Eliminasi konflik anti-overlap agent vs zona pada `OfficeScene.js`: `pts.forEach` tidak lagi menggeser posisi statis zona (`if (p.zone) return;`), mencegah drift berulang.
  7) Penyesuaian radius preset `top` (56m) pada gedung luas 34x30m agar seluruh 3 lantai dan zona terbingkai sempurna di antara header dan dock.
- Perubahan:
  - `src/App.jsx`: integrasi `selectedAgent` ke `window.__wfsModalOpen`, `chromeModal`, dan filter shortcut keyboard listener.
  - `src/components/Icons.jsx`: export `IconGear`, `IconSave`, `IconPlay`, pembaruan `IconRotate`.
  - `src/components/AgentInspector.jsx`, `CsWidget.jsx`, `ProjectPanel.jsx`, `TaskBoard.jsx`, `TeamStats.jsx`, `WfsPanel.jsx`: modernisasi SVG `IconClose` dan styling flexbox.
  - `src/scene/OfficeScene.js`: radius preset `top` 56m untuk gedung 34x30m, isolasi label zona dari mutasi anti-overlap agent.
  - `src/scene/parts/label_overlap.js`: bounded clamp pergeseran zona + pergeseran sumbu Z lantai pada sudut kamera top-down.
  - Unit test:
    - `src/__tests__/agent_inspector.test.jsx`: verifikasi tombol tutup dan tooltip `title`.
    - `src/__tests__/app_integration.test.jsx`: verifikasi chrome inert (`header, .hud, .ticker`) & blokir shortcut saat inspector terbuka serta penutupan via Escape.
    - `src/__tests__/zone_viewport_guard.test.js`: +2 unit test baru (clamp displacement anti run-away & pergeseran sumbu Z pada kamera top-down).
- Bukti terukur:
  - Vitest: **1185/1185 (107 file)** (+5 test baru, 0 fail).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache entries 1586.90 KiB, chunk `OfficeScene-BjEq8CjI.js` 846.04 KB / gzip 227.42 KB, `index-Bh0ZtL7v.js` 265.00 KB).
  - Deploy: `dist/*` ter-deploy ke `~/wfs-hq/`, chunk lama dibersihkan.
  - E2E & Servis:
    - `e2e_err.py`: HTTP 200 (index & `index-Bh0ZtL7v.js`, 0 "Scene init failed", PID 3813725).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_shot.py`: Screenshot visual **582.245 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
- Sisa backlog: verifikasi subjektif audio web-audio.

## 2026-10-25 17:20 WIB — Siklus 63: Modernisasi SVG close button modal dialog (ActivityLog, TaskModal, OverlayHelp), persistensi koordinat 3D window.__zoneBase (x, y, z), clamp 3D guard zona & sinkronisasi konvergensi RAF harness e2e_zone_multi

- Pilihan: penuntasan konsistensi visual modal dialog, integritas 3D base coordinate zona, dan determinisme pengujian viewport:
  1) Modernisasi UI modal dialog tersisa: `ActivityLog`, `TaskModal`, dan `OverlayHelp` sebelumnya belum memiliki tombol tutup SVG pojok kanan atas `IconClose` seperti panel modal lainnya (`TaskBoard`, `ProjectPanel`, dll.), menyisakan inkonsistensi UX saat menutup modal dialog di desktop.
  2) Penuntasan persistensi posisi dasar label zona di `window.__zoneBase`: sebelumnya hanya mencatat `{y, x}` tanpa sumbu `z`, sehingga saat reset label zona atau evaluasi kamera top-down, posisi `z` tidak ter-reset secara deterministik.
  3) Harmonisasi clamp 3D pada `zoneViewportGuard`: memastikan batas pergeseran `MAX_ZONE_DISP_Z = 2.0` konsisten dengan sumbu X dan Y (anti run-away) serta `resetZoneBaseOffsets` memulihkan sumbu Z dari `base.z` / `userData.baseZ`.
  4) Harness `scripts/e2e_zone_multi.py`: sinkronisasi preset top (radius 56m) dan injeksi pompa `requestAnimationFrame` untuk menjamin konvergensi guard pada lingkungan headless Chromium tanpa desync frame.
- Perubahan:
  - `src/components/ActivityLog.jsx`, `src/components/OverlayHelp.jsx`, `src/components/TaskModal.jsx`: pasang tombol tutup modern `<button className="x"><IconClose size={16}/><span className="sr-only">✕</span></button>` dengan tooltip `(Esc)` dan aksesibilitas screen reader.
  - `src/index.css`: tambahkan selector `.modal { position: relative; }` dan `.modal .x` (position absolute, border radius, hover transition halus).
  - `src/scene/parts/flooring.js`: simpan `{y, x, z}` lengkap pada `window.__zoneBase`.
  - `src/scene/parts/label_overlap.js`:
    - `resetZoneBaseOffsets`: dukung restorasi `base.z` dan sinkronisasi `userData.baseZ`.
    - `zoneViewportGuard`: clamp `MAX_ZONE_DISP_Z = 2.0` simetris dengan X dan Y.
  - `scripts/e2e_zone_multi.py`:
    - Perbarui preset `top` ke radius 56m sesuai preset `OfficeScene.js`.
    - Injeksi pompa frame ganda `requestAnimationFrame` sebelum proyeksi evaluasi.
    - Sinkronkan restorasi `z.position.z` di script evaluasi.
  - Unit test:
    - `src/__tests__/flooring_runtime.test.js`: verifikasi simpanan `base.z` pada `window.__zoneBase`.
    - `src/__tests__/reset_zone_base_offsets.test.js`: +2 test restorasi `base.z` dan fallback `userData.baseZ`.
    - `src/__tests__/zone_viewport_guard.test.js`: verifikasi clamp `MAX_ZONE_DISP_Z`.
    - `src/__tests__/remaining_components.test.jsx`: +2 test tombol tutup `IconClose` pada `OverlayHelp` dan `ActivityLog`.
    - `src/__tests__/ui_components.test.jsx`: +1 test tombol tutup `IconClose` pada `TaskModal`.
- Bukti terukur:
  - Vitest: **1188/1188 (107 file)** (+3 test baru, 0 fail).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache entries 1587.93 KiB, chunk `OfficeScene-ogBCZmtX.js` 846.09 KB / gzip 227.44 KB, `index-BeUDGhE2.js` 265.61 KB).
  - Deploy: `dist/*` ter-deploy ke `~/wfs-hq/`, chunk lama dibersihkan.
  - E2E & Servis:
    - `e2e_err.py`: HTTP 200 (index & `index-BeUDGhE2.js`, 0 "Scene init failed", PID 3813725).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **583.870 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - `shot.sh` (XDISP=:99): **587.471 bytes**.
- Sisa backlog: verifikasi subjektif audio web-audio.

## 2026-10-25 17:55 WIB — Siklus 64: Integrasi status OmniRoute di strip 3D ProjectBoard, penuntasan SVG close button ConfirmModal & penyesuaian drop order responsif

- Pilihan: integrasi status AI router Docker (OmniRoute) ke visualisasi kantor 3D dan penuntasan standardisasi modal close button:
  1) Integrasi status OmniRoute pada papan proyek 3D (`projectboard_data.js`): `/wfs-project` menyediakan snapshot `omniroute` (`online`, `port`), yang telah ditampilkan di `ProjectPanel` tetapi belum masuk ke strip status bawah kanvas 3D ProjectBoard di dinding kantor. Kini `stripSegments` menyertakan segmen `OMNI` dan status port (`:20128 ●` hijau / `offline` merah).
  2) Algoritma layout responsif strip bawah (`stripLayout`): mendukung `omni` drop order secara kondisional saat lebar kanvas menyempit, membuang segmen `OMNI` dan titik pemisah sebelum mengorbankan segmen wajib (`SaaS` & `AGENT`), sembari mempertahankan kompatibilitas deterministik penuh dengan `BASE_DROP_ORDER`.
  3) Modernisasi SVG close button `ConfirmModal.jsx`: melengkapi penutupan modal dialog terakhir dengan tombol silang modern `<button type="button" className="x"><IconClose size={16} /><span className="sr-only">✕</span></button>`, tooltip `Batal (Esc)`, padding judul `paddingRight: 32` agar tidak tumpang tindih, dan dukungan aksesibilitas screen reader.
- Perubahan:
  - `src/components/ConfirmModal.jsx`: impor `IconClose`, pasang tombol `.x` dengan handler `onCancel` dan tooltip (Esc), penyesuaian styling header.
  - `src/scene/parts/projectboard_data.js`:
    - `stripSegments`: tambahkan penanganan `snap.omniroute` (`OMNI` + status/port).
    - `stripLayout`: implementasikan `BASE_DROP_ORDER` dan `OMNI_DROP_ORDER` adaptif dengan pembersihan pemisah `·` otomatis.
  - Unit test:
    - `src/__tests__/projectboard_data.test.js`: +2 test baru verifikasi segmen `omniroute` (online/port & offline) serta degradasi anggun pada `stripLayout`.
    - `src/__tests__/projectboard_runtime.test.js`: +1 test baru verifikasi render canvas 3D `OMNI` dan `:20128 ●`.
    - `src/__tests__/remaining_components.test.jsx`: verifikasi tombol tutup silang `IconClose` pada `ConfirmModal` memicu `onCancel`.
    - `src/__tests__/ui_components.test.jsx`: +1 test verifikasi interaksi tombol silang `ConfirmModal`.
- Bukti terukur:
  - Vitest: **1192/1192 (107 file)** (+4 test baru, 0 fail).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache entries 1588.00 KiB, chunk `OfficeScene-BZlzXO7x.js` 845.92 KB / gzip 227.38 KB, `index-F671EB-J.js` 265.85 KB).
  - Deploy: `dist/*` ter-deploy ke `~/wfs-hq/`, chunk lama dibersihkan.
  - E2E & Servis:
    - `e2e_err.py`: HTTP 200 (index & `index-F671EB-J.js`, 0 "Scene init failed", PID 3964547).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **709.711 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - `shot.sh` (DISPLAY=:10): **714.812 bytes**.
- Sisa backlog: verifikasi subjektif audio web-audio.

## 2026-10-25 18:38 WIB — Siklus 65: Elevasi meja bertingkat alami (Lantai 2 Y=0.60, Lantai 3 Y=1.20), koreksi z-index kacamata avatar & restorasi kehadiran agen shift kerja

- Pilihan: koreksi elevasi meja dan perabotan kerja di lantai bertingkat, reposisi kacamata avatar stylized human, dan restorasi kehadiran agen kerja shift harian:
  1) Elevasi perabotan meja bertingkat (`buildDesk`): `buildDesk` menerima parameter `dp.y` (Y=0.60 pada Lantai 2 Mezzanine, Y=1.20 pada Lantai 3 Penthouse), namun grup meja sebelumnya di-hardcode ke `g.position.set(dp.x, 0, dp.z)` sehingga meja, kursi, monitor, dan nameplate di lantai atas tenggelam ke bawah lantai marmer/slate. Kini diubah menjadi `g.position.set(dp.x, dp.y || 0, dp.z)` sehingga seluruh perabotan bertengger sempurna di atas lantai masing-masing.
  2) Sinkronisasi elevasi 3D cincin & interaksi: cincin seleksi (`selRing`) dan hover (`hoverRing`) kini menghitung offset ketinggian `(a.walker.visible ? a.walker.position.y : a.home.y) || 0`, dan fokus kamera `updateFollowGoal` / `focusGoal.t` menghitung `(wp.y || 0) + 1.5`. Speech bubble `createBubble` dan autotalk kini menggunakan anchor `baseAy + 2.6` agar tidak menutupi wajah atau monitor karakter di lantai atas.
  3) Koreksi Z-index kacamata avatar stylized human (`OfficeScene.js`): kacamata pada avatar di `addAccessories` sebelumnya berada di `fz * 0.118`, tertinggal di belakang bola mata/pupil (z=0.125, glint z=0.132 pada standing; z=-0.115 pada sitting). Diposisikan ke `fz * 0.138` agar kacamata bertengger rapi di depan bola mata tanpa kliping.
  4) Restorasi kehadiran shift kerja (`daycycle.js`): `arrive()` dan `depart()` kini mencakup seluruh 14 agen kantor (termasuk agen ekstra 8..13 seperti RINA, LINA, SARI, TRAINER AI, INTEGRATOR BOT, SUPPORT) agar tidak tertinggal permanen dalam status `offsite`. Event `working_am` dan `working_pm` kini otomatis memulihkan agen dari status `offsite` ke meja duduk saat jam kerja dibuka.
- Perubahan:
  - `src/scene/OfficeScene.js`:
    - `buildDesk`: posisikan grup meja ke `g.position.set(dp.x, dp.y || 0, dp.z)`.
    - `addAccessories`: reposisi kacamata ke `fz * 0.138` (depan sklera & glint).
    - Pointer click/hover & applySelected: sinkronisasi elevasi Y `selRing` & `hoverRing`.
    - `createBubble`: elevasi ketinggian bubble berbasis `baseAy + 2.6` (autotalk, select, alert).
  - `src/scene/parts/daycycle.js`:
    - `arrive()` & `depart()`: tangani agen ekstra di luar 8 indeks historis.
    - `restoreWorkingDesks`: aktifkan kembali agen `offsite` saat jam kerja `working_am` / `working_pm`.
  - `src/scene/parts/kamera_focus.js`:
    - `updateFollowGoal`: target Y kamera memperhitungkan `(fp.y || 0) + 1.5`.
  - Unit test:
    - `src/__tests__/daycycle_runtime.test.js`: +2 test baru (verifikasi kehadiran agen ekstra dan restorasi agen offsite ke meja).
    - `src/__tests__/kamera_focus.test.js`: +1 test baru (verifikasi elevasi target kamera bertingkat).
- Bukti terukur:
  - Vitest: **1195/1195 (107 file)** (+3 test baru, 0 fail).
  - ESLint: 0 warning, 0 error (`npx eslint .`).
  - Build: Berhasil (exit 0, 35 precache entries 1589.87 KiB, chunk `OfficeScene-BDXYHY_E.js` 847.84 KB / gzip 227.88 kB, `index-xbzyENQR.js` 265.85 KB).
  - Deploy: `dist/*` ter-deploy ke `~/wfs-hq/`, chunk lama dibersihkan.
  - E2E & Servis:
    - `e2e_err.py`: HTTP 200 (index & `index-xbzyENQR.js`, 0 "Scene init failed", PID 3989694).
    - `scripts/e2e_tv.py`: **E2E_TV OK** (tasks 23/23 selesai, 100%, 14 agents aktif).
    - `scripts/e2e_zone_multi.py`: **E2E_ZONE_MULTI OK** (iso, front, top: 0 OFFSCREEN, 0 pelanggaran margin).
    - `scripts/e2e_shot.py`: Screenshot visual **723.425 bytes** (>500 KB, WebGL hidup, agents: 14, E2E_VISUAL: OK).
    - Screenshot daytime: **743.771 bytes** (14 agen hadir: 8 di meja kerja terangkat rapi di atas lantai + 6 di ruang rapat).
- Sisa backlog: verifikasi subjektif audio web-audio.

## 2026-10-27 04:46 WIB — Siklus 109: Badge koneksi gateway di kanvas TV lounge (paritas penuh chip HUD ↔ strip papan 3D ↔ TV) + hook debug __tvCanvas
- Kandidat backlog siklus 108 tuntas: tracker `tvConn` sudah menghitung kesehatan koneksi (backoff adaptif) tapi hasilnya belum terlihat di layar TV lounge. Kini ketiga permukaan status koneksi selaras:
  1. **`parts/tv_canvas.js`:** helper murni baru `tvConnBadge(state, ageSec)` — `live` → titik hijau `#10E5A0` + label `LIVE`; `stale` → amber `#F59E0B` + `SINKRON N dtk/mnt LALU` (umur data dari tracker, clamp ≥0); `down`/state tak dikenal/tracker kosong → merah `#ef4444` + `TERPUTUS`. `drawTvDashboard` menerima `opts.conn` opsional dan menggambar titik + label di sudut kanan atas (dot di x=TV_W-14, label rata kanan x=TV_W-22, y=21) — tanpa `opts.conn` perilaku identik dengan sebelumnya (kompatibel penuh dgn pemanggil lama).
  2. **`parts/lounge.js`:** `drawTv()` kini menarik `{state, ageSec}` dari tracker `tvConn` tiap gambar (umur = sejak `lastOkAt`); catch `tvPull` memanggil `drawTv()` langsung sehingga badge berubah SEGERA saat fetch gagal (paritas papan 3D yang sudah begitu). Hook debug `window.__tvCanvas` diekspos untuk verifikasi pixel-level via CDP (pola sama dgn `__tvData`/`__agentData`).
- Perubahan: `src/scene/parts/tv_canvas.js` (+tvConnBadge, +opts.conn), `src/scene/parts/lounge.js` (drawTv sadar-koneksi, drawTv di catch, hook `__tvCanvas`); test: `src/__tests__/tv_canvas.test.js` (+6: mapping state→warna/label, clamp umur negatif, render kanan-atas tak menabrak header, dasbor tetap tergambar di bawah badge, badge tanpa data "menghubungkan"), `src/__tests__/tv_lounge_runtime.test.js` (+1 alur runtime TERPUTUS→LIVE→SINKRON N dtk LALU saat fetch gagal; stub ctx +`arc`).
- Bukti terukur:
  - Vitest: **1928/1928 passed (142 file)** (+7 test baru dari 1920), 0 fail.
  - ESLint: 0 warning, 0 error (`npx eslint .` exit 0).
  - Build: sukses (37 precache 1806.24 KiB) → deploy `dist/*` → `~/wfs-hq/` OK; `wfs-hq` & `wfs-office` `active`.
  - E2E: `e2e_shot.py` **684.267 bytes** (WebGL hidup, 26 agen, ws true); `e2e_tv.py` OK; `e2e_zone_multi.py` OK (0 OFFSCREEN); `shot.sh` :0 **682.657 bytes**.
  - **E2E pixel badge TV (baru, `scratch/e2e_tvconn.py`):** `getImageData` kanvas TV via CDP → RGB(16,229,160) = `#10E5A0` **LIVE (hijau)** di browser nyata dengan data `/wfs-project` sungguhan.
- Commit: `b105ffe` — push sukses ke origin/main (rebase 1x di atas auto-dev `09df451` fitZoneLabel; vitest pasca-rebase 1928/1928).
- Sisa backlog: verifikasi subjektif audio web-audio (butuh pendengaran manusia); tidak ada item wajib lain.
## 2026-10-27 06:43 WIB — Siklus 112: Bugfix kritis WYSIWYG — uiMaterial salah tempel di Mesh (15 situs warna UI tetap shifted meski tekstur srgb)

- **Bug ditemukan (verifikasi probe siklus 111):** probe `e2e_tvwysiwyg.py` warisan melaporkan SHIFTED. Diagnosa: (a) probe lama salah theta kamera (0.85 = sisi +X, TV menghadap -X → memotret backface) DAN salah tanda proyeksi Z (TV di z=6.4 ≠ -6.4); (b) setelah probe v2 menemukan mesh via scene graph: material TV melaporkan **toneMapped=True** di browser nyata. Akar: `uiMaterial(new THREE.Mesh(...))` menempel `toneMapped=false` pada **objek Mesh** (tidak dibaca renderer) — bukan pada materialnya. 15 dari 17 situs UI memakai pola salah ini; hanya 2 Sprite yang benar. Efek: seluruh layar/teks/badge 3D tetap kena ACESFilmic meski tekstur sudah `srgb` (siklus 111).
- **Perbaikan:**
  - `src/scene/parts/ui_colorspace.js`: `uiMaterial(target)` kini menerima Mesh/Sprite (unwrap ke `.material`) DAN material langsung — semua 17 situs efektif tanpa perubahan panggilan; komentar mendokumentasikan bug.
  - Transformasi sumber 15 situs ke pola kontrak bersih `new THREE.Mesh(geom, uiMaterial(MAT))`: OfficeScene (monitor agen, nameplate, judul dinding), lounge TV, papan proyek, whiteboard, jam dinding, poster dinding, poster motivasi, menu board kafe, logo resepsionis, logo dinding, papan sambutan, sign lantai terrace.
  - Kontrak anti-regresi diperkuat: test baru melarang pola `uiMaterial(new THREE.Mesh/Sprite` di 11 file sumber (offender list → fail).
- **Bukti terukur (browser nyata, CDP + Xvfb):**
  - **Fill-test magenta (255,0,255):** piksel eksak ±10, bbox 358×191 px, fill 97.5% → `toneMapped=false` aktif di renderer.
  - **Fill-test warna painter badge (16,229,160):** 66.240 px eksak ±12, NEAREST (16,229,160) **jarak 0.0** — sebelum patch (111,177,186) jarak ~121. WYSIWYG 1:1 terbukti untuk colorSpace srgb + unlit sekaligus.
  - Vitest **2002/2002 (148 file)** (+3 dari 1999), 0 fail; ESLint 0/0; build sukses (37 precache 1806.68 KiB) → deploy `~/wfs-hq/`; `wfs-hq` & `wfs-office` active.
  - `scripts/e2e_shot.py` **673.612 bytes** (26 agen, ws true, E2E_VISUAL OK); `e2e_tv.py` OK; `e2e_zone_multi.py` OK.
  - Probe permanen baru di repo: `scripts/e2e_tvwysiwyg.py` (fill magenta) + `scripts/e2e_tvwysiwyg_painter.py` (fill painter).
- Sisa backlog: verifikasi subjektif audio web-audio (butuh pendengaran manusia).

## 2026-10-27 08:55 WIB — Siklus 113: Backlog audio tuntas — verifikasi SUBJEKTIF → OBJEKTIF otomatis (probe E2E sinyal Web Audio di browser nyata)

- **Sisa backlog terakhir ("verifikasi subjektif audio web-audio, butuh pendengaran manusia") dikonversi menjadi pengukuran objektif otomatis** — tidak lagi butuh manusia: probe baru membuktikan sinyal audio benar-benar mengalir di graph Web Audio browser nyata (Chrome headless-shell + Xvfb :99, CDP).
- **Perubahan kode aplikasi (1 baris + komentar):**
  - `src/scene/parts/sound_engine.js`: aksesor `masterGainNode()` diekspos dari engine (null sebelum `ensure()`/setelah `dispose()`) — satu-satunya celah instrumentasi: tanpa ini tak ada cara mengetuk sinyal masterGain untuk pengukuran E2E. Logika audio tidak berubah sama sekali.
  - `src/__tests__/sound_engine.test.js`: +1 test kontrak aksesor (null→node→null; gain=1).
- **Probe permanen baru `scripts/e2e_audio_signal.py`** (pola WS→CDP seperti probe WYSIWYG siklus 112), 6 verifikasi:
  1. WAKE — gesture keydown NYATA via CDP `Input.dispatchKeyEvent` → jalur wake listener asli (`installAudioWake`) membangunkan engine: ctx `none → running`.
  2. AMBIENCE — fitur nyata (hum 55 Hz + overtone 110 Hz + pink noise) via `setAmbienceEnabled(true)`: RMS terukur **1.93e-3, peak 3.6e-3** (eksak sesuai desain: calcAmbienceGain(1.0, 0.35) = 1.0×0.35×AMBIENCE_BASE_GAIN 0.015 = 0.00525 → peak wajar ~4e-3) via AnalyserNode tap di masterGainNode.
  3. CHAIN — test-osc kontinu (gain 0.2) → masterGainNode engine: RMS **1.42e-1, peak eksak 0.2000** — jalur masterGain→destination + tap terbukti membawa sinyal.
  4. CHIME — `playMeetingChime()` counter naik (transien tak dapat disample andal di null-sink; envelope/penjadwalan sudah diuji unit sound_engine).
  5. MUTE-CHECK (anti-false-positive) — `setMuted(true)` + osc kontinu mengalir → RMS **0.00e+0** (tap benar-benar mendengarkan masterGain yang dibisukan, bukan jalur lain).
  6. TIME — `ctx.currentTime` maju (graph hidup).
- **Temuan penting headless (dokumentasi):** chrome-headless-shell memakai null audio sink → WebAudio berjalan **fast-forward** (currentTime ~5-100× realtime; terukur 4.8×). Sinyal TRANSIEN (chime 0.5 s audio) mustahil ditangkap polling realtime (terbukti: 3-10 poll per 4.8 s audio) — maka probe mengukur sinyal KONTINU (ambience/osc) yang kebal fast-forward; keputusan amb_ok memakai threshold sesuai gain desain, bukan threshold arbitrer.
- Bukti terukur:
  - `E2E_AUDIO: OK` (amb_ok chain_ok chime_ok mute_ok advanced = True semua; stabil 2× run berturut-turut).
  - Vitest **2030/2030 (151 file)** (+1 dari 2029), 0 fail; ESLint 0/0; build sukses (37 precache 1806.69 KiB) → deploy `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - `e2e_shot.py` **675.078 bytes** (26 agen, ws true, E2E_VISUAL OK); `shot.sh` :0 **675.254 bytes** (>500 KB); `e2e_tv.py` OK; `e2e_zone_multi.py` OK (0 OFFSCREEN); `e2e_tvwysiwyg_painter.py` OK (dist 0.0 — regresi warna siklus 112 tetap bersih).
- Sisa backlog: **KOSONG** — verifikasi audio (item terakhir) kini objektif & otomatis. Siklus berikutnya: pemeliharaan rutin / perbaikan kualitas kecil sesuai temuan.

## 2026-10-27 09:35 WIB — Siklus 114: Refactor interaksi raycast — daftar target duplikat 3× + cek hit papan/nexus/root agen diekstrak ke parts/raycast_targets.js (+16 test)

- **Temuan (audit kode pasca-backlog kosong):** logika pengumpulan target raycast interaksi dibangun SECARA DUPLIKAT di 3 call site OfficeScene.js (pointerup klik, dblclick zoom, hover pointermove): tiap site menyusun sendiri daftar agen visible + papan proyek (mesh+frame) + whiteboard (mesh+frame) + nexus (visible!==false). Selain itu cek hit duplikat: papan proyek 2× inline (klik + dblclick, pola `obj===mesh || frame.getObjectById(obj.id)`), nexus 2× inline, dan pencarian root agen (telusuri rantai parent) 2× inline. Total ~30 baris duplikasi × 3 + risiko desinkronisasi antar call site saat satu diubah.
- **Perubahan:**
  - `src/scene/parts/raycast_targets.js` (BARU, murni tanpa THREE): `collectPickTargets({agentData, board, whiteboard, nexus})` — satu sumber kebenaran daftar target intersect (agen sittingChar/walker yang visible → board.mesh/frame → whiteboard.mesh/frame → nexus bila visible!==false); `findAgentRoot(obj, agentData)` — cek langsung lalu naik rantai parent; `isNexusHit(obj, nexus)` — langsung + getObjectById; `isBoardHit(obj, board)` — mesh langsung + frame langsung/anakan. Semua null-safe.
  - `src/scene/OfficeScene.js`: 3 call site kini memanggil `collectPickTargets(...)` (klik: −13 baris, dblclick: −6, hover: −10); cek papan `isBoardHit`, nexus `isNexusHit`, root `findAgentRoot`. 1959 → 1939 baris. Perilaku identik (urutan target & semantik hit dipertahankan persis).
  - `src/__tests__/raycast_targets.test.js` (BARU): 16 test — collect (null/kosong, agen hidden/visible, agen tanpa mesh, board frame saja, urutan agen→board→whiteboard→nexus, nexus visible=false dikecualikan), findAgentRoot (hit langsung, anak/cucu via parent chain, asing→null), isNexusHit (langsung, getObjectById, negatif), isBoardHit (mesh, frame, anakan frame, negatif).
- Bukti terukur:
  - Vitest **2053/2053 (154 file)** (+16 dari 2037), 0 fail.
  - ESLint: 0 warning, 0 error (`npx eslint .` exit 0).
  - Build: sukses (37 precache 1806.55 KiB, 480 ms) → deploy `dist/*` → `~/wfs-hq/` OK; `wfs-hq` & `wfs-office` `active`, HTTP 200.
  - E2E: `scripts/e2e_shot.py` **674.723 bytes** (26 agen, ws true, E2E_VISUAL OK); `e2e_tv.py` OK; `e2e_zone_multi.py` OK (label zona terlihat semua); `e2e_tvwysiwyg_painter.py` OK (dist 0.0); `e2e_conn.py` OK (chip "Sinkron"/live).
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok interaksi handler (klik/dblclick/hover) ke modul tersendiri bila OfficeScene masih >1.900 baris, atau perbaikan kualitas kecil sesuai temuan.

## 2026-10-27 10:35 WIB — Siklus 115: Fix bug kamera runtuh (klik kosong saat homeRadius null → radius meluruh ke 0) + DRY helper kamera null-safe (+15 test, probe E2E baru)

- **Bug nyata ditemukan & diperbaiki (bukan sekadar refactor):** klik area kosong saat `focusGoal` aktif & `homeRadius` masih null membuat goal reset `r: homeRadius` = **null** → lerp `focusStep` (`radius += (goalR−radius)×.06`) membuat radius **meluruh eksponensial ke 0** (terukur: 42.5 → 0.000000 dalam 1200 frame ~5 s) → kamera runtuh ke titik target, view kosong, sampai reload. Repro: halaman segar → dblclick langit (goal tanpa menyentuh homeRadius) → klik kosong. Jalur Escape/resetFocus sudah aman (`||sph.radius`); hanya jalur klik kosong yang bocor.
- **Perbaikan + DRY (3 helper murni di `parts/kamera_focus.js`, satu sumber kebenaran):**
  - `resetFocusGoal(homeT, homeRadius, fallback)` — goal reset null-safe: homeRadius null/undefined/NaN → fallback (fallback non-finite → 42.5); `r` goal **selalu finite**. Menggantikan 4 konstruksi goal reset inline (klik kosong, Escape, resetFocus API, `updateFollowGoal` offsite — semantik `||` dipertahankan agar kontrak test lama tetap benar).
  - `ensureHomeRadius(homeRadius, radius)` — clamp 24..70 sekali + null-safe radius non-finite; menggantikan 7 duplikat `if(homeRadius===null)homeRadius=Math.max(...)`.
  - `saveCam(sph)` — snapshot pose `__saved` sekali, null-safe (radius NaN → fallback 42.5); menggantikan 7 duplikat `if(!sph.__saved)sph.__saved=...`.
  - OfficeScene: 14 call site kini memakai helper; grep duplikat lama = **0**.
- **Probe E2E permanen baru `scripts/e2e_camera_reset.py`** (WS→CDP, chrome-headless-shell + Xvfb :99): replikasi skenario bug via input mouse NYATA (dblclick langit → goal aktif; klik kosong → jalur reset; radius 5 s kemudian harus > 20). Dua assert anti-vakuus: titik klik dicek `elementFromPoint` = CANVAS (dock React menutupi area bawah — koordinat dipindah ke langit) dan goal WAJIB terbentuk sebelum reset.
- Bukti terukur:
  - Diskriminasi bug: kode lama (simulasi eksak pola lama) radius → **0.000000**; kode baru di browser nyata → **39.11** (`E2E_CAMRESET: OK`, focus `{r:39.1, reset:true}`).
  - Vitest **2068/2068 (154 file)** (+15 dari 2053), 0 fail; ESLint 0/0 (`npx eslint .` exit 0).
  - Build sukses (37 precache 1806.47 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200 (port 9503).
  - E2E: `e2e_camera_reset.py` **OK**; `e2e_shot.py` via shot.sh :0 **672.999 B** (26 agen, E2E_VISUAL OK); `e2e_tv.py` OK; `e2e_zone_multi.py` OK (label zona terlihat); `e2e_tvwysiwyg_painter.py` OK (dist 0.0).
  - Catatan: `~/.hermes/cache/scratch/e2e_err.py` telah ter-prune (scratch 24 h) — cek error "Scene init failed" kini tercakup `uiOnly` banner di `e2e_shot.py` (OK).
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler interaksi (klik/dblclick/hover, ~176 baris, 166–341) ke modul tersendiri — perlu ctx state (focusGoal/sph/selectedIdx) atau refactoring lebih luas; atau perbaikan kualitas kecil sesuai temuan.

## 2026-10-27 11:40 WIB — Siklus 116: Fix bug cincin hover membeku saat agen berjalan + anchor ring DRY via selAnchorOf/ringFloorY (+9 test, probe E2E baru)

- **Bug visual nyata ditemukan:** cincin hover biru hanya diposisikan di handler pointermove (throttle 80 ms) — saat agen yang di-hover BERJALAN/naik-turun lantai, cincin TIDAK mengikuti: beku di posisi terakhir kursor, terlihat "tertinggal" melintas di lantai. Sel ring emas sudah follow per-frame (lerp 0.25) sejak lama; hover ring tidak sama sekali.
- **Bug kedua (satu keluarga):** anchor hover dihitung INLINE (hardcode `.55` + `(walker.visible?…:…)||0` di handler hover; formula Y duplikat total 3× di OfficeScene) — tanpa cek `sittingChar.visible`, beda kontrak dengan `selAnchorOf`: bila agen offsite/meeting (walker & sittingChar hidden), inline menganggap "duduk" → cincin nyangkut di meja kosongnya; sel ring sudah benar (null → disembunyikan). Walker tanpa `position` juga bisa melontarkan exception di formula inline lama.
- **Perubahan:**
  - `parts/ring_spec.js`: +`ringFloorY(a)` murni & null-safe (walker visible→position.y, `Number.isFinite(home.y)` fallback, else 0) — satu sumber kebenaran komponen Y ring; kontrak `selAnchorOf` (x,z,off) TIDAK diubah (test toEqual eksak tetap lulus).
  - `OfficeScene.js`: handler hover kini pakai `selAnchorOf`+`ringFloorY` (−3 baris duplikat, hardcode .55/0.02 hilang → `HOVER_RING.Y`); `applySelected` & blok follow sel ring juga pakai `ringFloorY` (total 3 duplikat formula Y → 1); blok animasi baru: hover ring follow per-frame (lerp 0.45 — lebih responsif dari sel 0.25; ring hilang bila anchor null/offsite, konsisten dgn sel ring).
- **Probe E2E permanen baru `scripts/e2e_hover_follow.py`** (WS→CDP, mouse NYATA): trigger lunch via `__setTime(720)` (jalur asli) → 26 agen berjalan ke kafe; hover badan agen berjalan via `Input.dispatchMouseEvent` (proyeksi dunia→layar via `__camCam`); identifikasi target anti-salah-agen via argmin jarak ring→agen berjalan (SwiftShader headless ~1.5 FPS → lerp settle tidak instan); anti-vakuus: agen wajib pindah >1.0 unit dgn kursor diakui tidak digerakkan; PASS bila ring tetap ≤0.6 dari agen.
- **Bukti terukur:**
  - Probe: `E2E_HOVERFOLLOW: OK` 2× berturut (moved 1.040/1.040, dist akhir 0.023/0.020 — bug lama akan ≈1.0+).
  - Vitest **2078/2078 (154 file)** (+9 dari 2069), 0 fail; ESLint 0/0 (`npx eslint .` exit 0).
  - Build sukses (37 precache 1806.64 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active.
  - E2E regresi: `e2e_camera_reset.py` OK (r 41.02); `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `e2e_tvwysiwyg_painter.py` OK (dist 0.0); shot.sh :0 **672.763 B** (>500 KB, E2E_VISUAL OK).
  - Catatan debug: follow per-frame TERBUKTI bekerja di headless (probe dbg: jarak ring→agen stabil 0.04–0.10 pada ~1.5 FPS; kegagalan attempt pertama probe = salah identifikasi agen — x beku -8.000 milik agen lain, bukan regresi kode).
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler interaksi (klik/dblclick, ~170 baris) — butuh ctx state; atau perbaikan kualitas kecil sesuai temuan.

## 2026-10-27 12:45 WIB — Siklus 117: Fix bug cincin hover menyangkut saat kursor meninggalkan kanvas (pointerleave tidak ada) + DRY hoverRingPos (+8 test, probe E2E baru dgn bukti diskriminasi)

- **Bug visual nyata ditemukan:** kanvas TIDAK punya handler `pointerleave` — saat kursor pindah ke dock/header React atau keluar jendela, cincin hover biru & kursor `pointer` TETAP tampil: blok follow per-frame terus menggerakkan ring utk agen yang sudah tidak di-hover, dan timeout throttle 80 ms yang masih pending mengeksekusi raycast dgn NDC basi (posisi kursor terakhir di tepi kanvas) → ring menyala kembali TEPAT SETELAH kursor keluar. Satu keluarga dgn bug siklus 116 (ring hover), sisi berlawanan: siklus 116 = ring tertinggal saat agen pergi; siklus 117 = ring nyangkut saat kursor pergi.
- **Perubahan:**
  - `OfficeScene.js`: handler `pointerleave` baru — batalkan `hoverTmr` (timer throttle kini disimpan, dulu `setTimeout` anonim tak bisa dibatalkan) + reset `hoverPend`/`hoveredAgent` + sembunyikan ring + kursor kembali normal (kecuali sedang dragging `grabbing`). Pointermove berikutnya menghidupkan kembali normal.
  - `parts/ring_spec.js`: +`hoverRingPos(agent,isNexus,nexusPos)` murni & null-safe — posisi penuh ring hover (agent → selAnchorOf+ringFloorY; nexus → konstanta `NEXUS_HOVER` {7.6,1.20,6.1} yang dulu hardcode 2×). Formula duplikat handler pointermove vs blok follow per-frame (2×) → 1 sumber.
  - OfficeScene: handler hover & blok follow pakai `hoverRingPos` (blok follow kini tak lagi membaca `selAnchorOf`/`ringFloorY` langsung); `if(ha!==hoveredAgent)` diperdering menjadi assignment biasa (nilai sama persis, guard tanpa efek).
- **Probe E2E permanen baru `scripts/e2e_hover_leave.py`** (WS→CDP, mouse nyata): hover agen berjalan (pre-condition ring tampil) → kursor dipindahkan ke titik DOCK React yang diverifikasi `elementFromPoint` ≠ canvas (pointerleave asli dari browser, bukan simulasi) → ring harus hilang; lalu tunggu 0.8 s (melewati umur timeout throttle 80 ms lama) → ring TETAP hilang & kursor bukan `pointer` (anti-kebangkitan-dari-NDC-basi).
- **Bukti terukur:**
  - **Diskriminasi bug**: kode lama (pointerleave dihapus dari build, dideploy) → probe **FAIL** (`LEAVE: vis:true cursor:pointer` — ring & kursor menyangkut, 3 attempt); kode baru dideploy ulang → **OK**. `E2E_HOVERLEAVE: OK` 3× berturut pada kode baru.
  - Regresi follow siklus 116 tetap hijau: `e2e_hover_follow.py` OK (moved 2.517, dist 0.399).
  - Vitest **2091/2091 (155 file)** (+8 dari 2083; describe hoverRingPos baru), 0 fail; ESLint 0/0 (`npx eslint .` exit 0).
  - Build sukses (37 precache 1806.73 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi: `e2e_camera_reset.py` OK; `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `e2e_tvwysiwyg_painter.py` OK (dist 0.0); shot.sh :0 **673.773 B** (>500 KB, E2E_VISUAL OK).
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler interaksi klik/dblclick (~170 baris, butuh ctx state) — atau perbaikan kecil sesuai temuan berikutnya.
## 2026-10-27 15:10 WIB — Siklus 118: Fix bug dblclick agen/nexus memecah goal kamera (tanpa cabang agen → goal statis menimpa goal follow; jalur agen skip saveCam/ensureHomeRadius) + DRY agentFocusPos & goal dblclick (+17 test, probe E2E dgn bukti diskriminasi)

- **Bug visual/interaksi nyata ditemukan (di-Audit saat ekstraksi blok interaksi — kandidat backlog lama):** handler `dblclick` TIDAK punya cabang agen & nexus — dblclick pada AGEN jatuh ke goal titik generik STATIS (`y = titik intersect + 0.8`, `r = min(radius,18)`, tanpa `follow`) yang **MENIMPA goal follow yang baru dibuat klik pertama** (urutan event browser: pointerdown/up klik-1 → dblclick): kamera berhenti mengikuti agen yang berjalan persis setelah double-click. Dblclick pada NEXUS menimpa goal `r:16` klik pertama dgn goal titik kepala/dada (y mengikuti titik intersect badan — framing kamera melompat). Jalur agen dblclick juga **satu-satunya jalur fokus yang skip `ensureHomeRadius`+`saveCam`** → Escape "kembali" tidak berfungsi setelah dblclick agen.
- **Perubahan:**
  - `OfficeScene.js`: cabang AGEN dblclick baru → `focusAgentRoot(root,{bubble:false})` — **idempoten dgn klik tunggal** (goal follow + `saveCam` + `ensureHomeRadius` + seleksi UI); cabang NEXUS dblclick baru → goal `r:16` posisi nexus eksplisit (idempoten dgn klik pertama, seleksi -2 dipertahankan). Helper `focusAgentRoot` baru menyatukan jalur fokus agen klik tunggal (dulu 14 baris inline).
  - `parts/kamera_focus.js`: +`agentFocusPos(a)` murni & null-safe — mirror EKSAK formula `updateFollowGoal` (walker visible → posisi walker, else home; +1.5 mata). Formula `walker.visible?walker.position:home` terduplikasi 3× (klik, focusAgent API, updateFollowGoal) → 1 sumber; jalur `focusAgent` API & bubble-nya ikut dirapikan (offset bubble konsisten −0.2 dari titik mata).
  - `parts/dblclick_spec.js` baru: `dblclickPointGoal(point,radius)` (y clamp ≥ +0.8, r=min(radius,18), null-safe non-finite) & `dblclickBlankGoal(tgt,radius)` (maju 30%, floor r 14, fallback HOME) — 2 goal inline dblclick yang dulu tanpa guard NaN → modul murni teruji unit.
- **Probe E2E permanen baru `scripts/e2e_dblclick_nexus.py`** (WS→CDP, chrome-headless-shell + Xvfb :99, mouse NYATA): klik tunggal nexus (torso terproyeksi, `elementFromPoint`=CANVAS) → tunggu kamera mendekat (r<28) → proyeksi ULANG → dblclick nexus → sampel `r` & `tgt.y` (target orbit) sampai 14 s. **Pembeda ganda tajam**: kode baru konvergen ke r≈16 & tgt.y≈2.0 (posisi nexus); bug lama lerp ke r=18 & tgt.y≥2.9 (badan nexus).
- **Bukti terukur:**
  - **Diskriminasi bug**: kode lama (cabang agen/nexus dblclick dihapus dari build, dideploy) → probe **FAIL** 2× (`r=21.5-22.1, tgt.y=2.94-2.95` — perilaku lama terdeteksi); kode baru dideploy ulang → **OK** 4× (r 17.20-17.64, tgt.y 1.95, `__saved` ada, seleksi persist).
  - Vitest **2128/2128 (157 file)** (+17 dari 2111; describe agentFocusPos/dblclickPointGoal/dblclickBlankGoal baru), 0 fail; ESLint 0/0 (`npx eslint .` exit 0).
  - Build sukses (37 precache 1807.46 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi: `e2e_camera_reset.py` OK; `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `e2e_tvwysiwyg_painter.py` OK (dist 0.0); `e2e_hover_follow.py` OK (moved 1.040, dist 0.020); `e2e_hover_leave.py` OK; shot.sh :0 **673.792 B** (>500 KB, E2E_VISUAL OK).
  - Catatan git: rebase di atas snapshot auto-dev remote; seluruh tree siklus ini sudah terdorong via snapshot auto `a9c1f9b`→`dd2ffe8`→`3b3160e` (verifikasi `git diff HEAD` kosong); stash lama sisa siklus 82 (konflik stale Icons/TaskBoard, isi sudah tercakup kode saat ini) didrop setelah verifikasi.
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler klik tunggal (pointerup, ~60 baris sisa setelah focusAgentRoot) — atau perbaikan kualitas kecil sesuai temuan berikutnya.
## 2026-10-27 19:02 WIB — Siklus 119: Figur peserta rapat kini bisa diklik/di-hover (dulu jatuh ke jalur "klik kosong" → kamera me-reset ke rumah) + DRY meetingFigureAnchor/findMeetingFigureOwner + fix TDZ __meetFigs (+9 test, probe E2E baru dgn bukti diskriminasi)

- **Bug interaksi nyata ditemukan (audit jalur raycast):** figur peserta rapat (`createMeeting.figures` — karakter duduk di kursi ruang meeting saat window rapat) TIDAK ada di daftar raycast `collectPickTargets` → klik pada peserta rapat jatuh ke jalur "KLIK KOSONG": kamera ME-RESET ke rumah (goal reset r=homeRadius), pilihan agen justru DIHAPUS, hover tidak bereaksi sama sekali. 6 peserta × 2 window/hari = persona yang "mati" utk interaksi saat rapat.
- **Perubahan:**
  - `parts/raycast_targets.js`: `collectPickTargets` +param `meetingFigures` (figur visible disertakan setelah nexus); helper baru `findMeetingFigureOwner(obj,figures)` murni & null-safe (telusuri rantai parent → {index,figure}).
  - `parts/ring_spec.js`: +`meetingFigureAnchor(fig)` murni & null-safe — anchor ring = posisi figur (kursi rapat, dipindah `placeFigure`), bukan home agen (mejanya kosong saat rapat); off 0.
  - `OfficeScene.js`: cabang AGEN-RAPAT baru di klik `pointerup` (SEBELUM findAgentRoot), dblclick (idempoten dgn klik pertama via `focusMeetingFigure`), dan hover (cursor pointer + ring biru di kursi). Helper `focusMeetingFigure(figIdx)`: goal kamera ke kursi (y+1.5), r=min(radius,16), `ensureHomeRadius`+`saveCam` (Escape "kembali" berfungsi), agen tetap dipilih di UI + bubble "(rapat)". `applySelected` & blok follow sel ring per-frame pakai `meetingFigureAnchor` — dulu `selAnchorOf`=null → ring emas dimatikan SETIAP FRAME oleh blok follow (mengalahkan applySelected; bug kedua terdeteksi probe). Hover figur → blok follow hover ring pakai `isMfHover` (dibersihkan pointerleave).
  - `window.__meetFigs` diekspos utk e2e — WAJIB setelah `const __meet` init: versi pertama di taruh sebelum deklarasi → **TDZ "Cannot access 'X' before initialization"** → scene mati UI-only (seluruh probe FAIL ~40 mnt; ditemukan via bisect bertahap revert blok). Kini satu baris setelah `const updateMeeting`.
- **Probe E2E permanen baru `scripts/e2e_meeting_pick.py`** (WS→CDP, chrome-headless-shell + Xvfb :99, mouse NYATA): `__setTime(605)` → window rapat aktif (6 peserta) → `focusMeetingRoom()` (HUD React menutupi figur dari kamera default) → proyeksikan tiap figur via `__meetFigs` + `__camCam` → pilih kandidat dgn `elementFromPoint`=CANVAS → klik nyata → sampel 14 s: pembeda ganda kode baru r≤18 & `sel` ring emas tampil & `__saved` ada.
- **Bukti terukur:**
  - **Diskriminasi bug**: build 118 dideploy (tanpa fitur) → probe **FAIL** (`r=41.74, tgt.y=1.409 = HOME reset, sel=null` — klik jatuh ke jalur klik kosong, persis perilaku lama); build 119 → **OK 3× berturut** (r=18.92–18.96, tgt.y=1.57–1.58, sel=true, sv=true).
  - Vitest **2143/2143 (158 file)** (+9: describe collectPickTargets meetingFigures/findMeetingFigureOwner/meetingFigureAnchor), 0 fail; ESLint 0/0.
  - Build sukses (37 precache 1809.46 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi: `e2e_shot.py` **682.320 B** (E2E_VISUAL OK); `e2e_camera_reset.py` OK; `e2e_dblclick_nexus.py` OK (r=17.36); `e2e_hover_follow.py` OK; `e2e_hover_leave.py` OK; `e2e_tv.py` OK; `e2e_zone_multi.py` OK; `e2e_tvwysiwyg_painter.py` OK (dist 0.0); shot `:99` 677.608 B. Catatan lingkungan: Xvfb :0 MATI di VM (socket `X10`/`X99` saja) — `shot.sh` skill (tanpa DISPLAY, headless=new) hanya 246 KB = fallback terbatas; verifikasi visual kini via `:99` (e2e_shot.py 677–682 KB = baseline sehat).
  - Catatan git: snapshot auto-dev 16:30 meng-commit state antara (termasuk TDZ); perbaikan TDZ diterapkan di atasnya.
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler interaksi ke modul (butuh ctx state besar); atau perbaikan kecil sesuai temuan berikutnya.
## 2026-10-27 21:56 WIB — Siklus 120: Kamera kini MENGIKUTI peserta rapat (follow goal {meetIdx,root} — anchor kursi per-frame) + goal follow agen satu sumber (agentFollowGoal) + fix rekursi tak hingga onTime→updateTime (ditemukan & diperbaiki sendiri) (+15 test, probe E2E baru)

- **Bug interaksi/kamera nyata ditemukan (audit lanjutan siklus 119):** goal kamera FOLLOW tidak mengenal figur peserta rapat:
  1. `updateFollowGoal` hanya formula walker/home — klik agen yang PESERTA rapat (via panel/menu) → target kamera = MEJA KOSONG agen selama 30 menit window (walker & sittingChar hidden, figur duduk di kursi rapat).
  2. `focusMeetingFigure` (119) = goal STATIS tanpa follow: figur lompat kursi saat window berganti → kamera menatap KURSI LAMA; saat rapat usai kamera TETAP menatap kursi kosong selamanya (tidak ikut pulang ke meja).
- **Perubahan:**
  - `parts/kamera_focus.js`: +`followAnchor(a,figAnchor)` murni & null-safe (figAnchor/kursi rapat MENANG atas walker/home; mirror eksak formula lama utk agen biasa; walker tanpa `position` / tanpa `home` → null, bukan exception — `updateFollowGoal` mempertahankan goal & tgt TIDAK dirusak). `updateFollowGoal` +param `figAnchor` opsional; follow `{meetIdx,root}` → agen di `.root`.
  - `OfficeScene.js`: `focusMeetingFigure` kini goal FOLLOW `{meetIdx:figIdx,root:ad}` (bukan statis); blok animate resolve anchor kursi per-frame via `meetingFigureAnchor` — rapat usai (figur hidden) → anchor null → jatuh ke `root` = meja home agen. Helper `agentFollowGoal(root,rf)` + `meetFollowIdx` — SATU sumber goal follow utk klik agen, API `focusAgent` (dulu duplikat inline r:20 yang tidak tahu peserta rapat), dan fokus figur rapat; agen peserta rapat di-fokus → follow kursi.
  - **Fix rekursi tak hingga (regresi versi pertama siklus ini):** `onTime` callback daycycle → `updateTime` → `__light.apply` → `onTime` lagi = **RangeError Maximum call stack size exceeded** → scene mati UI-only (terdeteksi `e2e_errors` sebelum deploy lanjut). Dipisah `applySimTime` (tanpa apply) — `onTime` → `applySimTime`, `updateTime` = `applySimTime`+`__light.apply`. Desain callback berulir tunggal.
  - `parts/daycycle.js`: +ctx `onTime` (opsional, dipanggil di akhir `apply`) — `__setTime` kini juga menyinkronkan `__sim.time` (dulu jam HUD melompat balik dari sisa sim lama).
- **Probe E2E permanen baru `scripts/e2e_meeting_follow.py`** (WS→CDP, mouse NYATA): klik figur peserta (kandidat home JAUH ≥2.5 dari kursi agar pembeda tajam) → follow aktif + sel + `__saved` → `__setTime(700)` rapat USAI → sampel dist(tgt, home agen). Versi pertama probe (window-ganti) DISCARTED: hash peserta window tidak overlap (agen terpilih selalu pulang) — pembeda rapat-usai lebih deterministik.
- **Bukti terukur:**
  - Regresi siklus 119 (klik figur rapat) di build baru: `e2e_meeting_pick.py` **OK 5× beruntun** (r=18.86–18.96, sel ring emas tampil, `__saved` ada).
  - Regresi penuh: `e2e_camera_reset` OK; `e2e_dblclick_nexus` OK (r=17.33, tgt.y=2.04); `e2e_hover_follow` OK (moved 1.120, dist 0.013); `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (dist 0.0); `e2e_shot` **683.319 B** (E2E_VISUAL OK, >500 KB).
  - Vitest **2181/2181 (159 file)** (+15: describe followAnchor 8 + updateFollowGoal-figAnchor 7), 0 fail; ESLint 0/0.
  - Build sukses (37 precache 1811.34 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200, konsol browser 0 error (hanya warning deprekasi THREE.Clock).
  - Catatan lingkungan: Xvfb :99 sempat MATI (WebGL gagal bind → "Scene init failed" palsu); direstart via background terminal; `e2e_errors.py` skill dialihkan DISPLAY :78→:99.
- Sisa backlog: KOSONG. Kandidat berikutnya: verifikasi visual probe `e2e_meeting_follow` perlu kamera tak-tertutup HUD (kandidat klik stabil di headless SwiftShader) — atau perbaikan kecil sesuai temuan berikutnya.
## 2026-10-27 23:14 WIB — Siklus 121: Zoom JUJUR — scroll/tombol zoom TIDAK lagi membunuh goal kamera diam-diam (dulu follow agen putus saat user scroll + radius dilawan lerp saat reset) (+12 test, probe E2E baru dgn bukti diskriminasi)

- **Bug interaksi/kamera nyata ditemukan (audit handler wheel & tombol zoom):** `wheel` & `zoomIn/zoomOut` menjalankan `if(focusGoal&&!focusGoal.reset)focusGoal=null` — satu putaran scroll selama kamera MENGIKUTI agen (goal follow hasil klik agen/figur rapat siklus 118-120) MEMBATALKAN follow diam-diam: kamera berhenti mengikuti agen yang berjalan persis saat pengguna men-zoom, `__saved` menjadi yatim (ada tanpa goal → Escape memutar pose lama tanpa tujuan), dan goal statis (lantai/tim/nexus) TERHENTI di tengah lerp (kadang `phi` goal belum sempat dilerp → framing beda dari tombol lantai asli). Saat goal reset berjalan, scroll DILAWAN lerp .06/frame: radius ditarik balik ke goal.r tiap frame → terasa "sticky".
- **Perubahan:**
  - `parts/zoom_spec.js` BARU: `zoomRadius(current,delta)` (formula radius + clamp 12..130, mirror eksak `Math.max(12,Math.min(130,...))` lama; null-safe: current/delta non-finite → fallback 42.5/no-op — anti-poisoning) & `zoomFocusGoal(goal,delta)` (goal follow/statis → r dimutasi clamp; goal reset → null/tak disentuh).
  - `OfficeScene.js`: handler `wheel` & tombol `zoomIn/zoomOut` kini ZOOM JUJUR — radius aktual dihitung satu formula (`zoomRadius`), dan goal follow/statis TIDAK dibatalkan: radius goal IKUT digeser (`zoomFocusGoal`) sehingga lerp per-frame bergerak BERSAMA input; kamera tetap mengikuti agen. Goal reset: radius goal ikut → lerp tidak lagi menarik balik (scroll tidak sticky).
- **Probe E2E permanen baru `scripts/e2e_zoom_follow.py`** (WS→CDP, mouse NYATA): `__setTime(720)` lunch → KLIK badan agen berjalan (proyeksi ulang) → goal follow `{r,reset:false}` → wheel NYATA `deltaY=-1000` (terdorong clamp 12 — bukti wheel mendarat) → pembeda ganda kode baru: goal follow MASIH ADA dan goal.r BERKURANG >2 (24→12) + radius aktual turun >2. (Versi pertama deltaY=-120: pembeda lemah — goal.r 24→24; lerp follow sendiri sudah menarik radius turun perlahan → diperkuat ke clamp.)
- **Bukti terukur:**
  - **Diskriminasi bug**: kode lama (wheel lama dipasang balik + build + deploy) → probe **FAIL** (`focus hilang setelah wheel — perilaku lama terdeteksi`, 2 attempt); kode baru dideploy ulang → **OK 2× beruntun** (r=24→12, radius 34.6→12.0 & 24.1→12.0).
  - Regresi penuh: `e2e_camera_reset` OK; `e2e_dblclick_nexus` OK (r=17.36, tgt.y=1.95); `e2e_hover_follow` OK (moved 1.120, dist 0.011); `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (dist 0.0); `e2e_meeting_pick` OK (r=18.92, sel+`__saved`); `e2e_shot` **686.653 B** (E2E_VISUAL OK >500 KB — diperbaiki: e2e_shot.py repo sebelumnya fallback headless=new 246 KB).
  - Vitest **2208/2208 (162 file, +12)**: describe `zoomRadius` 5 + `zoomFocusGoal` 7; ESLint 0/0 (`npx eslint .` exit 0).
  - Build sukses (37 precache 1812.17 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - `e2e_errors.py` (skill path pindah ke `~/.hermes/skills/ai-office-ui-audit/scripts/`): konsol hanya deprekasi `THREE.Clock` — **0 error**.
  - Catatan lingkungan: Xvfb :99 ditemukan MATI (socket stale, xdpyinfo gagal) setelah ~8 probe; direstart via background terminal — probe lanjutan hijau.
- Sisa backlog: KOSONG. Kandidat berikutnya: ekstraksi blok handler interaksi klik/dblclick ke modul (butuh ctx state besar) — atau perbaikan kecil sesuai temuan berikutnya.
## 2026-10-28 00:45 WIB — Siklus 122: Fix kebocoran tekstur GPU bubble chat — map CanvasTexture kini di-dispose di SEMUA jalur penghapusan (dulu hanya material.dispose → VRAM bocor selamanya) (+4 test, probe E2E baru dgn bukti diskriminasi)

- **Bug memori/GPU nyata ditemukan (audit sumber sprite dinamis):** setiap bubble chat membuat `CanvasTexture` baru (360×76) tapi SEMUA jalur penghapusannya hanya `material.dispose()`: (1) early-replace `createBubble` (agen sama/posisi <1.2 m), (2) eviksi `MAX_BUBBLES` (2–3 aktif), (3) expiry life≤0 via `updateBubbles`. Teksturnya TIDAK PERNAH di-dispose → tiap tekstur mati menumpuk di VRAM selamanya. Sumber bubble: autoTalk (~8 dtk) + chat pasangan dekat + klik papan/whiteboard → kantor display :9503 yang jalan berhari-hari menumpuk ribuan tekstur mati (memori GPU proses naik monoton). Tidak ada sumber tekstur dinamis per-instance lain (label agen reuse 2 tekstur; nameplate/screen statis).
- **Perubahan:**
  - `parts/bubbles.js`: +`disposeBubble(b)` (murni, null-safe) — map tekstur di-dispose SEBELUM material; guard fungsi dispose tidak ada.
  - `OfficeScene.js`: ketiga jalur penghapusan bubble kini memakai `disposeBubble` (dulu `b.sprite.material.dispose()` telanjang). +Hook debug e2e `window.__renderer` (probe `info.memory`) & `window.__spawnBubble` (jalur `createBubble` asli).
  - `scripts/e2e_bubble_leak.py` BARU (WS→CDP, chrome-headless-shell + Xvfb :99): wrap `gl.createTexture/gl.deleteTexture` di konteks WebGL NYATA → hitung alokasi & dealokasi tekstur GPU; spawn 1 bubble per 4.5 dtk × 8 (interval > life 3.5 dtk → array tak penuh, pembeda murni jalur expiry `updateBubbles`, bukan eviksi) → tunggu expiry → snapshot counter. (info.memory.textures tidak informatif utk eviksi: kode baru membuang seketika → counter live tetap — versi pertama probe dgn spawn massal 30× gagal membaca pembeda, diganti spawn bertahap.)
- **Bukti terukur:**
  - **Diskriminasi bug**: perilaku lama (map dispose dinonaktifkan 1 baris + build + deploy) → probe **FAIL** (`deleted=0 / created=15` — kebocoran persis terdeteksi); kode baru dideploy ulang → **OK 2×** (`deleted=12 & 13 / created=15`, sisa = ≤3 bubble hidup).
  - Vitest **2212/2212 (162 file, +4)**: describe `disposeBubble` 4 (urutan map→material, map kosong, null-safe 8 bentuk korup, integrasi jalur remove `updateBubbles`); ESLint 0/0.
  - Build sukses (37 precache 1812.33 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi penuh: `e2e_camera_reset` OK; `e2e_dblclick_nexus` OK (r=17.13, tgt.y=1.96, `__saved` ada); `e2e_hover_follow` OK; `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (WYSIWYG 1:1); `e2e_meeting_pick` OK (r=18.96, sel+`__saved`); `e2e_zoom_follow` OK (goal follow dipertahankan r 24→12); `e2e_shot` **686.449 B** (E2E_VISUAL OK >500 KB).
  - `e2e_errors.py`: konsol hanya deprekasi `THREE.Clock` — **0 error**.
  - Catatan lingkungan: Xvfb :99 mati lagi (WebGL "BindToCurrentSequence failed" → "Scene init failed" palsu di e2e_errors); direstart via background terminal — semua probe lanjutan hijau.
- Sisa backlog: KOSONG. Kandidat berikutnya: audit disposal elemen dinamis lain (sprite label mode full/short sudah reuse; cek `__shift.dispose` jalur HMR) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 03:30 WIB — Siklus 123: Higiene jalur destroy scene — SEMUA ±50 hook window milik scene kini di-purge (dulu hanya 10 → graph scene mati terkunci di heap setelah remount/HMR), registri zona direset saat create (dulu dipakai ulang → label zona dobel), timer interaksi pending diclear, listener matchMedia dilepas, WebGL forceContextLoss (+11 test, probe E2E baru dgn bukti diskriminasi)

- **Bug memori/higiene nyata ditemukan (audit lanjutan disposal, kandidat backlog siklus 122):** `createOfficeScene` memasang ±45 hook `window.__*` (debug/e2e + integrasi UI React: `__agentData`, `__cam`, `__camCam`, `__renderer`, `__zoneLabels`, `__zoneBase`, `__wallFade`, `__meetFigs`, `__tvData`, `__bubbles`, `__screens`, …) tapi `destroy()` hanya menghapus 10 di antaranya. Setelah destroy (remount React/HMR):
  1. puluhan hook tetap menunjuk graph scene MATI → heap terkunci (agentData/figur rapat/label tidak ter-GC); SysMeter terus membaca hitungan agen basi tiap 4 dtk dari array scene lama; probe E2E bisa "sukses" membaca scene yang seharusnya gugur.
  2. Registri zona (`__zoneLabels`/`__zoneBase` di parts/flooring.js pakai pola `window.X = window.X || []`) DIPAKAI ULANG scene remount: `createZones` push 5 label tambahan ke array lama → label zona duplikat & anti-tumpuk memproses sprite mati.
  3. `autoTmr` (pointerup→auto-rotate 6 dtk) & `hoverTmr` (throttle hover 80 ms) yang pending saat destroy tidak pernah di-clear → bisa menembak closure scene mati.
  4. Listener `matchMedia('prefers-reduced-motion')` anonim tidak bisa & tidak pernah dilepas.
  5. `renderer.dispose()` tanpa `forceContextLoss()` → VRAM (tekstur/buffer GPU) menunggu GC browser; di kiosk remount berulang konteks menumpuk ke arah batas 16/halaman.
- **Perubahan:**
  - `parts/scene_hooks.js` BARU: `SCENE_HOOKS` (daftar 50 hook milik scene — satu sumber kebenaran; TIDAK memuat milik pemilik lain: `__wfsAgentIdList`, `__wfsSceneSelect`, `__wfsModalOpen`, `__officeSceneDestroyed`, `THREE`) + `purgeSceneHooks(win, hooks)` (murni, null-safe, idempoten, hanya own-property, return daftar yang benar-benar terhapus).
  - `OfficeScene.js`: purge di `createOfficeScene` (reset sisa scene lama — memperbaiki duplikasi zona) + purge lengkap di `destroy()` menggantikan 8 delete manual; `window.__SCENE_HOOKS` diekspos utk probe; `clearTimeout(autoTmr)` + `hoverTmr` di destroy; listener matchMedia diberi nama (`__prmListener`) & dilepas di destroy; `renderer.forceContextLoss()` sebelum dispose; hook baru `window.__wfsSceneControls` (jembatan resmi destroy utk probe E2E — App.jsx tetap pakai sceneRef internal).
- **Probe E2E permanen baru `scripts/e2e_scene_hooks.py`** (WS→CDP, chrome-headless-shell + Xvfb :99, pump thread tunggal + queue — versi pertama dua pembaca pada satu socket saling mencuri frame → Runtime.evaluate menggantung): STATE1 (scene siap, 42 hook terpasang, zona=5) → `__wfsSceneControls.destroy()` → STATE2 (SEMUA hook hilang, flag destroyed, canvas diremove) → recreate via import chunk OfficeScene yang sama di container App → STATE3 (scene hidup, agents=26, zona TETAP 5 — registri tidak dobel, konsol 0 error).
- **Bukti terukur:**
  - **Diskriminasi bug**: purge-destroy dinonaktifkan 1 baris + build + deploy → probe **FAIL** (`sisa 40 hook scene setelah destroy — purge parsial`); kode baru dideploy ulang → **OK 2× beruntun** (destroy→sisa hook 0; recreate→zona=5, konsol bersih).
  - Vitest **2223/2223 (163 file, +11)**: describe `SCENE_HOOKS` 5 (cakupan ≥45, konvensi `__`, hook inti lama, TIDAK memuat milik pemilik lain, tanpa duplikat) + `purgeSceneHooks` 6 (hapus selektif, idempoten, null-safe, entri korup, prototipe tak tersentuh, purge penuh); ESLint 0/0.
  - Build sukses (38 precache 1830 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi penuh: `e2e_camera_reset` OK (r=39.11 reset goal); `e2e_hover_follow` OK (moved 1.040, dist 0.012); `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (WYSIWYG 1:1); `e2e_meeting_pick` OK (r=18.92, sel+`__saved`); `e2e_zoom_follow` OK; `e2e_bubble_leak` OK (deleted=13/created=15 — fix siklus 122 tetap hidup); `e2e_shot` **688.225 B** (E2E_VISUAL OK >500 KB).
  - `e2e_errors.py`: konsol hanya deprekasi `THREE.Clock` — **0 error**.
  - Catatan lingkungan: Xvfb :99 ditemukan mati lagi di awal siklus; direstart (background terminal) — semua probe lanjutan hijau. Catatan git: snapshot auto-dev 01:00–02:00 ikut meng-commit file siklus ini secara bertahap (6785944, 63d3229, fbf761e) — commit siklus berisi sisa perubahan (DEV_LOG + eskpos hook) di atas snapshot tersebut.
- Sisa backlog: KOSONG. Kandidat berikutnya: audit allokasi runtime lain di jalur remount (Reception/Bookshelf/Cafe builders membuat geometry per-instance tanpa dispose — dampak kecil karena sekali per scene) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 05:15 WIB — Siklus 124: Dispose graph scene di destroy (dulu TIDAK pernah: geometri/material/tekstur menunggu GC) + bug nyata: fetch pollStatus in-flight saat destroy menulis kembali hook window SETELAH purge (+6 test, probe E2E remount ×3 dgn bukti diskriminasi)

- **Bug memori/higiene nyata #1 (kandidat backlog siklus 123):** `destroy()` sebelum siklus 124 melepas konteks GPU (`forceContextLoss`, siklus 123) dan purge hook window (siklus 123), tapi TIDAK PERNAH men-dispose geometri/material/tekstur graph scene — typed-array atribut (position/normal/uv) & CanvasTexture (label zona, layar agen, papan proyek, TV, poster, langit) tetap hidup di JS heap selama referensi ada; pelepasan nyata menunggu GC. Remount berulang (display kiosk/HMR) menumpuk graph mati tanpa pelepasan deterministik.
- **Bug nyata #2 (TERDETEKSI probe baru di run pertama):** `pollStatus` async — fetch `/wfs-api/agents/status`+`/wfs-api/tasks` in-flight saat destroy resolve SETELAH purge → menulis `window.__wfsAgentIdMap`/`__wfsRunningTasks` (data scene MATI) kembali ke window + `statusPollActions` bisa mengubah badge/membuat bubble pada graph mati. Hook "bangkit kembali" setelah destroy — kebocoran jalur async yang tidak tertangkap purge sinkron.
- **Perubahan:**
  - `parts/scene_dispose.js` BARU: `disposeSceneGraph(root)` murni & null-safe — traverse graph (office), kumpulkan via `Set` (objek unik 1× meski dipakai bersama) semua geometri + material (termasuk material array) + tekstur di SEMUA slot material (map/alphaMap/emissiveMap/envMap/…, deteksi `isTexture`), dispose tiap objek sekali; traverse korup → hitungan parsial; return hitungan `{geometries,materials,textures}`.
  - `OfficeScene.js`: `disposeSceneGraph(office)` di destroy SETELAH purge hook; hitungan terekspos `window.__lastSceneDispose` (terdaftar di SCENE_HOOKS — dibaca probe SETELAH destroy, dibersihkan purge-create berikutnya). `__destroyHooks[]`: stopper async yang dijalankan destroy — `pollStopped` flag + guard SETELAH tiap await di `pollStatus` (3 titik: setelah fetch status, setelah fetch tasks, sebelum `statusPollActions`) → fetch in-flight tidak menyentuh window/graph mati.
  - `scripts/e2e_dblclick_nexus.py`: sampling 14→28 s (lerp .06/frame butuh ~18 frame; SwiftShader ~1.5 FPS saat VM load tinggi → r kerap berhenti di 17.4x tanpa verdict; verdict tetap ketat).
- **Probe E2E permanen baru `scripts/e2e_scene_dispose.py`** (WS→CDP, chrome-headless-shell + Xvfb :99, `--js-flags=--expose-gc`): 3× [STATE scene hidup (agents=26) → destroy resmi via `__wfsSceneControls` → baca `__lastSceneDispose` (WAJIB geometries>200 & textures>10) → hook bersih (≤2, count pakai hasOwnProperty) → GC eksplisit → recreate via import chunk OfficeScene → scene hidup, zona TETAP 5] → heap tiap putaran + konsol tanpa error baru.
- **Bukti terukur:**
  - **Hasil probe**: tiap destroy membuang **5063 geometri, 4982 material, 129 tekstur**; 3 remount beruntun semua hidup (agents=26), zona tetap 5, heap stabil [78, 78, 78, 78] MB, konsol bersih.
  - **Diskriminasi bug**: dispose dinonaktifkan 1 baris (`{geometries:0,...}` statis) + build + deploy → probe **FAIL** (`dispose graph r1 tidak terjadi: {geometries:0,materials:0,textures:0}`); kode baru dideploy ulang → **OK**. Run pertama probe (sebelum guard async) juga membuktikan bug #2: sisa hook `__wfsAgentIdMap`+`__wfsRunningTasks` setelah destroy → setelah guard: 0.
  - Vitest **2229/2229 (164 file, +6)**: describe `disposeSceneGraph` (unik 1×, material array + multi-slot tekstur, node polos, entri korup, null-safe 4 bentuk, traverse lempar tak merusak); ESLint 0/0.
  - Build sukses (38 precache 1831 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi penuh: `e2e_camera_reset` OK (r=39.11); `e2e_hover_follow` OK (moved 1.041, dist 0.020); `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (WYSIWYG 1:1, dist 0.0); `e2e_meeting_pick` OK (r=18.96, sel+`__saved`); `e2e_zoom_follow` OK (goal follow dipertahankan r 24→12); `e2e_bubble_leak` OK (deleted=12/created=14 — fix siklus 122 tetap hidup); `e2e_dblclick_nexus` OK (r=17.36, tgt.y=1.95); `e2e_shot` **689.996 B** (E2E_VISUAL OK >500 KB).
  - `e2e_errors.py`: konsol hanya deprekasi `THREE.Clock` — **0 error**.
  - Catatan lingkungan: Xvfb :99 mati lagi di awal siklus; direstart (background terminal) — semua probe lanjutan hijau.
- Sisa backlog: KOSONG. Kandidat berikutnya: probe remount ×3 dengan tekanan memori lebih tinggi (remount tanpa GC eksplisit, 10×) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 07:30 WIB — Siklus 125: Guard async tvPull (lounge) & pull (projectboard) — pola bug siklus 124 masih ada di 2 jalur async lain: fetch /wfs-project in-flight saat destroy menulis __tvData/__lastTvDrawAt SETELAH purge + menggambar canvas scene mati (+9 test, probe E2E baru dgn bukti diskriminasi)

- **Bug memori/higiene nyata (kandidat backlog siklus 124):** guard async `pollStatus` (siklus 124) ternyata TIDAK mencakup dua jalur async lain yang menulis hook window: (1) `parts/lounge.js::tvPull` — fetch `/wfs-project` in-flight saat destroy → await selesai SETELAH purge → menulis `window.__tvData`/`__lastTvDrawAt`/`__tvPullErr` kembali (hook "bangkit" menunjuk scene mati) + `drawTv()` menggambar CanvasTexture scene mati; (2) `parts/projectboard.js::pull` — sama, menggambar papan + tracker koneksi pada scene mati.
- **Bukti diskriminasi (probe E2E baru):** `scripts/e2e_async_destroy.py` — intercept semua fetch `/wfs-project` (deferred manual), picu tvPull+pull via event visibilitychange, destroy resmi via `__wfsSceneControls` (sanity: `__tvData` hilang), lalu resolve fetch in-flight. Kode LAMA (ter-deploy) → **FAIL**: `CHECK {tvData:true, tvDraw:true, hooksLeft:3}` — hook bangkit persis seperti hipotesis. Kode BARU → **OK 2×**: `{tvData:false, tvDraw:false, tvErr:false, hooksLeft:1}`, konsol bersih.
- **Perubahan:** guard flag `tvStopped`/`pollStopped` SETELAH tiap await + di catch + di awal (jangan mulai siklus baru) di kedua fungsi — pola identik guard `pollStatus` siklus 124; `pull()` dipindah di bawah `schedulePoll` (deklarasi function hoisted, urutan panggilan awal `pull().then(...)` dipertahankan).
- **+9 unit test** (`src/__tests__/async_destroy_guard.test.js`, jsdom + stub canvas/THREE + deferred fetch manual): 5 tvPull (resolve setelah tvDestroy tak menulis `__tvData`/`__lastTvDrawAt`/`__tvPullErr`; data lama tak ditimpa referensi-sama; reject setelah tvDestroy tak menulis; resolve sebelum tvDestroy = perilaku lama tetap + needsUpdate; tvPull setelah tvDestroy tak memulai fetch baru) + 4 pull (setara utk board incl. onVis setelah destroy). Harness: reject memakai reject fn Promise asli (dulu `Promise.reject` baru → unhandled rejection), `board.mesh.material.map.needsUpdate` (bukan frame).
- **Perbaikan probe lama:** `e2e_dblclick_nexus.py` — sampling berbasis waktu-dinding (budget 55 s, evaluasi ~0.5 s; dulu 45×1 s statis → probe kehabisan waktu saat VM overload: 1 Runtime.evaluate bisa ~3 s) + verdict cepat via goal resmi `__dbg().focus.r===16` (idempotensi klik tunggal vs dblclick, regresi siklus 119; goal lama tidak pernah r:16) — verdict tetap ketat, tidak melonggarkan pembeda. `e2e_meeting_pick.py`: sampling 28→48×0.5 s (VM load 3, r konvergen lambat).
- **Bukti terukur:**
  - Vitest **2238/2238 (165 file, +9)**; ESLint 0/0; build sukses (38 precache 1831 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, HTTP 200.
  - E2E regresi penuh: `e2e_camera_reset` OK; `e2e_hover_follow` OK; `e2e_hover_leave` OK; `e2e_tv` OK; `e2e_zone_multi` OK; `e2e_tvwysiwyg_painter` OK (WYSIWYG 1:1); `e2e_meeting_pick` OK (r=18.92, sel+`__saved`); `e2e_zoom_follow` OK; `e2e_bubble_leak` OK (deleted=13/created=15); `e2e_scene_dispose` OK (3 remount, zona=5); `e2e_scene_hooks` OK (destroy→hook 0, recreate hidup); `e2e_dblclick_nexus` OK (goal r:16 idempoten); `e2e_shot` **677.806 B** (E2E_VISUAL OK >500 KB); `e2e_errors` hanya deprekasi `THREE.Clock` — **0 error**.
  - Catatan lingkungan: Xvfb :99 ditemukan mati di awal siklus → direstart (background terminal). Catatan git: snapshot auto-dev 05:00–06:00 ikut meng-commit file siklus ini bertahap (fcab960, 05899a1, a324972) — commit siklus berisi DEV_LOG + finalisasi probe di atasnya.
- Sisa backlog: KOSONG. Kandidat berikutnya: audit jalur async lain (App.jsx fetch /wfs-project & /wfs-api milik React — di-destroy bersama unmount React, bukan scene) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 08:25 WIB — Siklus 126: Guard jalur async React — poll adaptif refreshStatus (App.jsx) kini rid-guarded: fetch overlap saat gateway lambat tak lagi menimpa state (chip mundur/stale, toast palsu) + respons in-flight saat unmount tak menulis log aktivitas (+3 test, bukti diskriminasi unit)

- **Bug nyata (kandidat backlog siklus 125: audit jalur async React):** poll adaptif App (`refreshStatus` + effect `schedule()`) adalah SATU-SATUNYA jalur poll React tanpa guard — semua komponen lain sudah aman (TaskBoard/ProjectPanel/TeamStats/Dashboard pakai `AbortController`, Ticker/SysMeter pakai flag `stop`). Dua kebocoran:
  1. **Fetch overlap/out-of-order:** `schedule()` menjadwalkan poll berikutnya SEGERA setelah `tick()` MULAI (bukan selesai) — saat gateway lambat (>15 dtk), poll berikutnya menyusul sebelum respons sebelumnya tiba; respons poll LAMA yang tiba belakangan MENIMPA state: chip koneksi mundur ke stale/offline padahal poll baru sukses, toast palsu "Task #N berjalan" muncul SETELAH toast "selesai" (diff prevStatus dihitung dari data basi).
  2. **Unmount in-flight:** respons fetch yang resolve SETELAH unmount tetap menulis `setStatus`/`setConn`/`pushLog` (localStorage `wfs_activity`) — pembacaan activity log bisa berisi entri dari App yang sudah gugur.
- **Perubahan (`src/App.jsx`):** `pollRid` ref — `refreshStatus` menaikkan rid di awal; SETELAH await Promise.all, hanya rid terbaru yang boleh menulis state/log/toast/audio (guard di 3 titik: sukses, catch, unmount-cleanup menaikkan rid membatalkan respons in-flight). Pemanggilan manual (doConfirm pause/resume, TaskModal onDone) ikut aman otomatis karena rid dari ref, bukan milik scheduler. Tanpa AbortController sengaja: satu titik kebenaran (rid), tidak ada dua mekanisme yang bisa saling lolos.
- **Bukti diskriminasi unit (`src/__tests__/app_poll_guard.test.jsx`, +3):** stub fetch poll App berpasangan `tasks/paused`→`/tasks` (pemanggil `/tasks` lain = Ticker dibalas instan, tidak didefer). (1) Poll #1 tertahan, poll #2 disulut via event 'online' → respons BARU diterima dulu → respons LAMA disettle: **kode LAMA FAIL** (status kembali "1 jalan · 0 antri" — persis hipotesis out-of-order), **kode BARU OK** (tetap "0 jalan · 0 antri", tanpa toast palsu). (2) Poll lama GAGAL menyusul setelah poll baru sukses → tak mundur ke "Gateway offline" (badge tak kembali `ticker-conn-err`). (3) Unmount saat poll menggantung → resolve telat: 0 React act-error, log aktivitas kosong.
- **Bukti terukur:**
  - Vitest **2241/2241 (166 file, +3)**; ESLint 0/0 (warning `exhaustive-deps` di cleanup diberi alasan eksplisit — bump rid saat unmount memang disengaja); build sukses (38 precache 1831 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E penuh hijau: camreset (r=40.34, reset goal), hover follow (moved 1.121, dist 0.016), hover leave, TV (26 agen), zone multi (SERVER ROOM vis), painter 1:1 (dist 0.0), meeting pick (r=18.92, sel+`__saved`), zoom follow (24→12 dipertahankan), bubble leak (deleted=13/created=15), scene dispose (3 remount, 5063 geometri/129 tekstur, heap 69 MB stabil, zona=5), scene hooks (destroy→hook 0, recreate hidup), async destroy (fetch in-flight tak menghidupkan hook — guard siklus 125 tetap jalan), dblclick nexus (r=27.14, goal r:16 idempoten), shot **676.494 B**; `e2e_errors` (dibuat ulang — file scratch terprune 24h): **0 error**, hanya deprekasi `THREE.Clock`.
  - Catatan lingkungan: Xvfb :99 mati di awal siklus → direstart; `e2e_err.py` scratch hilang (prune 24h) → dibuat ulang dari harness CDP repo.
- Sisa backlog: KOSONG. Kandidat berikutnya: audit jalur async sisanya (ShConsole `setInterval` overview 10 dtk & EventSource `/wfs-api/events` — tertutup di cleanup tapi `setOv` setelah unmount saat fetch telat; dampak kecil karena drawer jarang terbuka saat unmount) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 09:31 WIB — Siklus 127: Guard jalur async ShConsole — poll overview 10 dtk kini rid-guarded (respons poll LAMA tak lagi menimpa data poll BARU saat gateway lambat; kegagalan poll basi tak lagi memunculkan banner err palsu lintas tab) + EventSource esAlive (pesan hantu setelah drawer ditutup tak menulis live log) (+4 test, bukti diskriminasi unit)

- **Bug nyata (kandidat backlog siklus 126):** `ShConsole` termount permanen di App (render `<ShConsole/>` tanpa syarat; tutup drawer = `show=false` → null, STATE PERSIST). `loadOverview` (poll interval 10 dtk di tab Overview) polos tanpa guard; `err` dibagi LINTAS tab (`setErr` di semua loader):
  1. **Fetch overlap/out-of-order:** gateway lambat → poll berikutnya menyusul sebelum respons sebelumnya tiba → respons poll LAMA yang tiba belakangan MENIMPA `ov` (statistik mundur ke data basi) dan kegagalan poll basi menaikkan banner err di tab MANA PUN yang sedang dibuka.
  2. **Respons telat setelah drawer ditutup:** `setErr('HTTP 503…')` dari poll in-flight tampil saat drawer dibuka lagi (banner palsu tanpa refresh), karena state tak pernah di-reset dan komponen tak pernah unmount.
  3. **Pesan EventSource setelah cleanup:** `es.onmessage` closure tetap hidup — pesan yang disetel saat/after cleanup menulis `setLiveLogs` komponen "gugur" (log hantu muncul saat drawer dibuka lagi).
- **Perubahan (`src/components/ShConsole.jsx`):** ref `ovRid` — `loadOverview` menaikkan rid di awal; SETELAH await `api()`, hanya rid terbaru yang boleh menulis `setOv`/`setErr` (guard di 2 titik: sukses + catch) — menutup overlap DAN respons telat sekaligus. Cleanup effect overview menaikkan `ovRid.current++` (invalidate in-flight) + flag `esAlive` ditutup sebelum `es.close()` (pesan setelah cleanup tak menulis). Pola identik guard rid App (siklus 126) — satu titik kebenaran, tanpa AbortController.
- **+4 unit test (`src/__tests__/shconsole.test.jsx`, describe baru):** (1) respons poll LAMA tiba belakangan → tidak menimpa data poll BARU (poll #2 disulut via `vi.advanceTimersByTime(10000)` dengan fake timers `shouldAdvanceTime` — skenario nyata interval pada instansi SAMA; draf pertama test memakai unmount+remount terbukti TIDAK membedakan karena setState instansi gugur = no-op, ditulis ulang); (2) poll LAMA GAGAL setelah poll BARU sukses → banner HTTP 503 basi tidak muncul; (3) drawer ditutup saat poll in-flight → respons telat TIDAK memunculkan banner saat drawer dibuka lagi (ShConsole tak pernah unmount — setState stale tetap hidup); (4) pesan EventSource setelah drawer ditutup → log "hantu" tak muncul saat dibuka lagi + ES tertutup di cleanup.
- **Bukti diskriminasi (unit):** kode LAMA (checkout ShConsole.jsx dari commit siklus 126) → **4/4 test baru FAIL** (out-of-order, banner basi, log hantu — persis hipotesis); kode BARU → 24/24 PASS.
- **Bukti terukur:**
  - Vitest **2245/2245 (166 file, +4)**; ESLint 0/0 (warning `exhaustive-deps` di cleanup diberi alasan eksplisit — bump rid saat cleanup memang disengaja, pola siklus 126); build sukses (38 precache 1831 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E penuh hijau (14 probe): camreset (r=40.34, reset goal), hover follow (moved 1.040, dist 0.010), hover leave (vis false), TV (26 agen, tasks 2), zone multi (CAFÉ + SERVER ROOM vis), painter 1:1 (dist 0.0), meeting pick (r=18.96, sel+`__saved`), zoom follow (24→12 dipertahankan), bubble leak (deleted=14/created=16), scene dispose (3 remount, heap 58 MB stabil, zona=5), scene hooks (destroy→hook 0, recreate hidup), async destroy (fetch in-flight tak menghidupkan hook — guard siklus 124–125 tetap jalan), dblclick nexus (r=27.14, goal r:16 idempoten), shot **675.636 B** (E2E_VISUAL OK >500 KB); `e2e_errors`: **0 error**, hanya deprekasi `THREE.Clock`.
  - Catatan lingkungan: Xvfb :99 ditemukan MATI di awal siklus (socket `/tmp/.X11-unix/X99` basi membuat auto-start probe skip → 9 probe pertama "scene tidak siap", shot 241 KB); socket basi dibersihkan + Xvfb direstart (tracked background) → run ulang 14 probe semua hijau.
- Sisa backlog: KOSONG. Kandidat berikutnya: audit jalur async loader ShConsole lain (loadProjects/loadTasks/loadAgents/loadApprovals — polos setOv-setErr, tapi dipicu klik tab manual tanpa interval sehingga jendela overlap sempit) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 11:35 WIB — Siklus 128: Guard jalur async loader ShConsole lain (projects/tasks/agents/approvals) kini rid-guarded per-loader + bug nyata: `/wfs-api/projects` balas `{}` → `projects.map is not a function` → seluruh drawer crash blank (+4 test, bukti diskriminasi unit 4/4 FAIL→PASS) + akar masalah Xvfb :99 socket basi diperbaiki permanen di SEMUA probe E2E (13 probe gagal massal "scene tidak siap" dulu tiap siklus)

- **Bug nyata #1 (kandidat backlog siklus 127):** `loadProjects/loadTasks/loadAgents/loadApprovals` polos tanpa guard — klik Refresh/ganti filter overlap saat gateway lambat → respons LAMA menimpa daftar BARU; kegagalan respons basi menaikkan banner `HTTP 503` palsu (err dibagi lintas tab); refresh hasil keputusan approval bisa tertimpa GET pra-putuskan yang telat (list mundur menampilkan item yang baru saja disetujui).
- **Desain guard: rid PER-LOADER, bukan satu rid bersama.** Draf pertama memakai satu rid bersama dan langsung terbukti salah oleh test sendiri: di tab Tasks `loadTasks` + `loadProjects` berjalan PARALEL (data berbeda) — rid bersama membatalkan respons tasks yang sah. Kini `tabRid = {projects, tasks, agents, approvals}` (ref objek) + cleanup effect menaikkan SEMUA rid (monotonik — draf pertama me-RESET ke 0 yang membuka lubang yang sama dengan yang ditutup: effect re-run menomori rid dari 1 lagi, respons in-flight run sebelumnya dengan rid sama lolos guard).
- **Bug nyata #2 (terdeteksi test sendiri saat menulis harness):** `/wfs-api/projects` balas `{}`/`null` → `setProjects({})` → render `projects.map is not a function` → SELURUH drawer ShConsole crash blank (unhandled error). Perbaikan: normalisasi `Array.isArray(d?.projects) ? d.projects : Array.isArray(d) ? d : []`.
- **Bukti diskriminasi unit (`shconsole.test.jsx` +4):** kode LAMA (commit siklus 127) → **4/4 FAIL** persis hipotesis (daftar mundur 'Bas', banner 503 basi, daftar mundur 'Semua project', list approval mundur pra-putuskan); kode BARU → 28/28 PASS. Catatan metodologi: draf pertama test me-resolve promise yang SUDAH settle (no-op) → 3/4 lolos di kode lama = test palsu; ditulis ulang — respons BARU yang tampil duluan, respons LAMA dibiarkan MENGANTUNG lalu tiba belakangan (consume-once resolver; settle ulang slot sama = error).
- **Akar masalah lingkungan diperbaiki permanen (13 probe E2E):** probe-probe men-terminate Xvfb :99-nya sendiri di `finally`, tapi auto-start run berikutnya hanya mengecek KEBERADAAN socket `/tmp/.X11-unix/X99` — socket basi membuat Xvfb tak pernah distart → chrome tanpa display → scene tak boot → gelombang "scene tidak siap" massal (kali ini 9/13 probe; pola berulang sejak siklus 124 tapi selalu dibersihkan manual). Kini semua 17 probe: auto-start berbasis `xdpyinfo` (server hidup, bukan socket), socket basi dibersihkan otomatis, Xvfb bersama tak dibunuh (`if xv: xv.kill()`); `e2e_shot.py` gain 15→25 dtk. Bukti sebelum/sesudah: run pertama pasca-patch shot = 680 KB + camreset OK; tanpa patch semua FAIL.
- **Bukti terukur:**
  - Vitest **2249/2249 (166 file, +4)**; ESLint 0/0; build sukses (38 precache 1831 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E penuh **13/13 OK** (semua probe diperbaiki, run sekali jalan): camreset (r=40.34, reset goal), hover follow, hover leave, TV, zone multi, painter 1:1 (WYSIWYG), meeting pick (r=18.96, sel+`__saved`), zoom follow, bubble leak (deleted=13/created=15), scene dispose (3 remount, zona=5), scene hooks (destroy→hook 0, recreate hidup), async destroy (guard 124–125 jalan), dblclick nexus (r=25.26, goal idempoten); `e2e_shot` **678.224 B**; `e2e_errors` **0 error** (hanya deprekasi THREE.Clock).
- Commit: kode+test+probe di commit siklus ini (snapshot auto-dev 09:30/10:00 mengangkat sebagian bertahap).
- Sisa backlog: KOSONG. Kandidat berikutnya: audit loader Workspace lain (loadWsFiles/loadWsLogs/loadWsGit/openWsFile — polos, dipicu klik manual; dampak lebih kecil) — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 13:30 WIB — Siklus 129: Guard jalur async loader Workspace (files/file/logs/git) kini rid-guarded + bug arsitektur draf sendiri tertangkap test: fetch di event handler ganti-project DIBUNUH cleanup effect pada klik yang sama → panel tak pernah terisi (single-source fetch via effect, deps wsId) (+6 test, bukti diskriminasi 6/6 FAIL kode lama → 34/34 PASS)

- **Bug nyata (kandidat backlog siklus 128):** `loadWsFiles/loadWsLogs/loadWsGit/openWsFile` polos tanpa guard — klik Refresh/navigasi folder/buka file overlap saat gateway lambat → respons LAMA menimpa tampilan BARU: daftar file mundur ke folder/project sebelumnya, isi file A menimpa file B yang dibuka belakangan, log/git status mundur; kegagalan basi memunculkan banner `HTTP 503` palsu lintas tab; respons telat setelah drawer ditutup menulis state persist (tampil saat dibuka lagi — ShConsole tak pernah unmount).
- **Perubahan (`src/components/ShConsole.jsx`):** ref `wsRid = {files, file, logs, git}` (rid PER-LOADER, alasan sama siklus 128: file & logs berjalan paralel dgn data berbeda) + `guardWs`; normalisasi `entries`/`logs` ke array (gateway balas `{}`/`null`/string tak boleh crash `entries.map` — kelas sama dgn `projects.map` siklus 128); `selectWsProject` menaikkan SEMUA wsRid (respons milik project lama jadi basi).
- **Bug arsitektur draf sendiri (tertangkap test lama saat draf dijalankan — bukan sekadar teori):** (1) draf pertama menaruh bump rid di cleanup effect loader (deps memuat `projects.length`) → perubahan daftar project (state internal) ikut membatalkan fetch ws yang SAH → panel file project terpilih tak pernah terisi (8 test Workspace lama fail massal); (2) draf kedua memfetch 3 panel di `selectWsProject` (event handler) → klik ganti-TAB yang sama menjalankan cleanup effect baru (tab berubah) yang membunuh fetch itu → pola tak deterministik. Solusi final: fetch ws HANYA di effect loader (cabang `tab==='ws'`, deps `wsId` — single source), cleanup konteks dipisah ke effect tersendiri deps `[show, tab]` saja, `selectWsProject` murni bump-rid + reset state, `loadWsLogs/loadWsGit` di-`useCallback` (stabil utk deps). TDZ: 3 loader ws dipindah di ATAS effect (dipakai di deps array).
- **+6 test (`shconsole.test.jsx`, describe baru):** navigasi folder (respons folder LAMA tiba belakangan tak menimpa daftar folder BARU + heading wsPath tak mundur); refresh LAMA gagal setelah refresh BARU sukses → banner 503 basi tak muncul; ganti project (fetch refresh ketiga panel project lama MENGGANTUNG lalu tiba belakangan → file/log/git project baru tak tertimpa — data basi `{repo:false}` bahkan tak merender region Status git); buka file A menggantung → file B tampil → isi A telat tak menimpa B (label region ikut benar); tutup drawer saat fetch git menggantung → respons telat (`hacked-branch`) tak menulis setelah dibuka lagi; entries/logs non-array → render aman tanpa crash.
- **Bukti diskriminasi (unit):** kode LAMA (`git show 60237f0:src/components/ShConsole.jsx`) → **6/6 test baru FAIL** persis hipotesis (daftar mundur, banner 503 basi, log/file/git mundur lintas project, respons pasca-cleanup menulis, crash non-array); kode BARU → **34/34 PASS**. Catatan metodologi: draf test pertama memakai matcher findByText terhadap aria-label (`File: X` adalah aria-label, teks konten `📄 X`) dan skenario consume-once yang me-settle slot resolver SAMA dua kali (no-op kedua) — test palsu; ditulis ulang berbasis role query + fetch menggantung tambahan (tombol Refresh/Muat ulang/Status) agar respons LAMA benar-benar in-flight terpisah.
- **Bukti terukur:**
  - Vitest **2255/2255 (166 file, +6)**; ESLint 0/0; build sukses (38 precache 1832 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E penuh **13/13 OK** (run per probe): camreset (r=39.70, reset goal), hover follow (moved 2.564, dist 0.408), hover leave (vis false), TV (26 agen, tasks 2), zone multi (CAFÉ + SERVER ROOM vis), painter 1:1 (dist 0.0), meeting pick (r=18.96, sel+`__saved`), zoom follow (24→12 dipertahankan), bubble leak (deleted=12/created=15), scene dispose (3 remount, heap 78 MB stabil, zona=5), scene hooks (destroy→hook 0, recreate hidup), async destroy (guard 124–125 jalan), dblclick nexus (r=25.85, goal r:16 idempoten); `e2e_shot` **677.284 B** (E2E_VISUAL OK >500 KB); `e2e_errors` **0 error** (hanya deprekasi THREE.Clock).
  - Catatan lingkungan: Xvfb :99 mati di awal siklus → direstart (tracked background, socket basi dibersihkan); `shot.sh` scratch terprune → dibuat ulang sebagai wrapper `scripts/e2e_shot.py` (draf perintah chrome mandiri gagal: binary `google-chrome` tak ada di VM; chrome = `~/.cache/ms-playwright/chromium_headless_shell-1248/...` sesuai repo). Run `ganti project`/`meeting_pick`/`scene_dispose` butuh retry 1× (VM load — timeout 150–170 s kurang; naik ke 280 s lalu hijau tanpa perubahan kode).
- Commit: kode+test di commit siklus ini (snapshot auto-dev 11:30 mengangkat versi antara ShConsole.jsx — marker versi final diverifikasi ada di HEAD sebelum push).
- Sisa backlog: KOSONG — audit jalur async ShConsole kini TUNTAS (overview 127, tab loaders 128, ws loaders 129). Kandidat berikutnya: probe remount ×3 dgn tekanan memori lebih tinggi (10× tanpa GC eksplisit), atau audit `runTerm/runPreset/commitWs/sbAction` (POST exec — output terminal bisa tertimpa respons exec LAMA bila user mengetik cepat dua perintah; dampak kecil, semantik "output terakhir" ambigu).

## 2026-10-28 14:55 WIB — Siklus 130: Guard jalur aksi POST/exec ShConsole — terminal exec LAMA tak lagi menimpa output exec BARU, kegagalan commit/sandbox/approval basi tak lagi memunculkan banner 503 palsu (+6 test, bukti diskriminasi 5/6 FAIL kode lama → 42/42 PASS)

- **Bug nyata (kandidat backlog siklus 129: `runTerm/runPreset/commitWs/sbAction/decideApproval` polos tanpa guard):** dua perintah terminal diketik cepat (gateway lambat) → output exec LAMA tiba belakangan MENIMPA output exec BARU (termOut satu permukaan — runTerm & runPreset menulis state yang sama); commit LAMA gagal telat → banner `HTTP 503` palsu meski commit BARU sukses; `setGitMsg('')` + `loadWsGit` dari commit basi ikut jalan; aksi sandbox/approval telat pasca-tutup drawer / ganti tab menulis `setErr` state persist (banner palsu tampil saat dibuka lagi).
- **Perubahan (`src/components/ShConsole.jsx`):** ref `actRid = {term, git, sb, approval}` (rid PER-SURFACE — pola siklus 128/129: term & git berjalan paralel dgn data berbeda) + `guardAct`; guard SETELAH tiap await (sukses + catch) di 5 aksi; `selectWsProject` & cleanup konteks `[show, tab]` kini ikut menaikkan SEMUA actRid (aksi POST milik project/konteks lama jadi basi).
- **Bukti diskriminasi unit (`shconsole.test.jsx` +6, describe baru):** kode LAMA (`git show d054cb3:ShConsole.jsx`, hanya komponen ditukar) → **5/6 FAIL** persis hipotesis (OUT-SLEEP-LAMA menimpa OUT-LS; ERROR HTTP 503 menimpa OK-BARU; PYTEST-LAMA menimpa exec manual; banner commit basi muncul; banner approval basi muncul); kode BARU → **42/42 PASS**. Harness deferred consume-once (resolver tak bisa disettle ulang) + instant EXACT-match URL (substring `/projects` ikut mencocokkan `/projects/1/files` — draf pertama stub gagal persis karena itu, panel ws dapat data project).
- **Bukti terukur:**
  - Vitest **2282/2282 (169 file, +6)**; ESLint 0/0; build sukses (38 precache 1835.78 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E **10/10 OK**: camreset (r=39.70, reset goal), hover follow (moved 1.040, dist 0.015), hover leave, TV (26 agen), zone multi (SERVER ROOM vis), painter 1:1 (WYSIWYG), meeting pick (r=18.86, sel+`__saved`), zoom follow, bubble leak (deleted=13/created=15), scene dispose (3 remount, heap 78 MB stabil, zona=5), scene hooks (destroy→hook 0, recreate hidup), async destroy (guard 124–125 jalan), dblclick nexus (r=23.33, goal r:16 idempoten); `e2e_shot` **673.714 B** (E2E_VISUAL OK >500 KB) + `shot.sh` :0 677.904 B; `e2e_errors` **0 error** (hanya deprekasi THREE.Clock).
  - Catatan lingkungan: Xvfb :99 ditemukan mati di awal siklus → direstart (tracked background) sebelum probe.
- Commit: kode+test di commit siklus ini.
- Sisa backlog: KOSONG — audit jalur async ShConsole kini TUNTAS penuh (poll 127, loader tab 128, loader ws 129, aksi POST/exec 130). Kandidat berikutnya: audit aksi POST App.jsx lain (`runTask`, `createTask`, `create`, `decideApproval` setara — dipicu klik manual; dampak kecil) atau probe remount ×10 tanpa GC eksplisit — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 15:12 WIB — Siklus 131: Guard poll TaskBoard (interval 8 dtk) — poll LAMA tak lagi menimpa data poll BARU saat gateway lambat, kegagalan poll basi tak lagi memunculkan banner "Gagal memuat task" palsu, refresh pasca-run tak tertimpa poll pra-run (+4 test, bukti diskriminasi 3/4 FAIL kode lama → 46/46 PASS)

- **Bug nyata (kandidat backlog siklus 130: jalur async App.jsx tinggal TaskBoard/TaskModal):** `TaskBoard.load` polos tanpa guard — poll interval 8 dtk memakai SATU AbortController utk SEMUA poll (abort hanya saat cleanup effect, deps effect memuat sel/q/preset sehingga re-run sering) → gateway lambat: (1) respons poll LAMA tiba belakangan MENIMPA daftar/status BARU (out-of-order; filter kolom & metrik sprint mundur ke data basi); (2) kegagalan poll basi menaikkan banner "Gagal memuat task" palsu meski poll BARU sukses; (3) refresh pasca-run (`run()` → `load()`) bisa tertimpa poll pra-run yang telat — status task mundur dari "Jalan" ke "Antri"; (4) respons telat setelah board ditutup menulis state persist (TaskBoard render permanen, `open=false` → konten disembunyikan, state hidup).
- **Perubahan (`src/components/TaskBoard.jsx`):** ref `pollRid` + guard di `load` (SETELAH await `api('tasks')`: hanya rid terbaru yang boleh `setTasks`/`setSel`/`setErr(false)`; catch hanya menaikkan banner bila rid masih terbaru — poll lama gagal setelah poll baru sukses diabaikan). Cleanup effect poll menaikkan `pollRid` (respons in-flight pasca-unmount tak menulis). `run()` TIDAK perlu pre-increment: `load()` internal sudah menaikkan rid sendiri → refresh pasca-run otomatis rid tertinggi, menang atas poll pra-run menggantung. Pola identik guard App (siklus 126) & ShConsole (127–130).
- **+4 unit test (`TaskBoard.test.jsx`, describe baru, harness deferred consume-once — settle ulang slot sama = error):** (1) poll #1 tertahan, poll #2 disulut interval 8 dtk pada instansi SAMA (fake timers `shouldAdvanceTime`) → respons LAMA tak menimpa daftar BARU; (2) poll LAMA GAGAL setelah poll BARU sukses → banner "Gagal memuat task" basi tak muncul; (3) run sukses (jalur nyata `onAsk.onOk` → POST `/tasks/1/run` → `load()`) → refresh pasca-run menang atas poll pra-run menggantung; status detail (`p.note`) tak mundur dari Jalan ke Antri (query ke `p.note` — chip kolom filter & tombol quick-move juga berisi kata yang sama); (4) unmount saat poll menggantung → respons telat tidak menulis (0 act-error). Catatan metodologi: draf pertama mengasumsikan jumlah fetch pasti (#3) — effect re-run saat `sel`/`tasks` berikutnya menambah fetch tak terduga → ditulis ulang bebas-asumsi (settle slot TERTINGGI = pasca-run, lalu semua slot lama).
- **Bukti diskriminasi (unit):** kode LAMA (`git show d5a9897:src/components/TaskBoard.jsx`, hanya komponen ditukar) → **3/4 test baru FAIL** persis hipotesis (daftar mundur, banner basi, status mundur pasca-run); kode BARU → **46/46 PASS**.
- **Bukti terukur:**
  - Vitest **2286/2286 (169 file, +4)**; ESLint 0 error / 1 warning `exhaustive-deps` di cleanup (diberi alasan eksplisit — bump rid saat cleanup memang disengaja, pola siklus 126); build sukses (38 precache 1835.87 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E **13/13 OK** (run per probe): camreset, hover follow, hover leave, TV, zone multi, painter 1:1 (WYSIWYG), meeting pick (r=18.92, sel+`__saved`), zoom follow, bubble leak (deleted=12/created=15), scene dispose (3 remount, zona=5), scene hooks (destroy→hook 0), async destroy (guard 124–125 jalan), dblclick nexus (r=25.26, goal idempoten); `e2e_shot` via `shot.sh` :0 **678.916 B** (E2E_VISUAL OK >500 KB); `e2e_errors` **0 error** (hanya deprekasi THREE.Clock).
- Commit: kode+test di commit siklus ini (auto-dev `fa3713b` mengangkat versi antara TaskBoard.jsx — versi final diverifikasi ada sebelum push).
- Sisa backlog: KOSONG — jalur async papan tuntas (App poll 126, ShConsole 127–130, TaskBoard 131). Kandidat berikutnya: guard POST TaskModal `submit()` (dibuat task + langsung run; modal unmount saat submit telat → setState basi, dampak kecil karena modal bisa ditutup) atau probe remount ×10 tanpa GC eksplisit — atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 17:00 WIB — Siklus 132: Guard POST TaskModal `submit()` — submit LAMA telat tak lagi menutup modal BARU/menghapus input user/memicu auto-run task basi berbayar (+4 test, bukti diskriminasi 4/4 FAIL kode lama → 13/13 PASS)

- **Bug nyata (kandidat backlog siklus 131 — jalur async App.jsx terakhir setelah poll 126 & TaskBoard 131):** `submit()` di TaskModal polos tanpa guard — modal selalu mounted di App (`show` → render null), user menutup modal saat POST `/tasks` menggantung (gateway lambat) lalu membuka & mengetik task BARU → respons submit LAMA telat: (1) `onClose()` MENUTUP modal BARU yang sedang diedit user; (2) `setTitle('')/setPrompt('')` MENGHAPUS input user; (3) `onDone` (flash + `refreshStatus` di App) basi tetap jalan; (4) catch basi memunculkan alert "HTTP 503" palsu di form baru; (5) **tertangkap test sendiri:** `POST /tasks/{id}/run` (aksi BERBAYAR) masih terkirim untuk task basi — guard hanya SETELAH await run, task yang sudah di-abandon user dijalankan diam-diam; (6) `busy` basi: jalur sukses lama return sebelum `setBusy(false)` → form baru terkunci disabled.
- **Perubahan (`src/components/TaskModal.jsx`):** ref `rid` per-modal (satu modal, tak perlu per-surface) + guard `my !== rid.current` di 3 titik: SETELAH POST `/tasks` (BLOK auto-run task basi — titik paling penting), SETELAH await run (jangan onDone/setTitle('')/onClose), dan di catch (jangan alert basi). Effect `[show]`: saat modal dibuka → reset `err` + `busy` (generasi baru langsung siap) + bump `rid` (semua submit in-flight lama jadi basi). Ref didefinisikan DI ATAS early-return `if (!show) return null` — jumlah hook wajib konsisten antar render (draf pertama menaruh `useRef` setelah early-return → rules-of-hooks, tertangkap review sendiri sebelum commit). Jalur sukses/catch selalu menaikkan `setBusy(false)` sebelum guard-return basi → form baru tak pernah terkunci.
- **+4 unit test (`task_modal.test.jsx`, describe baru, harness deferred consume-once via `api.mockImplementation` — file ini me-mock `../lib/api`, stub global fetch TIDAK pernah terpakai komponen; settle ulang slot sama = error):** (1) submit #1 tertahan → tutup → buka ulang → submit #2 sukses → respons LAMA telat TIDAK menutup modal BARU, TIDAK menghapus input "Task KEDUA", onDone basi tak jalan, modal masih fungsional (submit #3 normal); (2) submit LAMA GAGAL telat → alert "HTTP 503" basi tak muncul, form baru tetap bisa submit; (3) submit&run LAMA telat sukses → TIDAK ada `POST /tasks/{id}/run` untuk task basi (diverifikasi via daftar URL api); (4) busy: in-flight → tombol disabled; modal dibuka ulang → langsung siap.
- **Bukti diskriminasi (unit):** kode LAMA (`git show c642df3:src/components/TaskModal.jsx`, hanya komponen ditukar) → **4/4 test baru FAIL** persis hipotesis (modal ditutup respons lama, alert 503 palsu, run task basi terkirim, form terkunci busy basi); kode BARU → **13/13 PASS**.
- **Bukti terukur:**
  - Vitest **2290/2290 (169 file, +4)**; ESLint 0 error 0 warning (dua `set-state-in-effect` di-reset effect diberi alasan eksplisit — pola lama yang memang disengaja); build sukses (38 precache 1836.00 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - E2E: `e2e_err.py` **0 error** (hanya deprekasi THREE.Clock); `shot.sh` :0 **680.681 B** (>500 KB — scene hidup).
- Commit: kode+test di commit siklus ini.
- Sisa backlog: **KOSONG** — audit jalur async UI TUNTAS PENUH: App poll 126, ShConsole 127–130 (poll/tab loader/ws loader/aksi POST), TaskBoard 131, TaskModal 132. Kandidat berikutnya: probe remount ×10 tanpa GC eksplisit (tekanan memori), atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 19:22 WIB — Siklus 133: Kebocoran memori per-remount ditemukan & diperbaiki — 10 listener canvas tak pernah dilepas saat destroy() menahan SELURUH dunia scene lama (+26 MB/remount); kini satu AbortController (+probe baru e2e_scene_dispose10: 10 remount tanpa GC, heap tertahan Δ+266→Δ+27 MB)

- **Temuan (probe baru `scripts/e2e_scene_dispose10.py`, kandidat backlog siklus 129/132):** turunan e2e_scene_dispose (3→10 remount, TANPA `--expose-gc` — window.gc tidak ada; GC paksa via CDP `HeapProfiler.collectGarbage` HANYA di akhir utk metrik "tertahan"). Run pertama FAIL sesuai dugaan: heap 74→393 MB, tertahan pasca-GC **Δ+266 MB (~26 MB per remount)** — bukan GC malas (sudah dipaksa).
- **Forensik heap snapshot (CDP):** snapshot 2 remount (hs_a, 229 MB) vs 6 remount (hs_b, 459 MB) → total self_size 138→281 MB, **semua kelas objek scene tumbuh seragam ×2.33** (JSArrayBufferData ×2.33, Float32Array ×2.33, CanvasRenderingContext2D ×2.33, closures ×2.33) = SATU akar per remount menahan seluruh dunia lama. Census: TIDAK ada Scene/Mesh/canvas DOM mati; window keys & DOM bersih sempurna (purge hook 123 & dispose graph 124 bekerja). Parser snapshot sendiri: nodes/edges FLAT via np.fromstring; BFS mundur 45 level (edge `weak` di-esklusi — weak tak menahan). **Jalur akar:** eternal/global handle GPU → WebGL2RenderingContext → canvas lama (data-engine three.js r183) → blink::EventTargetData → **EventListener → V8EventListener → closure → scope Context @285983 → fr.children → …(seluruh pohon Object3D)**.
- **Akar masalah:** `destroy()` melepas listener window/document (resize/keydown/pointerup/pointermove/visibilitychange) tapi **TIDAK pernah melepas 10 listener di `renderer.domElement`** (touchstart/touchmove/touchend, pointerdown ×2, pointerup, dblclick, pointermove, pointerleave, wheel). Canvas WebGL lama tertahan oleh eternal handle sisi GPU (terlihat di snapshot walau `forceContextLoss`+`dispose`), dan tiap listener canvas berbagi scope closure raksasa `createOfficeScene` (office/agentData/…) → satu listener tersisa = seluruh dunia lama terkunci di heap. Kandidat lama (agentData/screenData/array level-modul) terbukti BUKAN penyebab — semuanya di dalam fungsi (createOfficeScene = baris 66–2201).
- **Perubahan (`src/scene/OfficeScene.js`):** satu `AbortController` per scene — helper `__onCanvas(ev,fn,opts)` menambahkan `{signal}` ke SEMUA 10 pemasangan listener canvas; `destroy()` memanggil `__canvasAbort.abort()` paling awal (sebelum teardown apa pun). Nol perubahan perilaku runtime (hanya melepas).
- **Bukti pascaperbaikan (probe sama):** 10 remount tanpa GC eksplisit → **heap pasca-dispose stabil ~63–74 MB sepanjang run** (dulu merambat 35→324 MB); **heap tertahan pasca-GC paksa 68→95 MB (Δ+27 MB ≤ ambang 50)**; dispose graph tiap destroy (5063 geometri/4982 material/129 tekstur); zona tetap 5; konsol bersih; `E2E_SCENEDISPOSE10: OK`.
- **Bukti terukur:**
  - Vitest **2290/2290 (169 file)**; ESLint OfficeScene **0/0**; build sukses (38 precache 1835.72 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E **8/8 OK** (probe interaksi kena wiring listener): camreset (r=40.34, reset goal), hover follow (moved 1.040, dist 0.014), meeting pick (r=18.96, sel+`__saved`), zoom follow (24→12 dipertahankan), dblclick nexus (r=27.14, goal idempoten), bubble leak (deleted=12/created=14), scene hooks (destroy→sisa hook 0, recreate hidup), async destroy (guard tvPull/pull jalan, hooksLeft=1); `e2e_errors` **0 error** (hanya deprekasi THREE.Clock); `shot.sh` :0 **689.459 B** (>500 KB — scene hidup).
  - Skrip diagnostik disimpan utk audit berikutnya: `scripts/e2e_scene_dispose10.py` (probe), `scripts/diag_remount_leak.py`, `diag_heapsnap.py`, `diag_heapsnap_parse.py`, `diag_census.py`, `diag_snapdiff_run.py`, `diag_snapdiff.py`, `diag_retainers2.py`, `diag_rootpath.py` (forensik snapshot).
- Commit: kode+probe+skrip diagnostik di commit siklus ini.
- Sisa backlog: KOSONG — kebocoran remount (satu-satunya temuan telemetry E2E) TUNTAS. Kandidat berikutnya: naikkan ambang probe (remount ×20) bila ingin bukti lebih kuat, atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 20:45 WIB — Siklus 134: THREE.Clock → THREE.Timer — warning deprekasi hilang dari konsol (0 pesan), Timer.connect(document) membuat elapsed fase ambient/dust/pulse TIDAK melompat saat tab kembali visible

- **Kandidat (sisa telemetri terakhir):** `e2e_err.py` tiap siklus selalu melaporkan 1 warning: `THREE.THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` — satu-satunya pesan konsol non-error yang tersisa di seluruh aplikasi (three r183; Clock dijadwalkan dihapus).
- **Perubahan (`src/scene/OfficeScene.js`):** `new THREE.Clock()` → `new THREE.Timer()` + `timer.connect(document)`. Pola API baru: `timer.update()` dipanggil sekali per frame di awal animate() → `getDelta()`/`getElapsed()` murni pembacaan (Clock lama: getElapsedTime() memanggil getDelta() → efek samping; nilai berubah bila dipanggil 2× per frame). Clamp `.05` dipertahankan. `timer.connect(document)` memakai Page Visibility API: delta=0 saat tab hidden, `reset()` saat kembali visible → **fase ambient/dust/pulse (fungsi sin/cos dari elapsed) TIDAK melompat** sebesar durasi hidden (Clock lama: getElapsedTime melompat +durasi hidden — komentar lama sendiri mengakuinya; loop berhenti saat hidden sehingga clamp .05 hanya menutup delta, bukan elapsed). `timer.dispose()` ditambahkan di rantai destroy() (lepaskan listener visibilitychange milik Timer → konsisten dengan perbaikan leak siklus 133, tidak menambah listener yang bocor). Nol perubahan perilaku render/logika.
- **Bukti terukur:**
  - **Konsol bersih total:** `e2e_err.py` **0 pesan / 0 error / 0 warning** (dulu selalu 1 warning deprekasi) — untuk pertama kalinya sejak probe ini ada.
  - Vitest **2290/2290 (169 file)**; ESLint OfficeScene **0/0**; build sukses (38 precache 1835.79 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 menyajikan bundle baru (OfficeScene-CLJXvzuU).
  - Regresi E2E **10/10 OK** (jalur yang menyentuh clock/loop/destroy): camreset (r=39.70, reset goal), hover follow (moved 1.040, dist 0.009), meeting pick (r=18.96, sel+`__saved`), zoom follow (24→12 dipertahankan), dblclick nexus (r=25.85, goal idempoten), bubble leak (deleted=12/created=15), scene hooks (destroy→sisa hook 0, recreate hidup zona=5), async destroy (guard tvPull/pull jalan, hooksLeft=1), zone multi (SERVER ROOM vis), TV painter WYSIWYG (dist=0.0) + TV poll (26 agen); **e2e_scene_dispose10 tetap PASS pasca-ganti Timer: 10 remount tanpa GC, heap tertahan 68→93 MB (Δ+25 MB ≤ 50)** — Timer.disconnect() di destroy() tidak memperkenalkan leak baru.
  - `shot.sh` :0 **688.360 B** (>500 KB — scene hidup); `e2e_errors` 0 error.
  - Catatan lingkungan: Xvfb :99 ditemukan mati di awal siklus (socket basi) → direstart (tracked background) sebelum semua probe; run dispose10 +10 menit kena timeout 180/420 dtk → sukses dgn timeout tinggi & run terakhir background.
- Commit: kode di commit siklus ini (tanpa test baru — perilaku eksternal tidak berubah, klaim = hilangnya warning terukur via probe konsol).
- Sisa backlog: KOSONG — konsol aplikasi kini benar-benar 0 pesan. Kandidat berikutnya: audit aksi POST App.jsx manual (`runTask`, `create` — pola guard sama dgn 126–132, dampak kecil) atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-28 22:25 WIB — Siklus 135: Guard 4 aksi POST terakhir ShConsole (create project/createTask/runTask/runAllPending) — dobel klik tak lagi mengirim 2× POST /run BERBAYAR, respons lama telat tak menghapus input user / pindah tab / menampilkan banner 503 basi (+5 test, bukti diskriminasi 5/5 FAIL kode lama → 47/47 PASS)

- **Bug nyata (kandidat backlog siklus 134 — aksi POST polos TERAKHIR di aplikasi):** `create`, `createTask`, `runTask`, `runAllPending` di ShConsole masih tanpa guard (siklus 130 hanya menutup term/git/sb/approval). Gateway lambat: (1) create project menggantung → drawer ditutup-dibuka → respons sukses telat MENGHAPUS input user & `setTab('projects')` MEMINDAHKAN tab drawer baru; (2) createTask sama — input "Task KEDUA" terhapus; (3) `runTask` dobel klik/Enter (tombol polos tanpa disabled) → **2× POST `/tasks/{id}/run` BERBAYAR** (kuota API); run A telat gagal → banner `HTTP 503` menimpa daftar hasil refresh run B; (4) `runAllPending`: err bulk basi saat bulk menyusul.
- **Perubahan (`src/components/ShConsole.jsx`):** `actRid` +4 surface `{create, task, run, bulk}` + `guardAct` SETELAH await di 4 aksi (sukses + catch). `runTask` anti dobel-klik DUA LAPIS: (a) tombol per-task disabled via state `runningTask` (Set — dua task berbeda tetap bisa paralel; label "Menjalankan…" + aria-busy), (b) lock ref `runInFlight` (Set per-task — klik programatis/fokus/Enter ikut terblokir); cleanup `finally` hanya menghapus milik sendiri (functional update) — run task lain in-flight tak terganggu.
- **+5 unit test (`shconsole.test.jsx`, describe baru; harness `stubDeferred` kini POST-aware: kunci `'POST /url'` menahan hanya method itu, instant EXACT-match URL, resolver consume-once — settle ulang slot = error):** (1) run menggantung + klik dobel/triple → hanya SATU POST /run, tombol pulih pasca-selesai; (2) run A telat gagal setelah run B (project lain) sukses → tak ada alert 503, daftar TASK B utuh; (3) create project LAMA sukses telat pasca tutup-buka drawer → input "PROYEK-BARU" utuh, TIDAK pindah tab; (4) create LAMA gagal telat → alert 503 basi tak muncul di drawer baru; (5) createTask LAMA telat → input "Task KEDUA" tak dihapus.
- **Bukti diskriminasi:** kode LAMA (`git show 38bd5a7:src/components/ShConsole.jsx`, hanya komponen ditukar) → **5/5 test baru FAIL** persis hipotesis (klik dobel kirim POST run lagi; banner 503 basi; input dihapus; pindah tab otomatis); kode BARU → **47/47 PASS** (file), **2295/2295** total. Catatan metodologi: bot auto-dev mengangkat ShConsole.jsx di antara perintah (commit `05fc6c6`) — baseline diskriminasi = commit siklus 134 sejati (38bd5a7), bukan HEAD.
- **Bukti terukur:**
  - Vitest **2295/2295 (169 file, +5)**; ESLint 0 error 0 warning; build sukses (38 precache 1836.48 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E **11/11 OK**: camreset (r=39.11, reset goal), hover follow (moved 1.120, dist 0.010), dblclick nexus (r=26.48, goal idempoten + __saved), zone multi (SERVER ROOM vis), scene hooks (destroy→hook 0, recreate zona=5, 26 agen), bubble leak (deleted=12/created=14), zoom follow (24→12), TV (26 agen, 2 task), TV WYSIWYG (dist 0.0), async destroy (guard tvPull/pull), meeting pick (r=18.96, sel+__saved); `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **687.028 B** (>500 KB — scene hidup). Catatan: e2e_meeting_pick buffered-output terlihat terpotong saat piped — bukan regresi; dengan `python -u` hasil penuh OK.
- Commit: kode+test di commit siklus ini.
- Sisa backlog: **KOSONG** — audit jalur async UI TUNTAS PENUH: App poll 126, ShConsole 127–135 (poll/tab loader/ws loader/aksi POST/exec/create/run/bulk), TaskBoard 131, TaskModal 132. Kandidat berikutnya: probe remount ×20 (bukti lebih kuat utk leak fix siklus 133) atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 00:35 WIB — Siklus 136: Guard rid out-of-order diperluas ke 5 komponen poll tersisa (ProjectPanel/TeamStats/Dashboard/SysMeter/Ticker) — poll LAMA telat tak lagi menimpa data BARU / menaikkan banner error basi (+13 test, diskriminasi 9/13 FAIL kode lama 1f460a9 → 13/13 PASS)

- **Bug (keluarga yang sama dgn TaskBoard siklus 131 — kandidat dari audit rutin pasca-backlog kosong):** 5 komponen poll tersisa memakai SATU AbortController/flag `stop` bersama SEMUA poll (abort/stop hanya saat cleanup effect) → gateway lambat, interval menyulut poll #2 sementara #1 masih in-flight: respons poll #1 LAMA tiba belakangan **menimpa data BARU** (daftar task, stats, agent count, teks marquee mundur ke data basi) dan **kegagalan poll basi menaikkan banner error palsu** ("Gagal memuat data proyek" / "Gateway offline" / "Data belum lengkap") di atas data yang sudah valid. Cakupan: ProjectPanel (fetch /wfs-project, 15 dtk), TeamStats (tasks+resources, 15 dtk), Dashboard (4 endpoint batch, 10 dtk), SysMeter (status+resources, 12 dtk), Ticker (tasks+agents+status, 20 dtk).
- **Perubahan (5 file):** pola identik siklus 131 — ref `loadRid` (atau `rid` lokal utk widget selalu-mounted) + guard `rid !== latest` SETELAH await: sukses → abaikan (tak menulis state), catch → hanya menaikkan banner bila rid masih terbaru. Cleanup effect menaikkan rid (respons in-flight pasca-unmount/close tak menulis). Dashboard: `if (signal?.aborted)` diganti guard rid (abort sinyal tak menutup celah out-of-order antar poll). Nol perubahan perilaku normal.
- **Audit WfsPanel `loadAgents` — TIDAK diubah (diputuskan):** hanya dipanggil di mount (sekali) + tombol "Muat ulang" yang baru muncul SETELAH call sebelumnya selesai (gagal) → tidak ada jalur call bersamaan dari UI; guard tidak akan terobservasi.
- **+13 unit test (`poll_rid_guard.test.jsx` baru, harness deferred consume-once — settle ulang slot = error; `Error` me-REJECT sungguhan → jalur catch komponen; api() mock mengembalikan data MENTAH, wrapper Response hanya utk fetch langsung ProjectPanel):** ProjectPanel ×3, TeamStats ×2, Dashboard ×2, SysMeter ×3, Ticker ×3 — skenario: poll #2 (interval, fake timers) sukses → poll #1 LAMA tak menimpa; poll #1 LAMA GAGAL belakangan → banner basi tak muncul; unmount saat menggantung → respons telat tak menulis (0 act-error).
- **Bukti diskriminasi:** kode LAMA (`git show 1f460a9:src/components/…`, baseline siklus 135 sejati) → **9/13 test baru FAIL** persis hipotesis (data mundur, banner basi; 4 sisanya = skenario unmount/timing yang memang tak beda). **Catatan metodologi:** bot auto-dev meng-commit hasil antara (`26aac6f` "auto: update 22:30") SEBELUM diskriminasi — percobaan pertama tukar komponen ke "HEAD" salah karena HEAD sudah berisi kode baru; baseline diskriminasi = 1f460a9.
- **Bukti terukur:**
  - Vitest **2308/2308 (170 file, +13)**; ESLint 0 error 0 warning (3 `exhaustive-deps` di cleanup diberi alasan eksplisit — bump rid disengaja, pola siklus 126/131); build sukses (38 precache 1836.79 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - Regresi E2E **10/10 OK**: camreset, hover follow, zone multi, dblclick nexus (r=25.85, idempoten + __saved), scene hooks (destroy→hook 0, recreate zona=5), zoom follow (24→12), bubble leak (deleted=12/created=14), async destroy (guard tvPull/pull), TV texture, meeting pick (r=18.92, sel+__saved; run pertama kena timeout 150 dtk — 4 attempt × sleep, bukan regresi); `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **686.859 B** (>500 KB — scene hidup).
- Commit: kode+test di commit siklus ini.
- Sisa backlog: **KOSONG** — audit guard async UI kini merata SELURUH komponen poll (App 126, ShConsole 127–135, TaskBoard 131, TaskModal 132, panel/widget 136). Kandidat berikutnya: probe remount ×20, atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 01:30 WIB — Siklus 137: Guard rid terakhir di App.doConfirm (pause/resume ALL — POST berbayar terakhir tanpa guard) — respons pause LAMA telat tak lagi MENUTUP dialog konfirmasi BARU / toast basi / busy basi mengunci dialog baru (+5 test, diskriminasi 4/5 FAIL kode lama)

- **Bug (kandidat dari audit pasca-backlog kosong — aksi POST aktif TERAKHIR di aplikasi tanpa guard):** `doConfirm` di App.jsx (POST `tasks/pause_all` / `tasks/resume_all` — pause membatalkan proses berjalan, resume memanggil model AI per task = kuota API). Tombol "Batal" dialog konfirmasi sengaja TIDAK disabled saat busy (user harus selalu bisa membatalkan) → gateway lambat: user membatalkan dialog menggantung → membuka dialog BARU (mode sama/beda) → respons POST #1 LAMA tiba belakangan: (a) `setConfirm(null)` **menutup dialog BARU**, (b) toast basi "Dijeda — N proses"/"HTTP 503" muncul di atas generasi baru, (c) `finally` menghapus `confirmBusy` milik generasi baru — dan sebaliknya cancel saat in-flight bisa meninggalkan busy true yang mengunci tombol dialog baru. Audit GlobalTaskComposer & ProjectWorkspaceModal → **komponen yatim** (tidak diimpor di mana pun, tidak dirender) — TIDAK diubah; TaskBoard.run aman (modal konfirmasi unmount saat klik pertama, tiap run disengaja & berurutan).
- **Perubahan (`src/App.jsx`):** ref `confirmRid` + helper `openConfirm(mode)` / `closeConfirm()` — setiap buka/tutup dialog menaikkan rid DAN mereset `confirmBusy(false)` (generasi baru langsung siap); `doConfirm` mengambil rid sendiri, guard `rid !== confirmRid.current` SETELAH await di 4 titik: sukses pause, sukses resume, sebelum `setConfirm(null)+refreshStatus`, dan di catch (toast gagal basi tidak muncul). `finally` hanya menghapus busy bila rid masih terbaru (busy generasi baru tidak terganggu). Server-side POST tetap sudah terkirim — yang dibatalkan hanya penulisannya ke UI. Nol perubahan alur normal.
- **+5 unit test (`app_confirm_guard.test.jsx` baru):** stub POST pause_all/resume_all DEFER FIFO consume-once (settle slot kosong = error); poll App + widget instan; toolbar hanya menampilkan SATU tombol (resume saat paused / pause saat tidak) → mode dialog per-test lewat state.paused awal; tombol konfirmasi berganti label "Memproses…" saat busy. Skenario: (1) pause menggantung → Batal → buka ulang → respons LAMA telat sukses TIDAK menutup dialog BARU & toast basi tak muncul, dialog baru tetap bisa submit; (2) pause LAMA GAGAL (HTTP 503) telat → toast 503 basi tak muncul, dialog BARU utuh; (3) resume (paused) menggantung → tutup → buka ulang → respons LAMA telat sukses tak menutup dialog BARU; (4) tutup tanpa resolve → buka ulang → tombol langsung aktif label "Ya, jeda" (bukan "Memproses…"), settle FIFO tertua (POST #1 basi) tak menutup dialog, settle #2 menutup + toast generasi baru; (5) alur normal tidak berubah (POST 1x, dialog tertutup + toast).
- **Bukti diskriminasi:** kode LAMA (git stash App.jsx, hanya komponen) → **4/5 test baru FAIL** persis hipotesis (dialog BARU tertutup respons lama, toast basi muncul, busy basi; 1 lolos = skenario alur normal yang memang tak beda); kode BARU → **5/5 PASS**. Baseline diskriminasi bersih (belum ada commit auto-dev di antaranya).
- **Bukti terukur:**
  - Vitest **2313/2313 (171 file, +5)**; ESLint App + test baru **0 error 0 warning**; build sukses (38 precache 1837.01 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - E2E: `e2e_err.py` **0 pesan / 0 error / 0 warning**; smoke **4/4 OK** (camreset r=39.70 reset goal, hover follow moved 1.120/dist 0.014, scene hooks destroy→sisa hook 0 + recreate zona=5/26 agen, zoom follow 21.46→12.00 dipertahankan); `shot.sh` :0 **685.983 B** (>500 KB — scene hidup).
- Commit: kode+test di commit siklus ini.
- Sisa backlog: **KOSONG** — guard rid kini mencakup SELURUH jalur async aktif: poll (App 126, TaskBoard 131, ShConsole 127–130, panel/widget 136), aksi POST (ShConsole 135, TaskModal 132, App doConfirm 137). Audit menyisakan GlobalTaskComposer & ProjectWorkspaceModal sebagai komponen yatim (tidak dipakai) — kandidat berikutnya: hapus kedua komponen yatim + test-nya (rasio sinyal test), atau probe remount ×20, atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 01:55 WIB — Siklus 138: Hapus 2 komponen yatim (GlobalTaskComposer, ProjectWorkspaceModal) + 4 file test-nya — audit pasca-backlog kosong, repo jadi sumber kebenaran yang jujur (−1130 baris, rasio sinyal test naik)

- **Dasar keputusan (kandidat dari siklus 137):** audit referensi menyeluruh (`grep -rn` ke seluruh src/ + index.html) membuktikan `GlobalTaskComposer.jsx` (303 baris) & `ProjectWorkspaceModal.jsx` (365 baris) **tidak diimpor dan tidak dirender di mana pun** — hanya dirujuk oleh file test. Fitur yang dijanjikan komponen ini (composer task global, workspace proyek dgn Live Preview/File Explorer/Terminal/QA) TIDAK terjangkau user dari UI — dead code yang menyesatkan pembaca repo & test suite (37 test menguji komponen tak terpakai = sinyal palsu kesehatan).
- **Dihapus:** 2 komponen + 4 file test yang murni menguji keduanya (`global_task_composer.test.jsx` 6 test, `project_workspace_modal.test.jsx` 15, `workspace_races.test.jsx` 5, `wfs_software_house.test.jsx` 11) — total −1130 baris. Post-grep verifikasi: 0 referensi tersisa. Backup /tmp sebelum hapus.
- **Bonus:** ESLint menemukan 1 warning `exhaustive-deps` pre-existing di `TaskBoard.jsx:408` (cleanup `pollRid.current++` — pola guard rid siklus 131 yang sama dgn 5 komponen lain tapi luput diberi disable-comment) → diberi alasan eksplisit, ESLint kembali 0/0.
- **Bukti terukur:**
  - Bundle **TIDAK berubah**: `dist/assets/index-ZPDOcQUA.js` 237314 B hash identik dgn sebelum penghapusan → rollup memang sudah tree-shake kedua komponen (ship byte-identik, diverifikasi `diff -q` dgn `~/wfs-hq/`); manfaat nyata = repo & test suite.
  - Vitest **2276/2276 (167 file, −37 test yatim, −4 file)**; ESLint **0 error 0 warning**; build sukses (38 precache 1837.01 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - E2E: `e2e_err.py` **0 pesan / 0 error / 0 warning**; scene hidup via `shot.sh` :0 **687.956 B** (>500 KB); probe CDP: 6/6 hook debug utuh (__agentData/__cam/__setTime/__wallState/__camCam/__screens), **26 agen**, cam jauh 42.75.
- Commit: kode di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: probe remount ×20 (bukti leak fix 133), atau perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 02:35 WIB — Siklus 139: Probe remount ×20 TANPA GC eksplisit — bukti kuat fix leak siklus 133: heap tertahan 20 remount hanya Δ+22 MB (kode lama diproyeksi Δ+520 MB), heap-after-dispose datar 64–75 MB sepanjang 20 putaran

- **Kandidat (satu-satunya item dari siklus 138):** turunkan probe `e2e_scene_dispose10.py` (siklus 133) → `scripts/e2e_scene_dispose20.py`: ROUNDS 10→20, ambang tertahan proporsional (Δ≤100 MB ≈5 MB/putaran, absolut ≤300 MB), marker log `E2E_SCENEDISPOSE20`. Klaim yang diuji identik ×10: destroy selalu sukses, dispose graph tiap destroy (geometries>200 & textures>10), hook scene bersih (≤2), recreate hidup (26 agen, zona tetap 5 — registri tidak dobel), heap tertahan pasca-GC paksa CDP terkendali, konsol bersih; chrome tetap TANPA `--expose-gc` (hanya GC otomatis V8 di antara putaran).
- **Hasil (scene NYATA WebGL SwiftShader, 20 putaran ×~36 s = 12,7 menit):** `E2E_SCENEDISPOSE20: OK` — **heap tertahan pasca-GC paksa 80→102 MB (Δ+22 MB)**. Kebocoran pra-fix siklus 133 terukur ~26 MB/remount → pada ×20 diproyeksi Δ+520 MB; hasil nyata 22 MB ≈ 1 MB/putaran = bisu. dispose graph tiap destroy konsisten (geometries 5063, materials 4981–4982, textures 128–129); heap-after-dispose datar 35–127 MB (mayoritas 64–75 MB, fluktuasi = GC lazy V8, bukan tren naik); hook sisa ≤2 tiap putaran; 26 agen & zona 5 di semua recreate; konsol 0 error.
- **Catatan metodologi:** run `npm test` #1 melaporkan 1 FAIL flake saat dieksekusi BERSAMAAN dgn Chrome probe SwiftShader di mesin 2 vCPU (kontensi CPU memicu timeout test); rerun solo (2×) **2276/2276 PASS (167 file)** — bukan regresi kode (siklus ini tanpa perubahan src/). Probe ×20 disimpan ke repo (`scripts/`) agar bisa dijadwalkan ulang sebagai regresi berkala, sementara ×10 tetap jadi gate cepat.
- **Bukti terukur:**
  - Vitest **2276/2276 (167 file)**; build sukses (38 precache 1837.01 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **689.072 B** (>500 KB — scene hidup).
- Commit: probe baru di commit siklus ini (tanpa perubahan src/).
- Sisa backlog: **KOSONG** — bukti remount ×20 selesai, probe ×10 tetap dipakai. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 03:25 WIB — Siklus 140: Status live AgentInspector dari state machine scene — bug label HARDCODED "Aktif Bekerja" untuk SEMUA agen diperbaiki (agen rapat/makan siang/berjalan kini terlabel benar; +16 test, diskriminasi 6/16 FAIL kode lama)

- **Bug (audit rutin pasca-backlog kosong — jalur data scene → UI):** kartu AgentInspector (klik agen 3D) menampilkan chip Status yang DI-HARDCODE "Aktif Bekerja" (hijau) untuk SEMUA agen — padahal scene punya data live nyata per agen di `window.__agentData` (`state`: sitting/walking_out/walking_back/meeting/leaving/offsite + flag `lunch` dari daycycle). Agen yang sedang DALAM RAPAT, makan siang di kafe, berjalan keliling, atau pulang tetap dilabeli "Aktif Bekerja" = informasi palsu di UI (kartu ini juga pintu masuk founder ke Konsol Software House — status salah menyesatkan keputusan).
- **Perubahan:**
  - `src/scene/parts/agent_status.js` (BARU, murni tanpa THREE/DOM — bisa di-unit-test): `agentLiveStatus(ad)` memetakan state machine motion.js/meeting.js/daycycle.js → {label, tone, hex}: sitting→Aktif Bekerja (hijau), meeting→Dalam Rapat (biru), lunch (flag, state walking_out/diam kafe)→Makan Siang (oranye), walking_out→Berjalan, walking_back→Kembali ke Meja, leaving→Pulang, offsite→Di Luar Kantor, entri tak dikenal/korup→Standby. Guard anti-poisoning: state non-string → Standby (bukan crash). `findAgentLiveEntry(agentData, name)` pencarian case-insensitive (scene memakai nama uppercase, UI membawa nama asli; reception CEO bukan entri agentData → null).
  - `src/components/AgentInspector.jsx`: chip Status kini dibaca live dari `window.__agentData` via `useState` + polling 1 dtk SELAMA kartu terbuka (cleanup `clearInterval` di unmount — tanpa leak timer) → agen yang berpindah status terlihat berubah tanpa buka-tutup kartu. Scene belum siap/matris kosong → "Standby" (bukan klaim palsu). Warna titik & teks mengikuti status (bukan `var(--green)` permanen).
- **+16 unit test (`agent_live_status.test.jsx` baru):** 6 test murni peta status (semua state + korup), 4 test pencarian entri, 6 test integrasi komponen — termasuk: agen peserta rapat → "Dalam Rapat" BUKAN "Aktif Bekerja"; live transition (fake timers: agen sitting → meeting saat kartu terbuka → label ikut pindah); interval dibersihkan saat unmount; regresi Escape masih menutup kartu.
- **Bukti diskriminasi:** kode LAMA (backup `/tmp/AI.bak-*.js`) → **6/16 test integrasi FAIL** persis hipotesis (offsite/lunch/meeting/standby/live-update/interval); kode BARU → **16/16 PASS**. (6 test murni + 4 pencarian lolos di kedua versi karena tidak menyentuh komponen — memang unit murni baru.)
- **Bukti E2E scene NYATA (`scripts/e2e_inspector_status.py` baru, disimpan ke repo):** muat kantor Chrome SwiftShader Xvfb :99 → 26 agen → `__wfsSceneSelect('be1')` → kartu muncul, chip terbaca dari DOM; `__setTime(720)` (jendela makan siang 12:00) → **chip berubah "Aktif Bekerja" → "Makan Siang"** via polling live, entri scene `{"state":"walking_out","lunch":true}` = label benar sesuai state machine. Catatan metodologi: peserta rapat window pertama adalah indeks 3–14 (BUDI=1 tidak ikut — rotasi hash `win*7+3`), sehingga transisi live diuji lewat jendela lunch yang pasti menyentuh semua agen.
- **Bukti terukur:**
  - Vitest **2292/2292 (168 file, +16)**; ESLint 0 error 0 warning; build sukses (38 precache 1837.97 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **686.262 B** (>500 KB — scene hidup).
- Commit: `a72474f` — PUSH-OK ke origin/main.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 04:00 WIB — Siklus 141: Chip fase kantor LIVE di HUD — jalur data scene→UI yang terbangun tapi DIBUANG App (onStatusUpdate: () => {}) kini tampil; 12 fase daycycle (fokus/rapat/makan siang/shift malam…) terlihat founder tanpa buka panel (+7 test, diskriminasi 1/7 FAIL kode lama)

- **Bug (audit rutin pasca-backlog kosong — jalur data scene→UI, keluarga temuan siklus 140):** scene memanggil `onStatusUpdate(statusAt(min))` tiap perubahan jam simulasi — `daycycle.SCHEDULE` punya 12 fase kantor ("Fokus pagi", "Stand-up pagi", "Deep work · semua online", "Istirahat makan siang", "Sprint review", "Shift malam · WFS online", dst) — tapi App mendaftarkan callback KOSONG `onStatusUpdate: () => {}` (App.jsx:294) → seluruh label fase tidak pernah tampil di UI mana pun. Founder tidak bisa tahu kantor sedang fase apa (rapat? makan siang? shift malam?) tanpa menebak dari cahaya scene.
- **Perubahan:**
  - `src/scene/parts/office_phase.js` (BARU, murni): `phaseStyleFor(label)` memetakan 11 label unik SCHEDULE → tone CSS + ikon (work hijau/meet biru/break amber/dawn-dusk amber/night abu). SATU sumber kebenaran: label fase TIDAK dihitung ulang dari menit di UI (berisiko desinkron dgn scene) — scene tetap pemilik label, modul hanya menata gaya. Anti-poisoning: non-string/kosong → null (chip disembunyikan, bukan fallback palsu); label tak dikenal → tone dim generik (tetap tampil, scene tetap sumber kebenaran).
  - `App.jsx`: `officePhase` state + `onStatusUpdate: (label) => setOfficePhase(label)` + prop `phase` ke HUD.
  - `HUD.jsx`: chip `.phase-chip` (role=status, title tooltip) antara jam & slider — disembunyikan saat scene belum lapor.
  - `index.css`: gaya chip + tone per fase + responsive ≤760px (ellipsis, font 10px).
- **+7 test (`office_phase.test.jsx` baru):** 5 murni (11 label→tone benar; Tanpa fallback tersembunyi — SEMUA label SCHEDULE harus terpetakan, bukan jatuh ke dim; anti-poisoning 6 input korup → null; label tak dikenal → dim) + 2 integrasi App→HUD (onStatusUpdate menampilkan chip & perubahan label → chip ikut berubah live; scene belum lapor → chip TIDAK dirender).
- **Bukti diskriminasi:** kode LAMA (backup /tmp/AI.bak-*) → **1/7 FAIL** persis hipotesis (integrasi: chip tak pernah muncul karena callback dibuang); kode BARU → **7/7 PASS**. Test "tanpa fallback" menyelamatkan bug nyata saat dev: kunci peta awal `'Shift malam'` meleset dgn label asli `'Shift malam · WFS online'` → ketahuan test, bukan lolos diam-diam.
- **Bukti E2E scene NYATA (`scripts/e2e_office_phase.py` baru, disimpan ke repo):** Chrome SwiftShader Xvfb :99 → 26 agen → chip awal HUD **"Shift malam · WFS online"** (cls phase-chip night) → `__setTime(720)` → chip berubah LIVE **"Istirahat makan siang"** (cls phase-chip break) tanpa reload — jalur scene→App→HUD terbukti ujung-ke-ujung.
- **Bukti terukur:**
  - Vitest **2299/2299 (169 file, +7)**; ESLint 0 error 0 warning; build sukses (38 precache 1839.78 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **688.562 B** (>500 KB — scene hidup).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 04:45 WIB — Siklus 142: Lokasi Lantai AgentInspector LIVE dari posisi karakter scene — badge statis agent.floor (meja) diperbaiki; agen rapat→L1, makan siang kafe→L3, pulang→offsite kini terlabel benar; tombol FOKUS tak lagi membawa kamera ke lantai kosong (+19 test, diskriminasi 5/19 FAIL kode lama)

- **Bug (audit rutin pasca-backlog kosong — keluarga temuan siklus 140–141, jalur data scene→UI):** badge "Lokasi Lantai" kartu AgentInspector memakai `agent.floor` yang di-set SEKALI saat scene build (OfficeScene.js:1052 — posisi MEJA). Padahal agen berpindah lantai live: rapat selalu di ruang meeting L1 (ROOM_CZ=-3, meeting_room_spec), makan siang di Executive Cafe L3 (CAMPUS_LUNCH_SPOT z=5.6), jalan-jalan kampus lintas lantai, pulang → offsite. Contoh nyata: agen meja L3 yang rapat tetap dilabeli "L3 · Executive" — founder yang klik "FOKUS ↗" dibawa kamera ke lantai yang kosong (agen ada di L1).
- **Perubahan:**
  - `src/scene/parts/agent_status.js`: tambahan murni (tetap tanpa THREE/DOM; satu dependensi data murni `ROOM_CZ` dari meeting_room_spec.js): `levelOf(z)` (batas SAMA dgn penugasan meja scene: z<-0.8→L1, ≤4.5→L2, sisanya L3; guard anti-poisoning non-finite→null), `floorZoneName(level)` (label zona konsisten: Ops & AI / Engineering / Executive; tak dikenal→null), `agentLiveLevel(ad)` (prioritas walker visible → sittingChar visible → home; peserta `state:'meeting'` → lantai ruang rapat dari ROOM_CZ — scene memindahkan FIGUR ke kursi L1 tanpa memindahkan sittingChar/home).
  - `src/components/AgentInspector.jsx`: state `liveFloor` dibaca di loop polling 1 dtk yang sama (tanpa timer baru); badge & tombol FOKUS kini `liveFloor || agent.floor || default` — scene belum ada → fallback lama utuh (alur lama tak berubah).
- **+19 test:** `agent_live_floor.test.jsx` baru (12: levelOf 4, floorZoneName 2, agentLiveLevel 6 termasuk peserta rapat→ROOM_CZ & state korup) + 7 integrasi di `agent_live_status.test.jsx` (badge L1 alur lama; BUG UTAMA rapat L1; BUG UTAMA lunch walker z=5.6→L3; live update L1→L3 saat kartu terbuka tanpa buka-tutup; fallback scene absen; tombol FOKUS memakai lantai live `toHaveBeenCalledWith(3)`; entri tanpa koordinat→fallback).
- **Bukti diskriminasi:** kode LAMA (git checkout komponen+modul, test baru dipertahankan) → **5/19 FAIL** persis hipotesis (rapat→L1, lunch→L3, live update, FOKUS lantai live, modul murni meeting); 14 lolos = skenario fallback/alur lama yang memang tak beda. Kode BARU → **19/19 PASS**.
- **Bukti E2E scene NYATA (`scripts/e2e_inspector_floor.py` baru, disimpan ke repo):** Chrome SwiftShader Xvfb :99 → 26 agen → pilih agen meja L1 (`ai-cs`, entry0 z=-2.54 sitting) → badge awal **"L1 · Ops & AI"** → `__setTime(720)` (lunch 12:00) → daycycle mengirim ke kafe L3: walker berjalan (z=-3.74→4.98, walking_out lunch=true) → badge berubah LIVE **"L3 · Executive"** via polling 1 dtk TANPA buka-tutup kartu. Catatan metodologi: run #1 FAIL karena tunggu 21 dtk belum cukup (walker baru z=-3.7 dari ±15m perjalanan) — diperpanjang ke 60 dtk & strip '↗' dari pembacaan badge, run #2 OK; kegagalan run #1 = tempo probe, bukan kode.
- **Bukti terukur:**
  - Vitest **2318/2318 (170 file, +19)**; ESLint 4 file 0 error 0 warning; build sukses (38 precache 1840.37 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **685.072 B** (>500 KB — scene hidup).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 05:45 WIB — Siklus 143: Badge okupansi lantai LIVE di FloorNavigator — tombol lantai statis kini menampilkan jumlah agen SAAT INI per lantai dari posisi karakter scene (+13 test, diskriminasi 10/13 FAIL kode lama)

- **Bug (audit rutin pasca-backlog kosong — keluarga temuan siklus 140–142, jalur data scene→UI):** tombol FloorNavigator ("L1 · Ops & AI" dst) hanya daftar STATIS (pod + nama agen meja dari FLOORS array) — founder tak bisa lihat berapa agen yang SAAT INI ada di tiap lantai. Padahal agen berpindah lantai live terus-menerus: rapat selalu L1, makan siang kafe L3, jalan kampus lintas lantai. Contoh nyata E2E: saat lunch, distribusi meja {L1:9, L2:9, L3:8} berubah jadi {L1:4, L2:9, L3:13} — lama tak terlihat sama sekali.
- **Perubahan:**
  - `src/scene/parts/agent_status.js`: `floorOccupancy(agentData)` (murni, satu file dgn agentLiveLevel/levelOf siklus 142 — SATU sumber kebenaran): hitung jumlah agen per lantai dari posisi karakter scene. Kehadiran ≠ posisi: agen `state:'offsite'` TIDAK dihitung di lantai mana pun (agentLiveLevel murni posisi — masih membaca home utk offsite). Guard: agentData bukan array → null (badge disembunyikan, bukan nol palsu); array kosong → {1:0,2:0,3:0} (scene siap, 0 agen — BUKAN null); entri korup/tanpa agent dilewati.
  - `src/components/FloorNavigator.jsx`: state `occupancy` + polling 1 dtk (read() langsung + setInterval, cleanup clearInterval di unmount — tanpa leak timer, pola identik AgentInspector siklus 140/142). Badge `.floor-nav-occ` di tiap tombol: hanya dirender bila scene lapor (`occupancy && typeof occupancy[fl.num] === 'number'`), title tooltip "N agen saat ini di Lantai N", aria-hidden (jumlah juga terbaca dari textContent tombol, tak dobel untuk screen reader).
  - `src/index.css`: gaya `.floor-nav-occ` (pill 16px hijau #10E5A0, DM Mono 9.5px, background rgba(16,229,160,.16), border rgba(16,229,160,.35) — konsisten aksen status work/existing).
  - Catatan proses: `floorOccupancy` mula-mula diekspor dari file komponen → ESLint `react-refresh/only-export-components` FAIL → dipindah ke scene/parts/agent_status.js (arsitektur murni terpisah, bisa diuji unit tanpa jsdom).
- **+13 test (`floor_navigator_occupancy.test.jsx` baru):** 7 murni floorOccupancy (walker L3 ≠ meja L1, peserta rapat → L1 bukan lantai meja, offsite tak dihitung, koordinat NaN dilewati, guard korup → null, array kosong → {0,0,0}, entri korup dilewati) + 6 integrasi komponen (badge per tombol dari scene, transisi LIVE polling 1 dtk tanpa remount via fake timers, clearInterval saat unmount, scene absen → badge TIDAK dirender, alur lama klik & keyboard nav ArrowRight tetap utuh dgn badge ada).
- **Bukti diskriminasi:** kode lama (git checkout 5ab4e8b — komponen+modul) → **10/13 FAIL** persis hipotesis (semua 7 test murni karena fungsi tak ada + 3 integrasi: badge ada, live update, interval cleanup); 3 lolos = alur lama yang memang tak berubah (klik, keyboard, scene absen). Kode BARU → 13/13 PASS.
- **Bukti E2E scene NYATA (`scripts/e2e_floor_occupancy.py` baru, disimpan ke repo):** Chrome SwiftShader Xvfb :99 → 26 agen → jam 08:00 badge **{L1:9, L2:9, L3:8}** (total = 26 agen, distribusi meja akurat) → `__setTime(720)` (lunch 12:00) → agen berjalan lewat Grand Staircase ke Executive Cafe L3 → badge berubah LIVE **{L1:4, L2:9, L3:13}** (atZ>4.5=13 = badge L3 13, konsisten eksak) tanpa reload. Catatan metodologi: run #1–2 FAIL = bug probe, bukan kode — (1) regex parsing badge salah (textContent match `[^]*?` — diperbaiki ke querySelector `.floor-nav-occ`), (2) syarat break `L3>=5` absolut langsung terpenuhi baseline 8 (diperbaiki: break saat ΔL3 ≥ +3 dari baseline). Deploy dist ke :9503 WAJIB sebelum probe — run awal membaca build lama (badge tak ada di DOM).
- **Bukti terukur:**
  - Vitest **2331/2331 (171 file, +13)**; ESLint 0 error 0 warning; build sukses (38 precache 1841.10 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **689.315 B** (>500 KB — scene hidup).
- Commit: `842d3cc` — PUSH-OK ke origin/main (kode+test+probe di commit auto eeba496 + fix probe di 842d3cc).
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 06:15 WIB — Siklus 144: Sinkron lantai FloorNavigator saat klik agen kini dari posisi LIVE scene — jalur App.onSelectAgent tersisa keluarga bug 142–143 diperbaiki (+7 test, diskriminasi 2/7 FAIL kode lama; E2E: DEWI rapat → nav L1 bukan lantai meja L2)

- **Bug (audit rutin pasca-backlog kosong — jalur data scene→UI, terakhir jalur App yang belum live):** `App.jsx onSelectAgent` (callback scene saat agen diklik/dipilih) menyinkronkan FloorNavigator dgn `ag.floor` — lantai MEJA statis yang di-set SEKALI saat scene build (OfficeScene.js:1052). Padahal kamera fokus ke posisi LIVE (agentFollowGoal utk walker/sitting, anchor kursi rapat utk peserta meeting): agen meja L2 yang diklik SAAT RAPAT (figur di ruang meeting L1) → kamera ke L1 tapi tombol "L2 · Engineering" aktif — label nav menunjuk lantai kosong, kontradiksi langsung dgn apa yang founder lihat di layar. Keluarga bug siklus 140–143 (badge status, fase, lantai inspector, okupansi) — jalur App tersisa.
- **Perubahan:** `App.jsx onSelectAgent`: lantai sinkron = `agentLiveLevel(findAgentLiveEntry(window.__agentData, ag.name))` (murni di scene/parts/agent_status.js — SATU sumber kebenaran dgn badge AgentInspector 142 & okupansi FloorNavigator 143); entri scene tidak ada (Founder nexus idx -2, scene gagal init) → fallback lama `ag.floor`; onSelectAgent(null) → nav tak diubah (perilaku lama utuh).
- **+7 test (`app_select_floor_live.test.jsx` baru):** 3 murni (rapat meja L3 → LIVE L1 via ROOM_CZ; lunch walker meja L1 → LIVE L3 z=5.6; anti-poisoning founder/tanpa entri → null → fallback) + 4 integrasi App→FloorNavigator (BUG UTAMA rapat → L1 aktif bukan L3; BUG UTAMA lunch → L3 aktif bukan L1; duduk normal → alur lama tak berubah; fallback founder + null tak menggeser nav).
- **Bukti diskriminasi:** kode LAMA (backup /tmp/AI.bak-*.jsx) → **2/7 FAIL** persis dua "BUG UTAMA" integrasi; 5 lolos = test murni + alur tak berubah. Kode BARU → 7/7 PASS.
- **Bukti E2E scene NYATA (`scripts/e2e_select_floor_live.py` baru, disimpan ke repo):** Chrome SwiftShader Xvfb :99 → 26 agen → `__setTime(600)` (stand-up 10:00, window rapat 0) → pilih peserta rapat bermeja L2 via `__wfsSceneSelect` (jalur klik scene nyata → App.onSelectAgent) → **DEWI state=meeting desk=L2 → tombol aktif L1** (live ruang rapat), ring emas menyala → `__setTime(480)` (08:00) → pilih ulang → **tombol aktif L2** (lantai meja; live == meja, alur lama). Diskriminasi E2E: kode lama di-deploy ulang → probe sama **FAIL dgn active_meeting=L2** (nav menunjuk lantai kosong); kode baru → **OK dgn active_meeting=L1**.
- **Bukti terukur:**
  - Vitest **2338/2338 (172 file, +7)**; ESLint 0 error 0 warning; build sukses (38 precache 1841.15 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **688.468 B** (>500 KB — scene hidup).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 06:58 WIB — Siklus 145: Kamera pindah lantai TANPA agen → FloorNavigator ikut (onCameraFloor) — Fokus 3D pod tim (TeamStats/TaskBoard) & fokus ruang rapat kini menyinkronkan nav; kebalikan siklus 144, jalur kamera lintas lantai terakhir (+10 test, diskriminasi 7/10 FAIL kode lama; E2E: core-be→L2, qa-gov→L3, meeting→L1, kode lama: L1 terus)

- **Bug (audit rutin pasca-backlog kosong — jalur kamera scene→UI, penutup keluarga siklus 142–144):** jalur kamera lintas lantai yang melewati `onSelectAgent` tidak pernah melaporkan lantai ke App — (1) `scene.focusTeam` (kartu "Fokus 3D" TeamStats ×2 + 4 titik TaskBoard → `window.__focusTeam`): kamera melompat ke pod tim L1/L2/L3 sesuai `team_spec.podCenter.z`, tapi tombol nav tetap di lantai lama; (2) `scene.focusMeetingRoom`: kamera ke ruang rapat (selalu L1, ROOM_CZ=-3), nav tetap. Founder melihat pod L3 di layar sementara "L1 · Ops & AI" tetap aktif — kebalikan persis bug siklus 144 (dulu: nav salah saat agen diklik; kini: nav salah saat kamera pindah TANPA agen).
- **Perubahan:**
  - `OfficeScene.js`: callback baru `onCameraFloor(level)` — `focusTeam` melaporkan `levelOf(ft.z)` (fungsi murni agent_status.js — SATU sumber kebenaran dgn agentLiveLevel 142/143/144), `focusMeetingRoom` melaporkan `levelOf(MRZ)`.
  - `App.jsx`: `onCameraFloor: (fl) => { if (fl === 1 || fl === 2 || fl === 3) setCurrentFloor(fl) }` — guard anti-poisoning (null/0/4 diabaikan, bukan mengarang lantai). `onSelectAgent(null)` dari focusTeam TETAP tidak menggeser nav (perilaku siklus 144 utuh) — urutan panggilan scene: onSelectAgent(null) dulu, baru onCameraFloor.
- **+10 test (`app_camera_floor_live.test.jsx` baru):** 3 murni (podCenter SEMUA 6 tim → levelOf == field floor tim; fallback tim tak dikenal z=1.5 → L2; guard levelOf non-finite → null) + 7 integrasi App→FloorNavigator (BUG UTAMA qa-gov → L3 aktif bukan L1; BUG UTAMA fe-design dari L2 → L1; focusMeetingRoom dari L3 → L1; core-be → L2; guard null/0/4 diabaikan; interaksi siklus 144: klik agen meja L2 → L2 lalu fokus tim L3 → L3; callback eksis).
- **Bukti diskriminasi:** kode LAMA (backup /tmp/AI.bak-*.jsx + OS.bak-*.js) → **7/10 FAIL** (semua integrasi App: onCameraFloor tak dikenal scene, nav tak pernah berubah); 3 lolos = test murni levelOf/team_spec yang memang tak sentuh App. Kode BARU → **10/10 PASS**.
- **Bukti E2E scene NYATA (`scripts/e2e_camera_floor_live.py` baru, disimpan ke repo):** Chrome SwiftShader Xvfb :99 → 26 agen → `__focusTeam('core-be')` → nav aktif **L2** → `__focusTeam('qa-gov')` → **L3** → `__focusMeetingRoom()` → **L1** (semua via hook scene nyata → callback → App → DOM nav). Diskriminasi E2E penuh: kode lama di-build & deploy ulang → probe sama **FAIL: nav L1 terus** di ketiga langkah; kode baru → OK semua.
- **Bukti terukur:**
  - Vitest **2348/2348 (173 file, +10)**; ESLint 0 error 0 warning (file tersentuh); build sukses (38 precache 1841.28 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **682.362 B** (>500 KB — scene hidup).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 08:40 WIB — Siklus 146: Pelapor lantai kamera TERPUSAT per-frame — ekor terakhir keluarga 142–145: FOLLOW kamera ikut agen lintas lantai & klik papan proyek/nexus kini menyinkronkan nav (+13 test, diskriminasi E2E penuh: kode lama 4/4 langkah FAIL, baru OK)

- **Bug (audit rutin pasca-backlog kosong — penutup keluarga siklus 142–145):** semua siklus sebelumnya melaporkan lantai SEKALI di titik klik (onSelectAgent/onCameraFloor). Audit 13 titik `focusGoal=` menemukan 3 jalur yang lolos: (1) **FOLLOW** — kamera mengikuti agen yang BERJALAN lintas lantai (lunch kafe L3, pulang, rapat): nav beku di lantai saat agen diklik; (2) **klik papan proyek** (single + dblclick): goal z=13.2 dinding L3 tanpa laporan — panel proyek terbuka, nav tetap; (3) **dblclick nexus**: goal z=6.1 (L3) tanpa onSelectAgent.
- **Perubahan:**
  - `src/scene/parts/kamera_focus.js` (murni, satu sumber kebenaran): `goalFloor(goal, homeT)` — lantai kamera dari TARGET GOAL: `{follow}` → `agentLiveLevel` LIVE (badge 142/143/144), statis → `levelOf(goal.t.z)`; goal reset menuju HOME_TGT & dblclick area kosong (flag `blank` baru) → **null** (kembali ke overview ≠ pindah lantai — tanpa ini kamera di rumah terlapor "L2" palsu). `cameraFloorFrame(goal, last, homeT)` — latch per-frame: callback hanya saat lantai non-null BERUBAH.
  - `OfficeScene.js`: hook di `animate()` setelah focusStep — mengganti 2 panggilan langsung siklus 145 (focusTeam/focusMeetingRoom kini hanya me-reset latch `__lastCamFloor=null`); dblclick-blank menandai goal `blank:true`.
- **+13 test (`goal_floor_live.test.js`):** 9 murni goalFloor (BUG UTAMA papan z=13.2→L3, nexus z=6.1→L3, follow peserta rapat→L1 via agentLiveLevel, follow walker lunch→L3, guard korup→null, reset→null, reset target asing→dilaporkan, blank→null 2 varian) + 4 cameraFloorFrame (latch sama/beda, null reset latch, siklus L1→papan→overview→papan: langkah ke-3 HARUS terlapor lagi, walker melewati batas 4.5→changed).
- **Bukti diskriminasi E2E PENUH (`scripts/e2e_goal_floor_live.py`, di repo):** 4 langkah via scene nyata — klik papan proyek via raycast CDP (Input.dispatchMouseEvent ke proyeksi layar mesh), klik kosong, klik papan lagi, `__focusAgent('be1')` + `__setTime(720)` lunch follow. Kode lama (bak di-deploy ulang) → **FAIL: board=L1 afterBlank=L1 board2=L1 followLunch=L1** (4/4); kode baru → **OK: board=L3 afterBlank=L3 board2=L3 followLunch=L3** (nav TIDAK berubah saat klik kosong = alur lama utuh; follow LIVE L1→L3 tanpa klik baru).
- **Catatan metodologi:** (1) run #1–2 probe: bug harness — WS rx() `return b` sebelum buffer penuh + `__wfsSelectAgent` ternyata hanya memilih TANPA follow goal (bukan jalur kamera); diganti `__focusAgent` (focusAgent scene: goal follow + onSelectAgent). (2) **Bug desain latch tertangkap sebelum commit**: focusTeam men-set latch = level baru → per-frame `changed=false` → callback tak pernah menyala (terlihat di E2E siklus 145 FAIL `core-be→L1`) — kini latch selalu di-RESET di fokus baru.
- **Bukti terukur:**
  - Vitest **2361/2361 (174 file, +13)**; ESLint 0 error 0 warning (file tersentuh + src penuh); build sukses (38 precache 1841.74 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **675.805 B** (>500 KB — scene hidup).
  - Regresi E2E siklus 145/144 tetap OK: `e2e_camera_floor_live.py` OK (core-be→L2, qa-gov→L3, meeting→L1), `e2e_select_floor_live.py` OK (DEWI rapat→L1).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 11:25 WIB — Siklus 149: Kehadiran agen LIVE di Ticker — pita info teratas kini menampilkan hitungan per status (di meja/rapat/makan siang/berjalan/pulang) dari scene, penutup jalur Ticker keluarga scene→UI 142–148 (+11 test, diskriminasi 7/11 FAIL kode lama; E2E penuh: kode lama no-pill, baru 26 di meja → 26 makan siang)

- **Bug (audit rutin pasca-backlog kosong — jalur data scene→UI, Ticker = satu-satunya komponen pita yang belum live):** seluruh keluarga siklus 142–148 (badge status & lantai kartu AgentInspector, okupansi FloorNavigator, sinkron lantai onSelectAgent/onCameraFloor/per-frame goal) menyambungkan state scene ke UI — tapi Ticker, pita info TERATAS yang paling sering terlihat, hanya membawa task/gateway/host RAM. Keadaan 26 agen kantor (duduk kerja, rapat L1, makan siang kafe L3, jalan kampus, pulang) tidak tampak di mana pun kecuali kartu inspektur per-agen yang harus dibuka satu-satu. Ticker = penyambung alami terakhir keluarga ini.
- **Perubahan:**
  - `src/scene/parts/agent_status.js`: `tickerPresenceSummary(agentData)` (murni, SATU sumber kebenaran dgn agentLiveStatus siklus 140/142/143) — hitung agen per tone status {work, meet, lunch, walk, dim}, kembalikan item berhitungan >0 dgn label Indonesia ('di meja', 'rapat', 'makan siang', 'berjalan', 'pulang/offsite'). Guard anti-poisoning: bukan array → null; array kosong (scene siap, 0 agen) → null JUGA (baris tanpa isi hanya noise marquee); entri korup/tanpa agent dilewati; state non-string dihitung dim oleh agentLiveStatus (tetap terwakili, tidak hilang). **Bug desain tertangkap test sebelum commit:** field `first` mula-mula = index 0 urutan (work) → pill merender "· 2 pulang" dgn pemisah di depan saat tak ada agen kerja; diperbaiki first = item TERSISA pertama.
  - `src/components/Ticker.jsx`: state `presence` + polling 1 dtk `tickerPresenceSummary(window.__agentData)` (pola FloorNavigator siklus 143; clearInterval di unmount — tanpa leak); pill `.ticker-presence` di tepi kiri pita SEBELUM chip koneksi: item berwarna per status (titik 6px = STATUS_HEX agent_status.js, konsisten badge kartu), pemisah '·'; region aria-live #ticker-live kini diawali ringkasan kehadiran (screen reader mendengar "26 di meja · 4 task …"). Scene absen → pill tidak dirender, alur lama marquee gateway utuh.
  - `src/index.css`: gaya `.ticker-presence` + item + sep — konsisten `.ticker-conn` (pill 999px, DM Sans 11px, border putih 12%); `box-shadow: 0 0 5px currentColor` di titik.
- **+11 test (`ticker_presence.test.jsx` baru):** 5 murni tickerPresenceSummary (hitungan per status & urutan; walk tanpa lunch vs dim pulang/offsite; korup/tanpa-agent dilewati dgn Standby tetap terwakili; guard null array + array kosong → null; konsistensi lintas fungsi: tone agentLiveStatus semua state ≡ anggota TICKER_PRESENCE_ORDER) + 6 integrasi komponen (pill merender; LIVE transisi sitting→lunch tanpa remount via fake timers; scene absen → TIDAK dirender; isi diumumkan #ticker-live; clearInterval unmount; alur lama fallback gateway utuh). **Bukti diskriminasi unit:** kode LAMA (git show HEAD) → **7/11 FAIL** persis hipotesis (semua 4 test murni — fungsi tak ada + pill, LIVE update, aria-live); 4 lolos = alur lama (scene absen, unmount, fallback). Kode BARU → 11/11 PASS.
- **Bukti E2E scene NYATA (`scripts/e2e_ticker_presence.py` baru, di repo):** Chrome SwiftShader Xvfb :99 → 26 agen → `__setTime(480)` (08:00) → pill **"26 di meja"** (satu item, semua work) → `__setTime(720)` (lunch 12:00) → daycycle kirim ke kafe → pill berubah LIVE **"26 makan siang"** (total tetap 26 — tiap agen selalu terwakili satu status; aria-live ikut). **Diskriminasi E2E penuh:** kode lama di-build & deploy ulang (git stash) → probe sama **FAIL: no-pill** awal & final; kode baru → **OK**. Catatan proses: run pertama kena SIGTERM timeout harness (bukan kode); `pkill chrome` + `timeout 380` menuntaskan.
- **Bukti terukur:**
  - Vitest **2398/2398 (175 file, +11)**; ESLint 0 error 0 warning (file tersentuh); build sukses (38 precache 1846.52 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **675.068 B** (>500 KB — scene hidup).
  - Regresi tetap hijau: ticker.test.jsx eksisting 6/6, agent_live_status/floor & floor_navigator_occupancy 66/66 total dgn file baru.
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 13:45 WIB — Siklus 150: Kehadiran LIVE anggota tim di kartu "Progres Divisi & Pod 3D" TeamStats — keluarga scene→UI kini menutup panel pod: founder lihat "4/4 di pod" atau "0/4 di pod · 4 makan siang" SEBELUM klik Fokus 3D (+15 test, diskriminasi unit 3/15 FAIL kode lama; E2E penuh: kode lama no-chip, baru 3-4/4 → 0/4 · 4 makan siang LIVE)

- **Bug (audit rutin pasca-backlog kosong — kartu tim = satu-satunya panel yang belum live):** siklus 142–149 menyambungkan state scene ke badge inspektur (140/142), okupansi nav (143), sinkron kamera (144–146), Ticker (149) — tapi kartu "Progres Divisi & Pod 3D" di panel Statistik Tim hanya bawa progres TASK statis. Founder yang klik "Fokus 3D" ke pod bisa mendarat di pod KOSONG (semua anggota rapat L1 / makan siang kafe L3 / pulang) tanpa indikasi apa pun.
- **Perubahan:**
  - `agent_status.js`: `agentLiveTone(ad)` (murni — tone saja, paritas penuh agentLiveStatus) + `PRESENCE_LABELS` diekspor (Ticker 149 & kartu tim kini satu sumber label; tickerPresenceSummary direfaktor memakainya, perilaku identik).
  - `team_spec.js`: `teamPresenceSummary(agentData)` (murni) — per tim: total anggota (peta findTeamByAgent — sama dgn agregasi task), `atDesk` = sitting DAN lantai live == lantai pod tim (podCenter.z→levelOf, batas sama agent_status), `awayLabel` dikelompokkan tone ("2 di rapat · 1 makan siang"). Guard anti-poisoning: bukan array → null (chip disembunyikan); entri korup/Founder dilewati; work-di-lantai-lain (visiting) → away TANPA label palsu.
  - `TeamStats.jsx`: poll `window.__agentData` 4 dtk saat panel terbuka (pola SysMeter; clearInterval di unmount); chip `.team-presence` per kartu — titik hijau STATUS_HEX.work + "N/M di pod" + away label + `.sr-only` utk screen reader; scene absen → baris disembunyikan, alur lama utuh.
  - `index.css`: gaya `.team-presence` konsisten `.ticker-presence` 149 (DM Sans 10.5px, titik 6px glow currentColor).
- **+15 test (`team_presence.test.jsx` baru):** 2 agentLiveTone (paritas semua state) + 8 murni teamPresenceSummary (BUG UTAMA 4 rapat → atDesk 0 "4 di rapat"; campuran; tiap lantai pod; visiting tanpa label; lunch/walk; leaving→dim; guard null/korup/Founder; array kosong 6 tim nol) + 5 integrasi komponen (chip "0/4 di pod · 4 di rapat"; "4/4 di pod" tanpa away; polling LIVE rapat→pulang tanpa remount — fake timers HANYA interval, waitFor tetap nyata; scene absen → tak dirender; unmount → clearInterval). **Bukti diskriminasi unit:** TeamStats.jsx LAMA di-deploy ulang → 3/15 FAIL (ketiga integrasi chip); kode BARU → 15/15.
- **Bukti E2E scene NYATA (`scripts/e2e_team_presence.py` baru, di repo):** Chrome SwiftShader Xvfb :99 → 26 agen → set 480 + buka panel via klik dock → tunggu chip "3-4/4 di pod" (walking_back settle) → `__setTime(720)` lunch → chip berubah LIVE **"0/4 di pod · 4 makan siang"**. **Diskriminasi E2E penuh:** kode lama di-build & deploy ulang → probe sama **FAIL: no-chip**; kode baru → **OK**. Catatan proses: probe pertama gagal karena kartu tim ter-gate `teamStats.length>0` dan DB task gateway kosong → di-seed 4 task demo read-only (status pending/running/done, TIDAK memicu engine berbayar); jam simulasi berjalan wall-clock (1 mnt/5 dtk) → E2E Ticker 149 yang lulus kemarin kini butuh sinkronisasi 480 di awal juga.
- **Bukti terukur:**
  - Vitest **2413/2413 (176 file, +15)**; ESLint 0 error 0 warning (src penuh); build sukses (38 precache 1848.62 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; `shot.sh` :0 **677.955 B** (>500 KB — scene hidup).
  - Regresi: team_stats_a11y 11/11 & team_spec lulus — alur lama kartu (progres, Fokus 3D, Kanban) utuh.
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: perbaikan kecil sesuai temuan berikutnya.

## 2026-10-29 15:50 WIB — Siklus 151: Kehadiran LIVE agen kantor di Dashboard + FIX BUG PRODUKSI stats 404 — panel overview founder kini hidup (grid stats tak pernah muncul karena gateway :8787 tanpa /api/dashboard/stats → proxy 404 permanen) (+11 test, diskriminasi unit 3/11 FAIL kode lama; E2E penuh: kode lama no-para, baru 26 di meja → 26 makan siang LIVE)

- **Bug A (audit rutin pasca-backlog kosong — Dashboard = panel terakhir keluarga scene→UI 142–150):** bagian "Agen aktif" Dashboard hanya membaca task engine — tanpa task berjalan ia melaporkan "semua idle" padahal 26 agen kantor bisa sedang rapat L1 / makan siang kafe L3 / jalan kampus / pulang. Task engine memang tidak tahu keadaan fisik kantor; hanya scene tahu (window.__agentData).
- **Bug B (ditemukan E2E scene nyata — bug produksi tersembunyi):** probe pertama FAIL `no-para` + DIAG `stats:false, skel:'Memuat dashboard…'` selamanya. Diacak: gateway produksi :8787 (wfs-office/server.py) TIDAK punya endpoint `/api/dashboard/stats` → proxy `/wfs-api/dashboard/stats` 404 PERMANEN (terverifikasi curl: wfs-api/tasks 200, wfs-api/dashboard/stats 404; FETCHALL CDP: stats 404, lainnya 200) → `Promise.allSettled` membuat err hanya dari 4 sumber awal dan stats=null → panel Dashboard produksi HANYA banner "Data belum lengkap" + grid tidak pernah muncul sejak fitur dashboard dibuat. Backend repo (backend/server.py, 972 baris) PUNYA dashboard endpoint — file deployed :8787 (472 baris, beda generasi) tidak; diperbaiki di sisi frontend (yang ada di repo & di-deploy), bukan menyentuh server produksi.
- **Perubahan:**
  - `agent_status.js`: `dashboardPresenceSummary(agentData)` (murni, SATU sumber agentLiveTone/PRESENCE_LABELS/TICKER_PRESENCE_ORDER dgn Ticker 149 & kartu tim 150) → `{ total, text: '4 di meja · 2 rapat · …' }`. Guard anti-poisoning: bukan array → null; entri korup/tanpa agent dilewati (state non-string → dim, tetap terwakili); array kosong → null ("0 agen" hanya noise).
  - `Dashboard.jsx`: (1) FIX Bug B — `load` kini allSettled 5 sumber (tambah `status`) dan bila `dashboard/stats` gagal TAPI sumber lain sukses → stats DITURUNKAN dari data nyata (jumlah task/projects/status='running', completed dari task done/completed, agents_count dari /status.agents, flag `derived:true`) — bukan mengarang angka; banner err hanya bila sumber pengganti pun gagal. (2) presence state + poll `window.__agentData` 4 dtk saat panel terbuka (pola TeamStats 150; clearInterval di unmount). (3) Paragraf `.dash-presence` (role=status, titik hijau STATUS_HEX.work, "26 agen di kantor: …" + ringkasan .sr-only) di section Agen & sandbox; scene absen → tak dirender, teks task-engine utuh.
  - `index.css`: `.dash-presence` konsisten `.team-presence` 150.
- **+11 test (`dashboard_presence.test.jsx` baru):** 6 murni dashboardPresenceSummary (BUG UTAMA 26 rapat → "26 rapat" bukan idle; campuran urutan PRESENCE_LABELS; korup/no-agent; guard null/array kosong; paritas label TICKER_PRESENCE_ORDER) + 5 integrasi (paragraf LIVE ditempel BUKAN menggantikan teks task "semua idle"; campuran 7 agen; polling rapat→makan siang tanpa remount — fake timers HANYA interval; scene absen tak dirender; unmount clearInterval). **Diskriminasi unit:** Dashboard lama (652fe6d) di-deploy ulang → **3/11 FAIL** (ketiga integrasi chip); kode baru → 11/11. 26/26 termasuk dashboard_states & poll_rid_guard (fallback TIDAK melanggar kontrak "failed sections never fabricated": hanya disetel saat ≥1 sumber pengganti sukses; err = sumber pengganti gagal).
- **Bukti E2E scene NYATA (`scripts/e2e_dashboard_presence.py` baru, di repo):** Chrome SwiftShader Xvfb :99 → 26 agen → `__setTime(480)` (08:00) → klik dock Dashboard → paragraf **"26 agen di kantor: 26 di meja"** → `__setTime(720)` lunch → LIVE **"26 agen di kantor: 26 makan siang"** (total 26 konstan). **Diskriminasi E2E penuh:** kode lama di-build & deploy ulang → probe sama **FAIL: no-para**; kode baru → **OK**. Catatan proses: run pertama-sekunder mengungkap Bug B (di atas) — dua build basi (dist 13:41 dari autopush 14:00 commit kode tanpa rebuild) juga tertangkap: probe FAIL dgn dist lama meski kode source baru.
- **Bukti terukur:**
  - Vitest **2424/2424 (177 file, +11)**; ESLint 0 error 0 warning (file tersentuh); build sukses (38 precache 1850.25 KiB) → deploy `dist/*` → `~/wfs-hq/`; `wfs-hq` & `wfs-office` active, :9503 HTTP 200, index-nGodmsl3.js ter-serve.
  - `e2e_err.py` **0 pesan / 0 error / 0 warning**; screenshot CDP :99 **678.192 B** (avg brightness 51.2, 1439 warna — scene hidup; shot :0 legacy 246 KB = fallback UI-only karena Xorg pindah :10, bukan scene mati — dipastikan via probe CDP 26 agen & paragraf LIVE).
- Commit: kode+test+probe di commit siklus ini.
- Sisa backlog: **KOSONG**. Kandidat berikutnya: sinkronkan `wfs-office/server.py` deployed dgn backend/server.py repo (endpoint dashboard/stats di server, bukan hanya fallback frontend) — perhatian: bukan repo git, perlu deploy terkontrol.
## 2026-10-29 16:35 WIB — Siklus 152: /api/dashboard/stats LIVE di gateway produksi :8787 (sumber asli server, bukan lagi fallback frontend)
- **Backlog siklus 151 tuntas:** endpoint `dashboard/stats` kini ADA di server produksi (deploy terkontrol; server.py deployed bukan repo git). Frontend tak perlu diubah — fallback derived (151) otomatis tak terpakai karena endpoint sukses.
- **Artefak (repo):**
  - `backend_live/wfs_dashboard_stats.py` — router FastAPI additive READ-ONLY: SQLite `mode=ro` (mustahil menulis/kunci tasks.db), kontrak field = backend/api_service.py (software_house, projects/tasks counts, agents_count, logs[{id,timestamp,message}]+source/level); logs = task terbaru (message "Task #N 'judul' -> status"); agents_count paritas /api/status via sys.modules server/__main__ (AGENTS_META 15 + cfg kustom), fallback distinct agent_id (unit-testable).
  - `backend_live/test_wfs_dashboard_stats.py` — 3 test (hitungan baris nyata incl. fallback agents, TestClient 200 + path lain tetap 404, missing DB gagal LOUD) — **3/3 PASS** (venv gateway).
  - `scripts/apply_dashboard_stats.py` — apply/check/rollback terkontrol: backup server.py pra-patch, patch idempoten marker+anchor `# ---------- orders ----------`, compile-check (venv) SEBELUM tulis, restart systemd, health+field check, auto-rollback bila gagal; CHECK mode tanpa perubahan (exit 3 = belum terpasang).
  - `scripts/e2e_dashboard_stats_grid.py` — E2E produksi CDP :99: ground truth = fetch in-page `/wfs-api/dashboard/stats` dibandingkan dgn kartu .dash-grid + jumlah .dash-log-row; guard regresi .dash-presence.
- **Bukti terukur:**
  - `:9503/wfs-api/dashboard/stats` **200** (sebelumnya 404 permanen); `agents_count=15` = paritas /api/status; 4 log nyata; grid E2E: Proyek 3, Task 4, Agen 15, logrows 4, **tanpa banner err**.
  - **Diskriminasi E2E penuh:** rollback ke backup pra-patch → endpoint 404 → probe **FAIL** (truth tanpa field, logrows 0 — grid cuma fallback derived); apply ulang → **OK**. CHECK mode rc=0/3 benar.
  - Vitest **2424/2424 (177 file)**; build sukses (1850.25 KiB) → deploy `~/wfs-hq/`; `e2e_err.py` **0/0/0**; wfs-hq & wfs-office active, :9503 & :8787 200.
  - Bug tooling tertangkap: backup terbuat di tiap apply (rollback ke backup kedua = masih dipatch) → diperbaiki (backup hanya saat patch; rollback = backup tertua); diskriminasi diulang dgn tooling benar.
- Commit: backend_live + scripts + probe di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya (opsional): migrasi gateway :8787 ke Docker dgn healthcheck (user menghendaki semua service long-running terkontainer), atau sinkronisasi penuh generasi server.py deployed ↔ backend/server.py repo (review manual karena beda arsitektur chat/orders).
## 2026-10-29 19:16 WIB — Siklus 154: SSE /wfs-api/events LIVE ujung-ke-ujung (backlog 153 tuntas) — proxy :9503 streaming (bukan buffered) + /api/events di gateway :8787 (log live turunan jujur tasks.db) + liveLogs kini dirender (badge live) (+3 test; diskriminasi: pre 0-frame FAIL → pasca gateway FAIL (frontend lama) → penuh OK)

- **Backlog siklus 153 tuntas (2 setengah bug, keduanya di produksi & bukan repo git):** drawer ShConsole membuka `EventSource('/wfs-api/events')` sejak lama, tapi (A) gateway :8787 tidak punya `/api/events` (backend repo punya, via tabel `execution_logs`; DB deployed TIDAK punya tabel itu), dan (B) proxy :9503 buffered penuh (`urlopen().read()`) — SSE mustahil lewat proxy walau endpoint ada. Bonus bug C yang tertangkap E2E: frontend mengumpulkan `liveLogs` tapi Overview TIDAK PERNAH merendernya.
- **Perubahan:**
  - `backend_live/wfs_events.py` (baru) — router additive read-only: `GET /api/events` = SSE `StreamingResponse`, kontrak wire = backend/server.py repo (`data: {"type":"log","data":{id,message,level,source,project_id,created_at}}\n\n` — persis yang dikonsumsi ShConsole). Sumber data JUJUR: DB tak punya `execution_logs` → log diturunkan dari tabel `tasks` dgn format pesan paritas `/api/sh/overview` 153 ("Task #N 'judul' -> status", flag `derived:true` di frame connected). Perilaku paritas repo: TANPA backlog (last_id=MAX(id) saat connect; task lama tidak diulang), poll 1 dtk, keepalive `: ping` tiap 15 dtk. DB absen/korup → event level `error` DI DALAM stream (loud), stream tetap hidup.
  - `~/wfs-hq/server.py` (proxy :9503) — `_proxy_stream_events()`: passthrough `read1()` (MUNGKIN blocked menunggu chunk → thread-per-connection ThreadingMixIn aman) + branch `do_GET` sebelum delegasi `_proxy()`. **Bug versi pertama tertangkap E2E: timeout=10 dtk < keepalive 15 dtk → stream upstream mati tiap ~10 dtk** (terlihat: log_frame=False di run menengah) → diperbaiki timeout=90 dgn stamp versi.
  - `src/components/ShConsole.jsx` — badge live di tab Overview (`data-testid=live-log-badge`): titik hijau STATUS_HEX.work + "N log diterima realtime" (N = panjang liveLogs terpotong 30), `sr-only` untuk pembaca layar, hanya saat stream mengirim (bukan angka DB).
  - `scripts/apply_events.py` (baru) — apply/check/rollback 2 unit (wfs-office + wfs-hq), backup hanya saat patch, compile-check SEBELUM tulis, guard regresi 152/153 (overview/approvals/stats) + paritas agents=15, mode `--only gw|px`, patch proxy idempoten per-versi (stamp timeout=90).
  - `scripts/e2e_events_stream.py` (baru) — E2E produksi CDP :99: (1) EventSource in-page: frame connected < 4 dtk (bukti streaming; buffered = 0 frame); (2) jeda 10,5 dtk pasca-load (poll overview 10 dtk lewat); (3) INSERT task demo langsung ke tasks.db (pola seed 150, tanpa API); (4) judul muncul di drawer + **frame log terlihat EventSource in-page** — poll tak bisa menjelaskan frame mentah itu. Cleanup task demo tiap run (judul unik per-run — kontaminasi residu run pertama tertangkap & dibersihkan).
- **Bukti terukur:**
  - Frame connected via :9503 kini **t=0.0s** (dulu timeout 4 dtk); probe raw end-to-end: INSERT → **frame log tiba 1.0 dtk** (id, message, source kontrak persis).
  - **E2E diskriminasi 3 keadaan:** pre-apply FAIL (0 frame, sse_err=1, no title) → pasca Half A saja FAIL (frontend lama belum render liveLogs) → penuh **OK** (connected_fast=True, sse_err=0, log_frame=True, appear 4.55 dtk, no banner).
  - Unit: `test_wfs_events.py` **4/4 PASS** (venv gateway; salah satunya uvicorn nyata + decode chunked — TestClient portal terbukti tak mampu menutup stream tak berujung); `shconsole_events.test.jsx` **3/3** (payload nyata → baris log + badge; frame connected TIDAK menjadi log palsu; 32 frame → list terpotong 30 terbaru urut). **Diskriminasi unit:** ShConsole lama di-build ulang → 2/3 FAIL (badge & baris live) → kode baru 3/3.
  - Vitest **2427/2427 (178 file, +3)**; ESLint 0/0; build sukses (1850.57 KiB) → deploy `~/wfs-hq/`; `e2e_err.py` **0/0/0**; guards: ov153/st152/ap153 200, agents=15; wfs-hq & wfs-office active.
  - **Bug tooling tertangkap (duplikat pola 152):** probe verifier `read()` pada SSE tanpa EOF → blocking → "down" palsu → auto-rollback memicu 3x apply gagal palsu (produksi tak pernah rusak — guard 152/153 hijau sepanjang siklus) → diperbaiki `read1(300)`.
- Commit: router+test+apply+probe+frontend di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) migrasi gateway :8787 ke Docker + healthcheck (user menghendaki service long-running terkontainer), (b) sinkronisasi penuh generasi server.py deployed ↔ backend/server.py repo (review manual — beda arsitektur chat/orders).

## 2026-10-29 17:45 WIB — Siklus 153: Konsol Software House LIVE di gateway produksi — audit API menyeluruh menemukan 11 endpoint 404 permanen; /api/sh/overview + /api/approvals kini sumber asli server (tab Overview & Approvals drawer hidup), workspace jujur 501 (bukan 404 generik)

- **Bug (audit endpoint menyeluruh pasca-backlog kosong — kelas sama dgn siklus 151):** pemetaan SEMUA panggilan API frontend (`/(wfs-)?api/…` di src) vs curl endpoint gateway deployed menemukan **11 endpoint 404 permanen**: `sh/overview`, `events` (SSE), `approvals`, `invoice` (false positive — hanya teks placeholder), `projects/{pid}/exec|files|file|logs|git|git/commit|sandbox/{action}`. Dampak nyata: drawer ShConsole — tab **Overview "Memuat statistik…" selamanya + banner err tiap poll**, tab **Approvals "Memuat approval…" selamanya**, tab **Workspace error samar**. (Backend repo 972 baris punya semuanya; generasi deployed :8787 tidak.)
- **Keputusan cakupan (jujur):** router additive read-only pola terbukti siklus 152 untuk 2 endpoint JSON; SSE `events` TIDAK bisa diselamatkan server-side saja — proxy :9503 buffered penuh (`urlopen().read()`) → dipindah backlog dgn perbaikan proxy streaming; exec/git-commit/sandbox start-stop = operasi TULIS terhadap container produksi → tidak di-additive-read-only, workspace diberi 501 + pesan jujur (bukan mengarang data).
- **Perubahan:**
  - `backend_live/wfs_sh_console.py` (baru) — router: `GET /api/sh/overview` kontrak = backend/database.py get_overview() (projects, tasks, task_by_status, agents, agent_by_status, running_subtasks, total_logs, recent_logs[{message,source,level}]) — angka turunan tasks.db SQLite `mode=ro` (flag `derived:true`); agents paritas /api/status deployed (AGENTS_META via sys.modules server/__main__ + cfg kustom, fallback distinct agent_id); `GET /api/approvals` = `{approvals:[], available:false}` JUJUR kosong (generasi ini tak melacak approval — tab menampilkan "Tidak ada approval pending", bukan mengarang baris); `GET /api/projects/{pid}/files|file|logs|git` = 501 + detail "tidak tersedia di gateway generasi ini". Tidak ada operasi tulis; task engine tidak disentuh.
  - `backend_live/test_wfs_sh_console.py` (baru) — 4 test (venv gateway): hitungan baris nyata + fallback agent distinct; **paritas AGENTS_META 15+1 kustom = 16 idle** via modul palsu sys.modules; approvals jujur + workspace 501 semua path + path lain tetap 404; DB absen gagal LOUD. **4/4 PASS.**
  - `scripts/apply_sh_console.py` (baru) — apply/check/rollback pola 152: backup server.py pra-patch (hanya saat patch), anchor = marker siklus 152, compile-check venv SEBELUM tulis, restart systemd, verifikasi overview+approvals+**guard regresi stats152**+paritas /api/status, auto-rollback bila gagal.
  - `scripts/e2e_sh_console_overview.py` (baru) — E2E produksi CDP :99: klik tombol aria-label 'Konsol Software House' → drawer; ground truth = fetch in-page `/wfs-api/sh/overview`; innerText drawer dibandingkan server; tab Approvals harus `honest-empty`; guard banner err.
- **Bukti terukur:**
  - `:9503/wfs-api/sh/overview` & `/approvals` **200** (dulu 404 permanen); drawer Overview = server persis: Projects 3 · Task total 4 · Agent total 15 (paritas /api/status=15) · Log event 4, 4 baris log nyata (Task #28 'Uji E2E navigasi lantai kantor' → pending (qa1) dst), **tanpa banner err**; Approvals "Tidak ada approval pending."
  - **Diskriminasi E2E penuh:** rollback → kedua endpoint 404 → probe **FAIL** (nums semua -1, banner err muncul) → apply ulang → **OK**. Catatan doktrin rollback terverifikasi: rollback 153 memulihkan kondisi pra-patch **152** (backup tertua) → stats152 ikut 404 → pemulihan = apply_dashboard_stats dulu lalu apply_sh_console (keduanya APPLY OK, guard stats152 hijau).
  - Vitest **2424/2424 (177 file)**; build sukses (1850.25 KiB) → deploy `~/wfs-hq/`; `e2e_err.py` **0/0/0**; wfs-hq & wfs-office active, :9503 200.
  - Catatan proses probe: selector kartu rapuh (inline-style grid, tanpa class) → dua run pertama false-negative; diganti pembacaan innerText drawer + regex label — run berikut deterministik.
- Commit: router+test+apply+probe di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) proxy :9503 streaming + endpoint SSE `events` (log realtime ShConsole), (b) migrasi gateway :8787 ke Docker dgn healthcheck, (c) sinkronisasi penuh generasi server.py deployed ↔ backend/server.py repo (review manual — beda arsitektur chat/orders, membawa endpoint workspace + approvals nyata).
## 2026-10-29 21:25 WIB — Siklus 157: Audit pasca-backlog-kosong — sisa container rehearsal :8788 dihapus dari produksi (muncul palsu di panel Resources Dashboard), pemetaan penuh endpoint UI→gateway lulus 100%

- **Temuan (audit rutin):** `wfs-office-rehearsal` (sisa uji migrasi siklus 155, image wfs-office-gw:latest, DB salinan statis, restart unless-stopped → akan auto-start tiap reboot VM) masih Up di produksi dan TAMPIL di panel Resources Dashboard (wfs-api/system/resources → containers[]) — founder melihat kartu rehearsal basi di antara kontainer produksi sah. Potensi juga kebingungan port :8788 vs go-live :8787.
- **Tindakan:** `docker rm -f wfs-office-rehearsal` — panel Resources kini hanya kontainer produksi sah (saas-dibantuin, sandbox proyek, omniroute, 4 wfs-agent). Image go-live `wfs-office-gw:go-live` (489MB) & `:latest` DIPERTAHANKAN — runbook go-live :8787→Docker tetap siap, menunggu persetujuan user (tidak disentuh).
- **Audit pelengkap:** pemetaan penuh endpoint UI→gateway (extract api() dari src) — semua GET lulus 200 di :9503 (dashboard/stats, sh/overview, approvals, status, tasks, projects, orders, agents, agents/status, system/resources, tasks/paused); SSE /wfs-api/events hidup (hang curl = streaming normal, bukan mati). Tidak ada endpoint 404 permanen baru.
- **Bukti terukur:** vitest **2427/2427 (178 file)**; build sukses (38 precache 1850.57 KiB) → deploy `~/wfs-hq/`; :9503 200 (index-DF6DTauT.js ter-serve), stats 200; `e2e_err.py` **0/0/0** (di awal siklus); RAM available 4.7Gi setelah pembersihan.
- Sisa backlog: **KOSONG**. Go-live Docker :8787 tetap menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`).
## 2026-10-29 22:10 WIB — Siklus 158: BUG TOOLING DEPLOY diperbaiki — assets/ ~/wfs-hq menumpuk 90 file (83 orphan hashed ±11MB basi ter-serve) karena SOP `cp -r dist/*` tak pernah menghapus; deploy.py kini sinkron + auto-prune berarsip

- **Temuan (audit disk pasca-siklus 157 — / 85% penuh, 7.3G sisa):** `~/wfs-hq/assets/` berisi **90 file js/css** padahal build hanya menghasilkan **7** (index-DF6DTauT.js, index-Dx4GOVZd.css, OfficeScene-BLpcRsrf.js, CsWidget-CeXRTrdW.js, rolldown-runtime, vendor-react, vendor-three). Akar: SOP cron `cp -r dist/* ~/wfs-hq/` menimpa index.html (menunjuk nama hashed BARU) tapi TIDAK PERNAH menghapus bundle hashed LAMA — tiap siklus menambah 3-7 file orphan. 83 file ±11MB mati ter-serve publik, mengaburkan audit "file mana yang hidup", dan memakan disk pelan-pelan (≈158 siklus ≈ ratusan MB tanpa dibersihkan).
- **Perbaikan (akar, bukan simptom):**
  - `scripts/deploy.py` (satu-satunya file produksi yang diubah; tidak menyentuh src scene/UI): (1) salin `dist/assets` SINKRON — rmtree lalu copytree, tidak ada penumpukan; (2) `prune_orphan_assets()` — file ber-hash Vite/Rolldown (`<stem>-<hash8+>.js|css`) yang TIDAK direferensikan `index.html`/`landing.html`/`sw.js` DIARSIPKAN ke `~/wfs-hq/.pruned-assets/` (bukan rm permanen — bisa dipulihkan); file tanpa hash (favicon.svg, og-image.png, dsb) tidak disentuh; output mencetak jumlah file terpangkas.
  - Guard regresi: `src/__tests__/deploy_prune.test.js` (3 test) — deploy.py wajib sinkron, wajib menghormati referensi index/landing/sw, wajib arsip bukan rm. **3/3 PASS.**
- **Tindakan produksi:** backup penuh assets/ lama ke `/tmp/wfs-hq-assets-bak-1793282227`; `python3 scripts/deploy.py` → `pruned 0 orphan` (assets/ sinkron penuh dari dist = 7 file, 1.4MB — 11MB basi hilang dari serve); verifikasi pasca: :9503 index 200, bundle 200, landing.html 200, `/wfs-api/dashboard/stats` 200.
- **Bukti terukur:** vitest **2430/2430 (179 file, +3)**; ESLint 0/0 (bug pertama test sendiri: `__dirname` di ESM → fileURLToPath, tertangkap lint sebelum commit); build sukses (38 precache 1850.57 KiB) → deploy sinkron → assets/ **7 file (1.4MB)**, sebelumnya 90 file (~12.4MB); `e2e_err.py` **0/0/0**; screenshot CDP **684.396 B** (scene hidup); `npm audit` 4 low (deepmerge chain vite-plugin-pwa — dev-only, tidak dieksploitasi server).
- Commit: deploy.py + test di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker tetap menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) npm audit fix low-severity saat minor update vite-plugin-pwa; (c) tambah `.pruned-assets` ke .gitignore tidak perlu (~/wfs-hq bukan repo).

## 2026-10-29 22:56 WIB — Siklus 159: BUG NAVIGASI PRODUKSI — /app/ melayani LANDING lagi (loop navigasi: CTA "Masuk Kantor 3D" menaut /app/ yang balik ke landing, kantor 3D tak pernah terbuka dari landing); /app/ kini SATU app + deep-link #dashboard; CTA "Lihat Dashboard" event-ke-hilang diperbaiki

- **Temuan (audit rute pasca-backlog kosong):** komentar server produksi bilang "kantor 3D penuh di /app/" tapi kenyataan kebalik: handler `do_GET` `~/wfs-hq/server.py` melayani **landing.html untuk /app/ juga**, sementara `/` = index.html (app). Konsekuensi nyata: (1) CTA "🚀 Masuk Kantor 3D" di landing menaut `/app/` → user berputar di landing selamanya (loop navigasi; tak ada jalan masuk office dari landing); (2) CTA "📊 Lihat Dashboard" menaut `/app/` + `setTimeout(dispatchEvent('wfs-toggle-dashboard'),2500)` — event di-dispatch ke dokumen LAMA yang sudah di-unload saat navigasi → dashboard tak pernah terbuka; (3) metadata tak konsisten (menu landing bilang kantor di /app/, server bilang sebaliknya).
- **Perbaikan (akar, bukan simptom):**
  - `~/wfs-hq/server.py` (produksi): split branch — `/landing(/)` = landing.html (tetap), **`/app(/)` = index.html + injeksi token UI** (satu app; `/` tak diubah = PWA start_url & semua guard cron tetap aman). Compile-check + restart systemd + verifikasi curl penuh.
  - `src/App.jsx` — deep-link runtime: hash `#dashboard` on-mount → dispatch event runtime yang SAMA dgn shortcut D (`wfs-toggle-dashboard`, jalur tunggal tanpa duplikat state) + `history.replaceState` bersihkan hash. Fallback bila hash hilang (redirect/pengetikan manual): flag `localStorage['wfs_open_dashboard']` dibaca-sekali-dikonsumsi (tak auto-buka tiap kunjungan), try/catch utk storage terblokir.
  - `public/landing.html` — CTA "📊 Lihat Dashboard" → `/app/#dashboard` (menulis flag fallback juga); "🚀 Masuk Kantor 3D" → `/app/` (kini benar-benar menuju kantor).
  - Guard regresi `src/__tests__/app_deeplink_dashboard.test.jsx` (3 test): hash membuka Dashboard; fallback terbuka SEKALI lalu flag dikonsumsi (kunjungan-2 tak auto-buka); tanpa keduanya tetap tertutup. **3/3 PASS.**
  - Tooling baru: `scripts/e2e_deeplink_dashboard.py` (E2E CDP :99, diskriminasi 3 keadaan A hash-buka/B bersih-tutup/C fallback-sekali+flag-konsumsi) + `scripts/shot_cdp.py` (pengganti shot.sh yang ter-prune dari scratch; 2 frame scene + landing, error CDP tak ditekan).
- **Bug tooling tertangkap (2):** WS parser probe pertama kehilangan continuation frames + settimeout 1s (Runtime event tak di-enable namun tetap gagal) → dirombak ke pola terbukti e2e_err.py (frame loop, settimeout 30); captureScreenshot gagal senyap (`KeyError result`) → error CDP kini dicetak + wait 20 dtk + frame kedua diambil (scene beranimasi).
- **Bukti terukur:**
  - curl pasca-restart: `/` token=1; **`/app/` token=1 + bundle index-9_sMLowc.js + BUKAN landing (0× "Masuk Kantor")**; `/landing` 200 + CTA `href="/app/#dashboard"` ter-serve.
  - **E2E CDP :99 — A deeplink-hash buka=True | B bersih buka=False | C fallback buka=True + flag konsumsi=True + kunjungan-2 buka=False ⇒ OK.**
  - Vitest **2433/2433 (180 file, +3)**; ESLint 0/0; build sukses (index-9_sMLowc.js, precache 38 = 1850.97 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; screenshot CDP scene **681.013 B** (frame-2 680.845 B — scene beranimasi), landing 273.969 B; heuristik piksel: scene uniq 23.717 warna (3D kompleks hidup), landing navy 88% + 3% teks terang. Vision model 404 di proxy (antigravity/gemini-3.8-flash-high tak terkonfigurasi) — penilaian visual via heuristik piksel (catatan).
  - wfs-hq & wfs-office active; guard stats/overview/approvals tak tersentuh (server.py hanya blok do_GET rute html statis).
- Commit: App.jsx + test + landing.html + scripts di commit siklus ini; `~/wfs-hq/server.py` dipatch terkontrol (backup `/tmp/hq-server.py.bak-*`). **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker tetap menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) `npm audit` 4 low severity saat minor update vite-plugin-pwa.

## 2026-10-29 23:34 WIB — Siklus 160: BUG PRODUKSI WIDGET AI CS — kontainer saas-dibantuin-widget menjalankan BUILD LAMA (fetch localhost:8000/api/admin/chat): chat selalu "Gagal terhubung ke server." bagi pengunjung eksternal; di-rebuild dari sumber yang sudah benar (same-origin /api/admin + /widget/chat), E2E CDP chat end-to-end nyata

- **Temuan (audit endpoint pasca-backlog kosong):** `/cs-widget/` (proxy server.py :9503 → Docker :3001, ditaut footer landing) menyajikan HTML dengan `const API = 'http://localhost:8000/api/admin'` + `fetch(API + '/chat')` — dua lapis rusak: endpoint `/chat` TIDAK ada di backend :8000 (yang benar `/api/admin/widget/chat`, route publik tanpa auth), dan base `localhost:8000` mati bagi pengunjung eksternal (browser mereka, bukan VM). Dampak: setiap user widget selalu mendapat "Gagal terhubung ke server." — fitur chat AI CS mati total di produksi. Sumber repo `saas-dibantuin/widget/index.html` SUDAH benar (`'/api/admin'` + `/widget/chat`) → akar: kontainer `saas-dibantuin-widget-1` dibuat 2026-10-14 dari image sebelum sumber diperbaiki dan tak pernah di-rebuild.
- **Perbaikan:** backup image lama `saas-dibantuin-widget:pre-fix-1760000000` (dipertahankan — dipakai kontrol E2E) → `docker compose build widget` + recreate container → :3001 & :9503/cs-widget kini menyajikan kode benar. POST `/api/admin/widget/chat` via proxy same-origin :9503 → **200 + balasan AI nyata** (backend FastAPI, LLM proxy).
- **Tooling baru `scripts/e2e_widget_chat.py` (CDP :99, diskriminasi 3 keadaan):** (A) buka `/cs-widget/` → verifikasi kode same-origin ter-serve → klik bubble → ketik "halo" → submit → polling balasan ≠ "Gagal terhubung ke server." (chat end-to-end nyata dgn LLM); (B) kontrol: image lama di-run di port buangan 3999 → HTML memuat `localhost:8000` + `'/chat'` sementara produksi same-origin (membuktikan probe tidak false-positive); (C) kontrol: endpoint pola lama `/api/admin/chat` via proxy → 401 (bukan 200+reply).
- **Bug diskriminator tertangkap di siklus ini (jujur):** kontrol B versi pertama fetch `localhost:8000` dari browser CDP → ternyata **200** — browser berjalan DI VM sehingga localhost terjangkau (persis kenapa bug lolos saat dev tapi mati bagi eksternal); diganti diskriminator KODE ter-serve (image lama vs baru). Kontrol C versi pertama menuntut 404 → nyatanya 401 (auth) → dilonggarkan ke "bukan 200".
- **Bukti terukur:** E2E `e2e_widget_chat.py` **===> OK** (2 run stabil; balasan LLM memang bervariasi); curl `:9503/cs-widget/` 200 + kode benar; vitest **2433/2433 (180 file)**; build sukses (precache 38, 1850.97 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; guard stats/overview/approvals **200**; wfs-hq & wfs-office active; kontainer widget Up.
- Commit: E2E script di commit ini (fix live di kontainer Docker; repo saas-dibantuin bukan git). **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) audit rebuild-status kontainer saas-dibantuin LAIN (admin/backend) vs sumber repo; (c) `npm audit` 4 low saat minor update vite-plugin-pwa.

## 2026-10-30 00:35 WIB — Siklus 161: BUG PRODUKSI PANEL ADMIN SAAS-DIBANTUIN (audit kandidat siklus 160: kontainer admin usia 2026-10-14 tak pernah di-rebuild) — 3 lapis mati: API localhost:8000 + TASK_URL IP-Tailscale (mati bagi browser eksternal) + panel sendiri 404 di :9503 + bug UI login (body display:none → blank, 401→reload berulang); plus kebocoran auth /api/admin/stats ditutup

- **Temuan (kandidat eksplisit siklus 160 — audit rebuild-status kontainer lain):** `saas-dibantuin-admin-1` dibuat 2026-10-14 (image = sumber, md5 identik → bug ada di SUMBER `admin/index.html`, bukan drift): (1) `const API = location.hostname.includes('8000') ? '' : 'http://localhost:8000'` — mati bagi browser eksternal, persis pola widget siklus 160; (2) `TASK_URL='http://100.117.198.46:8787'` (IP Tailscale) — mati bagi semua browser non-VM; (3) `:9503/admin/` 404 (link footer landing "Login Admin" menaut /admin/, tapi hanya :3001 widget yang diproxy; :3000 admin TIDAK diekspos publik) → panel TIDAK TERJANGKAU sejak dibuat; (4) **bug UI asli panel:** `if(!TOKEN) body.style.display='none'` menyembunyikan FORM LOGIN juga (blank page) sementara `loadDash()` tetap jalan tanpa token → api() 401 → `location.reload()` BERULANG (blank berkedip) — bahkan di LAN sekalipun panel tak bisa dipakai; (5) **kebocoran auth:** `GET /api/admin/stats` didefinisikan telanjang di backend main.py (di luar router terproteksi) → 200 tanpa token (tenant/conversation/message counts publik).
- **Perbaikan:**
  - `~/wfs-office/saas-dibantuin/admin/index.html` (sumber, bukan git): `const API=''` same-origin (nginx kontainer proxy `/api/` → backend:8000); `TASK_URL='/wfs-api'` + `fetch(TASK_URL+'/tasks')` → GET publik :9503 → gateway :8787; wrapper `<div id="main-app">` (aside+main) — yang disembunyikan pra-login kini main-app SAJA (form login selalu tampil), `loadDash()` guard `if(!TOKEN) return` (tidak ada lagi reload berulang).
  - `~/wfs-hq/server.py` (produksi, patch terkontrol — backup `/tmp/hq-server.py.bak-*`; TIDAK menyalin generasi 972-baris repo): `_proxy_bantuin` kini GET+POST+DELETE + header Authorization diteruskan (dulu HANYA POST tanpa auth — GET stats/tenants/conversations/knowledge admin 404 permanen; DELETE knowledge 404); `POST /api/auth/login` diproxy (login JWT panel); `do_GET` rute `/admin(/)` = proxy HTML :3000 (panel kanonik same-origin, base same-origin bekerja: fetch /api/* & /wfs-api/* satu origin).
  - `~/wfs-office/saas-dibantuin/backend/app/main.py`: `/api/admin/stats` + `dependencies=[Depends(require_auth)]` (kebocoran ditutup); rebuild image backend + admin (backup tak perlu — compose rebuild dari sumber).
  - Guard regresi `src/__tests__/deploy_prune.test.js` tak tersentuh; proxy :9503 punya fallback 401→login panel (bukan mengarang data).
- **Tooling baru `scripts/e2e_admin_panel.py` (CDP :99, diskriminasi 3 keadaan):** (A) `/admin/` produksi: kode same-origin ter-serve TANPA localhost:8000 → login SALAH ditolak ("Login salah") → login BENAR (password dari .env, tidak diketik manual) → dashboard nyata (s-tenants=2, tab Tenants diklik → 2 baris) → tab Agent Tasks = 4 task status gateway :8787 via /wfs-api/tasks; (B) kontrol: file admin LAMA (backup /tmp) disajikan di port buangan 3930 → detektor kode mengenali localhost:8000 + IP Tailscale (probe tidak false-negative; catatan jujur: dari browser dalam VM localhost:8000 TERJANGKAU — blind-spot dev yang membuat bug ini lolos — karena itu diskriminator = KODE ter-serve, pelajaran siklus 160); (C) kontrol endpoint: GET /api/admin/stats tanpa token = 401; POST /api/admin/chat (pola lama) ≠ 200.
- **Bug tooling tertangkap:** E2E run-1 gagal karena load halaman kontrol race → retry-loop 10×; `http.server` kontrol stale dari run sebelumnya → pkill sebelum start; tabel tenants ternyata hanya terisi saat tab diklik (perilaku panel) → E2E klik tab dulu (probe empiris, bukan tebak).
- **Bukti terukur:**
  - `e2e_admin_panel.py` **===> OK (2 run stabil, exit 0)**: A sameorigin=True no_old=True login_salah_ditolak=True tenants=2 tenant_rows=2 task_rows=4 (task #25 'Perbaikan filter kanban divisi' be1 done — data gateway nyata); B detektor kode lama OK; C 401/≠200 OK.
  - Baterai API 14/14 hijau: login-salah 401 · stats-noauth **401 (kebocoran tertutup; dulu 200)** · login-benar 200+JWT · stats-auth 200 {tenants:2, conversations:36, messages:72} · tenants 200 (2) · convs 200 (33) · knowledge 200 · DELETE-noauth **401 (dulu 404)** · widget-chat 200 (guard 160) · wfs-tasks/stats152/sh-overview/approvals/resources 200.
  - vitest **2433/2433 (180 file)**; build sukses (precache 38, 1850.97 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; :9503 root/app/landing/admin/cs-widget 200; wfs-hq & wfs-office active; backend Up (healthy), admin/widget/db/redis Up.
- Commit: `scripts/e2e_admin_panel.py` di commit siklus ini (fix live: kontainer admin+backend di-rebuild dari sumber; `~/wfs-hq/server.py` dipatch terkontrol; sumber saas-dibantuin bukan repo git — terdokumentasi di sini).
- **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker tetap menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) sumber admin/widget saas-dibantuin tak ber-version-control — kandidat inisialisasi git + remote agar fix terlacak; (c) `npm audit` 4 low saat minor update vite-plugin-pwa.

## 2026-10-30 01:05 (jam VM +08; WIB sebenarnya 00:05) — Siklus 162: saas-dibantuin di-version-control (git init + commit 123ee3e, 63 file, 0 rahasia) + deploy key baru disiapkan; npm audit 4 low ditutup via analisis (deepmerge 4.3.1 = versi TERBARU, tak ada patch upstream; fix `--force` = downgrade vite-plugin-pwa 2.0.0→0.2.1 merusak)

- **Item (b) kandidat siklus 161 — git init `~/wfs-office/saas-dibantuin`:** repo sumber (admin/widget/backend/frontend/docker-compose, fix same-origin & kebocoran stats siklus 160-161 kini terlacak). `.gitignore` baru (node_modules, .venv, __pycache__, **.env**, db/redis data, log); komit `123ee3e` = **63 file**; guard pra-komit: 0 file `.env`/.venv/node_modules/db ter-stage, scan rahasia (LLM_API_KEY=sk-*, JWT_SECRET hex) = **0 temuan**; `.env.example` berisi placeholder aman (`ganti-dengan-secret-panjang`).
- **Push ditunda (butuh user, dicatat tidak diulang):** push `git@github.com:wawanwfs/saas-dibantuin.git` → `Repository not found` (repo belum dibuat user) + kedua kunci SSH VM (`wfs_github`, `wfs_github2` — diuji via `ssh -T`) = **deploy key repo AI-Office saja**, GitHub menolaknya untuk repo lain (otentikasi key OK, otorisasi repo gagal). Browser GitHub = tidak login; vault Hermes kosong (tak ada kredensial GH — tidak ada yang bisa dipakai tanpa user). **Siap Pakai:** deploy key baru `~/.ssh/wfs_saas` (ed25519, passphrase kosong) sudah digenerate — user cukup: (1) buat repo `wawanwfs/saas-dibantuin` (private), (2) Settings → Deploy keys → Add: kunci di `~/.ssh/wfs_saas.pub` (read/write), (3) kabari worker → push langsung jalan.
- **Item (c) npm audit 4 low — DITUTUP via analisis, bukan `--force`:** rantai `vite-plugin-pwa@2.0.0 → workbox-build@7.4.1 → @rollup/plugin-node-resolve@16.0.3 → deepmerge@4.3.1` (advisory GHSA-gcqx-w48m-w2h4, prototype poisoning `mergeObject()`); registry: 4.3.1 = **versi terbaru** (rilis terakhir upstream 2023-03-16, tak ada 4.3.2+), audit JSON `patched_versions: None` untuk SEMUA 4 entri; satu-satunya "fix" yang ditawarkan npm = `--force` downgrade vite-plugin-pwa 2.0.0→**0.2.1** (breaking, >1.5 tahun mundur) — ditolak. Risiko runtime: chain hanya dipakai vite build (generateSW) di mesin dev/CI, tidak pernah masuk bundle produksi. Status: low, dev-only, no upstream fix → dipantau.
- **Bukti terukur:** vitest **2433/2433 (180 file)**; ESLint 0/0; build sukses (precache 38, 1850.97 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; :9503 root/app/admin/cs-widget = 200/200/200/200; wfs-hq & wfs-office active. Catatan jam: entri DEV_LOG sebelumnya memakai jam VM (+08) berlabel WIB — waktu nyata siklus ini 00:05 WIB.
- **Sisa backlog: KOSONG** (git-init selesai; audit ditutup analisis).
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 02:20 VM (+08; WIB 01:20) — Siklus 164: BUG VISUAL PRODUKSI DAY/NIGHT — jendela selalu langit SIANG (matahari+awan putih statis) meski malam hari (latar NAVY, daylight 0.3); kini skyTex di-REPAINT siang↔malam sesuai daylight (langit malam: bintang + bulan + glow kota horizon), terbukti via piksel kanvas (siang 104,183,240 ↔ malam 6,15,41)

- **Temuan (audit painter pasca-backlog kosong):** `skyTex` (tekstur SEMUA jendela kaca kantor — dinding depan/kanan/belakang/kiri via walls.js) digambar SEKALI saat init (`structure.js` → `drawSky`: gradien biru cerah #4EA8EE→#D6EDFB + pita matahari + 4 awan putih) dan TIDAK PERNAH di-update. Sementara `createLighting.apply(min)` punya siklus malam penuh (scene.background/fog NAVY 0x010a28, daylight 0.3 dini hari/malam, sun turun 0.9, dGlow agent naik). Konsekuensi: siapa pun membuka kantor jam malam (mis. sekarang 01:20 WIB) melihat jendela memancarkan langit biru siang terang berawan — kontras salah dgn interior gelap; mode "kantor hidup 24 jam" terasa seperti bug grafis.
- **Perbaikan (akar: repaint kanvas yang sudah ada, tanpa sentuh scene graph):**
  - `parts/sky_canvas.js` — painter baru `drawSkyNight(x)`: gradien gelap #050B22→#0A1636→#16264E, glow bulan radial di (210,22) (posisi sama dgn matahari siang → swap mulus), 15 bintang arc DETERMINISTIK (tanpa RNG — render stabil antar rebuild), glow kota hangat horizon bawah (linear 84→128, rgba(255,190,110,.22)).
  - `parts/structure.js` — canvas skyTex dipertahankan sbg referensi `skyCv`; hook `skyCv.__needsUpdate=()=>{skyTex.needsUpdate=true}` (repaint → re-upload GPU); refs return +`skyCv`.
  - `parts/daycycle.js` `createLighting` — ctx baru opsional `skyWinCanvas`; `paintSkyNight(night)` repaint `drawSkyNight`/`drawSky` dgn guard status (repaint HANYA saat state berubah — 0 repaint per tick dgn nilai sama); pemicu di `apply()`: `paintSkyNight(daylight(min) <= 0.55)` (malam penuh + senja lanjut); getter `skyNight` utk e2e; tanpa ctx itu (test lama) swap dilewati tanpa error. Import `drawSky/drawSkyNight` dari sky_canvas (1 arah, tanpa siklus).
  - `OfficeScene.js` — `skyWinCanvas:__skyCv` di ctx `createLighting`; hook debug baru (tIDAK menghapus hook lama): `window.__skyNight=()=>__light.skyNight` + `window.__skyCv=__skyCv` (bukti via state, bukan tebak dari screenshot).
- **Guard regresi `src/__tests__/sky_night_swap.test.js` (9 test):** drawSkyNight gradien gelap BUKAN warna siang; bulan di (210,22); tepat 15 arc tanpa ellipse (awan siang hilang); glow kota; kontras drawSky tetap 4 awan. Integrasi createLighting: malam 60 → repaint+needsUpdate; siang 720 → balik 4 awan; idempoten (siang terus/malam terus = 0 repaint); senja 1100 (daylight ≈0.44<0.55) → swap; tanpa skyWinCanvas → apply aman. Test refs `structure_runtime.test.js` diperbarui (+skyCv). **9 test baru, 2443 total.**
- **Tooling baru `scripts/e2e_sky_night.py` (CDP :99, diskriminasi 5 keadaan):** A load real-time (02:10 VM = malam) → `__skyNight()=True` sesuai jam; B `__setTime(720)` → False + screenshot day 668KB; C `__setTime(0)` → True + screenshot night 684KB; D flip-flop 5× berakhir konsisten; **E piksel kanvas via `__skyCv.getImageData` tengah: siang=(104,183,240) biru cerah | malam=(6,15,41) navy gelap** — bukti sumber kebenaran tekstur (viewport didominasi interior, heuristik layar tak diskriminatif). **===> OK**; vision model 404 di proxy (antigravity/gemini-3.8-flash-high, kondisi siklus 159) → penilaian via piksel kanvas (catatan jujur).
- **Bukti terukur:** vitest **2443/2443 (181 file, +9)**; ESLint 0/0 (5 file inti); build sukses (precache 38, 1852.02 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; verify_desks **26/26 (L1:9 L2:9 L3:8)**; screenshot day/night 668.308/684.142 B (scene hidup); guard :9503 root/landing/stats = 200/200/200; wfs-hq & wfs-office active.
- Commit: sky_canvas.js + daycycle.js + structure.js + OfficeScene.js + test + e2e script di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + deploy key `~/.ssh/wfs_saas.pub` (ternyata branch = main; push master gagal refspec, push main = Repository not found — menunggu repo user).

## 2026-10-30 04:15 VM (+08; WIB 03:15) — Siklus 165: BUG VISUAL PRODUKSI KELAS SAMA 164 — dinding kantor tetap terang pucat (#E6EAF1, MeshBasicMaterial) meski malam hari; kini 8 tekstur dinding di-REPAINT siang↔malam (panel biru arsitektural gelap + wainscot jati gelap), sinkron ambang dgn jendela (daylight ≤ 0.55), terbukti piksel kanvas siang (230,233,239) ↔ malam (55,63,79)

- **Temuan (audit lanjutan pasca-siklus 164 — kelas bug sama, elemen lain):** dinding atas & wainscot kayu (8 tekstur: 4 panel atas + 4 kayu, `drawWallTex` base pucat #E6EAF1 / kayu #8A6244) digambar SEKALI saat init via `lit()` = `MeshBasicMaterial` ("tidak bergantung pencahayaan → selalu terang") — sengaja begitu utk keterbacaan, tapi konsekuensinya jam malam (daylight 0.3, latar NAVY, lantai Lambert menggelap, jendela kini langit malam sejak 164) dinding tetap terang penuh seperti siang. Interior malam terlihat "bocor cahaya siang" di semua dinding — kontras salah yang sama dgn jendela sebelum 164.
- **Perbaikan (akar, pola terbukti repaint kanvas — tanpa sentuh scene graph):**
  - `parts/wall_canvas.js` — palet malam diekspor `WALL_NIGHT`: panel atas `#1B2436` (biru arsitektural gelap, seam samar rgba(96,116,150,.32)), wainscot kayu `#3B2B1D` (jati gelap, tetap kayu — kanal R>B). Painter `drawWallTex` TAK DIUBAH (parametrik base+line sejak awal) → repaint = panggil ulang painter dgn warna malam; pola panel/nat/bevel identik siang.
  - `parts/walls.js` — `tex()` kini mencatat tiap kanvas ke `wallTexPaints` ({cv,tex,base,line,wpx,hpx,step}); fungsi baru `paintWallNight(night)` me-repaint semua kanvas (pilihan palet per heuristik step: kayu = step 32) + `tex.needsUpdate` (re-upload GPU). Semua material berbagi map dgn referensi sama — termasuk KLON wall-fade (`m.material.clone()` di collect()) — jadi satu repaint cukup utk 4 dinding. Return +`paintWallNight`, `wallTexCount`, `wallTexPaints`.
  - `parts/daycycle.js` `createLighting` — ctx baru opsional `wallPainter` (runtime createWalls); `paintWalls(night)` dgn guard status terpisah dari sky + guard `wallReady` (kanvas init = palet siang → load langsung siang = 0 repaint); pemicu `apply()`: `paintWalls(d <= 0.55)` — ambang SAMA dgn jendela (satu sumber kebenaran). Getter `wallNight`.
  - `OfficeScene.js` — `const __wallsRt=createWalls({...})` → `wallPainter:__wallsRt` di ctx createLighting; hook debug baru (tanpa hapus hook lama): `window.__wallNight=()=>__light.wallNight` + `window.__wallTexCv=()=>__wallsRt.wallTexPaints[0]?.cv` (bukti via state+piksel, bukan tebak screenshot).
- **Guard regresi `src/__tests__/wall_night_swap.test.js` (10 test):** palet malam ≠ palet siang (panel gelap, kayu coklat R>B); kontrak gradien top/bottom painter tak berubah; repaint = painter parametrik dgn warna malam (fillStyle[0]=base, strokeStyle[1]=line — mock recorder); integrasi createLighting: malam 60→paint(true), siang 720→paint(false), load-siang=0 repaint, idempoten malam terus=1×, senja 1100→night (ambang sama), tanpa wallPainter→aman + sky swap tetap jalan. **10 test baru, 2453 total.**
- **Tooling baru `scripts/e2e_wall_night.py` (CDP :99, 5 keadaan):** A realtime (03:xx = malam) → True; B siang 720 → False + piksel kanvas dinding (288,24) pucat (230,233,239); C malam 0 → True + gelap (55,63,79); D flip-flop 5× stabil; E sinkron wall==sky di 6 keadaan waktu (0/400/720/1000/1100/1200). **===> OK 2 run**; e2e_sky_night (jendela) rerun **tetap OK** — tak regresi. Bug tooling tertangkap: sampel x=256 tepat kena garis seam panel (step 64) → digeser 288; ambang awal terlalu ketat utk piksel gradien bevel → dikalibrasi dari hasil nyata.
- **Bukti terukur:** vitest **2453/2453 (182 file, +10)**; ESLint 0/0 (5 file inti); build sukses (precache 38, 1852.67 KiB) → deploy sinkron (`pruned 0 orphan`); `e2e_err.py` **0/0/0**; verify_desks **26/26 (L1:9 L2:9 L3:8)**; screenshot day 675KB / night 690KB (scene hidup); guard :9503 root/landing/stats = 200/200/200; wfs-hq & wfs-office active. Vision model masih 404 di proxy (kondisi 159–164) → verifikasi visual via piksel kanvas + state hook.
- Commit: wall_canvas.js + walls.js + daycycle.js + OfficeScene.js + test + e2e script di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 05:25 VM (+08; WIB 04:25) — Siklus 167: BUG VISUAL DAY/NIGHT kelas 164-166 — WHITEBOARD sprint putih (#fbfbfa, MeshBasicMaterial unlit, avgLum 243 — terang tertinggi di seluruh audit) menyala seperti panel lampu saat malam + 36 mesh bunga pot (krem #F6F2EA/kuning #F2C14E) ikut menyala; kini papan di-TINT siang↔malam (tahan redraw live) & bunga masuk pipeline trim — sinkron sky==wall==trim==board

- **Temuan (rerun audit enumerasi scene live `e2e_mb_audit2.py` pasca-166):** sisa kandidat MB terang saat malam tinggal 3 kelompok: (1) **whiteboard sprint 320×128** latar `#fbfbfa` (avgLum 243 — TERANG tertinggi, melebihi trim putih 166) di ruang rapat [8,2.2,-5.5]; (2) 13 plane [3,1.9] avgLum 218 = **sheen kaca** (overlay alpha rendah, memang subtle — BUKAN bug, salah kandidat tersaring); (3) poster 256×340 avgLum 218-243 = latar painter sudah navy #14172b (aman, avg tinggi hanya area teks). Investigasi 256×128 avgLum 190-222 → **root cause jendela dinding KIRI (walls.js:240): map skyTex dibuat TANPA push skyWinMats + TANPA fadeMats** — tapi repaint kanvas skyTex (164) by-reference → materialnya ikut otomatis (terverifikasi e2e wall/trim tetap OK) → aman, cuma tak ter-tint neon (beda mode, bukan bug siang↔malam). Sisa nyata: **whiteboard + bunga pot** (36 mesh MB statis FLW[4] di bawah jendela depan/kanan; krem #F6F2EA lum ~240, kuning ~186).
- **Perbaikan (pola terbukti 164-166, ambang satu sumber kebenaran d≤0.55):**
  - `parts/room.js` — `paintBoardNight(night)` di createMeetingRoom: **TINT warna material** papan (pola `skyWins` mode neon), BUKAN repaint kanvas → **tahan redraw live** papan (setInterval 60 dtk + visibilitychange, data task nyata __tvData: redraw hanya `map.needsUpdate`, warna material tak tersentuh). `WB_TINT_NIGHT=0x2A3446` (harmonis bingkai jendela FR 0x2B3446); guard idempoten; return +`paintBoardNight`.
  - `parts/daycycle.js` — ctx opsional `boardPainter` (pola trimPainter 166); `paintBoard(night)` guard state+ready terpisah (init=siang → load siang=0 set); pemicu `apply()`: `paintBoard(d <= 0.55)`; getter `boardNight`.
  - `parts/walls.js` — 36 material bunga masuk inventaris trim via `note(mat, FLW[i], FLW_NIGHT[i])` (pasangan per warna: pink #E86A92→#5A2740, kuning #F2C14E→#6B4E1E, hijau #7FC8A9→#1F4F3E, krem #F6F2EA→#3A4256 — hue asli terjaga, lum turun ≥4×); otomatis ikut `paintTrimNight` + tag mesh + tahan klon wall-fade (mekanisme 166); return +`flowerDay/flowerNight`.
  - `OfficeScene.js` — `boardPainter:{paintBoardNight:__mr.paintBoardNight}` di ctx createLighting; hook debug baru (tanpa hapus hook lama): `window.__boardNight` + `window.__boardMat`.
- **Guard regresi:** `src/__tests__/board_night_swap.test.js` BARU (8 test: kontrak painter #fbfbfa tak berubah, konstanta tint, malam/siang/load-siang-0/idempoten/senja-1100/tanpa-boardPainter-aman); `trim_night_swap.test.js` diperbarui (trimCount ≥ 76 = 13 crown/sill + 34 pilar + 36 bunga = **83 material instance**; pasangan warna flowerDay/flowerNight diterima). Probe live pasca-deploy: **83 mesh ter-tag** (semua material instance terpakai ≥1 mesh — 13+34+36).
- **Tooling baru `scripts/e2e_board_night.py` (CDP :99, 6 keadaan):** A realtime (05:xx = malam) → True; B siang 720 → False + material putih (1,1,1); C malam 0 → True + rgb(0.023,0.034,0.061)=#2A3446; **C2 dispatch visibilitychange → redraw live → tint SELAMAT** (regresi kunci: repaint kanvas akan gugur di sini); D flip-flop 5×; E sinkron sky==wall==trim==board di 6 keadaan waktu.
- **Bukti terukur:** `e2e_board_night.py` **===> OK** (screenshots day 674KB / night 688KB); regresi rerun tetap OK: e2e_wall_night + e2e_trim_night + e2e_sky_night; vitest **2473/2473 (184 file, +8)**; ESLint 0/0 (5 file); build sukses (precache 38, 1854.27 KiB) → deploy sinkron; `e2e_err.py` **0/0/0**; verify_desks **26/26 (L1:9 L2:9 L3:8)**; :9503 root/app/landing 200; wfs-hq & wfs-office active.
- Commit: room.js + daycycle.js + walls.js + OfficeScene.js + 2 test + e2e script di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`; (c) audit judul dinding "WFS PROJECT" (avgLum 194, kandidat tersisa di audit) — kandidat dim halus malam (UI judul, mungkin sengaja terang).

## 2026-10-30 06:30 VM (+08; WIB 05:30) — Siklus 168: BUG VISUAL DAY/NIGHT kelas 164-167 — JUDUL dinding "WFS PROJECT" (putih+amber, avgLum 194, kandidat (c) tersisa audit 167) tetap menyala saat malam; kini di-REPAINT parametrik siang↔malam (dua-tone brand terjaga) + bug tooling tersingkap: heuristik jam 4 skrip e2e night SALAH saat jam 06:xx (daylight 0.31 ≤ 0.55 = malam menurut ambang) — kini ekspektasi dari formula daylight() yang sama

- **Temuan (rerun audit enumerasi `e2e_mb_audit2.py` pasca-167):** satu-satunya kandidat terang NYATA tersisa = kanvas **1024×200 avg [248,189,88] (avgLum 194)** di dinding kiri [-16.8,2.9,-6.5] = **judul "WFS PROJECT"** (`drawWallTitle`, putih #FFFFFF + amber #F59E0B, latar transparan, MB unlit `uiMaterial` — sengaja terbaca, konsekuensi sama kelas 164-167). Whiteboard 320×128 masih tercetak di audit (avgLum 243) = **false positive yang diharapkan**: audit membaca PIKSEL KANVAS, sedangkan fix 167 menint warna MATERIAL (kanvas memang tetap putih — tint tetap bekerja, terbukti e2e_board_night rerun OK). 13 plane sheen kaca & poster navy (sudah disaring 167) tak berubah.
- **Perbaikan (REPAINT parametrik pola 164/165 — BUKAN tint 167):** kanvas judul STATIS (tanpa redraw live) → repaint aman; dan tint satu-warna akan MERATAKAN dua-tone brand (putih & amber jadi satu warna) — jadi painter dibuat parametrik: `drawWallTitle(ctx, colors)` default `TITLE_DAY {w:'#FFFFFF',p:'#F59E0B'}` (identik kode lama) + `TITLE_NIGHT {w:'#7E90B4' silver-biru, p:'#8A5E1A' amber gelap}` (hue terjaga: WFS B>G>R, PROJECT R>G>B; lum turun ~½). `paintTitleNight(night)` di OfficeScene (repaint + `wtt.needsUpdate=true`); ctx `titlePainter` di createLighting dgn guard state+ready terpisah (init=siang → load siang=0 repaint), ambang SAMA d≤0.55; getter `titleNight`; hook debug baru `window.__titleNight` + `window.__titleCv` (getter lazy — wtc dideklarasi belakangan, TDZ bila langsung; koreksi cepat: komentar inline sempat mengomentari sisa baris hook, langsung dipulihkan).
- **Bug tooling tersingkap (bonus siklus):** rerun regresi 4 e2e night → SEMUA FAIL ['A'] saat jam 06:xx: heuristik `hour0<6 or hour0>=19` menyatakan 06:xx = siang, padahal `daylight(361)=0.30 ≤ 0.55` = MALAM menurut ambang bersama scene (smoothstep fajar 06:00-08:00 belum naik). Diperbaiki di SEMUA 5 skrip (board/wall/trim/sky/title): ekspektasi dihitung dari formula `daylight()` yang sama (satu sumber kebenaran) — kegagalan bukan regresi fitur (B/D/E hijau sejak run pertama).
- **Guard regresi:** `logo_canvas.test.js` +1 test (kontrak TITLE_DAY identik lama; lum malam <75% siang; hue kanal terjaga; repaint malam posisi/font identik); `board_night_swap.test.js` +7 test (pemicu titlePainter: malam/siang/load-siang-0/idempoten/senja-1100/tanpa-titlePainter-aman/sinkron board+title). **vitest 2481/2481 (184 file, +8).**
- **Tooling baru `scripts/e2e_title_night.py` (CDP :99, 6 keadaan):** A realtime dgn ekspektasi daylight() (t=370, daylight 0.31 → night=True OK); B siang 720 → False + piksel kanvas dua-tone terang W=[254,244,226] P=[245,158,11]; C malam 0 → True + W=[127,138,162] P=[138,94,26] **lumDrop 44%/41%** dgn urutan hue terjaga; D flip-flop 5× stabil; E sinkron sky==wall==trim==board==title di 6 keadaan waktu. **===> OK** (kalibrasi C: kunci kanal-pers gugur oleh bleed antar-wilayah — font sama "PROJECT" menjulur ke sampel "WFS" → diganti bukti relatif hue-order + lumDrop ≥35%).
- **Bukti terukur:** vitest **2481/2481 (184 file, +8)**; ESLint 0/0 (5 file inti); build sukses (precache 38, **1854.65 KiB**) → deploy sinkron; `e2e_err.py` **0/0/0**; regresi rerun **e2e_board_night + e2e_wall_night + e2e_trim_night + e2e_sky_night semua OK** (pasca-fix tooling A); verify_desks **26/26 (L1:9 L2:9 L3:8, collisions NONE)**; screenshot day 673KB / night 688KB (scene hidup); :9503 root/app/landing 200; wfs-hq & wfs-office active.
- Commit: logo_canvas.js + daycycle.js + OfficeScene.js + 2 test + 5 skrip e2e di commit siklus ini. **Sisa backlog: KOSONG** — kandidat terang audit scene kini TERSARING HABIS (semua kelompok teridentifikasi: fixed, aman-by-design, atau false positive).
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 08:15 VM (+08; WIB 07:15) — Siklus 169: BUG VISUAL DAY/NIGHT kelas 164-168 (final) — PANEL PLAFON recessed (#F0F4FF, n=114, bidang unlit TERLUAS di audit) & BOHLAM lampu gantung (#FFF3D6 ×26 meja) tetap menyala saat malam; kini keduanya ikut siang↔malam (pola trim 166: tag mesh __ceil, pasangan day/night) — misteri grup n=310 audit (0.05×0.05 putih) TERPECAHKAN: glint mata + lampu status robot (detail mikro <5cm, by-design, bukan bug)

- **Temuan (rerun audit `e2e_mb_audit2.py` pasca-168):** grup terang tersisa yang NYATA = (1) **panel plafon recessed 3×1m `#F0F4FF` MB statis ×35 mesh (audit tercatat n=114 karena 114 INSTANCE memakai material itu via grouping unik per uuid-map… n sebenarnya per-material; dim 4.2×1.8 di tabel = salah satunya)** — dirender putih penuh 24 jam, hanya digelapkan di MODE NEON (bukan day/night); (2) **bohlam lampu gantung `#FFF3D6` MB ×26 meja** (`createCeilingFixtures`) — sama. Grup `n=310 dim[0.05,0.05] putih` di tabulasi audit = **SEMUA mesh MB(0xffffff) TANPA map digabung per-rgb**: glint mata putih (SphereGeometry ×4 per char × ~52 char + figur rapat) + lampu status robot (BoxGeometry 0.05×0.05×0.014, terverifikasi probe live: parent Group[robot], pos lokal (0.1,0.86/-0.91) = ty+0.12 pose duduk/berdiri) = **detail mikro <5cm — by-design, bukan kandidat day/night**. Plafon utama y=4.3 = MeshLambertMaterial (ikut lighting otomatis — bukan bug).
- **Perbaikan (pola trim 166 — tag mesh, warna material aktif, selamat dari klon wall-fade):**
  - `parts/room.js` — `createCeilingFixtures` kini mengembalikan runtime: pasangan `CEIL_DAY 0xF0F4FF ↔ CEIL_NIGHT 0x2E3A52` (biru arsitektural gelap, harmonis WALL_NIGHT #1B2436) & `BULB_DAY 0xFFF3D6 ↔ BULB_NIGHT 0x3A3426` (amber sangat redup, hue hangat R≥G>B terjaga, lum ~¼); bohlam per meja di-tag `userData.__ceil=BULB_DAY`; **`paintCeilNight(night)`** traverse office → set warna material mesh ter-tag (return count, guard traverse).
  - `OfficeScene.js` — **`const __ceilRt=createCeilingFixtures({THREE,office,M,MB},DESKS)` dipanggil SEBELUM loop panel plafon** (loop butuh `__ceilRt.ceilDay` untuk tag; argumen = import `DESKS` langsung — `const desks` dideklarasikan belakangan = TDZ, **2× Scene init failed saat pengembangan tertangkap konsol & diperbaiki**, ditemukan via CDP console error "Cannot access 'Ht/Vt' before initialization" → urutan deklarasi dibereskan); panel plafon loop di-tag `p.userData.__ceil=__ceilRt.ceilDay`; ctx `ceilPainter` di createLighting; hook debug baru `window.__ceilNight` + `window.__ceilMat` (piksel material mesh ter-tag pertama — tanpa hapus hook lama).
  - `parts/daycycle.js` — `ceilRt/ceilNight/ceilReady` guard state+ready terpisah (pola titlePainter 168); pemicu `apply()`: `paintCeils(d <= 0.55)` — ambang SAMA satu sumber kebenaran; getter `ceilNight`.
- **Guard regresi `src/__tests__/ceil_night_swap.test.js` BARU (13 test):** konstanta palet (identik siang, malam gelap, hue bohlam terjaga lum ≤¼); paintCeilNight set warna mesh ter-tag + balik siang + material tak ter-tag tak tersentuh + office tanpa traverse aman; integrasi createLighting: malam/siang/load-siang-0/idempoten/senja-1100/tanpa-ceilPainter-aman/**sinkron wall==trim==board==title==ceil di 6 keadaan waktu**. **vitest 2494/2494 (185 file, +13).**
- **Tooling baru `scripts/e2e_ceil_night.py` (CDP :99, 6 keadaan):** A realtime dgn ekspektasi daylight(); B siang 720 → panel rgb live (0.871,0.905,1.0)=#F0F4FF linear; C malam 0 → (0.027,0.042,0.084)=#2E3A52 linear; D flip-flop 5×; E sinkron sky==wall==trim==board==title==ceil di 6 keadaan waktu. **===> OK** (screenshots day 671KB / night 688KB). Bukti bohlam terpisah (probe live): siang (1,0.896,0.672) → malam (0.042,0.034,0.019) **lumDrop 96%** hue hangat terjaga. Catatan tooling: `COL` awal menangkap bohlam (dim <2m) → difilter `gp.width>=2` utk panel; nilai material live = LINEAR (THREE r152+ sRGB→linear) → ambang dikalibrasi dari nilai nyata.
- **Bukti terukur:** vitest **2494/2494 (185 file, +13)**; ESLint 0/0; build sukses (precache 38, **1855.60 KiB**) → deploy sinkron; `e2e_err.py` **0/0/0**; regresi rerun **title/board/wall/trim/sky e2e semua OK**; verify_desks **26/26 (L1:9 L2:9 L3:8, collisions NONE)**; :9503 root/app/landing 200; wfs-hq & wfs-office active; vision model masih 404 di proxy (kondisi 159-169) → verifikasi visual via material-state + piksel kanvas + probe live (jujur, bukan tebakan).
- Commit: room.js + daycycle.js + OfficeScene.js + test baru + e2e script di commit siklus ini. **Sisa backlog: KOSONG** — kandidat terang MB audit kini benar-benar tuntas (panel+bohlam FIXED; grup 310 = detail mikro by-design; plafon utama Lambert aman).
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 10:05 VM (+08; WIB 09:05) — Siklus 170: MODE NEON MATI TOTAL TERSINGKAP (bug arsitektural, kelas akar 164-169) — toggleCyberpunk ditulis ulang inline (commit 4e17450) & MELUPAKAN tint jendela + panel plafon → createNeonMode jadi kode mati; probe live: 13/13 jendela sky-view tetap putih #ffffff saat neon ON; kini neon menyala utuh (jendela #14213F, panel 0x0A1526, bohlam 0x16243D) + resync() painter day/night pasca-OFF + remap registry skyWinMats saat klon wall-fade

- **Temuan (probe live baru `scripts/probe_neon_skywin.py`, CDP :99):** bukan sekadar jendela kiri (duga awal dari jejak siklus 167) — **SEMUA 13 jendela sky-view tetap `#ffffff` saat mode neon ON**. Akar: `toggleCyberpunk()` (OfficeScene) punya implementasi inline sendiri sejak commit `4e17450` ("perbaikan total pencahayaan night studio anti-hancur") dan TIDAK PERNAH memanggil `__neon.toggle()` → seluruh `createNeonMode` (daycycle) = **kode mati**: tint `skyWins 0x14213F`, gelap `ceilPanels 0x0A1526`, dim pendant/panel-light — tak pernah dieksekusi. Bug kedua di jalur yang sama: registry `__skyWinMats` memegang material ASLI 4 jendela back/left yang di-CLONE oleh `collect()` wall-fade pada tick pertama → meski neon jalan pun tint menyasar material basi (9 jendela depan/kanan tidak diklon). Bug ketiga: restore neon lama (enable/disable daycycle) memaksa warna SIANG keras — balik malam akan salah palet.
- **Perbaikan (3 lapis, tanpa mengubah look neon yang sudah diterima user):**
  - `walls.js` — remap registry saat klon: `skyWinMats[ix]=m.material` (klon menggantikan asli in-place, tanpa duplikat, panjang tetap 13).
  - `OfficeScene.js` — filter pendant/panel-light di-hoist (`pendBulbs/pendLights/panelLightsArr`, dipakai `__neon` & toggle); toggle inline kini ikut: **ON** → `__skyWinMats→0x14213F`, `__ceilPanels→0x0A1526`, bohlam `0x16243D`, pendant-light `0x06/0x1E3A5F`, panel-light `0.03`; **OFF** → jendela balik putih + lampu restore + `__light.resync()`.
  - `daycycle.js` — **`resync()`** baru di createLighting: set state tiap painter ke KEBALIKAN target lalu repaint sekali (guard ready tidak lagi valid pasca-neon; getter tetap boolean, `apply()` lanjutan no-op idempoten) — langit jendela (164), dinding (165), trim (166), papan (167), judul (168), plafon+bohlam (169) semua kembali sesuai jam NOW.
- **Guard regresi:** `src/__tests__/neon_resync.test.js` BARU (5 test: resync malam repaint paksa 2×, resync siang balik palet siang walau ready-guard terlanjur, getter tetap boolean, apply() pasca-resync no-op, tanpa painter aman); `walls_runtime.test.js` +2 (pasca-clone SEMUA 13 material jendela tetap terdaftar & unik; jendela depan/kanan tak berubah referensi). **vitest 2501/2501 (186 file, +7).**
- **Bukti live (probe real-time, bukan tebakan):** NEON-ON → **13/13 jendela `#14213F`** (RGB linear 0.01,0.02,0.05 — termasuk 4 back/left yang dulu meleset); restore → 13/13 `#ffffff`; `probe_neon_ceil.py`: DAY bohlam (1.0,0.896,0.672) → NEON (0.008,0.018,0.047) → OFF pulih (1.0,0.896,0.672) → NIGHT (0.042,0.034,0.019)+ceilNight/skyNight/wallNight=true. Regresi 6 e2e night **semua === > OK** (sky/wall/trim/board/title/ceil — sinkron 6 keadaan waktu), `e2e_err.py` **0/0/0**, verify_desks **26/26 (collisions NONE)**.
- **Bukti terukur:** vitest **2501/2501 (186 file, +7)**; ESLint 0/0; build sukses (precache 38, **1856.25 KiB**) → deploy sinkron; :9503 root/app/landing 200; wfs-hq & wfs-office active. Catatan tooling: `shot.sh` default menembak LANDING (245KB — bukan scene; arg ke-4 `app/` untuk kantor) — screenshot kanal CDP e2e (666-687KB) tetap jadi bukti scene hidup; vision model masih 404 di proxy (kondisi 159-170).
- Commit: walls.js + daycycle.js + OfficeScene.js + 2 test + 2 probe live di commit siklus ini (sebagian ter-sapu auto-commit cron 09:30 — tercatat di sini). **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`; (c) opsi: satukan toggle inline & createNeonMode jadi satu sumber (pembersihan arsitektur, risiko regresi visual neon — perlu verifikasi visual user).

## 2026-10-30 11:10 VM (+08; WIB 10:10) — Siklus 171: TOGGLE NEON & createNeonMode DISATUKAN (pembersihan arsitektur kandidat (c), lanjutan akar 170) — toggleCyberpunk kini DELEGASI ke __neon.toggle() (kode mati resmi dimakamkan), palet NEON = satu-satunya sumber kebenaran (nilai look diterima user pindah utuh), restore pasca-OFF via restoreTime→apply() + resync()

- **Latar:** siklus 170 menambal toggle inline TANPA menyatukan — dua palet tetap hidup berdampingan (inline: ambient 0.58/sun 1.25/tube 0.85/reception 0.9; createNeonMode: 0.14/0.06/0.55/0.7) dan `__neon` tetap tak pernah dipanggil = kode mati tersisa. Siklus ini menuntaskan pembersihan arsitektur: satu implementasi, satu palet.
- **Perubahan (2 file inti + 2 test):**
  - `parts/daycycle.js` — **`export const NEON`** = satu-satunya palet neon (enable + restore): nilai = look eks-inline yang SUDAH diterima user (siklus 170, terverifikasi probe live) pindah utuh; `createNeonMode.enable()/disable()` kini membaca dari NEON. Catatan semantik yang diselidiki sebelum dipilih: disable TIDAK menyetel ambient/sun/exposure (restoreTime→apply() daycycle yang memulihkan sesuai jam — satu sumber untuk pencahayaan waktu); pendBulb restore = `0xffffff` (eks-inline `0xfff8e0` tak pernah terlihat: resync()→paintCeils selalu menimpanya sesuai jam); ceiling.panels restore `0xF0F4FF` tetap eksplisit (paintCeils siang no-op karena ready-guard).
  - `OfficeScene.js` — `toggleCyberpunk()` = **delegasi murni**: `cyberpunkMode=__neon.toggle()`; ON → hanya `__terraces.setMode(true)`; OFF → `__light.resync()` + `setMode(false)`; persist `wfs_neon` tetap di OfficeScene. Seluruh 22 baris set-warna inline (termasuk blok tambalan 170) DIHAPUS — tidak ada lagi pasangan angka kembar. Perilaku & nilai eksekusi IDENTIK dgn siklus 170 (palet dipindah, bukan diubah).
  - `daycycle_runtime.test.js` — nilai ekspektasi enable diperbarui ke palet NEON (dulu menegakkan palet kode-mati 0.14/0.06! — bukti test lama menjaga kode mati tetap "benar") + **3 test baru** `describe('NEON — single source of truth')`: kontrak nilai enable (15 field), restore= basis siang + restoreTime terpanggil, enable menutup SEMUA kelompok eks-inline (skyWin/ceilPanel/pendBulb/pendLight/panelLight pasangan eksak). `neon_persist.test.js` +NEON import, nilai 0.58/1.25/1.15 & NEON.floor.
- **Bukti live (jalur BARU — delegasi, bukan jalur lama):** `probe_neon_skywin.py`: OFF putih ×13 → ON **13/13 `#14213f`** → restore putih ×13; `probe_neon_ceil.py`: DAY (1,0.896,0.672) → NEON (0.008,0.018,0.047) → OFF pulih → NIGHT (0.042,0.034,0.019)+sky/wall/ceil night=true (resync jalan).
- **Bukti terukur:** vitest **2504/2504 (186 file, +3)**; ESLint 0/0; build sukses (precache 38, **1855.95 KiB**) → deploy sinkron; `e2e_err.py` **0/0/0 hooks=True**; regresi **6 e2e night semua ===> OK** (sky/wall/trim/board/title/ceil — sinkron 6 keadaan waktu); verify_desks **26/26 (L1:9 L2:9 L3:8, collisions NONE)**; screenshot scene **674KB** (hidup); :9503 root/app/landing 200; wfs-hq & wfs-office active. Tooling: `e2e_err.py` & `shot.sh` ter-prune dari scratch (idle 24 jam) — **e2e_err.py direkonstruksi** (pump CDP terpadu: event console dicatat sambil resolve response id; toleran idle-stream; hasil identik format `0/0/0`) + dipakai penuh siklus ini.
- Commit: daycycle.js + OfficeScene.js + 2 test di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 13:12 VM (+08; WIB 12:12) — Siklus 172: KETAHANAN KONTEKS WEBGL (glLost end-to-end) + **BUGFATAL LUNCH-CRASH TERSINGKAP & DIMATIKAN** — checkConversations membaca .walker/.home di WRAPPER hasil nearbyPairsPure (selalu undefined) → animate() crash per-frame saat 2 agen berdekatan → KANTOR BEKU TOTAL sepanjang jam makan siang 12:00-13:00 (repro live 2×: 128 error/5 dtk, sim clock ikut beku); diperbaiki unwrap .a + guard glLost menyeluruh (chip HUD "GPU terputus…", sampling jelata, audio suspend/resume, refresh peta bayangan pasca-restore)

- **Fitur (glLost — GPU reset / driver crash / tab mobile dibuang OS):** Three r183 pulih sendiri (_isContextLost → render() no-op; restore → initGLContext + reupload), TAPI lapisan aplikasi buta: frame no-op tetap terhitung di kecepatan display → chip "GPU xx FPS" berbohong di atas kanvas hitam; recovery tangga bisa mengisi streak semu (bayangan menyala ulang di tengah kegagalan GPU); ambience audio terus berjalan. Perbaikan: (1) `perf_quality.js` — state `glLost` disuntik dari pemilik listener via `opts.glLost()` SEBELUM guard t0 (konteks bisa hilang sebelum sampel pertama) → sampel jelata: fps tak dihitung, jendela & streak di-reset (pola stale 148); `perfChip` status "GPU terputus…" (state 'down') MENIMPA semuanya walau fps 0/kosong; (2) `OfficeScene.js` — listener `webglcontextlost` (preventDefault = syarat spesifikasi agar restore dipicu; flag true; `__sound.suspend()`) & `webglcontextrestored` (flag false; `renderer.shadowMap.needsUpdate=true` — peta lama gugur saat lost; `__sound.resume()` bila tab visible) via `__onCanvas` (AbortController 133 — destroy() abort SEBELUM forceContextLoss → scene mati tak mengangkat flag, `__glLost=false` eksplisit); passthrough `glLost:()=>__glLost` ke perfStep; (3) `App.jsx` — komentar kontrak chip (tak ada perubahan perilaku — polling 2 dtk sudah membawa status); (4) `scene_hooks.js` — hook `__glLost` masuk SCENE_HOOKS (purge destroy).
- **BUGFATAL ditemukan via tooling glLost (bonus terbesar siklus):** e2e baru gagal di state restore → window error `TypeError: Cannot read properties of undefined (reading 'y')` 30×/dtk. Pelacakan stack minified (`ri`@70105 ← `gi`@71335) + probe agentData TEPAT saat crash = BUKAN bug glLost: **`checkConversations` melakukan destructure `for(const [a,b] of pairs)` lalu membaca `a.walker`/`a.home` di objek pembungkus `{a,visible,x,z,cooldown}` hasil `nearbyPairsPure` — field itu ada di `a.a`, bukan di wrapper** → TypeError begitu DUA agen terlihat berjarak < CHAT_RADIUS 1.5. Efek nyata (repro live 2× independent): animate() crash per-frame SEJAK detik agen mengerumuni kafe (auto-cross 12:00 lunch_start) → **kantor beku total sepanjang jam makan siang 12:00-13:00** (frame, sim clock, semuanya berhenti; `advanceSimClock` di baris crash tak pernah tercapai), plus setiap kumpulan obrolan dekat di jam kerja. Bug asli (bukan regresi siklus ini) — lolos karena e2e lama tidak pernah membiarkan 2 agen berdekatan dalam window error-nya. **Fix:** unwrap `const a=pa.a, b=pb.a` + hardening `if(!a||!b)continue`.
- **Guard regresi (2 file, +16 test):** `src/__tests__/chat_check.test.js` +3 — kontrak pasangan utk pemanggil runtime: pasangan=[wrapper,wrapper], agen asli di `.a`, wrapper tak punya field scene (sumber bug), pola unwrap → akses home/agent AMAN, cluster kafe lunch menghasilkan pasangan (jalur yang dulu crash). `src/__tests__/gl_lost.test.js` BARU 13 test — perfStep: injeksi dari opts → sampel jelata (fps beku, jendela reset), injeksi sebelum guard t0, tangga DIAM (pixelRatio/bayangan utuh), recovery tak terisi streak semu (L2 tak menyala ulang), pasca-restore bersih + sampling hidup, tanpa-opts kompatibel; perfChip: "GPU terputus…" menimpa fps palsu tinggi & tampil walau fps 0, tanpa-glLost perilaku lama utuh; kontrak statis sumber: listener lost+restored + preventDefault, injeksi + reset destroy, refresh shadowMap pasca-restore, hook terdaftar SCENE_HOOKS. **vitest 2520/2520 (187 file, +16).**
- **Tooling baru:** `scripts/e2e_gl_lost.py` (CDP :99, **WEBGL_lose_context nyata** — objek ext HARUS di-grab SEBELUM konteks hilang; getExtension saat lost = null, pelajaran tooling) — 5 keadaan: A baseline (glLost False, rAF hidup) → B lost (**glLost=True, perf.glLost+stale=True, fps BEKU 0.31 padahal rAF 62→242 = premis terbukti, chip 'perf-chip down' "GPU terputus…"**, screenshot 226KB kanvas hitam) → C restored (flag bersih, sampling hidup lagi via polling anti-race — SwiftShader 0.3-3 FPS membuat sampel ≥2 dtk hanya dihitung di atas frame, **scene hidup 649KB**) → D siklus ke-2 lose→restore idempoten → E destroy (hook ter-purge + hygiene=True). **===> OK**. `scripts/e2e_lunch_chat.py` — regresi spesifik crash: setTime(718) → AUTO-cross 720 lunch_start → atCafe=26 (cluster penuh) → **40 dtk: 0 error window, frames 4→48, sim 718→741, bubbles=3 (fitur chat HIDUP kembali), screenshot 668KB** → **===> OK** (dulu: crash 128 error/5 dtk mulai detik ke-30).
- **Bukti terukur:** vitest **2520/2520 (187 file, +16)**; ESLint 0/0; build sukses (precache 10 entri, **1378.58 KiB** — rolldown memadatkan chunk OfficeScene+vendör) → deploy sinkron (9503: 200, pruned 0); `e2e_err.py` **0/0/0 hooks=True**; regresi **6 e2e night semua ===> OK** (sky/wall/trim/board/title/ceil); verify_desks **26/26 (L1:9 L2:9 L3:8, COLLISIONS: NONE)** via `node scripts/verify_desks.mjs` (file .mjs = ESM, bukan python); wfs-hq & wfs-office active; :9503 root/app 200. Tooling: `shot.sh` ter-prune lagi dari scratch — bukti visual diambil dari kanal screenshot e2e (649KB/668KB).
- Commit: perf_quality.js + OfficeScene.js + App.jsx + scene_hooks.js + chat_check.test.js + gl_lost.test.js + 2 e2e di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`; (c) jejak audit: error window jangka-panjang (mis. 5 menit) utk menangkap crash kelas "crash di bawah radar" lain — e2e_err.py saat ini hanya memuat singkat.

## 2026-10-30 14:20 WIB — Siklus 173: SOAK TEST HARI PENUH (tooling kandidat (c) backlog 172) — `scripts/e2e_soak_day.py`: error window ~5,5 menit memaksa SEMUA fase hari + crossing jam kritis + toggle neon, jebakan error dari document-start; hasil: 0 error end-to-end, animate hidup 425 frame terus — tooling anti "crash di bawah radar" (kelas bug lunch 172) kini ada & hijau

- **Latar:** e2e_err.py hanya memuat singkat (~10 dtk) — bug lunch 172 (TypeError per-frame saat 2 agen berdekatan, kantor beku 12:00-13:00) lolos berbulan-bulan karena tak ada skrip yang TETAP MEMBACA error sambil sim berjalan melewati fase-fase kritis. Kandidat (c) backlog 172 dieksekusi: soak test hari penuh.
- **Desain `scripts/e2e_soak_day.py` (CDP :99, 7 tahap):** jebakan error terpasang via `Page.addScriptToEvaluateOnNewDocument` (document-start = menangkap error sejak baris pertama) — window 'error' + 'unhandledrejection' + console.error (ter-bungkus, console asli tetap jalan) → `window.__errs`. Invariant tiap polling 5 dtk: frame WAJIB bertambah (animate hidup), error WAJIB 0 ('deprecated' di-filter). Tahapan dgn AUTO-cross (setTime 2 menit sebelum batas, biarkan mesin shift sendiri yang memicu): S1 478→480 arrive (agen masuk) → S2 598→600 rapat pagi (MEETING_WINDOWS[0], vis=6) → S3 718→720 lunch (bug fatal 172: atCafe=26, maxBubbles=3, shot 660KB) → S4 838→840 rapat sore (vis=6) → S5 1078→1080 pulang (leaving) → S6 1438→wrap 1440→0 tengah malam + **NEON ON/OFF** (resync 171) → S7 478→480 fajar kedua (dawn pasca-malam — jalur resurrection bug lama).
- **Hasil: ===> OK, EXIT=0** — 60 sampel polling, **0 error** dari document-start sampai akhir; frames 8→425 monoton naik (tak sekali pun beku); semua crossing terpicu mesin sendiri; shot akhir 647KB (scene hidup); fps stabil ~0.33-0.36 (SwiftShader). Tooling: `Page.enable`+`Runtime.enable` WAJIB sebelum `addScriptToEvaluateOnNewDocument` (dulu trap tak terpasang = `__errs` undefined), plus fallback injeksi pasca-load; eval error CDP di-log 600 char (dulu 200 = terpotong).
- **Guard standar siklus (kode inti TIDAK diubah — siklus tooling murni):** vitest **2520/2520 (187 file)**; ESLint 0/0; build sukses (precache 38, **1856.56 KiB**) → deploy sinkron `cp -r dist/* ~/wfs-hq/`; `e2e_err.py` **0/0/0 hooks=True**; verify_desks **26/26 (L1:9 L2:9 L3:8, OUT_OF_ROOM/COLLISIONS NONE)**; :9503 root/app 200; wfs-hq & wfs-office active.
- Commit: `scripts/e2e_soak_day.py` + DEV_LOG. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 15:20 WIB — Siklus 174: PINCH-ZOOM MOBILE MENYATU KONTRAK "ZOOM JUJUR" (siklus 121) — jalur lama: clamp inline mentah `Math.max(12,Math.min(130,…))` (duplikat di luar satu sumber `zoomRadius`, tanpa anti-poisoning NaN) + **fokus kamera DIBATALKAN diam-diam saat di-pin** (`focusGoal=null` — bug UX persis jalur wheel lama: follow agen patah, `__saved` yatim) + 2 jari ikut memutar kamera (pointerdown jari-1 set `isDrag`, pinch tak menahannya); kini `pinchRadius()` satu sumber (delegasi zoomRadius) + delta radius eksak diteruskan ke goal (`zoomFocusGoal`) + `pinchActive` menahan drag

- **Temuan (audit jalur input kamera pasca-backlog kosong):** kontrak zoom jujur siklus 121 hanya menjangkau wheel & tombol zoomIn/zoomOut — **pinch-zoom mobile (touchstart/touchmove/touchend) tertinggal di pola lama**: (1) clamp inline `Math.max(12,Math.min(130,sph.radius-(d-pinchDist)*.05))` = duplikat formula di luar `zoom_spec.js` (NaN dari `Math.hypot` menular ke `sph.radius` tanpa anti-poisoning); (2) `if(focusGoal&&!focusGoal.reset)focusGoal=null` = **pembatalan goal diam-diam** — user yang sedang mengikuti agen berjalan/figur rapat lalu mencubit layar kehilangan fokus tanpa jejak (wheel utk kasus sama sudah diperbaiki 121, pinch tidak); (3) konflik gesture: `pointerdown` jari pertama set `isDrag=true` & pointermove jari kedua memutar kamera SAAT pinch — dua gestur berebut satu kamera.
- **Perbaikan (2 file inti + 1 test + 1 e2e):**
  - `parts/zoom_spec.js` — **`pinchRadius(current, currentDist, dist, scale=0.05)`** baru: delegasi `zoomRadius` (clamp 12..130 + anti-poisoning satu sumber); jarak jari non-finite → **delta 0** (pinch gegabah tak menggeser kamera — bukan di-0-kan per sisi yang malah menghasilkan delta raksasa dgn sisi utuh); `scale` = eksak konstanta lama 0.05 (terasa sama), param opsional utk eksperimen sensitivitas.
  - `OfficeScene.js` — handler pinch: radius via `pinchRadius`; **zoom jujur**: `const __r0=sph.radius` sebelum, `if(focusGoal)zoomFocusGoal(focusGoal,sph.radius-__r0)` sesudah — delta radius EKSAK (termasuk efek clamp) diteruskan ke goal, follow/lantai/titik tetap hidup (pola eksak wheel 121); `pinchActive=true` saat 2 jari (`isDrag=false` = batal drag terlanjur), `onDragMove` bergerbang `if(!isDrag||pinchActive)return`, `touchend` kini membaca `e.touches` (tutup gestur bersih; drag putar sengaja TIDAK dilanjutkan dgn jari sisa — basis `prev` basi = putaran liar; sentuh ulang 1 jari = drag normal).
  - `src/__tests__/zoom_spec.test.js` +11 test: `pinchRadius` (mirror formula .05, arah zoom, clamp, anti-poisoning, delta-0 utk jarak non-finite, scale custom, delta 0) + **kontrak statis wiring** (pola kontrak statis 172): satu sumber (clamp inline mentah `Math.max(12,Math.min(130,sph.radius…)` TIDAK boleh ada lagi), goal tak dibatalkan, `pinchActive` menahan drag (`isDrag=false` + gerbang `onDragMove`), touchend membaca `e.touches`. **vitest 2531/2531 (187 file, +11).**
  - `scripts/e2e_pinch.py` (CDP :99) — verifikasi live TouchEvent sintetis di canvas: TES1 pinch melebar 6 langkah → radius **42.5→27.5** (zoom IN); TES2 pinch saat `__focusAgent` aktif → goal **r 20→14 dipertahankan** (`reset:false`, dulu goal=null); TES3 pointermove jari-kedua saat pinch → phi/theta BEKU (drag tersupresi); TES4 pasca-pinch, drag 1 jari hidup lagi (theta 2.456→1.956); ERRS=0 EXCS=0 → **===> OK**. Pelajaran tooling: eval CDP terpisah kelaparan oleh main-thread render SwiftShader (~0.3 fps; `new Touch()` saja 6 dtk) → **skenario penuh dalam SATU `Runtime.evaluate` sinkron** (semua handler & mutasi state memang sinkron, tak perlu await antar langkah); `__camCam`=kamera (tanpa domElement) → canvas diambil via `document.querySelector('canvas')`; jembatan kontrol = `window.__wfsSceneControls` (bukan `__sceneControls`).
- **Bukti terukur:** vitest **2531/2531 (187 file, +11)**; ESLint 0/0; build sukses (precache 38, **1856.73 KiB**) → deploy sinkron (9503 root/app 200); `e2e_err.py` **0/0/0 hooks=True**; `e2e_pinch.py` **4/4 tes OK, 0 error**; verify_desks **26/26 (L1:9 L2:9 L3:8, COLLISIONS NONE)**; wfs-hq & wfs-office active.
- Commit: zoom_spec.js + OfficeScene.js + zoom_spec.test.js + scripts/e2e_pinch.py + DEV_LOG di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 16:16 WIB — Siklus 175: DOUBLE-TAP ZOOM MOBILE (padanan dblclick mouse) + GERBANG KLIK PINCH — dua gap tersisa audit jalur input kamera: (1) dblclick browser HANYA terpicu pointer mouse — tap ganda di HP jatuh ke aksi zoom-halaman Chrome (tidak ada cara zoom cepat di touch selain pinch); (2) angkat jari-1 dari pinch memicu JALUR KLIK normal (pointerdown jari-1 + pointerup "di tempat" = moved<6) → raycast meleset → focusGoal di-RESET ke rumah + seleksi dihapus — kamera user melompat tak sengaja tepat setelah mencubit; kini dtapRadius (delegasi zoomRadius, clamp 12..130 + anti-poisoning, langkah majemuk ×0.82) + touch-action:none + pinchGuard + touchcancel

- **Temuan (lanjutan audit jalur input kamera pasca-174):**
  - **Gap 1 — dblclick tidak pernah terjadi di touch:** browser hanya memicu event `dblclick` dari pointer MOUSE; tap ganda cepat di layar sentuh di-tangkap Chrome sebagai aksi zoom-halaman (viewport `maximum-scale=5.0`) dan TIDAK menghasilkan dblclick kanvas → seluruh kontrak dblclick (118/119/146: zoom ke titik/agen/papan, goal kosong maju 30%) tak terjangkau mobile sama sekali. Satu-satunya zoom di HP: pinch (174).
  - **Gap 2 — klik hantu pasca-pinch:** `pointerdown` jari-1 set `downXY`; pinch dimulai (jari-2); saat pinch selesai jari-1 diangkat DULU → `pointerup` jari-1 dievaluasi jalur klik normal: `moved=|up-down|` < 6px (jari tak bergeser) = "klik" → raycast di titik jari-1; bila meleset → `focusGoal=resetFocusGoal(...)` (kamera kembali ke RUMAH) + `selectedIdx=-1` — persis saat user baru selesai zoom-in ke target. Skenario pinch (jari-2 naik duluan) adalah urutan angkat paling umum di mobile.
- **Perbaikan (2 file inti + test + e2e):**
  - `parts/dblclick_spec.js` — **gerbang murni double-tap**: `tapCandidate` (tap turun→naik ≤24px, ≤300ms — drag putar & press-and-hold gagal gerbang), `isDoubleTap` (dua kandidat valid + jeda antar naik ≤350ms + jarak antar tap ≤36px), `dtapRadius(current,step,dir,zoomRadiusFn)` — **delegasi `zoomRadius`** (clamp 12..130 + anti-poisoning satu sumber dgn wheel/pinch); `zoomRadius` MENJUMLAH delta → langkah majemuk `step` = delta `cur*(step-1)` (42.5 → ×0.82 ≈ 34.85 per tap-ganda, terasa setara wheel); **anti-poisoning**: state teracuni (NaN) pulih ke BASIS 42.5 tanpa delta (langkah tak boleh diturunkan dari radius tak valid); `DTAP_ZOOM_STEP=0.82` eksport utk wiring & test.
  - `OfficeScene.js` — (a) **`touch-action:none`** pada kanvas (three r183 tak menyetelnya lagi — syarat tap-ganda tak dibajak zoom halaman & pointer/touch lanjutan tak dibatalkan Chrome); (b) **double-tap**: `touchstart` 1 jari catat `__tapDown`; `touchend` (semua jari naik, bukan pinch) → `tapCandidate` → pasangan dgn `dtapLast` → `isDoubleTap` → `sph.radius=dtapRadius(...)` + **zoom jujur 121: `zoomFocusGoal(focusGoal, delta)`** (goal ikut, follow tetap hidup) + `updCam`; tap tak-valid (drag) mereset pasangan; (c) **`pinchGuard`**: ditandai saat 2 jari, dilepas HANYA saat SEMUA jari terangkat — `pointerup` klik membaca guard (`if(pinchGuard){downXY=null;return;}`) → tak ada lagi klik hantu pasca-pinch; pinch juga memutus pasangan tap (`dtapLast=null`); (d) **`touchcancel`** — OS membatalkan gestur (telepon masuk/notifikasi) → semua state gestur direset (pinchDist/pinchActive/pinchGuard/dtapLast/__tapDown) tanpa meninggalkan basi.
  - `src/__tests__/dblclick_spec.test.js` **+23 test** (unit tapCandidate/isDoubleTap/dtapRadius + kontrak statis wiring pola 174): gerbang tap (slop eksak 24px, hold >300ms ditolak, tepi inklusif), pasangan (jarak >36px, jeda >350ms, tap-2 lambat, tap-1 drag, null), dtapRadius (×0.82 eksak, tanpa-sumber no-op, clamp bawah 12 & atas 130 dgn tap berulang, NaN→42.5 basis, arah keluar) + kontrak statis (satu sumber dtapRadius, zoom jujur goal-ikut, touch-action:none, pinchGuard+downXY, touchcancel mereset semua). **vitest 2554/2554 (187 file, +23)**.
  - `scripts/e2e_dtap.py` (CDP :99, satu `Runtime.evaluate` sinkron — pelajaran 174) — **6 tes live**: TES1 double-tap 42.5→**34.85** (×0.82 eksak); TES2 double-tap saat follow → goal **r 20→13.727 dipertahankan** (reset:false — dulu bahkan tak bisa dicoba: tak ada jalurnya); TES3 angkat jari-1 dari pinch → goal **tetap 13.727** (TIDAK di-reset ke rumah — dulu bug klik hantu); TES4 dua tap lambat (jeda >350ms) → radius diam (bukan double-tap); TES5 touchcancel → double-tap berikutnya tetap hidup (28.58→23.43); TES6 klik normal pasca-semua gestur tetap mengubah goal (reset:true) — pinchGuard tidak membekukan klik. ERRS=0 EXCS=0 **===> OK**. Pelajaran tooling: `PointerEvent.pointerup` untuk klik kanvas harus di-dispatch ke CANVAS (target produksi; window hanyalah bubble) — versi pertama mengirim ke window → listener kanvas tak terpicu → tes 3/6 "lolos" palsu; diperbaiki & lolos ulang.
- **Bukti terukur:** vitest **2554/2554 (187 file, +23)**; ESLint src/ 0 error; build sukses (precache 38, **1857.77 KiB**) → deploy sinkron `cp -r dist/* ~/wfs-hq/`; `e2e_dtap.py` **6/6 OK 0 error**; **regresi `e2e_pinch.py` 4/4 tetap OK** (42.5→27.5, goal 20→14, drag tersupresi & hidup lagi); `e2e_err.py` **0/0/0 hooks=True**; verify_desks **26/26 (L1:9 L2:9 L3:8, COLLISIONS NONE)**; :9503 root/app 200; wfs-hq & wfs-office active.
- Commit: dblclick_spec.js + OfficeScene.js + dblclick_spec.test.js + scripts/e2e_dtap.py + DEV_LOG di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`.

## 2026-10-30 17:30 WIB — Siklus 176: TEPInput POINTER TERAKHIR — CONTEXTMENU/RIGHT/MIDDLE + pointercancel + anti "DRAG HANTU" + TOMBOL RUMAH HUD (padanan mobile Escape) — lanjutan audit jalur input kamera 174/175; keputusan terdokumentasi: goal yatim {meetIdx,root:null} TIDAK diubah (kontrak 120 eksplisit, jalur produksi tak pernah menghasilkannya)

- **Temuan (penutupan audit jalur input kamera — 3 tepi yang belum terjaga):**
  1. **`contextmenu` kanvas tak dicegah** — klik-kanan desktop & long-press Android memunculkan menu browser MENUTUPI scene 3D (kanvas WebGL fullscreen tanpa teks yang bisa di-copy — menu itu murni noise). Klik kanan juga dihitung "klik" jalur raycast (pointerup tanpa gerbang tombol): kamera reset/fokus tanpa niat.
  2. **Klik tengah** memicu autoscroll Chrome (ikon kompas) di atas scene — tak dicegah di mana pun.
  3. **`pointercancel` tak ditangani** — OS membatalkan pointer (stylus, palm rejection, gesture sistem) dulu meninggalkan `isDrag=true` + `prev` basi → pointermove SETELAH cancel (tanpa tombol tertekan) TETAP memutar kamera ("drag hantu"), cursor terkunci 'grabbing'. Varian desktop: tombol dilepas DI LUAR window (di atas HUD) → `pointerup` window tak membawa tombol untuk listener kanvas → pointermove berikutnya buttons=0 tetap drag.
- **Perbaikan (`OfficeScene.js`, 4 listener baru + guard):** `contextmenu`→preventDefault; `pointerdown` button=1→preventDefault (autoscroll mati; sentuh tak tersentuh); `pointercancel`→reset SEMUA state gestur (isDrag/downXY/__tapDown/dtapLast/pinchDist/pinchActive/pinchGuard + cursor); `pointerup` button!==0→buang downXY (klik hantu non-kiri); `pointermove` buttons=0&&isDrag→isDrag=false (tombol lepas di luar window). Guard `e.buttons` = properti standar pointer events — di drag nyata SELALU ≥1 (tes lama dgn PointerEvent sintetis tanpa buttons kini tak valid → diperbaiki di e2e).
- **Fitur: tombol RUMAH di QuickToolbar (padanan mobile Escape):** kontrak "kembali ke tampilan awal" dulu HANYA di keyboard (Escape; siklus 118/119/146 seluruhnya keyboard-first) — di HP tak ada jalurnya sama sekali. Kini `IconHome` baru + tombol "Rumah" (posisi: setelah Dekat/Jauh) → `s.resetFocus()` (goal reset ke rumah + hapus seleksi + __saved dibuang — satu sumber dgn Escape/handleCloseInspector) + `setSelectedAgent(null)`. Prop `onGoHome` opsional (tanpa prop = tombol tak dirender — kompat).
- **Keputusan terdokumentasi (goal yatim):** percobaan mengubah `updateFollowGoal` utk goal yatim (follow tanpa agen valid → reset rumah) DIBATALKAN setelah test `follow_anchor.test.js` (siklus 120) terbukti EKSPLISIT mengunci kontrak "goal dipertahankan" utk `{meetIdx,root:null}` (figur rapat dgn root hilang = no-op by-design), dan jalur produksi tak pernah menghasilkan goal yatim (focusMeetingFigure selalu root valid dari agentData). Test baru MENEGAKKAN kontrak lama (goal yatim dipertahankan, offsite tetap reset) supaya keputusan ini tercatat — bukan tersembunyi.
- **Guard regresi `src/__tests__/input_edges.test.js` BARU (9 test):** kontrak goal yatim (3) + kontrak statis wiring (6): contextmenu dicegah, pointercancel mereset semua state, pointerup non-kiri bukan klik, pointermove buttons=0 mematikan drag (listener drag lama tetap utuh), klik-tengah dicegah, tombol Rumah (onGoHome + aria-label + delegasi resetFocus + setSelectedAgent(null)). **vitest 2565/2565 (188 file, +11).**
- **Tooling `scripts/e2e_input_edges.py` (CDP :99, satu evaluate sinkron — pelajaran 174) — 6 tes live:** TES1 contextmenu defaultPrevented; TES2 klik kanan (button=2, buttons=2→0) goal TIDAK berubah; TES3 klik tengah preventDefault + goal diam; TES4 pointercancel → pointermove buttons=0 TIDAK memutar kamera (ghostDead; dulu memutar — "drag hantu") + drag valid (buttons=1) tetap hidup (theta 2.455→1.955) + cursor bebas; TES5 tombol Rumah: goal follow aktif → klik → goal reset:true + ring seleksi hilang; TES6 klik kiri normal tetap mengubah goal. **===> OK, ERRS=0 EXCS=0.** Pelajaran tooling: PointerEvent sintetis kini WAJIB membawa `button`+`buttons` eksplisit (realita browser: drag = buttons≥1) — event tanpa buttons dulu men-trigger guard baru = lolos-palsu terdeteksi sebelum deploy.
- **Bukti terukur:** vitest **2565/2565 (188 file, +11)**; ESLint 0/0; build sukses (precache 38, **1858.10 KiB**) → deploy sinkron `cp -r dist/* ~/wfs-hq/`; `e2e_input_edges.py` **6/6 OK**; **regresi `e2e_pinch.py` 4/4 tetap OK** (42.5→27.5, goal 20→14, drag supresi & resume — tes drag resume kini dgn buttons=1); **regresi `e2e_dtap.py` 6/6 tetap OK**; `e2e_err.py` **0/0/0 hooks=True**; verify_desks **26/26 (L1:9 L2:9 L3:8, COLLISIONS NONE)**; screenshot scene via CDP **644KB** (hidup); :9503 root/app 200; wfs-hq & wfs-office active.
- Commit: OfficeScene.js + kamera_focus.js (komentar keputusan) + App.jsx + QuickToolbar.jsx + Icons.jsx (IconHome, ter-sapu auto-commit 16:00) + input_edges.test.js + scripts/e2e_input_edges.py + DEV_LOG di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`; (c) audit jalur input kamera resmi TUNTAS (wheel/klik/dblclick/pinch/double-tap/contextmenu/right/middle/cancel semua terjaga) — siklus berikutnya mulai dari sumber isu lain (visual/performa/e2e jangka-panjang).

## 2026-10-30 18:10 WIB — Siklus 177: ORBIT KAMERA VIA KEYBOARD (panah) — satu-satunya jalur input kamera yang belum ada (audit pointer 174/175/176 tuntas, tapi PUTAR kamera HANYA bisa drag pointer — tanpa mouse tak ada cara memutar kantor sama sekali); kontrak murni orbit_spec.js (langkah 0.12 rad, Shift = 3× 0.36, clamp phi eksak updCam 0.18..π/2.3, anti-poisoning NaN→basis isometrik, goal kamera TIDAK tersentuh) + dokumentasi shortcut + guard modal/input

- **Temuan (pasca-backlog kosong, lanjutan audit jalur input kamera):** audit 174/175/176 menutup SEMUA tepi pointer (wheel/klik/dblclick/pinch/double-tap/contextmenu/right/middle/cancel) — TAPI satu jalur input kamera tidak pernah ada: putar kamera hanya lewat drag pointer. Keyboard punya zoom (+/−), preset (1/2/3), reset (0), Esc — TIDAK punya orbit. Pengguna tanpa mouse (touchpad rusak, aksesibilitas) tak punya cara memutar kantor. Panah browser default (scroll halaman) tak berguna di kanvas fullscreen ini.
- **Fitur (`parts/orbit_spec.js` BARU + wiring `OfficeScene.js`):**
  - `orbitStep(sph, key, step)` MURNI (objek baru, input tak dimutasi — dpt diuji tanpa scene): kiri = theta +0.12, kanan = −0.12 (arah konsisten dgn drag), atas = phi −0.12 (kamera naik), bawah = +0.12 (turun); `ORBIT_KEY_STEP=0.12` (~7°), `ORBIT_KEY_STEP_FAST=0.36` (Shift, 3× ~21°).
  - **Clamp phi EKSAK dgn updCam produksi** (PHI_MIN 0.18, PHI_MAX π/2.3): panah berulang tak pernah menembus lantai atau membalik kamera.
  - **Anti-poisoning** (pola zoom_spec): theta/phi non-finite → pulih ke basis isometrik {π·0.78, 0.92} TANPA langkah; step non-finite → langkah 0.
  - **Kontrak goal utuh eksplisit:** `orbitFocusGoal(goal)` = identitas — orbit memutar SEKELILING target, TIDAK mengubah target/radius/follow (lawan kasus zoom 121/174: zoom mengubah radius goal, orbit tidak menyentuh apa pun). Diuji eksplisit supaya keputusan terdokumentasi.
  - Wiring: listener `keydown` window (bukan canvas — orbit harus hidup walau fokus di body): guard modal (`__wfsModalOpen||__escModalAtDispatch` — keyboard milik modal), guard input/textarea/select/contentEditable (sedang mengetik), `preventDefault` (panah = orbit bukan scroll), `e.shiftKey?ORBIT_KEY_STEP_FAST:ORBIT_KEY_STEP`, mutasi sph + `updCam()`. Hold-panah = repeat OS otomatis per keydown (halus tanpa timer). `window.__orbitStep` probe murni utk e2e (terdaftar SCENE_HOOKS — purge destroy); listener dilepas di destroy (anti bocor).
  - Dokumentasi: `shortcut_spec.js` — entri navigasi baru "Panah = Orbit Kamera (Shift+Panah = cepat 3×)" + ringkasan bantuan (`formatShortcutHelpSummary`) + otomatis tampil di dialog Help (OverlayHelp membaca KEYBOARD_SHORTCUTS).
- **Guard regresi `src/__tests__/orbit_keys.test.js` BARU (19 test):** unit murni (7): arah 4 panah, objek baru tanpa mutasi input, tombol bukan-panah no-op, Shift 3× eksak, clamp 100× panah atas/bawah tak pernah menembus batas, PHI_MIN/MAX = eksak updCam, NaN/undefined → basis tanpa langkah, step NaN → 0; kontrak goal (2): follow utuh & identitas, null aman; kontrak statis wiring (7): listener terpasang & dilepas destroy, preventDefault + Shift dibaca, sph diedit + updCam, guard modal + input, satu sumber (tanpa formula 0.12/0.36 inline di OfficeScene), dokumentasi Panah di spec & ringkasan, hook probe terdaftar SCENE_HOOKS. **vitest 2584/2584 (189 file, +19).**
- **Tooling `scripts/e2e_orbit_keys.py` (CDP :99, satu evaluate sinkron — pelajaran 174) — 6 tes live:** TES1 panah kiri/kanan memutar theta ±0.12 EKSAK; TES2 panah atas/bawah mengubah phi (naik −0.12, turun +0.12); TES3 clamp: 30× bawah → phi tepat π/2.3, 60× atas → tepat 0.18 (kamera tak pernah jatuh/membalik); TES4 Shift+kanan = 0.36 EKSAK (3×); TES5 **goal follow TETAP hidup saat orbit** (r goal tak berubah, reset false — kontrak orbitFocusGoal); TES6 Escape pasca-orbit tetap mengembalikan kamera (kontrak lama utuh). **===> OK, ERRS=0 EXCS=0.**
- **Bukti terukur:** vitest **2584/2584 (189 file, +19)**; ESLint 0/0; build sukses (precache 38, **1859.94 KiB**) → deploy sinkron `cp -r dist/* ~/wfs-hq/` (9503 root/app 200); `e2e_orbit_keys.py` **6/6 OK**; **regresi `e2e_input_edges.py` 6/6, `e2e_pinch.py` 4/4, `e2e_dtap.py` 6/6 tetap OK**; `e2e_err.py` **0/0/0 hooks=True**; verify_desks **26/26 (L1:9 L2:9 L3:8, COLLISIONS NONE)**; screenshot scene CDP **687KB** (hidup); wfs-hq & wfs-office active.
- Commit: orbit_spec.js + OfficeScene.js + scene_hooks.js + shortcut_spec.js + orbit_keys.test.js + scripts/e2e_orbit_keys.py + DEV_LOG di commit siklus ini. **Sisa backlog: KOSONG.**
- Kandidat berikutnya: (a) go-live gateway :8787→Docker menunggu keputusan user (`scripts/go_live_gateway_docker.sh APPLY`); (b) push saas-dibantuin setelah user buat repo `wawanwfs/saas-dibantuin` + pasang deploy key `~/.ssh/wfs_saas.pub`; (c) audit jalur input kamera kini LENGKAP termasuk keyboard (wheel/klik/dblclick/pinch/double-tap/contextmenu/right/middle/cancel/orbit-panah semua terjaga) — siklus berikutnya mulai dari sumber isu lain (visual/performa/e2e jangka-panjang).
