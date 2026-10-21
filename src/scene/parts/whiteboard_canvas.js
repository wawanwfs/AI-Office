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

export function drawSprintBoard(ctx) {
  ctx.fillStyle = WB_BG; ctx.fillRect(0, 0, WB_W, WB_H);
  ctx.fillStyle = WB_TITLE.color; ctx.font = WB_TITLE.font; ctx.fillText(WB_TITLE.text, WB_TITLE.x, WB_TITLE.y);
  ctx.fillStyle = WB_ITEM_COLOR; ctx.font = WB_ITEM_FONT;
  WB_ITEMS.forEach((t, i) => ctx.fillText(t, WB_ITEM_X, WB_ITEM_Y0 + i * WB_ITEM_DY));
}
