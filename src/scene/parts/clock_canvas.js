import {
  TICKS, tickAngle, tickInnerR, hourHandAngle, minuteHandAngle, secondHandAngle, HANDS,
} from './clock_spec.js';

// Painter wajah jam dinding 96x96 — murni, ctx di-inject, tanpa THREE/DOM.
export const CLOCK_SIZE = 96;
export const CLOCK_CENTER = 48;
export const CLOCK_BG = '#fafafa';
export const CLOCK_RIM = '#2a2f36';
export const CLOCK_RIM_W = 3;
export const CLOCK_RIM_R = 45;
export const CLOCK_TICK_OUTER_R = 43;
export const CLOCK_PIN = '#f97316';
export const CLOCK_PIN_R = 3;

export function drawClockFace(c, nowSeconds, dateMs = Date.now()) {
  const minutes = nowSeconds / 60;
  const cx = CLOCK_CENTER, cy = CLOCK_CENTER;
  c.fillStyle = CLOCK_BG; c.fillRect(0, 0, CLOCK_SIZE, CLOCK_SIZE);
  c.strokeStyle = CLOCK_RIM; c.lineWidth = CLOCK_RIM_W; c.beginPath(); c.arc(cx, cy, CLOCK_RIM_R, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < TICKS; i++) {
    const a = tickAngle(i);
    const r1 = tickInnerR(i);
    c.beginPath(); c.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    c.lineTo(cx + Math.sin(a) * CLOCK_TICK_OUTER_R, cy - Math.cos(a) * CLOCK_TICK_OUTER_R); c.stroke();
  }
  const hand = (angle, len, w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(cx, cy);
    c.lineTo(cx + Math.sin(angle) * len, cy - Math.cos(angle) * len); c.stroke();
  };
  hand(hourHandAngle(minutes), HANDS.hour.len, HANDS.hour.w, HANDS.hour.color);
  hand(minuteHandAngle(minutes), HANDS.minute.len, HANDS.minute.w, HANDS.minute.color);
  hand(secondHandAngle(((dateMs / 1000) % 60)), HANDS.second.len, HANDS.second.w, HANDS.second.color);
  c.fillStyle = CLOCK_PIN; c.beginPath(); c.arc(cx, cy, CLOCK_PIN_R, 0, Math.PI * 2); c.fill();
}
