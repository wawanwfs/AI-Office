// painter kanvas tekstur dinding (panel + nat + bevel gradien) — murni, ctx di-inject.
// Urutan & parameter perintah gambar identik fungsi tex() inline lama di OfficeScene.
// Warna gradien juga diekspor agar pemanggil cukup memanggil painter tanpa melihat detail.
export const WALL_TEX_TOP = 'rgba(255,255,255,.12)';
export const WALL_TEX_BOTTOM = 'rgba(0,0,0,.08)';

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
  const g = ctx.createLinearGradient(0, 0, 0, hpx);
  g.addColorStop(0, WALL_TEX_TOP);
  g.addColorStop(1, WALL_TEX_BOTTOM);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wpx, hpx);
}
