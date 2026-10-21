import { describe, it, expect } from 'vitest';
import { shouldRedrawScreenAt, SCREEN_REDRAW_EVERY } from '../scene/parts/effects.js';

describe('shouldRedrawScreenAt (stagger layar monitor)', () => {
  it('tiap layar digambar tepat sekali per periode, fase = index mod every', () => {
    const N = 14;
    const draws = Array(N).fill(0);
    for (let f = 0; f < SCREEN_REDRAW_EVERY * 2; f++)
      for (let i = 0; i < N; i++) if (shouldRedrawScreenAt(f, i)) draws[i]++;
    expect(draws).toEqual(Array(N).fill(2));
  });

  it('beban menyebar: per frame maksimal ceil(N/every) layar, bukan semua sekaligus', () => {
    const N = 14;
    let maxPerFrame = 0;
    for (let f = 0; f < SCREEN_REDRAW_EVERY * 2; f++) {
      let n = 0;
      for (let i = 0; i < N; i++) if (shouldRedrawScreenAt(f, i)) n++;
      maxPerFrame = Math.max(maxPerFrame, n);
    }
    expect(maxPerFrame).toBe(Math.ceil(N / SCREEN_REDRAW_EVERY));
    expect(maxPerFrame).toBeLessThan(N);
  });

  it('indeks negatif & > every tetap konsisten (wrap), guard non-numerik', () => {
    for (let f = 0; f < SCREEN_REDRAW_EVERY; f++) {
      expect(shouldRedrawScreenAt(f, -1)).toBe(shouldRedrawScreenAt(f, SCREEN_REDRAW_EVERY - 1));
      expect(shouldRedrawScreenAt(f, 2 * SCREEN_REDRAW_EVERY + 3)).toBe(shouldRedrawScreenAt(f, 3));
    }
    expect(shouldRedrawScreenAt(0, NaN)).toBe(false);
    expect(shouldRedrawScreenAt(NaN, 0)).toBe(false);
    expect(shouldRedrawScreenAt(undefined, 1)).toBe(false);
  });
});
