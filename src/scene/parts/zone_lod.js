// zone_lod.js — LOD (Level of Detail) skala label zona berbasis jarak kamera.
//
// Masalah (temuan A/B kamera rendah, siklus 245 temuan B3): sprite label zona
// punya skala DUNIA tetap (3.4×0.64 ×1.25 label panjang — flooring.js). Sprite
// selalu menghadap kamera (billboard) dan ukuran pikselnya ∝ 1/jarak, sehingga
// saat kamera rendah/dekat (radius 9–14 utk inspeksi detail, mis. server room)
// billboard membengkak (SERVER ROOM ~348px lebar) dan MENUTUPI objek yang
// justru mau dilihat (rak server). Label agen sudah punya LOD (sizeLabels →
// labelScale: frac ∝ jarak, mode full/short); label zona tidak punya sama sekali.
//
// Solusi: faktor LOD linear terhadap jarak kamera→label, di-clamp:
//   dist ≥ ZLOD_FULL_DIST → 1   (kamera rumah radius 42.5: UKURAN PENUH, kontrak
//                                visual lama utuh — inilah kondisi 99% pemakaian)
//   dist < ZLOD_FULL_DIST → dist/ZLOD_FULL_DIST, dibatasi bawah ZLOD_MIN
//   (dekat maksimal menyusut ke 45% — label tetap terbaca, tidak hilang).
// Murni: hitung faktor + mutasi scale dari userData.baseScale (tanpa
// THREE/canvas) — unit-testable. Pemanggil: animate() OfficeScene di blok
// __zoneLabels (dithrottle shouldRelayoutLabels, 4 frame) — zents sudah
// menghitung dist per label; LOD diterapkan SEBELUM entri dibangun agar box
// kolisi anti-overlap (zw/zh) & fade pw memakai ukuran yang benar-benar
// digambar (paritas dengan oklusi 240 yang memakai posisi FINAL).

// Jarak kamera (unit dunia) mulai menyusut / batas penyusutan.
export const ZLOD_FULL_DIST = 30;
export const ZLOD_MIN = 0.45;

// Faktor LOD utk satu jarak. Non-finite → 1 (anti-poisoning: kamera/label
// korup tidak boleh mengecilkan label diam-diam; aman = ukuran penuh).
export function zoneLodFactor(dist, fullDist = ZLOD_FULL_DIST, min = ZLOD_MIN) {
  if (!Number.isFinite(dist)) return 1;
  if (dist >= fullDist) return 1;
  return Math.max(min, dist / fullDist);
}

// Terapkan LOD ke satu sprite label zona: scale = baseScale × faktor.
// baseScale HARUS ada di userData (dipasang createZones/flooring.js); bila
// absen → no-op aman (label dibuat versi lama tanpa baseScale tak boleh rusak).
// Bila faktor == 1 dan scale sudah == baseScale → lewati (hemat mutasi).
// Return faktor yang diterapkan (untuk probe/pengukuran).
export function applyZoneLod(zt, dist, fullDist = ZLOD_FULL_DIST, min = ZLOD_MIN) {
  if (!zt || !zt.scale) return 1;
  const bs = zt.userData && zt.userData.baseScale;
  if (!bs) return 1;
  const f = zoneLodFactor(dist, fullDist, min);
  const tx = bs.x * f, ty = bs.y * f;
  if (zt.scale.x !== tx || zt.scale.y !== ty) zt.scale.set(tx, ty, 1);
  return f;
}
