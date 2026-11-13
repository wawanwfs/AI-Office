import { describe, it, expect } from 'vitest';
import { wallLogoBreath, LOGO_BULB_SEC, LOGO_GLOW_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('wallLogoBreath (siklus 496)', () => {
  it('guard nilai non-finite → netral tanpa melempar', () => {
    const n = wallLogoBreath(NaN);
    near(n.bulb, 0.86);   // nilai tengah rentang
    near(n.glow, 0.8);
    const u = wallLogoBreath(undefined);
    near(u.bulb, 0.86);
    near(u.glow, 0.8);
    expect(Number.isFinite(wallLogoBreath(Infinity).bulb)).toBe(true);
  });

  it('bulb & glow bernapas — tak mati total, rentang aman', () => {
    const N = 400;
    const bs = Array.from({ length: N }, (_, i) => wallLogoBreath(i * 0.05).bulb);
    const gs = Array.from({ length: N }, (_, i) => wallLogoBreath(i * 0.05).glow);
    expect(Math.min(...bs)).toBeGreaterThanOrEqual(0.72 - 1e-9);
    expect(Math.max(...bs)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...bs) - Math.min(...bs)).toBeGreaterThan(0.1);
    expect(Math.min(...gs)).toBeGreaterThanOrEqual(0.6 - 1e-9); // logo tak padam
    expect(Math.max(...gs)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...gs) - Math.min(...gs)).toBeGreaterThan(0.2);
  });

  it('deterministik: elapsed sama → hasil identik', () => {
    near(wallLogoBreath(2.1).bulb, wallLogoBreath(2.1).bulb);
    near(wallLogoBreath(5.3).glow, wallLogoBreath(5.3).glow);
  });

  it('periodik: kontinu di seam satu siklus penuh', () => {
    [0.3, 1.1, 2.9].forEach((t) => {
      near(wallLogoBreath(t).bulb, wallLogoBreath(t + LOGO_BULB_SEC * 4).bulb, 1e-6);
      near(wallLogoBreath(t).glow, wallLogoBreath(t + LOGO_GLOW_SEC * 4).glow, 1e-6);
    });
    expect(LOGO_BULB_SEC).toBeGreaterThan(0);
    expect(LOGO_GLOW_SEC).toBeGreaterThan(0);
    // rasio tak sinkron dgn lampu lounge (5.2) & siklus lain
    expect(LOGO_BULB_SEC).not.toBe(LOGO_GLOW_SEC);
  });

  it('konstanta kontrak: 0.72 + 0.28·w dan 0.6 + 0.4·w', () => {
    const bPeak = LOGO_BULB_SEC / 4;
    near(wallLogoBreath(bPeak).bulb, 1.0);
    near(wallLogoBreath(bPeak + LOGO_BULB_SEC / 2).bulb, 0.72);
    const gPeak = LOGO_GLOW_SEC / 4;
    near(wallLogoBreath(gPeak).glow, 1.0);
    near(wallLogoBreath(gPeak + LOGO_GLOW_SEC / 2).glow, 0.6);
  });
});
