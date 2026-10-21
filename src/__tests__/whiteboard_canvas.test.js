// Test painter whiteboard agenda sprint (parts/whiteboard_canvas.js).
// ctx recorder: setter & panggilan metode direkam sebagai oper berurutan,
// sehingga warna/font bisa diasersi tepat sebelum tiap penggunaan.
import { describe, it, expect } from 'vitest';
import {
  drawSprintBoard, WB_W, WB_H, WB_BG, WB_TITLE, WB_ITEM_COLOR, WB_ITEM_FONT,
  WB_ITEMS, WB_ITEM_X, WB_ITEM_Y0, WB_ITEM_DY,
} from '../scene/parts/whiteboard_canvas.js';

function mkCtx() {
  const ops = [];
  const rec = (name) => (...a) => ops.push([name, ...a]);
  const ctx = {
    fillRect: rec('fillRect'), fillText: rec('fillText'),
  };
  for (const key of ['fillStyle', 'font']) {
    let v;
    Object.defineProperty(ctx, key, {
      get: () => v,
      set: (nv) => { v = nv; ops.push(['set:' + key, nv]); },
    });
  }
  return { ops, ctx };
}
const styleBefore = (ops, name, arg1) => {
  const i = ops.findIndex((o) => o[0] === name && o[1] === arg1);
  expect(i).toBeGreaterThan(-1);
  const setter = ops.slice(0, i).reverse().find((o) => o[0] === 'set:fillStyle');
  expect(setter).toBeTruthy();
  return setter[1];
};

describe('whiteboard_canvas — konstanta & painter agenda sprint', () => {
  it('mengekspor konstanta sesuai kanvas lama (320×128, teks & warna)', () => {
    expect(WB_W).toBe(320);
    expect(WB_H).toBe(128);
    expect(WB_BG).toBe('#fbfbfa');
    expect(WB_TITLE).toEqual({ text: 'WFS SPRINT', color: '#f59e0b', font: 'bold 22px sans-serif', x: 14, y: 30 });
    expect(WB_ITEM_COLOR).toBe('#334155');
    expect(WB_ITEM_FONT).toBe('15px sans-serif');
    expect(WB_ITEMS).toEqual(['• Review task QA', '• Deploy tenant baru', '• Demo widget AI CS']);
    expect(WB_ITEM_X).toBe(14);
    expect(WB_ITEM_Y0).toBe(58);
    expect(WB_ITEM_DY).toBe(24);
  });

  it('latar fillRect penuh sebagai oper pertama dengan warna latar', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx);
    expect(ops[0]).toEqual(['set:fillStyle', WB_BG]);
    expect(ops[1]).toEqual(['fillRect', 0, 0, 320, 128]);
  });

  it('judul: font bold 22px, warna #f59e0b, teks di (14,30)', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx);
    const t = ops.findIndex((o) => o[0] === 'fillText' && o[1] === 'WFS SPRINT');
    expect(t).toBeGreaterThan(-1);
    expect(ops[t]).toEqual(['fillText', 'WFS SPRINT', 14, 30]);
    expect(styleBefore(ops, 'fillText', 'WFS SPRINT')).toBe('#f59e0b');
  });

  it('tiga item agenda di x=14, y=58+i·24, warna #334155, font 15px', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx);
    WB_ITEMS.forEach((t, i) => {
      const op = ops.find((o) => o[0] === 'fillText' && o[1] === t);
      expect(op).toEqual(['fillText', t, 14, 58 + i * 24]);
    });
    expect(styleBefore(ops, 'fillText', WB_ITEMS[WB_ITEMS.length - 1])).toBe('#334155');
    expect(styleBefore(ops, 'fillText', WB_ITEMS[WB_ITEMS.length - 1])).not.toBe(WB_ITEM_FONT.slice(0, 4));
  });

  it('tepat 1 fillRect + 3 fillText, tanpa oper liar', () => {
    const { ctx, ops } = mkCtx();
    drawSprintBoard(ctx);
    const names = ops.map((o) => o[0].replace(/^set:/, ''));
    expect(names.filter((n) => n === 'fillRect')).toHaveLength(1);
    expect(names.filter((n) => n === 'fillText')).toHaveLength(4);
    expect(names.length).toBe(10);
  });

  it('dua pemanggilan tidak saling memengaruhi state', () => {
    const a = mkCtx(), b = mkCtx();
    drawSprintBoard(a.ctx);
    drawSprintBoard(b.ctx);
    expect(a.ops).toEqual(b.ops);
  });
});
