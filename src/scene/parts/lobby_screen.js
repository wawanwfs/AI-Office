// Painter layar monitor RESEPSIONIS (256×160) — murni (ctx di-inject, tanpa
// THREE/DOM) agar bisa di-unit-test.
//
// Latar: rcScreenGlow (reception.js) sejak awal hanya kotak MeshBasicMaterial
// 0x0A1628 datar — satu-satunya layar di kantor yang TIDAK menampilkan apa pun
// (semua meja agen punya drawScreenFrame animasi; TV lounge punya dasbor live).
// Meja resepsionis adalah titik pertama yang dilihat pengunjung → layarnya kini
// menampilkan data NYATA dari simulasi: jam kantor (timeOfDay) + label fase dari
// office_hours.officeStatusAt (satu sumber, siklus 372) + jumlah agen bertugas
// (agentData.length, bukan angka hardcode).
//
// Anti-poisoning: menit non-finite/korup → '--:--' & label netral, tidak pernah
// 'NaN'/'Invalid Date' tampil permanen di dinding (kelas bug 268).
import { officeStatusAt } from './office_hours.js';
import { AMBER_ACCENT } from '../../lib/ui_palette.js';

export const LS_W = 256;
export const LS_H = 160;
export const LS_BG = '#0A1628';
export const LS_TITLE = 'WFS · LOBBY';
export const LS_TITLE_FONT = 'bold 19px "Segoe UI",Arial,sans-serif';
export const LS_CLOCK_FONT = '900 54px "Segoe UI",Arial,sans-serif';
export const LS_STATUS_FONT = '600 13px "Segoe UI",Arial,sans-serif';
export const LS_FOOT_FONT = '10px monospace';
export const LS_MUTED = '#8fa3bd';
export const LS_STATUS_NETRAL = 'WFS Project · HQ';

/** Menit simulasi → 'HH:MM' 24 jam. Non-finite/NaN → '--:--'.
 *  Nilai di luar 0…1439 di-wrap (jam simulasi bisa lewat batas saat seek). */
export function lobbyClockText(minutes) {
  if (!Number.isFinite(minutes)) return '--:--';
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/** Label fase kantor dari office_hours (satu sumber). Non-finite → label netral. */
export function lobbyStatusText(minutes) {
  if (!Number.isFinite(minutes)) return LS_STATUS_NETRAL;
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return officeStatusAt(m) || LS_STATUS_NETRAL;
}

/** Baris jumlah agen: '26 AGEN BERTUGAS'. Non-finite/negatif → 'AGEN SIAP'
 *  (bukan 'NaN AGEN' di layar). */
export function lobbyAgentsText(n) {
  if (!Number.isFinite(n) || n < 0) return 'AGEN SIAP';
  const c = Math.floor(n);
  if (c === 0) return 'AGEN SIAP';
  return c + ' AGEN BERTUGAS';
}

/** Kunci redraw: menit bulat — cukup satu repaint per menit simulasi (5 dtk
 *  nyata) alih-alih tiap frame. Non-finite → null (pemanggil tak menggambar). */
export function lobbyScreenKey(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return ((Math.floor(minutes) % 1440) + 1440) % 1440;
}

/** Gambar satu frame layar lobi. opts: {minutes, agents}. */
export function drawLobbyScreen(ctx, opts = {}) {
  const minutes = opts && opts.minutes;
  const clock = lobbyClockText(minutes);
  const status = lobbyStatusText(minutes);
  const agents = lobbyAgentsText(opts && opts.agents);

  ctx.fillStyle = LS_BG;
  ctx.fillRect(0, 0, LS_W, LS_H);
  // garis tepi tipis (bingkai layar) — amber redup
  ctx.strokeStyle = 'rgba(245,158,11,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, LS_W - 2, LS_H - 2);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = AMBER_ACCENT;
  ctx.font = LS_TITLE_FONT;
  ctx.fillText(LS_TITLE, 16, 30);
  ctx.fillStyle = 'rgba(245,158,11,0.75)';
  ctx.fillRect(16, 38, 66, 2);

  // jam besar — pusat layar, putih (kontras tertinggi untuk dibaca dari jauh)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = LS_CLOCK_FONT;
  ctx.fillText(clock, LS_W / 2, 96);

  // label fase kantor
  ctx.fillStyle = LS_MUTED;
  ctx.font = LS_STATUS_FONT;
  ctx.fillText(status, LS_W / 2, 122);

  // footer: identitas meja & beban agen (kedua sisi)
  ctx.font = LS_FOOT_FONT;
  ctx.fillStyle = 'rgba(143,163,189,0.85)';
  ctx.textAlign = 'left';
  ctx.fillText('RESEPSIONIS · 24/7', 16, 148);
  ctx.textAlign = 'right';
  ctx.fillText(agents, LS_W - 16, 148);
  ctx.textAlign = 'left';
}
