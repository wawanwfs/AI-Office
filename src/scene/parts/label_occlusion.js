// label_occlusion.js — fade OKLUSI antar-sprite nameplate agen (backlog visual 238c).
//
// Masalah: label agen dirender X-ray (SpriteMaterial depthTest:false, renderOrder 35)
// agar tak tertutup perabotan — konsekuensinya di kluster tengah (kolom x=0/±4,
// baris z −3/1.5/6 yang bertumpuk di layar dari kamera iso), nameplate baris BELAKANG
// tergambar PENUH di atas nameplate baris DEPAN: teks-atas-teks tampak "bertumpuk
// kertas". Anti-overlap 2D (label_overlap.js) hanya MEMISAHKAN posisi di layar —
// ia tak punya informasi kedalaman dan justru membuat tumpukan makin lebar.
//
// Solusi: fade berbasis KEDALAMAN kamera. Label yang box-nya menumpuk di layar
// dengan label LEBIH DEKAT (jarak kamera lebih kecil ≥ OCCL_START unit dunia)
// dipudarkan proporsional selisih kedalaman sampai OCCL_MIN_OPACITY pada
// OCCL_END — tak pernah 0 (nama masih terbaca samar & bisa diklik/hover).
// Label terdekat selalu opacity 1. Posisi pembanding = posisi FINAL layar
// (x+offX, y+offY) hasil anti-overlap + sweep/clamp, jadi fade akurat thd
// apa yang benar-benar digambar.
//
// Murni: mutasi field `occ` pts saja (tanpa THREE/canvas/material) — unit-testable.

// Selisih kedalaman (unit dunia) mulai memudar / pudar penuh.
export const OCCL_START = 2.5;
export const OCCL_END = 6.0;
// Opasitas minimum label tertutup: samar tapi masih terbaca (tak hilang total).
export const OCCL_MIN_OPACITY = 0.18;
// Breathing room piksel: dua box dianggap menumpuk bila celah antar-tepi < px ini.
// Label punya padding sendiri di kanvas (rounded, ~2-4px) — 26px memberi toleransi
// agar label yang nyaris bersentuhan tidak saling memudarkan.
export const OCCL_PX = 26;

// Fade target utk satu pasangan (dist = jarak label ini, nearerDist = jarak label
// penutup yang lebih dekat). 1 bila tak menutupi cukup dalam; linear 1→MIN antara
// START..END. Non-finite → 1 (anti-poisoning, sama pola dgn zoneScreenFade).
export function occlusionFade(dist, nearerDist, start = OCCL_START, end = OCCL_END, minOpacity = OCCL_MIN_OPACITY) {
  if (!Number.isFinite(dist) || !Number.isFinite(nearerDist)) return 1;
  const d = dist - nearerDist;
  if (d <= start) return 1;
  if (d >= end) return minOpacity;
  const t = (d - start) / (end - start);
  return 1 - t * (1 - minOpacity);
}

// Satu pass oklusi: utk tiap pasangan label agent (pts dgn `a` non-null & tanpa
// `zone`), bila box layar FINAL-nya menumpuk dan salah satunya LEBIH DEKAT ke
// kamera, label lebih jauh diberi occ = min(occ, occlusionFade(...)).
// pt tanpa `dist` (undefined/NaN) dilewati — fade 1 (perilaku lama).
// Return jumlah label yang di-fade (occ < 1) — utk pengukuran/probe.
// TIDAK mengubah x/y/offX/offY/sw/sh — hanya menulis field baru `occ`.
export function occlusionPass(pts, opts = {}) {
  const start = opts.start ?? OCCL_START;
  const end = opts.end ?? OCCL_END;
  const minO = opts.minOpacity ?? OCCL_MIN_OPACITY;
  const px = opts.padPx ?? OCCL_PX;
  if (!Array.isArray(pts)) return 0;
  const ag = pts.filter(p => p && p.a && !p.zone);
  ag.forEach(p => { p.occ = 1; });
  for (let i = 0; i < ag.length; i++) {
    const pi = ag[i];
    const di = Number.isFinite(pi.dist) ? pi.dist : null;
    if (di === null) continue;
    for (let j = 0; j < ag.length; j++) {
      if (j === i) continue;
      const pj = ag[j];
      const dj = Number.isFinite(pj.dist) ? pj.dist : null;
      if (dj === null || dj >= di) continue; // penutup wajib LEBIH dekat ke kamera
      // overlap layar dgn posisi FINAL (offX/offY hasil anti-overlap/sweep)
      const dx = Math.abs((pi.x + (pi.offX || 0)) - (pj.x + (pj.offX || 0)));
      const dy = Math.abs((pi.y + (pi.offY || 0)) - (pj.y + (pj.offY || 0)));
      const ox = ((pi.sw || 0) + (pj.sw || 0)) / 2;
      const oy = ((pi.sh || 0) + (pj.sh || 0)) / 2;
      if (dx >= ox + px || dy >= oy + px) continue;
      const f = occlusionFade(di, dj, start, end, minO);
      if (f < pi.occ) pi.occ = f; // penutup TERDEKAT menang (min antar pasangan)
    }
  }
  let n = 0;
  ag.forEach(p => { if (p.occ < 1) n++; });
  return n;
}
