import { describe, it, expect } from 'vitest';
import { receptionGlow, RC_GLOW_SEC, RC_SCREEN_SEC } from '../scene/parts/effects.js';

const near = (a, b, eps = 1e-9) => expect(a).toBeCloseTo(b, 12);

describe('receptionGlow (siklus 494)', () => {
  it('guard nilai non-finite → netral tanpa melempar', () => {
    const n = receptionGlow(NaN);
    near(n.glow, 0.775);  // nilai tengah rentang
    near(n.screen, 0.91);
    const u = receptionGlow(undefined);
    near(u.glow, 0.775);
    near(u.screen, 0.91);
    expect(Number.isFinite(receptionGlow(Infinity).glow)).toBe(true);
  });

  it('glow & screen bernapas — tak mati total, rentang aman', () => {
    const N = 400;
    const gs = Array.from({ length: N }, (_, i) => receptionGlow(i * 0.05).glow);
    const ss = Array.from({ length: N }, (_, i) => receptionGlow(i * 0.05).screen);
    expect(Math.min(...gs)).toBeGreaterThanOrEqual(0.55 - 1e-9); // strip tak padam
    expect(Math.max(...gs)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...gs) - Math.min(...gs)).toBeGreaterThan(0.2); // benar-benar bergerak
    expect(Math.min(...ss)).toBeGreaterThanOrEqual(0.82 - 1e-9);
    expect(Math.max(...ss)).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(Math.max(...ss) - Math.min(...ss)).toBeGreaterThan(0.1);
  });

  it('deterministik: elapsed sama → hasil identik', () => {
    near(receptionGlow(1.7).glow, receptionGlow(1.7).glow);
    near(receptionGlow(4.4).screen, receptionGlow(4.4).screen);
  });

  it('periodik: kontinu di seam satu siklus penuh', () => {
    const P = RC_GLOW_SEC * RC_SCREEN_SEC; // LCM bilangan rasional via product sampling
    [0.3, 1.1, 2.9].forEach((t) => {
      near(receptionGlow(t).glow, receptionGlow(t + RC_GLOW_SEC * 4).glow, 1e-6);
      near(receptionGlow(t).screen, receptionGlow(t + RC_SCREEN_SEC * 4).screen, 1e-6);
    });
    expect(RC_GLOW_SEC).toBeGreaterThan(0);
    expect(RC_SCREEN_SEC).toBeGreaterThan(0);
  });

  it('konstanta kontrak: 0.55 + 0.45·w dan 0.82 + 0.18·w', () => {
    // puncak & lembah eksak sesuai formula
    const tPeak = RC_GLOW_SEC / 4; // sin=1
    near(receptionGlow(tPeak).glow, 1.0);
    near(receptionGlow(tPeak + RC_GLOW_SEC / 2).glow, 0.55);
    const sPeak = RC_SCREEN_SEC / 4;
    near(receptionGlow(sPeak).screen, 1.0);
    near(receptionGlow(sPeak + RC_SCREEN_SEC / 2).screen, 0.82);
  });
});
