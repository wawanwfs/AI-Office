// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { SCREEN_RENDERERS } from '../scene/parts/effects.js';

// Mock ctx 2D: merekam perintah fillText/fillRect + warna aktif (pola sama dgn tv_canvas.test.js).
function mockCtx() {
  const ops = [];
  let color = null;
  const grd = { addColorStop() {} };
  const c = {
    get fillStyle() { return color; },
    set fillStyle(v) { color = v; ops.push({ op: 'style', v }); },
    font: '', textAlign: '', textBaseline: '',
    createLinearGradient() { return grd; },
    beginPath() {}, arc() {}, fill() {},
    fillRect: (x, y, w, h) => ops.push({ op: 'rect', color, x, y, w, h }),
    fillText: (t, x, y) => ops.push({ op: 'text', color, t, x, y }),
    __ops: ops,
  };
  return c;
}
const texts = (c) => c.__ops.filter((o) => o.op === 'text');
const find = (c, t) => texts(c).find((o) => o.t === t);

describe('SCREEN_RENDERERS.board — guard anti-poisoning data paparan task (__tvData)', () => {
  const prevTvData = (typeof window !== 'undefined' && window.__tvData) || undefined;
  afterEach(() => {
    if (typeof window !== 'undefined') window.__tvData = prevTvData;
  });

  function renderWith(tasks) {
    const c = mockCtx();
    window.__tvData = { tasks };
    SCREEN_RENDERERS.board(c, 256, 144, 0, '#F59E0B');
    return c;
  }

  it('data normal → persen & teks benar (3/10 → 30%)', () => {
    const c = renderWith({ total: 10, done: 3, failed: 0, review: 0 });
    expect(find(c, '30% · 3/10 task')).toBeTruthy();
  });

  it('done NaN → tidak ada "NaN" di teks, lebar bar progres terhingga', () => {
    const c = renderWith({ total: 10, done: NaN });
    expect(texts(c).some((o) => String(o.t).includes('NaN'))).toBe(false);
    const rects = c.__ops.filter((o) => o.op === 'rect');
    expect(rects.every((o) => Number.isFinite(o.w))).toBe(true);
  });

  it('total 0 / NaN → 0%, tanpa NaN di teks', () => {
    const c = renderWith({ total: 0, done: 5 });
    expect(find(c, '0% · 5/0 task')).toBeTruthy();
    const c2 = renderWith({ total: NaN, done: 5 });
    expect(texts(c2).some((o) => String(o.t).includes('NaN'))).toBe(false);
    const c3 = renderWith({ total: 5, done: Infinity });
    expect(texts(c3).some((o) => String(o.t).includes('Infinity'))).toBe(false);
  });

  it('tanpa window.__tvData.tasks → state memuat (bukan error)', () => {
    if (typeof window !== 'undefined') window.__tvData = null;
    const c = mockCtx();
    SCREEN_RENDERERS.board(c, 256, 144, 0, '#F59E0B');
    expect(find(c, 'papan task: memuat...')).toBeTruthy();
  });
});
