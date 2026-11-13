import { describe, it, expect } from 'vitest';
import { receptionLightBreath, RECEPTION_LIGHT_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('receptionLightBreath (siklus 500)', () => {
  it('guard nilai non-finite → netral (0.89 = 0.74+0.11+0.02·…) tanpa melempar', () => {
    // t=0: main=0.5, micro=0.5 → 0.74+0.11+0.02 = 0.87
    near(receptionLightBreath(NaN), 0.87);
    near(receptionLightBreath(undefined), 0.87);
    expect(Number.isFinite(receptionLightBreath(Infinity))).toBe(true);
  });

  it('bernapas — tak padam total, rentang 0.74…1.0', () => {
    const N = 600;
    const vals = Array.from({ length: N }, (_, i) => receptionLightBreath(i * 0.03));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.74 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.15);
  });

  it('deterministik + periodik: kontinu di seam siklus penuh', () => {
    near(receptionLightBreath(1.3), receptionLightBreath(1.3));
    [0.4, 1.7, 3.1].forEach((t) => {
      // seam gabungan: main (T) & micro (2.2T) — LCM = 11T utk 2.2 exact
      near(receptionLightBreath(t), receptionLightBreath(t + RECEPTION_LIGHT_SEC * 11), 1e-6);
    });
    expect(RECEPTION_LIGHT_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: puncak main eksak, lembah tak padam', () => {
    const p = receptionLightBreath(RECEPTION_LIGHT_SEC / 4);
    near(p, 0.74 + 0.22 + 0.04 * wAt(RECEPTION_LIGHT_SEC / 4, RECEPTION_LIGHT_SEC * 2.2), 1e-9);
    const valley = receptionLightBreath(RECEPTION_LIGHT_SEC * 3 / 4);
    expect(valley).toBeLessThan(0.9);
    expect(valley).toBeGreaterThan(0.74);
  });

  it('mikro-gelombang menambah tekstur: nilai bervariasi di puncak main', () => {
    const a = receptionLightBreath(RECEPTION_LIGHT_SEC / 4);
    const b = receptionLightBreath(RECEPTION_LIGHT_SEC / 4 + RECEPTION_LIGHT_SEC * 2.2 / 2);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.74);
  });

  it('fase tak sinkron vs siklus lain (5.2 / 4.3 / 3.9)', () => {
    expect(RECEPTION_LIGHT_SEC).not.toBeCloseTo(5.2, 1);
    expect(RECEPTION_LIGHT_SEC).not.toBeCloseTo(4.3, 1);
    expect(RECEPTION_LIGHT_SEC).not.toBeCloseTo(3.9, 1);
  });
});

// replika lokal gelombang mikro utk kontrak eksak (sama dgn implementasi)
function wAt(t, sec) {
  return 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
}
