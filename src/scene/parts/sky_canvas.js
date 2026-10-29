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

// ── Langit malam jendela (siklus 164): dulu jendela selalu langit siang —
// jam malam (daylight 0.3, latar NAVY) jendela memancarkan biru terang + awan
// putih = kontras salah. drawSkyNight dipakai createLighting utk swap tekstur
// jendela saat daylight turun (lihat daycycle.js skyWins).
export function drawSkyNight(x) {
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#050B22');g.addColorStop(.65, '#0A1636');g.addColorStop(1, '#16264E');
  x.fillStyle = g;x.fillRect(0, 0, 256, 128);
  // glow bulan di (210,22) — posisi sama dgn matahari versi siang (swap mulus)
  const moon = x.createRadialGradient(210, 22, 2, 210, 22, 46);
  moon.addColorStop(0, 'rgba(215,228,255,0.85)');moon.addColorStop(1, 'rgba(215,228,255,0)');
  x.fillStyle = moon;x.fillRect(0, 0, 256, 128);
  // bintang: 15 titik deterministik (tanpa RNG → hasil render stabil antar rebuild)
  x.fillStyle = 'rgba(255,255,255,0.9)';
  [[24,12,1.2],[58,30,1],[95,18,.8],[132,42,1.3],[168,14,.9],[205,55,1],[228,30,.8],[42,58,.9],[88,66,1.1],[150,74,.8],[186,88,1],[118,96,.8],[64,104,.9],[200,110,.8],[28,84,.7]]
    .forEach(([sx, sy, sr]) => { x.beginPath();x.arc(sx, sy, sr, 0, 7);x.fill(); });
  // glow kota hangat di horizon bawah (lampu gedung) — kaki langit malam
  const city = x.createLinearGradient(0, 84, 0, 128);
  city.addColorStop(0, 'rgba(255,190,110,0)');city.addColorStop(1, 'rgba(255,190,110,0.22)');
  x.fillStyle = city;x.fillRect(0, 84, 256, 44);
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
