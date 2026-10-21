// @vitest-environment jsdom
// Unit test painter poster slogan WFS — parts/poster_canvas.js.
// ctx recorder; memverifikasi urutan & parameter identik kode inline lama di furniture.js.
import { describe, it, expect } from 'vitest';
import { drawPoster } from '../scene/parts/poster_canvas.js';
import { CANVAS_W, CANVAS_H, LINE_H, posterLineY } from '../scene/parts/poster_spec.js';

function makeCtx() {
  const ops = [];
  const ctx = {
    _ops: ops,
    fillRect: (...a) => ops.push(['fillRect', a]),
    strokeRect: (...a) => ops.push(['strokeRect', a]),
    fillText: (...a) => ops.push(['fillText', a]),
    // setter properti style direkam sebagai oper agar urutan bisa diverifikasi
  };
  for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'shadowColor', 'shadowBlur']) {
    Object.defineProperty(ctx, k, {
      set(v) { ops.push([k, v]); },
      get() { return undefined; },
    });
  }
  return ctx;
}

describe('drawPoster', () => {
  it('latar gelap penuh sebagai oper pertama, ukuran kanvas sesuai spec', () => {
    const c = makeCtx();
    drawPoster(c, '#0deef3', 'SHIP IT');
    expect(c._ops[0]).toEqual(['fillStyle', '#14172b']);
    expect(c._ops[1]).toEqual(['fillRect', [0, 0, CANVAS_W, CANVAS_H]]);
    expect(CANVAS_W).toBe(120);
    expect(CANVAS_H).toBe(160);
  });

  it('bingkai warna poster: strokeStyle + lineWidth 3 + strokeRect(6,6,108,148)', () => {
    const c = makeCtx();
    drawPoster(c, '#f5a623', 'BUILD DAILY');
    const i = c._ops.findIndex((o) => o[0] === 'strokeStyle');
    expect(c._ops[i]).toEqual(['strokeStyle', '#f5a623']);
    expect(c._ops[i + 1]).toEqual(['lineWidth', 3]);
    expect(c._ops[i + 2]).toEqual(['strokeRect', [6, 6, 108, 148]]);
  });

  it('teks: fillStyle = warna, font bold 15px, center, shadow warna blur 6', () => {
    const c = makeCtx();
    drawPoster(c, '#ff5252', 'KUALITAS DULU');
    const i = c._ops.findIndex((o) => o[0] === 'font');
    expect(c._ops[i]).toEqual(['font', 'bold 15px sans-serif']);
    expect(c._ops[i + 1]).toEqual(['textAlign', 'center']);
    expect(c._ops[i + 2]).toEqual(['shadowColor', '#ff5252']);
    expect(c._ops[i + 3]).toEqual(['shadowBlur', 6]);
    const fillStyleAfter = c._ops.filter((o) => o[0] === 'fillStyle').map((o) => o[1]);
    expect(fillStyleAfter).toContain('#ff5252');
  });

  it('tiap kata jadi satu fillText di x=60, y = posterLineY(i) (64 + i*LINE_H)', () => {
    const c = makeCtx();
    drawPoster(c, '#7c4dff', 'TEST EVERYTHING');
    const texts = c._ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
    expect(texts).toEqual([
      ['TEST', 60, posterLineY(0)],
      ['EVERYTHING', 60, posterLineY(1)],
    ]);
    expect(posterLineY(0)).toBe(64);
    expect(posterLineY(1)).toBe(64 + LINE_H);
  });

  it('teks satu kata = tepat 1 fillText; total oper = latar+baya+teks, tanpa oper liar', () => {
    const c = makeCtx();
    drawPoster(c, '#00e676', 'WFS PROJECT');
    const names = c._ops.map((o) => o[0]);
    expect(names.filter((n) => n === 'fillText').length).toBe(2);
    const allowed = new Set(['fillStyle', 'fillRect', 'strokeStyle', 'lineWidth', 'strokeRect', 'font', 'textAlign', 'shadowColor', 'shadowBlur', 'fillText']);
    expect(names.every((n) => allowed.has(n))).toBe(true);
  });

  it('dipanggil dua kali tidak share state (oper terpisah per ctx)', () => {
    const a = makeCtx(), b = makeCtx();
    drawPoster(a, '#0deef3', 'SHIP IT');
    drawPoster(b, '#f5a623', 'BUILD DAILY');
    expect(a._ops.length).toBe(b._ops.length);
    expect(a._ops.find((o) => o[0] === 'strokeStyle')[1]).toBe('#0deef3');
    expect(b._ops.find((o) => o[0] === 'strokeStyle')[1]).toBe('#f5a623');
  });
});
