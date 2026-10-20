// label_spec.js — parameter & logika murni nameplate mengambang (label sprite agen).
// Diekstrak dari OfficeScene.js (makeLabel/sizeLabels) agar regresi tampilan label
// (ukuran kanvas, auto-shrink font, ellipsis, title-case nama) terdeteksi unit test.
// Tidak ada THREE / DOM di sini — ctx 2D di-inject oleh pemanggil.
import { ACRONYMS } from './nameplate_spec.js';

export const LABEL_Y = 2.45; // tepat di atas kepala (tinggi duduk ≈1.95)

// Ukuran kanvas label: lengkap (nama+role) vs ringkas (nama saja)
export const LABEL_FULL = { W: 360, H: 84, RADIUS: 18, NAME_FONT: '800 36px "Segoe UI",Arial,sans-serif', NAME_Y: 32, ROLE_FONT: '600 22px "Segoe UI",Arial,sans-serif', ROLE_Y: 62, NAME_MAX: 300, ROLE_MAX: 300 };
export const LABEL_SHORT = { W: 210, H: 50, RADIUS: 14, NAME_FONT: '800 28px "Segoe UI",Arial,sans-serif', NAME_Y: 26, NAME_MAX: 160 };

// "wahyu fs" → "Wahyu Fs"; "bantuin ai" → "Bantuin AI" (akronim diuppecase-kan);
// aman utk null/undefined. Memakai ACRONYMS dari nameplate_spec.
export function labelName(name) {
  return String(name ?? '').toLowerCase().replace(/(^|\s)(\w+)/g, (m, sp, w) =>
    sp + (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
}

// Auto-shrink font (min ~60% dari base) sebelum memotong dengan ellipsis.
// Mengembalikan string yang muat, ATAU objek {fit, fnt} bila versi font kecil muat.
export function fitLabel(ctx, text, max, font, basePx) {
  const t = String(text ?? '');
  ctx.font = font;
  if (ctx.measureText(t).width <= max) return t;
  const m = font.match(/^(?:\d+\s+)?(\d+)px(.*)$/);
  const base = m ? +m[1] : basePx;
  const rest = m ? ' ' + m[2] : '';
  for (let f = Math.floor(base * 0.9); f >= Math.floor(base * 0.6); f -= Math.floor(base * 0.06 || 1)) {
    const fnt = f + rest;
    ctx.font = fnt;
    if (ctx.measureText(t).width <= max) { ctx.font = font; return { fit: t, fnt }; }
  }
  ctx.font = font;
  let e = t;
  while (e.length > 1 && ctx.measureText(e + '…').width > max) e = e.slice(0, -1);
  return e + '…';
}

// scale sprite label agar tingginya konsisten di layar (sizeAttenuation=false)
export function labelScale(viewportW, viewportH, fovDeg, camDist, wantFull) {
  const w = viewportW || 800, h = viewportH || 600;
  const near = camDist;
  const _full = wantFull !== undefined ? wantFull : ((w >= 700 && near < 30) || near < 17);
  const t2 = 2 * Math.tan((fovDeg || 50) * Math.PI / 360);
  const hPx = (w < 600 ? 14 : 19);
  const hFrac = hPx * Math.min(1.35, h / 900 * 1.2) / h;
  return { frac: hFrac * t2, wantFull: _full };
}
