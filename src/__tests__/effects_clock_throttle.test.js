import { describe, it, expect } from 'vitest';
import { CLOCK_REDRAW_EVERY, shouldRedrawClock } from '../scene/parts/effects.js';

describe('throttle redraw jam dinding', () => {
  it('default = 20 frame (~3x/dtk @60fps)', () => {
    expect(CLOCK_REDRAW_EVERY).toBe(20);
  });
  it('hanya kelipatan every yang redraw', () => {
    expect(shouldRedrawClock(0)).toBe(true);
    expect(shouldRedrawClock(20)).toBe(true);
    expect(shouldRedrawClock(40)).toBe(true);
    expect(shouldRedrawClock(1)).toBe(false);
    expect(shouldRedrawClock(19)).toBe(false);
    expect(shouldRedrawClock(21)).toBe(false);
  });
  it('every kustom dihormati', () => {
    expect(shouldRedrawClock(9, 9)).toBe(true);
    expect(shouldRedrawClock(8, 9)).toBe(false);
  });
  it('guard input non-numerik → false', () => {
    expect(shouldRedrawClock(undefined)).toBe(false);
    expect(shouldRedrawClock(NaN)).toBe(false);
    expect(shouldRedrawClock('20')).toBe(false);
  });
  it('throttle ≥ 20x lebih hemat daripada tiap frame', () => {
    let ticks = 0;
    for (let f = 1; f <= 60; f++) if (shouldRedrawClock(f)) ticks++;
    expect(ticks).toBe(3);
    expect(60 / ticks).toBeGreaterThanOrEqual(20);
  });
});
