// Kanvas label zona (512×96) — diekstrak murni dari createZones (flooring.js)
// agar bisa di-unit-test: ctx 2D di-inject (mock recorder), tanpa THREE/DOM.
// Urutan & parameter perintah gambar identik kode inline lama.

import { AMBER_ACCENT } from '../../lib/ui_palette.js';

export const ZL_BG = 'rgba(5,10,22,0.75)';
export const ZL_BORDER = AMBER_ACCENT;
export const ZL_W = 512, ZL_H = 96;

// drawZoneLabel(ctx, label): teks label putih center/middle di (256,50).
// (Latar roundRect & fitZoneLabel tetap di flooring.js — butuh measureText.)
export function drawZoneLabel(zx, label) {
  zx.textAlign = 'center'; zx.textBaseline = 'middle';
  zx.fillStyle = '#FFFFFF'; zx.fillText(label, 256, 50);
}

// ── Siklus 527: label zona menampilkan jumlah agen LIVE di area itu ──────
// Dulu label hanya nama zona statis — padahal agen berpindah-pindah (rapat,
// lunch, jalan kampus). Kanvas label (512×96) kini bisa digambar ulang dgn
// baris kedua: badge "N di zona". Painter murni (ctx di-inject):
//   drawZoneLive(ctx, label, count)
//   - count valid → label putih center di (256,34) + badge amber di (256,72);
//   - count null/undefined/NaN → label penuh (256,50) persis render lama
//     (fallback tanpa baris kosong).
export const ZL_LIVE_Y = 72;      // garis dasar badge (baseline middle)
export const ZL_LIVE_FONT = '600 22px monospace';
export const ZL_LIVE_COLOR = AMBER_ACCENT;

export function drawZoneLive(zx, label, count) {
  if (!zx) return;
  if (count === null || count === undefined || !Number.isFinite(+count)) {
    drawZoneLabel(zx, label); // fallback: tampilan lama utuh
    return;
  }
  zx.textAlign = 'center'; zx.textBaseline = 'middle';
  zx.fillStyle = '#FFFFFF'; zx.fillText(label, 256, 34);
  zx.fillStyle = ZL_LIVE_COLOR; zx.font = ZL_LIVE_FONT;
  zx.fillText(Math.floor(+count) + ' di zona', 256, ZL_LIVE_Y);
}

// Hitung agen live dalam AABB zona z {x,z,w,d}. Posisi agen: walker.visible →
// walker.position, sittingChar.visible → sittingChar.position, selain itu home.
// Offsite tidak dihitung (tidak di kantor). Entri/koordinat korup → dilewati.
export function zoneAgentCount(z, agentData) {
  if (!z || typeof z !== 'object') return 0;
  if (!Number.isFinite(z.x) || !Number.isFinite(z.z) ||
      !Number.isFinite(z.w) || !Number.isFinite(z.d)) return 0;
  if (!Array.isArray(agentData)) return 0;
  let n = 0;
  for (const a of agentData) {
    if (!a || typeof a !== 'object' || a.state === 'offsite') continue;
    const p = (a.walker && a.walker.visible && a.walker.position) ||
              (a.sittingChar && a.sittingChar.visible && a.sittingChar.position) ||
              a.home;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    if (Math.abs(p.x - z.x) <= z.w / 2 && Math.abs(p.z - z.z) <= z.d / 2) n++;
  }
  return n;
}
