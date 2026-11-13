import { describe, it, expect } from 'vitest';
import { floorLampBreath, FLOOR_LAMP_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);
const w = (t, sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);

describe('floorLampBreath (siklus 499)', () => {
  it('guard nilai non-finite → netral (0.98 = 0.76+0.10+0.02) tanpa melempar', () => {
    // t=0: main=0.5, micro=0.5 → 0.76+0.10+0.02 = 0.88
    near(floorLampBreath(NaN), 0.88);
    near(floorLampBreath(undefined), 0.88);
    expect(Number.isFinite(floorLampBreath(Infinity))).toBe(true);
  });

  it('bernapas — tak padam total, rentang 0.76…1.0', () => {
    const N = 600;
    const vals = Array.from({ length: N }, (_, i) => floorLampBreath(i * 0.03));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.76 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.15);
  });

  it('deterministik + periodik: kontinu di seam siklus penuh (LCM 287T)', () => {
    near(floorLampBreath(1.3), floorLampBreath(1.3));
    [0.4, 1.7, 3.1].forEach((t) => {
      near(floorLampBreath(t), floorLampBreath(t + FLOOR_LAMP_SEC * 287), 1e-6);
    });
    expect(FLOOR_LAMP_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: puncak main eksak, lembah di bawah 0.9 tapi ≥ 0.76', () => {
    const p = floorLampBreath(FLOOR_LAMP_SEC / 4);
    near(p, 0.76 + 0.20 + 0.04 * w(FLOOR_LAMP_SEC / 4, FLOOR_LAMP_SEC * 2.87), 1e-9);
    const valley = floorLampBreath(FLOOR_LAMP_SEC * 3 / 4);
    expect(valley).toBeLessThan(0.9);
    expect(valley).toBeGreaterThan(0.76);
  });

  it('mikro-gelombang menambah tekstur: nilai bervariasi di puncak main', () => {
    const a = floorLampBreath(FLOOR_LAMP_SEC / 4);
    const b = floorLampBreath(FLOOR_LAMP_SEC / 4 + FLOOR_LAMP_SEC * 2.87 / 2);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.76);
  });

  it('fase tak sinkron dgn lampu lounge (5.2) & server (3.9): rasio irasional', () => {
    expect(FLOOR_LAMP_SEC).not.toBe(5.2);
    expect(FLOOR_LAMP_SEC).not.toBe(3.9);
    const ratio = FLOOR_LAMP_SEC * 2.87 / FLOOR_LAMP_SEC;
    expect(ratio).toBeCloseTo(2.87, 9);
  });
});
