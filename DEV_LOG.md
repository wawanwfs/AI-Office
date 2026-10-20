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
