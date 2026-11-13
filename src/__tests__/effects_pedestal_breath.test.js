import { describe, it, expect } from 'vitest';
import { pedestalBreath, PEDESTAL_GLOW_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('pedestalBreath (siklus 492)', () => {
  it('guard nilai non-finite → netral tanpa melempar', () => {
    near(pedestalBreath(NaN).glow, 0.75);
    near(pedestalBreath(Infinity).lip, 0.45);
    near(pedestalBreath(undefined).glow, 0.75);
    near(pedestalBreath(undefined).lip, 0.45);
  });

  it('glow bernapas dalam [0.55,0.95] — tak mati total', () => {
    const lo = Math.min(...Array.from({ length: 300 }, (_, i) => pedestalBreath(i * 0.1).glow));
    const hi = Math.max(...Array.from({ length: 300 }, (_, i) => pedestalBreath(i * 0.1).glow));
    expect(lo).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(hi).toBeLessThanOrEqual(0.95 + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.2); // benar-benar bergerak
  });

  it('lip shimmer dalam [0.35,0.55]', () => {
    const vals = Array.from({ length: 200 }, (_, i) => pedestalBreath(i * 0.13).lip);
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.35 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(0.55 + 1e-9);
  });

  it('periodik: glow seam T & lip seam 1.7T (kontinuitas siklus)', () => {
    const T = PEDESTAL_GLOW_SEC;
    [0.3, 1.7, 4.44].forEach((t) => {
      near(pedestalBreath(t).glow, pedestalBreath(t + T).glow); // glow siklus T
      near(pedestalBreath(t).lip, pedestalBreath(t + 1.7 * T).lip); // lip siklus 1.7T
    });
  });

  it('deterministik & rentang jelas', () => {
    near(pedestalBreath(2.5).glow, pedestalBreath(2.5).glow);
    near(pedestalBreath(3.3).lip, pedestalBreath(3.3).lip);
    const p = pedestalBreath(0);
    expect(p.glow).toBeGreaterThan(0); expect(p.lip).toBeGreaterThan(0);
  });
});
