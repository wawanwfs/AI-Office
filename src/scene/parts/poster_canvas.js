// Painter poster slogan WFS (dipakai createFurniture di parts/furniture.js),
// diekstrak ke parts/poster_canvas.js agar murni dan bisa di-unit-test.
// Urutan & parameter perintah gambar identik kode inline lama — tampilan tak berubah.
import { CANVAS_W, CANVAS_H, posterLineY } from './poster_spec.js';

export function drawPoster(ctx, color, text) {
  ctx.fillStyle = '#14172b';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 108, 148);
  ctx.fillStyle = color;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  text.split(' ').forEach((w, i) => ctx.fillText(w, 60, posterLineY(i)));
}
