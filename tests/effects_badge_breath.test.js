import { describe, it, expect } from 'vitest';
import { badgeBreath, BADGE_BREATH_SEC, BADGE_STAGGER_SEC } from '../src/scene/parts/effects.js';

describe('badgeBreath (siklus 507)', () => {
  it('guard non-finite netral (sin 0 → 0.5)', () => {
    expect(badgeBreath(NaN)).toBeCloseTo(0.82 + 0.15 * 0.5 + 0.03 * 0.5, 10);
    expect(badgeBreath(undefined)).toBeCloseTo(0.91, 10);
    expect(badgeBreath(0, NaN)).toBe(badgeBreath(0, 0));
  });

  it('rentang 0.82…1.0 + tak pernah padam', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t <= 80; t += 0.01) {
      const v = badgeBreath(t, 1);
      mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    expect(mn).toBeGreaterThanOrEqual(0.8199);
    expect(mx).toBeLessThanOrEqual(1.0001);
  });

  it('kontrak puncak/lembah eksak via rumus w (stagger i)', () => {
    const w = (t, sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
    for (const i of [0, 1, 2]) {
      const elapsed = BADGE_BREATH_SEC / 4 - i * BADGE_STAGGER_SEC; // tt = sec/4
      const tt = elapsed + i * BADGE_STAGGER_SEC;
      const microP = w(tt, BADGE_BREATH_SEC * 2.53);
      expect(badgeBreath(elapsed, i)).toBeCloseTo(0.82 + 0.15 + 0.03 * microP, 10);
    }
  });

  it('deterministik + stagger memindahkan fase (2.53 = 253/100, 253 prima)', () => {
    const L = BADGE_BREATH_SEC * 253;
    for (const t of [0.7, 2.1, 5.5]) {
      expect(badgeBreath(t, 2)).toBeCloseTo(badgeBreath(t + L, 2), 10);
      expect(badgeBreath(t, 2)).toEqual(badgeBreath(t, 2));
    }
    // fase berbeda antar plakat: selisih bukan kelipatan penuh 2.7 dtk
    expect(badgeBreath(0.3, 0)).not.toBeCloseTo(badgeBreath(0.3, 1), 6);
  });

  it('fase tak sinkron vs 10 siklus lain (lampu + kafe + rack)', () => {
    const secs = [5.2, 4.3, 3.9, 3.6, 5.6, 4.7, 6.1, 2.9, 3.3, 3.1];
    for (const s of secs) {
      const ratio = BADGE_BREATH_SEC / s;
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.05);
    }
  });
});
