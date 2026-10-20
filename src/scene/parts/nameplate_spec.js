// Nameplate meja: kanvas 256×64, garis aksen warna agen, nama + role — diekstrak dari buildDesk().
// Semua fungsi murni (ctx 2D di-inject, tanpa THREE) agar bisa di-unit-test.

export const NAMEPLATE = {
  W: 256, H: 64,
  RADIUS: 12,
  BG: 'rgba(8,12,22,0.88)',
  BAR: { x: 2, y: 10, w: 7, h: 44 },
  TEXT_X: 132, NAME_Y: 24, ROLE_Y: 45,
  F1: '800 22px "Segoe UI",Arial,sans-serif',
  F2: '500 14px "Segoe UI",Arial,sans-serif',
  MAX_TEXT_W: 220,
  NAME_COLOR: '#fff',
  ROLE_COLOR: '#a8b4c6',
};

export const PLATE = {
  w: 0.62, h: 0.155,
  y: 0.68, z: 0.42,
  standY: 0.66, standZ: 0.44,
};

// "bantuin ai" -> "Bantuin AI" (word-initial capitalization; kata khas akronim
// dalam daftar ACRONYMS di-uppecase-kan semua: "ai"→"AI", "hr"→"HR", "qa"→"QA").
export const ACRONYMS = new Set(['ai', 'hr', 'qa', 'ui', 'ux', 'ml', 'api', 'sql']);
export function titleCase(s) {
  return String(s).toLowerCase().replace(/(^|\s)(\w+)|(\w+)$/g, (m, sp, w) => {
    if (w === undefined) return m;
    return sp + (ACRONYMS.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1));
  });
}

// Ellipsis dari kanan sampai muat dalam max piksel dengan font yang ditentukan
export function clampText(ctx, text, max, font) {
  text = String(text ?? '');
  ctx.font = font;
  if (ctx.measureText(text).width <= max) return text;
  let e = text;
  while (e.length > 1 && ctx.measureText(e + '…').width > max) e = e.slice(0, -1);
  return e + '…';
}

export function drawNameplate(ctx, name, role, hex) {
  const N = NAMEPLATE;
  ctx.canvas.width = N.W; ctx.canvas.height = N.H;
  // Panel latar rounded-rect
  ctx.fillStyle = N.BG;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(2, 2, N.W - 4, N.H - 4, N.RADIUS);
  else ctx.rect(2, 2, N.W - 4, N.H - 4);
  ctx.fill();
  // Garis aksen warna agen di kiri
  ctx.fillStyle = hex;
  ctx.fillRect(N.BAR.x, N.BAR.y, N.BAR.w, N.BAR.h);
  // Nama (title-case, bold) + role
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = N.F1; ctx.fillStyle = N.NAME_COLOR;
  ctx.fillText(clampText(ctx, titleCase(name), N.MAX_TEXT_W, N.F1), N.TEXT_X, N.NAME_Y);
  ctx.font = N.F2; ctx.fillStyle = N.ROLE_COLOR;
  ctx.fillText(clampText(ctx, role, N.MAX_TEXT_W, N.F2), N.TEXT_X, N.ROLE_Y);
}
