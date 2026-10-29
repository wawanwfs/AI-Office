// painter kanvas tekstur dinding (panel + nat + bevel gradien) — murni, ctx di-inject.
// Urutan & parameter perintah gambar identik fungsi tex() inline lama di OfficeScene.
// Warna gradien juga diekspor agar pemanggil cukup memanggil painter tanpa melihat detail.
export const WALL_TEX_TOP = 'rgba(255,255,255,.12)';
export const WALL_TEX_BOTTOM = 'rgba(0,0,0,.08)';

// ── Palet dinding MALAM (siklus 165): dulu 8 tekstur dinding (panel atas pucat
// #E6EAF1 + wainscot kayu #8A6244) digambar SEKALI dgn palet siang via
// MeshBasicMaterial ("tidak bergantung pencahayaan") — jam malam (daylight 0.3,
// latar NAVY, lantai Lambert menggelap, jendela malam) dinding tetap terang
// penuh = kelas bug sama dgn jendela siklus 164. createWalls me-repaint kanvas
// dgn palet ini saat daylight ≤ 0.55 (lihat daycycle.js).
// Painter drawWallTex PARAMETRIK (base+line di-inject) → repaint = panggil ulang
// painter dgn warna malam; urutan & pola panel/nat/bevel identik siang.
export const WALL_NIGHT = {
  upper: { base: '#1B2436', line: 'rgba(96,116,150,0.32)' }, // panel atas: biru arsitektural gelap, seam samar
  wood: { base: '#3B2B1D', line: 'rgba(20,12,6,0.45)' },     // wainscot kayu: jati gelap, tetap kayu
};

export function drawWallTex(ctx, base, line, wpx = 512, hpx = 256, step = 64) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, wpx, hpx);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  for (let i = 0; i <= wpx; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, hpx);
    ctx.stroke();
  }
  // seam panel horizontal — memecah kepolosan bidang vertikal
  ctx.lineWidth = 1.5;
  for (let j = 64; j < hpx; j += 64) {
    ctx.beginPath();
    ctx.moveTo(0, j);
    ctx.lineTo(wpx, j);
    ctx.stroke();
  }
  // pita satin lembut (kesan finishing dinding premium)
  const st = ctx.createLinearGradient(0, 0, wpx, 0);
  st.addColorStop(0, 'rgba(255,255,255,0)');
  st.addColorStop(0.22, 'rgba(255,255,255,0.05)');
  st.addColorStop(0.34, 'rgba(255,255,255,0)');
  st.addColorStop(0.72, 'rgba(255,255,255,0.045)');
  st.addColorStop(0.86, 'rgba(255,255,255,0)');
  ctx.fillStyle = st; ctx.fillRect(0, 0, wpx, hpx);
  // AO tepi kiri/kanan tile — panel terasa berdimensi
  const aoL = ctx.createLinearGradient(0, 0, 46, 0);
  aoL.addColorStop(0, 'rgba(0,0,0,0.09)'); aoL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aoL; ctx.fillRect(0, 0, 46, hpx);
  const aoR = ctx.createLinearGradient(wpx, 0, wpx - 46, 0);
  aoR.addColorStop(0, 'rgba(0,0,0,0.09)'); aoR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aoR; ctx.fillRect(wpx - 46, 0, 46, hpx);
  const g = ctx.createLinearGradient(0, 0, 0, hpx);
  g.addColorStop(0, WALL_TEX_TOP);
  g.addColorStop(1, WALL_TEX_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wpx, hpx);
}
