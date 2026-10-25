// Test painter whiteboard: mode live (data task nyata) + fallback statis.
import { describe, it, expect } from 'vitest';
import {
  drawSprintBoard, sprintLiveRows, drawSprintLive,
  WB_W, WB_H, WB_ITEMS, WB_ITEM_X, WB_ITEM_Y0, WB_ITEM_DY, WB_LIVE_COLORS,
} from '../scene/parts/whiteboard_canvas.js';

function mkCtx() {
  const ops = [];
  const rec = (name) => (...a) => ops.push([name, ...a]);
  const ctx = { fillRect: rec('fillRect'), fillText: rec('fillText') };
  for (const key of ['fillStyle', 'font']) {
    let v;
    Object.defineProperty(ctx, key, { get: () => v, set: (nv) => { v = nv; ops.push(['set:' + key, nv]); } });
  }
  return { ops, ctx };
}
const texts = (ops) => ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);

describe('whiteboard mode live', () => {
  it('sprintLiveRows: data lengkap → selesai/review/gagal', () => {
    expect(sprintLiveRows({ total: 23, done: 23, review: 2, failed: 1 })).toEqual([
      ['selesai', '23/23 (100%)', WB_LIVE_COLORS.done],
      ['review', '2', WB_LIVE_COLORS.review],
      ['gagal', '1', WB_LIVE_COLORS.failed],
    ]);
  });
  it('sprintLiveRows: tanpa review/failed → baris "on track"', () => {
    const rows = sprintLiveRows({ total: 10, done: 4 });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['status', 'on track', WB_LIVE_COLORS.ontrack]);
  });
  it('sprintLiveRows: guard — null/NaN/negatif → null (fallback statis)', () => {
    expect(sprintLiveRows(null)).toBe(null);
    expect(sprintLiveRows({})).toBe(null);
    expect(sprintLiveRows({ total: NaN, done: 3 })).toBe(null);
    expect(sprintLiveRows({ total: -5, done: 0 })).toBe(null);
  });
  it('sprintLiveRows: done di-clamp 0..total (tanpa persen > 100)', () => {
    const rows = sprintLiveRows({ total: 10, done: 99 });
    expect(rows[0][1]).toBe('10/10 (100%)');
    expect(sprintLiveRows({ total: 10, done: -3 })[0][1]).toBe('0/10 (0%)');
  });
  it('drawSprintBoard dgn data valid: teks live tampil, agenda statis tidak', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx, { total: 23, done: 23, review: 2, failed: 1 });
    const t = texts(ops);
    expect(t).toContain('23/23 (100%)');
    expect(t).toContain('1'); // nilai GAGAL
    WB_ITEMS.forEach((item) => expect(t).not.toContain(item));
    expect(t.some((x) => String(x).includes('live'))).toBe(true);
  });
  it('drawSprintBoard tanpa data → fallback agenda statis (perilaku lama utuh)', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx, null);
    const t = texts(ops);
    WB_ITEMS.forEach((item) => expect(t).toContain(item));
    expect(t.some((x) => String(x).includes('live'))).toBe(false);
  });
  it('drawSprintBoard tanpa argumen (kompatibilitas pemanggil lama) → statis', () => {
    const { ops, ctx } = mkCtx();
    drawSprintBoard(ctx);
    expect(texts(ops)).toContain(WB_ITEMS[0]);
  });
  it('drawSprintLive menggambar bar progres dalam batas kanvas', () => {
    const { ops, ctx } = mkCtx();
    expect(drawSprintLive(ctx, { total: 4, done: 4 })).toBe(true);
    const rects = ops.filter((o) => o[0] === 'fillRect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    const [bx, by, bw, bh] = rects[rects.length - 1].slice(1);
    expect(bx).toBe(WB_ITEM_X);
    expect(bx + bw).toBeLessThanOrEqual(WB_W);
    expect(by + bh).toBeLessThanOrEqual(WB_H);
  });
  it('drawSprintLive tanpa data valid → false, tidak menggambar apa pun', () => {
    const { ops, ctx } = mkCtx();
    expect(drawSprintLive(ctx, undefined)).toBe(false);
    expect(ops).toHaveLength(0);
  });
});
