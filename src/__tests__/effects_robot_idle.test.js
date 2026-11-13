// Siklus 491 — robotIdle: idle hidup robot BANTUIN AI (murni, kontrak waktu-nyata).
import { describe, it, expect } from 'vitest';
import { robotIdle, ROBOT_BLINK_SEC, ROBOT_BLINK_DUR, ROBOT_SCAN_SEC } from '../scene/parts/effects.js';

describe('siklus 491 — robotIdle (robot BANTUIN AI hidup)', () => {
  it('guard: elapsed non-finite → hasil aman (bukan NaN)', () => {
    [NaN, undefined, 'x', null].forEach((bad) => {
      const r = robotIdle(bad);
      expect(r.eyeScaleY).toBeGreaterThan(0);
      expect(r.chest.every((v) => Number.isFinite(v))).toBe(true);
      expect(Number.isFinite(r.status)).toBe(true);
      expect(Number.isFinite(r.antenna)).toBe(true);
    });
  });

  it('mata: terbuka penuh hampir selalu, menutup >88% hanya di jendela kedip', () => {
    let maxClosed = 0;
    for (let t = 0; t < 20; t += 0.005) maxClosed = Math.max(maxClosed, 1 - robotIdle(t).eyeScaleY);
    expect(maxClosed).toBeGreaterThan(0.85); // kedip benar-benar terjadi
    // di luar jendela kedip mata penuh
    const mid = robotIdle(ROBOT_BLINK_SEC / 2);
    expect(mid.eyeScaleY).toBeCloseTo(1, 5);
    // jendela kedip tepat di ujung siklus
    const atBlink = robotIdle(ROBOT_BLINK_SEC - ROBOT_BLINK_DUR / 2);
    expect(atBlink.eyeScaleY).toBeLessThan(0.6);
  });

  it('panel dada: sapuan bergerak — bar lain beda intensitas, dasar ≥0.38', () => {
    const a = robotIdle(0.2), b = robotIdle(0.7);
    expect(a.chest.some((v, i) => Math.abs(v - b.chest[i]) > 0.1)).toBe(true);
    robotIdle(1.0).chest.forEach((v) => expect(v).toBeGreaterThanOrEqual(0.37));
    expect(robotIdle(1.0).chest.every((v) => v <= 1)).toBe(true);
  });

  it('lampu status & antena: osilasi berpusat, tak pernah mati total', () => {
    let sMin = 1, sMax = 0, aMin = 1, aMax = 0;
    for (let t = 0; t < 10; t += 0.02) {
      const r = robotIdle(t);
      sMin = Math.min(sMin, r.status); sMax = Math.max(sMax, r.status);
      aMin = Math.min(aMin, r.antenna); aMax = Math.max(aMax, r.antenna);
    }
    expect(sMin).toBeGreaterThan(0.3); expect(sMax).toBeCloseTo(1, 1);
    expect(aMin).toBeGreaterThan(0.13); expect(aMax).toBeLessThan(0.35);
  });

  it('deterministik & kontinu di seam siklus kedip', () => {
    expect(robotIdle(3.1)).toEqual(robotIdle(3.1));
    const seam = 0.002;
    expect(Math.abs(robotIdle(ROBOT_BLINK_SEC * 3 + seam).eyeScaleY - robotIdle(seam).eyeScaleY)).toBeLessThan(0.05);
  });
});
