// Kanvas tanda dekoratif (diekstrak dari OfficeScene, murni — tanpa THREE/DOM):
//  - drawMenuBoard(ctx)      : papan menu WFS CAFÉ (256×140)
//  - drawPoster(ctx, txt, col): poster motivasi (256×340), txt boleh multi-baris '\n'
//  - drawWelcomeSign(ctx)    : papan sambutan dinding kiri (1024×320)
// Urutan & parameter perintah gambar identik kode inline lama di OfficeScene.

export function drawMenuBoard(c, highlightIdx = -1) {
  // Siklus 518: baris menu ter-highlight (indeks 0…2, default -1 = tak ada)
  // digambar lebih terang — berganti tiap MENU_HIGHLIGHT_SEC via menuHighlight().
  const hi = Number.isInteger(highlightIdx) && highlightIdx >= 0 && highlightIdx < 3 ? highlightIdx : -1;
  c.fillStyle = '#1A1A2E'; c.fillRect(0, 0, 256, 140);
  c.strokeStyle = '#F59E0B'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 134);
  c.font = 'bold 26px sans-serif'; c.fillStyle = '#F59E0B'; c.fillText('WFS CAFÉ', 34, 40);
  c.font = '15px monospace';
  const rows = [
    ['Kopi susu      15k', 75],
    ['Americano     18k', 100],
    ['Matcha latte  22k', 125],
  ];
  rows.forEach(([txt, y], i) => {
    c.fillStyle = i === hi ? '#FFE082' : '#EEE'; // highlight kuning hangat vs putih
    c.fillText(txt, 26, y);
  });
}

export function drawPoster(p, txt, col) {
  p.fillStyle = '#0f1a2e'; p.fillRect(0, 0, 256, 340); p.strokeStyle = col; p.lineWidth = 8; p.strokeRect(10, 10, 236, 320);
  p.fillStyle = col; p.font = 'bold 48px sans-serif'; p.textAlign = 'center';
  txt.split('\n').forEach((l, i) => p.fillText(l, 128, 150 + i * 56));
}

// Siklus 519: subjudul berganti bergaya tagline — daftar frasa sambutan
// berputar tiap WELCOME_TAGLINE_SEC dtk (deterministik dari elapsed; judul
// WFS PROJECT tetap). Guard non-finite → frasa pertama.
export const WELCOME_TAGLINE_SEC = 4.4;
const WELCOME_TAGLINES = [
  'Selamat Datang \u00b7 Welcome',
  'Innovation \u00b7 Kolaborasi \u00b7 Karya',
  'AI Office \u00b7 26 Agents On Duty',
];

export function welcomeTaglineIdx(elapsed) {
  if (!Number.isFinite(elapsed)) return 0;
  const n = WELCOME_TAGLINES.length;
  const idx = Math.floor(elapsed / WELCOME_TAGLINE_SEC) % n;
  return ((idx % n) + n) % n; // aman utk elapsed negatif
}

export function drawWelcomeSign(n, taglineIdx = 0) {
  const safeIdx = Number.isInteger(taglineIdx) && taglineIdx >= 0 && taglineIdx < WELCOME_TAGLINES.length
    ? taglineIdx : 0;
  n.fillStyle = '#0F1B2E'; n.fillRect(0, 0, 1024, 320);
  n.strokeStyle = '#D4AF37'; n.lineWidth = 10; n.strokeRect(10, 10, 1004, 300);
  n.fillStyle = '#FBBF24'; n.font = '900 130px "Segoe UI",Arial,sans-serif'; n.textAlign = 'center'; n.fillText('WFS PROJECT', 512, 150);
  n.fillStyle = '#FFFFFF'; n.font = '600 60px "Segoe UI",Arial,sans-serif'; n.fillText(WELCOME_TAGLINES[safeIdx], 512, 250);
}

export function welcomeTaglines() { return WELCOME_TAGLINES.slice(); }
