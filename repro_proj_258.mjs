// repro_proj_258.mjs — beda SUMBU proyeksi: pts.y dihitung dari v.y*pxH (y-up),
// sedangkan probe membaca y layar = 384 − pts_y. Cocokkan dgn konvensi OfficeScene
// (y = v.y * pxH, y positif = ATAS) lalu hitung ulang overlap RIAN×MEETING.
// Data mentah probe (y layar, origin kiri-atas): RIAN y=505.3, MEETING y=504.5.
// Dalam koordinat pts: pts_y = 384 − y_layar → RIAN −121.3, MEETING −120.5 (dy 0.8 — sama).
// Karena keduanya pakai skala sama, TANDA hanya membalik; |dy| identik. → geometri sama.
// Jadi jika pass tetap occ=1 di produksi, bedanya bukan sumbu — cek dgn drawnX/drawnY!
// PASS MEMBACA drawnX/drawnY (bukan x). Dalam produksi zona: drawnX = p.x + offX + antiX? TIDAK:
// OfficeScene mencegah drawnX zona = p.x (proyeksi POSISI sprite). Tapi p.x pts zona
// dibangun dari zt.position.y PROYEKSI — yang DIKELOLA guard viewport (posisi bergerak).
// KUNCI: probe membaca zt.position SETELAH guard viewport menggeser posisi 3D; pts.x/y
// dibangun dari proyeksi posisi YANG SAMA per tick → keduanya konsisten...
// KECUALI: antiX/antiY zona di-akumulasi ke baseX/baseY pt (buildZonePts), bukan ke x/y.
// x = proyeksi posisi sprite, y = proyeksi posisi sprite — antiY/antiX TIDAK masuk x/y.
// Jadi drawnX=drawnY=p.x/p.y = proyeksi sprite = persis apa dibaca probe.
// → Geometri pass == geometri probe. Bedanya harus di URUTAN WAKTU: dist zona!
// Pass agen×zona tidak pakai dist. Hmm. TAPI: pass BUBBLE×ZONE & pass AGENT×ZONE
// keduanya harus fade. Repro Node: meeting.occ=0.5. Di produksi occO tetap 1.
// → Mungkinkan relayout tick melihat pts LAIN: buildAgentPts menaruh pts.y = v.y*pxH
//   sedangkan probe membaca y layar = 384 − pts_y. Sama dgn di atas.
// Satu variabel tersisa: occlusionPass di produksi menerima pts urutan berbeda /
// drawnX zone = p.x SAJA — dgn p.x = v.x*pxW di mana v = project(zt.position).
// KITA UJI DENGAN KOORDINAT PROBE PERSIS (centered) di atas: hasil fade.
// Kesimpulan sementara: fungsi murni benar; perlu cek nilai p.x/p.y riil di produksi.
import { occlusionPass } from './src/scene/parts/label_occlusion.js';
// Hipotesis terakhir: di produksi, `pts` utk zona memiliki drawnX/drawnY yang DISET
// OLEH BLOK pts.forEach SEBELUM occlusionPass — untuk zona: drawnX=p.x (bagus).
// Tapi blok tsb mengecek `if(p.zone){...return}` — bubble (zone:true) JUGA kena:
// p.drawnX=p.x — aman. Maka nilai x/y pts HARUS beda dari probe... atau pass TIDAK
// PERNAH dipanggil utk frame-frame ini (shouldRelayoutLabels false)? occlFade=13 ≠ 0
// membuktikan pass jalan. Cek: apakah 13 label faded termasuk zona?
console.log('— repro selesai; lihat catatan di header —');
