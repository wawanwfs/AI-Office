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

// ── Siklus 266: arg ke-3 LAMA (timestamp waktu-nyata) DIHAPUS dari kontrak painter ──
// Bug lanjutan 265: fix pipa (simClockSeconds + call-site) menghitung detik-sim
// dgn benar, tapi painter MASIH menarik jarum detik dari timestamp default
// waktu-nyata (room.js::draw menerima SATU argumen → frac dihitung lalu DIBUANG).
// Efek: laju 12× bertahan & detik tetap berputar saat sim manual beku — klaim
// "satu sumber waktu" 265 tak pernah sampai ke canvas. Kontrak baru:
// drawClockFace(c, nowSeconds, fracSec = 0) — detik = nowSeconds + fracSec
// (nowSeconds sudah detik-jam dari simClockSeconds; frac = sisa detik-sim menit
// berjalan, clamp < 60 agar jarum detik tak melewati menit yang ditunjuk).
export function drawClockFace(c, nowSeconds, fracSec = 0) {
  // Guard anti-poisoning: input waktu non-finite (NaN/±Infinity/undefined) → 0
  // (jarum di 12:00), jangan biarkan NaN merambat ke koordinat lineTo arc
  // (jarum diam-diam tak tergambar). Konsisten dgn pola guard modul lain.
  // fracSec non-finite/≤0 → no-op (pola simClockSeconds); clamp 59.999.
  const safeSeconds = Number.isFinite(nowSeconds) ? nowSeconds : 0;
  const safeFrac = Number.isFinite(fracSec) && fracSec > 0 ? Math.min(fracSec, 59.999) : 0;
  const minutes = safeSeconds / 60;
  // Detik jarum: SATU sumber — detik-jam dari nowSeconds (+frac); painter TIDAK
  // punya akses waktu-nyata lagi (jam wall-clock intern tidak ada di sini).
  const seconds = safeSeconds + safeFrac;
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
  hand(secondHandAngle(seconds), HANDS.second.len, HANDS.second.w, HANDS.second.color);
  c.fillStyle = CLOCK_PIN; c.beginPath(); c.arc(cx, cy, CLOCK_PIN_R, 0, Math.PI * 2); c.fill();
}
