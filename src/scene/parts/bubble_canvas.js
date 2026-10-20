// Canvas drawing bubble chat: panel rounded-rect + ekor segitiga + teks.
// Diekstrak murni dari createBubble (OfficeScene.js) agar bisa di-unit-test:
// ctx 2D di-inject (mock recorder), tidak ada THREE.
export const BUBBLE_W = 360;
export const BUBBLE_H = 76;
export const BUBBLE_FADE_IN_SEC = 0.22;
export const BUBBLE_LIFE_SEC = 3.5;

export const BUBBLE_BG = 'rgba(7,16,32,0.94)';
export const BUBBLE_TEXT_FONT = '700 24px "Segoe UI",Arial,sans-serif';

// Rounded rect path pada ctx (digunakan untuk fill & stroke — path sama).
export function roundRectPath(ctx, cx, cy, cw, ch, cr){
  ctx.beginPath();
  ctx.moveTo(cx+cr,cy);
  ctx.lineTo(cx+cw-cr,cy);
  ctx.quadraticCurveTo(cx+cw,cy,cx+cw,cy+cr);
  ctx.lineTo(cx+cw,cy+ch-cr);
  ctx.quadraticCurveTo(cx+cw,cy+ch,cx+cw-cr,cy+ch);
  ctx.lineTo(cx+cr,cy+ch);
  ctx.quadraticCurveTo(cx,cy+ch,cx,cy+ch-cr);
  ctx.lineTo(cx,cy+cr);
  ctx.quadraticCurveTo(cx,cy,cx+cr,cy);
  ctx.closePath();
}

// Ekor segitiga di bawah panel (ujung tepat di bawah tengah).
export function tailPath(ctx, W, H){
  ctx.beginPath();
  ctx.moveTo(W/2-9,H-11);
  ctx.lineTo(W/2,H-3);
  ctx.lineTo(W/2+9,H-11);
  ctx.closePath();
}

// Gambar seluruh bubble pada ctx 2D. Mengembalikan teks yang dipakai
// (sudah melalui clampText, default identitas untuk non-string).
export function drawBubble(ctx, text, color, { clampText } = {}){
  const W = BUBBLE_W, H = BUBBLE_H;
  ctx.fillStyle = BUBBLE_BG;
  roundRectPath(ctx, 3, 3, W-6, H-14, 10);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRectPath(ctx, 3, 3, W-6, H-14, 10);
  ctx.stroke();
  tailPath(ctx, W, H);
  ctx.fillStyle = BUBBLE_BG;
  ctx.fill();
  ctx.font = BUBBLE_TEXT_FONT;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  const clamp = clampText || (t => String(t));
  const t = clamp(text);
  ctx.fillText(t, W/2, 32);
  return t;
}

// Skala sprite bubble (fraksi tinggi viewport × aspek canvas).
export function bubbleScale(hFrac = 0.034){
  return { w: hFrac * (BUBBLE_W/BUBBLE_H), h: hFrac };
}

// Opacity lifecycle: fade-in cepat setelah spawn, fade-out di akhir hidup,
// puncak 1.0 di tengah. (Dipakai createBubble + updateBubbles.)
export function bubbleOpacity(ageSec, lifeSec = BUBBLE_LIFE_SEC){
  const fadeIn = Math.min(1, ageSec / BUBBLE_FADE_IN_SEC);
  const fadeOut = Math.max(0, Math.min(1, lifeSec > 0 ? lifeSec / 0.5 : 0));
  return fadeIn * fadeOut;
}
