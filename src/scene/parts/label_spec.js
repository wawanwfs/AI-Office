// label_spec.js — parameter & logika murni nameplate mengambang (label sprite agen).
// Diekstrak dari OfficeScene.js (makeLabel/sizeLabels) agar regresi tampilan label
// (ukuran kanvas, auto-shrink font, ellipsis, title-case nama) terdeteksi unit test.
// Tidak ada THREE / DOM di sini — ctx 2D di-inject oleh pemanggil.
import { ACRONYMS } from './nameplate_spec.js';

export const LABEL_Y = 2.45; // tepat di atas kepala (tinggi duduk ≈1.95)

// Ukuran kanvas label: lengkap (nama+role) vs ringkas (nama saja)
export const LABEL_FULL = { W: 360, H: 84, RADIUS: 18, NAME_FONT: '800 36px "Segoe UI",Arial,sans-serif', NAME_Y: 32, ROLE_FONT: '600 22px "Segoe UI",Arial,sans-serif', ROLE_Y: 62, NAME_MAX: 300, ROLE_MAX: 300 };
export const LABEL_SHORT = { W: 210, H: 50, RADIUS: 14, NAME_FONT: '800 28px "Segoe UI",Arial,sans-serif', NAME_Y: 26, NAME_MAX: 160 };

// "wahyu fs" → "Wahyu FS"; "bantuin ai" → "Bantuin AI" (akronim diuppecase-kan);
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

// Render label ke ctx 2D (murni — ctx di-inject, tanpa THREE/DOM): latar rounded,
// strip warna agen di kiri, nama (auto-shrink + ellipsis) dan role utk mode lengkap.
// Semantik persis makeLabel lama di OfficeScene.
export function drawLabelText(ctx, agent, spec, full) {
  const W = spec.W, H = spec.H;
  ctx.fillStyle = 'rgba(10,14,24,0.84)';
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(2, 2, W - 4, H - 4, spec.RADIUS); else ctx.rect(2, 2, W - 4, H - 4); ctx.fill();
  ctx.fillStyle = agent.hex; ctx.fillRect(2, full ? 14 : 10, 6, H - (full ? 28 : 20));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = (s, max, font) => fitLabel(ctx, s, max, font, full ? 36 : 28);
  const drawFit = (val, max, font, weightPx, y) => { const r = title(val, max, font);
    if (r && typeof r === 'object' && r.fit) { ctx.font = r.fnt; ctx.fillText(r.fit, W / 2 + 4, y); ctx.font = font; }
    else ctx.fillText(typeof r === 'string' ? r : String(val), W / 2 + 4, y); };
  const nmFull = labelName(agent.name);
  ctx.font = spec.NAME_FONT;
  ctx.fillStyle = '#fff';
  drawFit(nmFull, spec.NAME_MAX, spec.NAME_FONT, full ? 36 : 28, spec.NAME_Y);
  if (full) { ctx.fillStyle = '#b8c4d4'; drawFit(agent.role, spec.ROLE_MAX, spec.ROLE_FONT, 22, spec.ROLE_Y); }
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
