// Painter plakat lantai beriluminasi (dipakai createTerraces di parts/terraces.js),
// diekstrak ke parts/floor_badge_canvas.js agar murni dan bisa di-unit-test.
// Urutan & parameter perintah gambar identik kode inline lama (siklus 526) —
// tampilan awal tak berubah; teks kini bisa digambar ulang (misi berganti).
export const FB_W = 640, FB_H = 112;

export function drawFloorBadge(ctx, accent, levelText, text) {
  ctx.fillStyle = 'rgba(6, 12, 26, 0.94)';
  ctx.roundRect ? ctx.roundRect(4, 4, FB_W - 8, FB_H - 8, 16) : ctx.rect(4, 4, FB_W - 8, FB_H - 8);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = 'bold 24px "DM Mono", monospace';
  ctx.fillText(levelText, 28, 42);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px "DM Sans", sans-serif';
  ctx.fillText(text, 28, 82);
}
