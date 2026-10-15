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
