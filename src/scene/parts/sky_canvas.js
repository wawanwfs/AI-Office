// Painter kanvas jendela & kaca — murni (ctx di-inject, tanpa THREE/DOM).
// Diekstrak dari IIFE skyTex/glassSheen di OfficeScene; urutan & parameter
// perintah gambar identik kode lama (tampilan tak berubah).

// langit jendela: gradien vertikal + pita matahari radial + 4 awan ellipse
export function drawSky(x) {
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#4EA8EE');g.addColorStop(.65, '#93D0F5');g.addColorStop(1, '#D6EDFB');
  x.fillStyle = g;x.fillRect(0, 0, 256, 128);
  // pita cahaya matahari utk depth (hindari langit flat/pucat)
  const sun = x.createRadialGradient(210, 22, 4, 210, 22, 80);
  sun.addColorStop(0, 'rgba(255,250,220,0.95)');sun.addColorStop(1, 'rgba(255,250,220,0)');
  x.fillStyle = sun;x.fillRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  [[40, 38, 60, 14], [130, 60, 80, 12], [190, 30, 55, 10], [80, 90, 70, 12]].forEach(([cx, cy, cw, ch]) => {
    x.beginPath();x.ellipse(cx, cy, cw / 2, ch / 2, 0, 0, 7);x.fill();
  });
}

// sheen kaca: 2 pantulan diagonal + tint biru — overlay plane di tiap jendela
export function drawGlassSheen(x) {
  const g = x.createLinearGradient(0, 128, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.00)');
  g.addColorStop(.42, 'rgba(210,235,255,0.05)');
  g.addColorStop(.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(.58, 'rgba(210,235,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0.00)');
  x.fillStyle = g;x.fillRect(0, 0, 256, 128);
  const g2 = x.createLinearGradient(256, 128, 60, 0);
  g2.addColorStop(0, 'rgba(255,255,255,0.00)');
  g2.addColorStop(.46, 'rgba(255,255,255,0.11)');
  g2.addColorStop(.54, 'rgba(255,255,255,0.00)');
  x.fillStyle = g2;x.fillRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(140,200,255,0.10)';x.fillRect(0, 0, 256, 128);
}
