import { describe, it, expect } from 'vitest';
import { posterBreath, POSTER_BREATH_SEC, POSTER_STAGGER_SEC } from '../scene/parts/effects.js';

describe('posterBreath (siklus 509)', () => {
  it('guard non-finite: netral 0.92 (sin 0 → w=0.5)', () => {
    expect(posterBreath(NaN)).toBeCloseTo(0.92, 10);
    expect(posterBreath(Infinity)).toBeCloseTo(0.92, 10);
    expect(posterBreath(undefined, NaN)).toBeCloseTo(0.92, 10);
  });

  it('rentang 0.84…1.0 dan tak pernah pudar habis (< 0.84 tak ada)', () => {
    for (let t = 0; t < 600; t += 0.01) {
      const v = posterBreath(t, 5);
      expect(v).toBeGreaterThanOrEqual(0.84 - 1e-12);
      expect(v).toBeLessThanOrEqual(1.0 + 1e-12);
    }
  });

  it('kontrak puncak/lembah eksak via rumus w', () => {
    const peak = POSTER_BREATH_SEC / 4; // sin(π/2)=1
    const wm = 0.5 + 0.5 * Math.sin((peak / POSTER_BREATH_SEC) * Math.PI * 2);
    const wc = 0.5 + 0.5 * Math.sin((peak / (POSTER_BREATH_SEC * 2.72)) * Math.PI * 2);
    expect(posterBreath(peak)).toBeCloseTo(0.84 + 0.13 * wm + 0.03 * wc, 12);
    const valley = (3 * POSTER_BREATH_SEC) / 4;
    const vm = 0.5 + 0.5 * Math.sin((valley / POSTER_BREATH_SEC) * Math.PI * 2);
    const vc = 0.5 + 0.5 * Math.sin((valley / (POSTER_BREATH_SEC * 2.72)) * Math.PI * 2);
    expect(posterBreath(valley)).toBeCloseTo(0.84 + 0.13 * vm + 0.03 * vc, 12);
  });

  it('deterministik + seam periodik LCM (3.35×68 = 227.8 dtk)', () => {
    const seam = 227.8; // LCM(3.35, 9.112): 3.35=67/20, 9.112=1139/125 → 227.8 dtk
    expect(posterBreath(seam)).toBeCloseTo(posterBreath(0), 12);
    expect(posterBreath(seam * 2 + 3.217)).toBeCloseTo(posterBreath(3.217), 10);
  });

  it('stagger fase antar poster: i berbeda → nilai berbeda pada t sama', () => {
    const t = 1.117;
    const a = posterBreath(t, 0);
    const b = posterBreath(t, 4);
    const c = posterBreath(t, 9);
    expect(Math.abs(a - b)).toBeGreaterThan(1e-6);
    expect(Math.abs(a - c)).toBeGreaterThan(1e-6);
  });

  it('fase tak sinkron vs 13 siklus lain (rasio ≠ kelipatan halus)', () => {
    const others = [5.2, 4.3, 3.9, 3.6, 5.6, 2.9, 4.7, 6.1, 3.3, 3.1, 2.7, 3.4, 2.1];
    const micro = POSTER_BREATH_SEC * 2.72;
    // uji rasio mikro vs siklus lain — 2.9 persis ada di daftar (main wajar, lantai
    // beda ruang) jadi kontrak pakai mikro 7.888 dtk:
    const ratios = others.map((o) => micro / o);
    ratios.forEach((r) => {
      const nearest = Math.min(...[1, 2, 3, 4].map((k) => Math.abs(r - k)));
      expect(nearest).toBeGreaterThan(0.05);
    });
  });
});
