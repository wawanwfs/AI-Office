import { describe, it, expect } from 'vitest';
import { lampFlicker, LAMP_FLICKER_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('lampFlicker (siklus 493)', () => {
  it('guard nilai non-finite → netral tanpa melempar', () => {
    const n = lampFlicker(NaN);
    near(n.intensity, 0.89); // nilai tengah rentang
    near(n.shade, 0.76);
    const u = lampFlicker(undefined);
    near(u.intensity, 0.89);
    near(u.shade, 0.76);
    expect(Number.isFinite(lampFlicker(Infinity).intensity)).toBe(true);
  });

  it('intensity & shade bernapas — tak mati total, rentang aman', () => {
    const N = 400;
    const ints = Array.from({ length: N }, (_, i) => lampFlicker(i * 0.05).intensity);
    const shs = Array.from({ length: N }, (_, i) => lampFlicker(i * 0.05).shade);
    expect(Math.max(...ints)).toBeLessThanOrEqual(1.1 + 1e-9); // jitter ≤ ~1.09
    expect(Math.min(...ints)).toBeGreaterThanOrEqual(0.6);     // tak padam total
    expect(Math.max(...ints) - Math.min(...ints)).toBeGreaterThan(0.15); // benar-benar bergerak
    expect(Math.min(...shs)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...shs)).toBeLessThanOrEqual(1.0);
    expect(Math.max(...shs) - Math.min(...shs)).toBeGreaterThan(0.2);
  });

  it('deterministik: elapsed sama → hasil identik', () => {
    near(lampFlicker(2.7).intensity, lampFlicker(2.7).intensity);
    near(lampFlicker(4.1).shade, lampFlicker(4.1).shade);
  });

  it('periodik: shade (tanpa jitter) kontinu di seam LCM(main, micro)', () => {
    const T = LAMP_FLICKER_SEC;
    const LCM = T * 19; // rasio periode main:micro = 30:19 → LCM = 19T (=30 micro)
    [0.4, 2.2, 5.1].forEach((t) => {
      near(lampFlicker(t).shade, lampFlicker(t + LCM).shade, 1e-6);
    });
  });

  it('jitter intensity kecil (nuansa filamen, bukan metronom) & bounded', () => {
    // beda intensity dgn formula tanpa jitter (shade mengikuti main+micro) ≤ 0.03+eps
    const t = 3.14;
    const lf = lampFlicker(t);
    const base = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(t / LAMP_FLICKER_SEC * Math.PI * 2))
      + 0.06 * (0.5 + 0.5 * Math.sin(t / (LAMP_FLICKER_SEC * 1.9 / 3) * Math.PI * 2) - 0.5) - 0.03;
    expect(Math.abs(lf.intensity - base)).toBeLessThanOrEqual(0.03 + 1e-9);
  });

  it('struktur rusak / input aneh tidak melempar', () => {
    expect(() => lampFlicker('x')).not.toThrow();
    expect(() => lampFlicker(null)).not.toThrow();
    expect(Number.isFinite(lampFlicker(null).shade)).toBe(true);
  });
});
