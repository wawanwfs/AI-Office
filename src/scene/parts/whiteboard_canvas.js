// Whiteboard agenda sprint (ruang meeting) — painter kanvas murni.
// Diekstrak dari parts/room.js agar bisa di-unit-test; ctx di-inject,
// tanpa THREE/DOM. Urutan & parameter perintah identik kode inline lama.
export const WB_W = 320, WB_H = 128;
export const WB_BG = '#fbfbfa';
export const WB_TITLE = { text: 'WFS SPRINT', color: '#f59e0b', font: 'bold 22px sans-serif', x: 14, y: 30 };
export const WB_ITEM_COLOR = '#334155';
export const WB_ITEM_FONT = '15px sans-serif';
export const WB_ITEMS = ['• Review task QA', '• Deploy tenant baru', '• Demo widget AI CS'];
export const WB_ITEM_X = 14, WB_ITEM_Y0 = 58, WB_ITEM_DY = 24;

// Mode live: agenda diganti dari data task nyata (T = __tvData.tasks).
// Murni: kembalikan baris teks [label, nilai, warna] agar mudah diuji & digambar.
export const WB_LIVE_COLORS = { done: '#16a34a', review: '#448AFF', failed: '#ef4444', ontrack: '#334155' };
export function sprintLiveRows(T) {
  if (!T || !Number.isFinite(+T.total) || +T.total < 0) return null;
  const total = +T.total, done = Math.min(Math.max(0, +T.done || 0), total);
  const pct = total ? Math.round(done / total * 100) : 0;
  const rows = [
    ['selesai', done + '/' + total + ' (' + pct + '%)', WB_LIVE_COLORS.done],
  ];
  if (+T.review > 0) rows.push(['review', String(+T.review), WB_LIVE_COLORS.review]);
  if (+T.failed > 0) rows.push(['gagal', String(+T.failed), WB_LIVE_COLORS.failed]);
  if (!+T.review && !+T.failed) rows.push(['status', 'on track', WB_LIVE_COLORS.ontrack]);
  return rows;
}

// Gambarkan baris live di bawah judul: label abu, nilai berwarna, plus bar progres.
export function drawSprintLive(ctx, T, w = WB_W, h = WB_H) {
  const rows = sprintLiveRows(T);
  if (!rows) return false; // tanpa data valid → pemanggil fallback ke agenda statis
  ctx.fillStyle = '#8fa3bd'; ctx.font = '12px monospace';
  ctx.fillText('live · dibantuin.com', WB_ITEM_X, WB_ITEM_Y0 - 8);
  rows.forEach(([label, val, col], i) => {
    const y = WB_ITEM_Y0 + i * WB_ITEM_DY;
    ctx.fillStyle = '#8fa3bd'; ctx.font = '13px sans-serif';
    ctx.fillText(label, WB_ITEM_X, y);
    ctx.fillStyle = col; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(val, WB_ITEM_X + 78, y);
  });
  // bar progres (di bawah baris)
  const barY = WB_ITEM_Y0 + rows.length * WB_ITEM_DY + 6;
  if (barY + 12 < h) {
    const T2 = T, total = +T2.total || 0, done = Math.min(Math.max(0, +T2.done || 0), total);
    ctx.fillStyle = 'rgba(51,65,85,.18)'; ctx.fillRect(WB_ITEM_X, barY, w - 2 * WB_ITEM_X, 10);
    ctx.fillStyle = WB_LIVE_COLORS.done;
    ctx.fillRect(WB_ITEM_X, barY, Math.max(3, (w - 2 * WB_ITEM_X) * (total ? done / total : 0)), 10);
  }
  return true;
}

export function drawSprintBoard(ctx, T) {
  ctx.fillStyle = WB_BG; ctx.fillRect(0, 0, WB_W, WB_H);
  ctx.fillStyle = WB_TITLE.color; ctx.font = WB_TITLE.font; ctx.fillText(WB_TITLE.text, WB_TITLE.x, WB_TITLE.y);
  if (drawSprintLive(ctx, T)) return;
  ctx.fillStyle = WB_ITEM_COLOR; ctx.font = WB_ITEM_FONT;
  WB_ITEMS.forEach((t, i) => ctx.fillText(t, WB_ITEM_X, WB_ITEM_Y0 + i * WB_ITEM_DY));
}
