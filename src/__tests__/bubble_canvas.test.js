import { describe, it, expect } from 'vitest';
import {
  BUBBLE_W, BUBBLE_H, BUBBLE_FADE_IN_SEC, BUBBLE_LIFE_SEC,
  BUBBLE_BG, BUBBLE_TEXT_FONT,
  roundRectPath, tailPath, drawBubble, bubbleScale, bubbleOpacity,
} from '../scene/parts/bubble_canvas.js';
import { clampBubbleText } from '../scene/parts/dialog.js';

// Mock ctx 2D yang merekam pemanggilan method penting (tanpa canvas nyata).
function mockCtx(){
  const calls = { fill: 0, stroke: 0, fillText: [] };
  const noop = () => {};
  return {
    calls,
    fillStyle: null, strokeStyle: null, lineWidth: 0,
    font: null, textAlign: null,
    beginPath: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
    closePath: noop,
    fill(){ calls.fill++; },
    stroke(){ calls.stroke++; },
    fillText(t, x, y){ calls.fillText.push({ t, x, y }); },
  };
}

describe('bubble_canvas — konstanta sesuai render lama', () => {
  it('ukuran canvas & skala tetap 360×76, hFrac 0.034', () => {
    expect(BUBBLE_W).toBe(360);
    expect(BUBBLE_H).toBe(76);
    const { w, h } = bubbleScale();
    expect(h).toBeCloseTo(0.034);
    expect(w).toBeCloseTo(0.034 * 360 / 76);
  });
  it('warna bg, font, fade-in, life sesuai nilai historis', () => {
    expect(BUBBLE_BG).toBe('rgba(7,16,32,0.94)');
    expect(BUBBLE_TEXT_FONT).toContain('24px');
    expect(BUBBLE_FADE_IN_SEC).toBeCloseTo(0.22);
    expect(BUBBLE_LIFE_SEC).toBeCloseTo(3.5);
  });
});

describe('bubble_canvas — roundRectPath & tailPath', () => {
  it('roundRectPath menutup path setelah 4 kuadrat kurva + 4 garis', () => {
    const ctx = mockCtx();
    let cur = {};
    ctx.quadraticCurveTo = () => { cur.q = (cur.q||0)+1; };
    ctx.lineTo = () => { cur.l = (cur.l||0)+1; };
    ctx.closePath = () => { cur.closed = true; };
    roundRectPath(ctx, 3, 3, 354, 62, 10);
    expect(cur.q).toBe(4);
    expect(cur.l).toBe(4);
    expect(cur.closed).toBe(true);
  });
  it('tailPath segitiga simetris di bawah tengah panel', () => {
    const pts = [];
    const ctx = mockCtx();
    ctx.moveTo = (x,y) => pts.push([x,y]);
    ctx.lineTo = (x,y) => pts.push([x,y]);
    tailPath(ctx, 360, 76);
    expect(pts.length).toBe(3);
    expect(pts[1][0]).toBe(180);            // ujung di tengah
    expect(pts[1][1]).toBe(73);             // H-3
    expect(pts[0][1]).toBe(pts[2][1]);      // alas rata
    expect(pts[2][0] - pts[1][0]).toBe(pts[1][0] - pts[0][0]); // simetris
  });
});

describe('bubble_canvas — drawBubble', () => {
  it('menggambar: fill panel + stroke border + fill ekor + fill teks', () => {
    const ctx = mockCtx();
    const t = drawBubble(ctx, 'Halo', '#10E5A0');
    expect(ctx.calls.fill).toBe(2);   // panel + ekor
    expect(ctx.calls.stroke).toBe(1); // border
    expect(ctx.calls.fillText.length).toBe(1);
    expect(t).toBe('Halo');
    expect(ctx.strokeStyle).toBe('#10E5A0');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.font).toBe(BUBBLE_TEXT_FONT);
  });
  it('teks digambar di tengah horizontal, y=32', () => {
    const ctx = mockCtx();
    drawBubble(ctx, 'x', '#fff');
    expect(ctx.calls.fillText[0].x).toBe(180);
    expect(ctx.calls.fillText[0].y).toBe(32);
  });
  it('clampText diterapkan pada teks panjang', () => {
    const ctx = mockCtx();
    const t = drawBubble(ctx, 'A'.repeat(50), '#fff', { clampText: clampBubbleText });
    expect(t.length).toBeLessThanOrEqual(33); // 32 + ellipsis
    expect(ctx.calls.fillText[0].t).toBe(t);
  });
  it('tanpa clampText: teks dilewatkan apa adanya', () => {
    const ctx = mockCtx();
    const t = drawBubble(ctx, 'B'.repeat(50), '#fff');
    expect(t).toBe('B'.repeat(50));
  });
});

describe('bubble_canvas — bubbleOpacity lifecycle', () => {
  it('fade-in: 0 di spawn, puncak 1 setelah 0.22s dengan life penuh', () => {
    expect(bubbleOpacity(0, 3.5)).toBe(0);
    expect(bubbleOpacity(0.22, 3.5)).toBeCloseTo(1);
    expect(bubbleOpacity(0.11, 3.5)).toBeCloseTo(0.5);
  });
  it('fade-out: proporsional life/0.5, 0 saat habis', () => {
    expect(bubbleOpacity(1, 0.5)).toBeCloseTo(1);
    expect(bubbleOpacity(1, 0.25)).toBeCloseTo(0.5);
    expect(bubbleOpacity(1, 0)).toBe(0);
    expect(bubbleOpacity(1, -0.1)).toBe(0);
  });
  it('kombinasi: fade-in × fade-out, tidak pernah >1', () => {
    expect(bubbleOpacity(0.1, 0.25)).toBeCloseTo(0.1/0.22 * 0.5);
    for (let age = 0; age <= 3.5; age += 0.35) {
      expect(bubbleOpacity(age, 3.5 - age)).toBeLessThanOrEqual(1);
      expect(bubbleOpacity(age, 3.5 - age)).toBeGreaterThanOrEqual(0);
    }
  });
});
