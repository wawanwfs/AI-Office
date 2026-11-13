import { describe, it, expect } from 'vitest';
import { downlightBreath, DOWNLIGHT_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('downlightBreath (siklus 497)', () => {
  it('guard nilai non-finite → netral (0.89) tanpa melempar', () => {
    const n = downlightBreath(NaN);
    near(n.l1, 0.89); near(n.l2, 0.89); near(n.l3, 0.89);
    const u = downlightBreath(undefined);
    near(u.l1, 0.89);
    expect(Number.isFinite(downlightBreath(Infinity).l2)).toBe(true);
  });

  it('ketiga lantai bernapas — tak padam total, rentang 0.78…1.0', () => {
    const N = 500;
    const vals = ['l1', 'l2', 'l3'].map((k) =>
      Array.from({ length: N }, (_, i) => downlightBreath(i * 0.04)[k]));
    for (const vs of vals) {
      expect(Math.min(...vs)).toBeGreaterThanOrEqual(0.78 - 1e-9);
      expect(Math.max(...vs)).toBeLessThanOrEqual(1.0 + 1e-9);
      expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(0.1);
    }
  });

  it('fase L1/L2/L3 tak sinkron — tak sama di titik acak', () => {
    let differs = 0;
    for (let i = 0; i < 50; i++) {
      const r = downlightBreath(i * 0.37);
      if (Math.abs(r.l1 - r.l2) > 1e-6 && Math.abs(r.l2 - r.l3) > 1e-6) differs++;
    }
    expect(differs).toBeGreaterThan(40);
  });

  it('deterministik + periodik: kontinu di seam siklus penuh', () => {
    near(downlightBreath(3.7).l1, downlightBreath(3.7).l1);
    [0.2, 1.4, 2.8].forEach((t) => {
      near(downlightBreath(t).l1, downlightBreath(t + DOWNLIGHT_SEC * 3).l1, 1e-6);
      near(downlightBreath(t).l2, downlightBreath(t + DOWNLIGHT_SEC * 1.35 * 3).l2, 1e-6);
      near(downlightBreath(t).l3, downlightBreath(t + DOWNLIGHT_SEC * 0.62 * 3).l3, 1e-6);
    });
    expect(DOWNLIGHT_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: 0.78 + 0.22·w (puncak/lembah eksak)', () => {
    near(downlightBreath(DOWNLIGHT_SEC / 4).l1, 1.0);
    near(downlightBreath(DOWNLIGHT_SEC / 4 + DOWNLIGHT_SEC / 2).l1, 0.78);
    const p2 = DOWNLIGHT_SEC * 1.35 / 4;
    near(downlightBreath(p2).l2, 1.0);
    near(downlightBreath(p2 + DOWNLIGHT_SEC * 1.35 / 2).l2, 0.78);
    const p3 = DOWNLIGHT_SEC * 0.62 / 4;
    near(downlightBreath(p3).l3, 1.0);
    near(downlightBreath(p3 + DOWNLIGHT_SEC * 0.62 / 2).l3, 0.78);
  });
});
