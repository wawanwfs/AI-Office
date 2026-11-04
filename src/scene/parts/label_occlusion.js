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

// ── Siklus 250: aturan TIE (kedalaman nyaris sama) ──────────────────────────
// Kurva berbasis selisih kedalaman di atas HANYA menyala bila penutup lebih dekat
// ≥ 2.5 unit. Di kluster meja, dua label bertetangga sering berjarak kamera
// hampir SAMA (Δdist 0.05–1.9) padahal box-nya menumpuk sampai 40–66% — di situ
// tak ada label yang "menutupi" scr geometris (sama-sama X-ray, renderOrder 35),
// jadi tanpa aturan ini teks-atas-teks tetap 100% pekat. Anti-overlap 2D juga
// tak bisa menyelesaikannya: label bertetangga hanya 2.0–2.64 unit dunia
// (sw 73.4px di kamera rumah) sementara offset dibatasi ±16px horizontal /
// ±23px vertikal agar label tetap menempel karakternya (offset lebih besar =
// label lepas dari agen, lebih buruk dari tumpukan).
// Aturan: bila tumpukan NYATA (tanpa breathing room) ≥ OCCL_TIE_FRAC dari luas
// label TERKECIL dan Δdist < START, label yang LEBIH JAUH (tie → nama
// lexicographic, deterministik) dipudarkan ke OCCL_TIE_MIN_OPACITY. Satu
// pemenang per pasangan — tak ada saling pudar. Ambang 0.15 dipilih dari
// angka produksi (probe iso 250): pasangan bermasalah mulai 0.14–0.17 area
// (strip 40×5px = 2-4 huruf bertabrakan), noise < 0.1 (sentuhan sudut).
export const OCCL_TIE_FRAC = 0.15;   // fraksi luas tumpukan / luas label terkecil
export const OCCL_TIE_MIN_OPACITY = 0.55; // cukup pudar utk memisahkan mata, teks tetap terbaca

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
// `zone`), bila box layar FINAL-nya menumpuk:
//   1. salah satunya LEBIH DEKAT ke kamera ≥ OCCL_START → label lebih jauh
//      diberi occ = min(occ, occlusionFade(...)) — kurva kedalaman 240;
//   2. SIKLUS 250 — TIE: Δdist < START tapi tumpukan ≥ OCCL_TIE_FRAC dari
//      label terkecil → label lebih jauh (tie: nama lexicographic) dipudarkan
//      ke OCCL_TIE_MIN_OPACITY. Menutup kasus tetangga meja yang tak tersentuh
//      kurva kedalaman (Δdist 0.05–1.9, tumpukan 40–66%, semua opacity 1).
// pt tanpa `dist` (undefined/NaN) dilewati — fade 1 (perilaku lama).
// Return jumlah label yang di-fade (occ < 1) — utk pengukuran/probe.
// TIDAK mengubah x/y/offX/offY/sw/sh — hanya menulis field baru `occ`.
export function occlusionPass(pts, opts = {}) {
  const start = opts.start ?? OCCL_START;
  const end = opts.end ?? OCCL_END;
  const minO = opts.minOpacity ?? OCCL_MIN_OPACITY;
  const px = opts.padPx ?? OCCL_PX;
  const tieFrac = opts.tieFrac ?? OCCL_TIE_FRAC;
  const tieMin = opts.tieMinOpacity ?? OCCL_TIE_MIN_OPACITY;
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
      if (dj === null) continue;
      // overlap layar dgn posisi FINAL (offX/offY hasil anti-overlap/sweep)
      const dx = Math.abs((pi.x + (pi.offX || 0)) - (pj.x + (pj.offX || 0)));
      const dy = Math.abs((pi.y + (pi.offY || 0)) - (pj.y + (pj.offY || 0)));
      const ox = ((pi.sw || 0) + (pj.sw || 0)) / 2;
      const oy = ((pi.sh || 0) + (pj.sh || 0)) / 2;
      if (dx >= ox + px || dy >= oy + px) continue;
      if (dj < di) {
        // kurva kedalaman 240: penutup LEBIH dekat
        const f = occlusionFade(di, dj, start, end, minO);
        if (f < pi.occ) pi.occ = f; // penutup TERDEKAT menang (min antar pasangan)
      } else if (dj < di + start && tieFrac > 0) {
        // aturan TIE 250: nyaris sama kedalaman — SATU label yang pudar: yang
        // LEBIH JAUH; dist persis sama → nama lexicographic (deterministik
        // antar frame & urutan pts). Area = tumpukan NYATA (tanpa breathing
        // room) dibanding fraksi luas label TERKECIL.
        const target = (dj > di) ? pj : (pi.a.name > pj.a.name ? pi : pj);
        const ix = Math.max(0, ox - dx), iy = Math.max(0, oy - dy);
        const areaMin = Math.min((pi.sw || 0) * (pi.sh || 0), (pj.sw || 0) * (pj.sh || 0));
        if (areaMin > 0 && ix * iy >= areaMin * tieFrac) target.occ = Math.min(target.occ, tieMin);
      }
    }
  }
  let n = 0;
  ag.forEach(p => { if (p.occ < 1) n++; });
  return n;
}
