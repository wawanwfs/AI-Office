// Painter kanvas jendela & kaca — murni (ctx di-inject, tanpa THREE/DOM).
// Diekstrak dari IIFE skyTex/glassSheen di OfficeScene; urutan & parameter
// perintah gambar identik kode lama (tampilan tak berubah).

// langit jendela: gradien vertikal + pita matahari radial + 4 awan ellipse.
// Siklus 521: awan BERGERAK — offset X tiap awan = drift(elapsed) × kecepatan
// per-awan (wrap modulo 256+lebar, deterministik dari elapsed; guard non-finite
// → posisi awal). drawSky(x, elapsed=0): default 0 = posisi awal identik kode lama
// (test regresi posisi awan tak berubah), repaint siang berkala via daycycle.
export const SKY_CLOUDS = [[40, 38, 60, 14], [130, 60, 80, 12], [190, 30, 55, 10], [80, 90, 70, 12]];
export const SKY_CLOUD_SPEED = [1.6, 2.4, 1.1, 2.0]; // px/dtk — laju beda per awan (tak sinkron)
const SKY_SPAN = 256;
// cloudOffset(i, elapsed): posisi pusat awan i pada waktu elapsed — deterministik,
// wrap modulo 256+lebar (keluar kanan → masuk kiri), guard non-finite → posisi awal.
export function cloudOffset(i, elapsed) {
  const t = Number.isFinite(elapsed) ? elapsed : 0;
  const idx = Number.isFinite(i) ? i : 0;
  const spec = SKY_CLOUDS[idx] || SKY_CLOUDS[0];
  const cw = spec[2];
  const drift = t * SKY_CLOUD_SPEED[idx % SKY_CLOUD_SPEED.length] % (SKY_SPAN + cw);
  let px = spec[0] + drift;
  if (px > SKY_SPAN + cw / 2) px -= SKY_SPAN + cw;
  return px;
}
export function drawSky(x, elapsed = 0) {
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#4EA8EE');g.addColorStop(.65, '#93D0F5');g.addColorStop(1, '#D6EDFB');
  x.fillStyle = g;x.fillRect(0, 0, 256, 128);
  // pita cahaya matahari utk depth (hindari langit flat/pucat)
  const sun = x.createRadialGradient(210, 22, 4, 210, 22, 80);
  sun.addColorStop(0, 'rgba(255,250,220,0.95)');sun.addColorStop(1, 'rgba(255,250,220,0)');
  x.fillStyle = sun;x.fillRect(0, 0, 256, 128);
  x.fillStyle = 'rgba(255,255,255,0.85)';
  SKY_CLOUDS.forEach(([cx, cy, cw, ch], i) => {
    x.beginPath();x.ellipse(cloudOffset(i, elapsed), cy, cw / 2, ch / 2, 0, 0, 7);x.fill();
  });
}

// ── Langit malam jendela (siklus 164): dulu jendela selalu langit siang —
// jam malam (daylight 0.3, latar NAVY) jendela memancarkan biru terang + awan
// putih = kontras salah. drawSkyNight dipakai createLighting utk swap tekstur
// jendela saat daylight turun (lihat daycycle.js skyWins).
export const STAR_TWINKLE_SEC = 1.7; // satu kedipan bintang (rasio tak sinkron dgn lampu 5.2/3.9/3.6)
export const STAR_TWINKLE_MIN = 0.55; // kedipan terendah — bintang tak pernah padam total

// Kedipan tiap bintang: fase dari index (deterministik), amplitudo bervariasi
// (bintang besar berkedip lebih jelas). Diuji unit murni — tanpa kanvas.
export function starTwinkle(i, elapsed) {
  const n = Number.isFinite(elapsed) ? elapsed : 0;
  const idx = Number.isFinite(i) ? i : 0;
  const phase = idx * 0.618;                        // distribusi fase (rasio emas)
  const sec = STAR_TWINKLE_SEC * (1 + (idx % 3) * 0.23); // 3 kelompok laju tak sinkron
  const w = 0.5 + 0.5 * Math.sin((n / sec + phase) * Math.PI * 2);
  const amp = 0.32 + (idx % 4) * 0.06;              // 0.32…0.50
  return (1 - amp) + amp * w;                       // 1-amp … 1, puncak eksak 1
}

export function drawSkyNight(x, step = 0) {
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#050B22');g.addColorStop(.65, '#0A1636');g.addColorStop(1, '#16264E');
  x.fillStyle = g;x.fillRect(0, 0, 256, 128);
  // glow bulan di (210,22) — posisi sama dgn matahari versi siang (swap mulus)
  const moon = x.createRadialGradient(210, 22, 2, 210, 22, 46);
  moon.addColorStop(0, 'rgba(215,228,255,0.85)');moon.addColorStop(1, 'rgba(215,228,255,0)');
  x.fillStyle = moon;x.fillRect(0, 0, 256, 128);
  // bintang: 15 titik deterministik — kedipan via starTwinkle(i, step detik) (siklus 501):
  // alpha dimodulasi fase per-index → repaint tiap 2 dtk menghasilkan langit hidup.
  const T0 = step; // step = detik malam (dari daycycle.paintStars)
  [[24,12,1.2],[58,30,1],[95,18,.8],[132,42,1.3],[168,14,.9],[205,55,1],[228,30,.8],[42,58,.9],[88,66,1.1],[150,74,.8],[186,88,1],[118,96,.8],[64,104,.9],[200,110,.8],[28,84,.7]]
    .forEach(([sx, sy, sr], i) => {
      const tw = starTwinkle(i, T0);
      x.globalAlpha = STAR_TWINKLE_MIN + (1 - STAR_TWINKLE_MIN) * tw;
      x.beginPath();x.arc(sx, sy, sr, 0, 7);x.fill();
    });
  x.globalAlpha = 1;
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
