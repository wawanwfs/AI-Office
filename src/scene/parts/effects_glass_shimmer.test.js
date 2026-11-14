import { describe, it, expect } from 'vitest';
import { glassShimmer, GLASS_SHIMMER_SEC, GLASS_SHIMMER_MICRO } from './effects.js';

describe('glassShimmer (siklus 520)', () => {
  it('guard non-finite → netral (1, opasitas basis tak berubah)', () => {
    expect(glassShimmer('x')).toBe(1);
    expect(glassShimmer(NaN)).toBe(1);
    expect(glassShimmer(Infinity)).toBe(1);
    expect(glassShimmer(1, 'x')).toBe(1);
    expect(glassShimmer(NaN, 2)).toBe(1);
  });

  it('hasil × basis 0.18 tetap dalam rentang 0.10…0.26 (margin) & tak padam', () => {
    for (let t = 0; t < 60; t += 0.13) {
      for (let i = 0; i < 3; i++) {
        const o = 0.18 * glassShimmer(t, i);
        expect(o).toBeGreaterThan(0.09);
        expect(o).toBeLessThan(0.27);
      }
    }
  });

  it('kontrak puncak/lembah eksak via rumus', () => {
    const twoPi = Math.PI * 2;
    // puncak: sin & cos = 1 → w = 0.5+0.5*1 = 1 → mult = 0.13/0.18 + 0.10/0.18*1
    const tPeak = GLASS_SHIMMER_SEC * 0.25; // sin(2π·t/T)=1 di t=T/4
    const phase = (Math.sin(0 * 43758.5453) * 0.5 + 0.5) * twoPi; // i=0 → hash 0.5
    expect(phase).toBeCloseTo(twoPi / 2, 12);
    // cari t yang membuat sin-utama + fase tepat 1: t = T*(0.25 - phase/twoPi)
    const tSin1 = GLASS_SHIMMER_SEC * (0.25 - phase / twoPi);
    expect(Math.sin((tSin1 / GLASS_SHIMMER_SEC) * twoPi + phase)).toBeCloseTo(1, 10);
    const wPeak = 0.5 + 0.5 * Math.sin((tSin1 / GLASS_SHIMMER_SEC) * twoPi + phase)
                       * Math.cos((tSin1 / GLASS_SHIMMER_MICRO) * twoPi + phase * 0.7);
    const mult = 0.13 / 0.18 + (0.10 / 0.18) * (0.5 + 0.5 * wPeak);
    expect(glassShimmer(tSin1, 0)).toBeCloseTo(mult, 7);
    // deterministik
    expect(glassShimmer(tSin1, 0)).toBe(glassShimmer(tSin1, 0));
  });

  it('fase antar panel berbeda (tak sinkron) — scan pasangan', () => {
    let differ = 0;
    for (let t = 0; t < GLASS_SHIMMER_SEC * 3; t += 0.21) {
      if (glassShimmer(t, 0) !== glassShimmer(t, 1)) differ++;
      if (glassShimmer(t, 1) !== glassShimmer(t, 2)) differ++;
    }
    expect(differ).toBeGreaterThan(20);
  });

  it('tak sinkron vs siklus lampu lantai (floorLampBreath 3.0 dtk banding lintas 2 slot)', () => {
    // keberadaan rasio 5.1/2.3 menjamin pola tak periodik terhadap 3.0 dtk:
    const t = 7.77;
    expect(glassShimmer(t, 1)).not.toBe(glassShimmer(t + 3.0, 1));
    expect(glassShimmer(t, 2)).not.toBe(glassShimmer(t + 3.0, 2));
  });
});
