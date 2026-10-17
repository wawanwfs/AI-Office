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
