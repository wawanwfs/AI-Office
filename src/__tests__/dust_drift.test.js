import { describe, it, expect } from 'vitest';
import { DUST_UPDATE_EVERY, shouldUpdateDust, dustY } from '../scene/parts/effects.js';

describe('dust drift throttle', () => {
  it('DUST_UPDATE_EVERY = 3 (~20×/dtk @60fps)', () => {
    expect(DUST_UPDATE_EVERY).toBe(3);
  });

  it('shouldUpdateDust: kelipatan 3 saja', () => {
    for (let f = 0; f < 60; f++) expect(shouldUpdateDust(f)).toBe(f % 3 === 0);
  });

  it('shouldUpdateDust: custom every + guard non-numerik', () => {
    expect(shouldUpdateDust(10, 5)).toBe(true);
    expect(shouldUpdateDust(11, 5)).toBe(false);
    expect(shouldUpdateDust(NaN)).toBe(false);
    expect(shouldUpdateDust(undefined)).toBe(false);
  });

  it('dustY: naik per langkah, respawn >3.6 → 0.5', () => {
    const y1 = dustY(1, 2, 0, 0);           // cos(0)=1 → naik .0003
    expect(y1).toBeCloseTo(2.0003, 7);
    expect(dustY(1, 3.7, 0, 0)).toBe(0.5);  // di atas batas → respawn
    // guard non-numerik
    expect(dustY(NaN, 2, 0, 0)).toBe(0.5);
    expect(dustY(1, NaN, 0, 0)).toBe(0.5);
    expect(dustY(1, 2, undefined, 0)).toBe(0.5);
    expect(dustY(1, 2, 0, 'x')).toBe(0.5);
  });

  it('dustY: pergeseran sebanding cos(elapsed*.4 + i*.5) — periodik 2π', () => {
    const d = (y, e, i) => dustY(1, y, e, i) - y;
    expect(d(2, 0, 0)).toBeCloseTo(.0003, 7);
    expect(d(2, 2 * Math.PI / .4, 0)).toBeCloseTo(d(2, 0, 0), 9); // fase sama
    expect(d(2, Math.PI / .4, 0)).toBeCloseTo(-.0003, 7);         // cos(π) = -1
  });
});
