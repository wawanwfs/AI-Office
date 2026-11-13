import { describe, it, expect } from 'vitest';
import { tubeLightBreath, TUBE_LIGHT_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('tubeLightBreath (siklus 502)', () => {
  it('guard nilai non-finite → netral 0.775 tanpa melempar', () => {
    // t=0: main=0.5, micro=0.5 → 0.55+0.19+0.035 = 0.775
    near(tubeLightBreath(NaN), 0.775);
    near(tubeLightBreath(undefined), 0.775);
    expect(Number.isFinite(tubeLightBreath(Infinity))).toBe(true);
  });

  it('bernapas — tak padam total, rentang 0.55…1.0', () => {
    const N = 600;
    const vals = Array.from({ length: N }, (_, i) => tubeLightBreath(i * 0.03));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.3);
  });

  it('deterministik + periodik: kontinu di seam LCM 233T (2.33 exact)', () => {
    near(tubeLightBreath(1.3), tubeLightBreath(1.3));
    [0.4, 1.7, 3.1].forEach((t) => {
      near(tubeLightBreath(t), tubeLightBreath(t + TUBE_LIGHT_SEC * 233), 1e-6);
    });
    expect(TUBE_LIGHT_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: puncak main eksak, lembah di bawah 0.9 tapi tak padam', () => {
    const p = tubeLightBreath(TUBE_LIGHT_SEC / 4);
    near(p, 0.55 + 0.38 + 0.07 * wAt(TUBE_LIGHT_SEC / 4, TUBE_LIGHT_SEC * 2.33), 1e-9);
    const valley = tubeLightBreath(TUBE_LIGHT_SEC * 3 / 4);
    expect(valley).toBeLessThan(0.9);
    expect(valley).toBeGreaterThan(0.55);
  });

  it('fase tak sinkron vs lampu lounge 5.2 / floor 4.3 / reception 3.6', () => {
    for (const sec of [5.2, 4.3, 3.9, 3.6]) {
      expect(Math.abs(TUBE_LIGHT_SEC - sec) / sec).toBeGreaterThan(0.04);
    }
  });

  it('mikro-gelombang menambah tekstur di puncak main', () => {
    const a = tubeLightBreath(TUBE_LIGHT_SEC / 4);
    const b = tubeLightBreath(TUBE_LIGHT_SEC / 4 + TUBE_LIGHT_SEC * 2.33 / 2);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.55);
  });
});

function wAt(t, sec) {
  return 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
}
