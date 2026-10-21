// Kanvas tanda dekoratif (diekstrak dari OfficeScene, murni — tanpa THREE/DOM):
//  - drawMenuBoard(ctx)      : papan menu WFS CAFÉ (256×140)
//  - drawPoster(ctx, txt, col): poster motivasi (256×340), txt boleh multi-baris '\n'
//  - drawWelcomeSign(ctx)    : papan sambutan dinding kiri (1024×320)
// Urutan & parameter perintah gambar identik kode inline lama di OfficeScene.

export function drawMenuBoard(c) {
  c.fillStyle = '#1A1A2E'; c.fillRect(0, 0, 256, 140);
  c.strokeStyle = '#F59E0B'; c.lineWidth = 6; c.strokeRect(3, 3, 250, 134);
  c.font = 'bold 26px sans-serif'; c.fillStyle = '#F59E0B'; c.fillText('WFS CAFÉ', 34, 40);
  c.font = '15px monospace'; c.fillStyle = '#EEE';
  c.fillText('Kopi susu      15k', 26, 75);
  c.fillText('Americano     18k', 26, 100);
  c.fillText('Matcha latte  22k', 26, 125);
}

export function drawPoster(p, txt, col) {
  p.fillStyle = '#0f1a2e'; p.fillRect(0, 0, 256, 340); p.strokeStyle = col; p.lineWidth = 8; p.strokeRect(10, 10, 236, 320);
  p.fillStyle = col; p.font = 'bold 48px sans-serif'; p.textAlign = 'center';
  txt.split('\n').forEach((l, i) => p.fillText(l, 128, 150 + i * 56));
}

export function drawWelcomeSign(n) {
  n.fillStyle = '#0F1B2E'; n.fillRect(0, 0, 1024, 320);
  n.strokeStyle = '#D4AF37'; n.lineWidth = 10; n.strokeRect(10, 10, 1004, 300);
  n.fillStyle = '#FBBF24'; n.font = '900 130px "Segoe UI",Arial,sans-serif'; n.textAlign = 'center'; n.fillText('WFS PROJECT', 512, 150);
  n.fillStyle = '#FFFFFF'; n.font = '600 60px "Segoe UI",Arial,sans-serif'; n.fillText('Selamat Datang \u00b7 Welcome', 512, 250);
}
