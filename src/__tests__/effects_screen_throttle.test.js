import { describe, it, expect } from 'vitest';
import { shouldRedrawScreen, SCREEN_REDRAW_EVERY } from '../scene/parts/effects.js';

describe('shouldRedrawScreen', () => {
  it('menggambar tiap frame kelipatan SCREEN_REDRAW_EVERY saja', () => {
    const drawn = [];
    for (let f = 0; f < SCREEN_REDRAW_EVERY * 3; f++) if (shouldRedrawScreen(f)) drawn.push(f);
    expect(drawn).toEqual([0, SCREEN_REDRAW_EVERY, SCREEN_REDRAW_EVERY * 2]);
  });

  it('throttle memangkas kecepatan redraw ≥5× dibanding per-frame', () => {
    expect(SCREEN_REDRAW_EVERY).toBeGreaterThanOrEqual(5);
  });

  it('frame non-numerik tidak digambar (guard)', () => {
    expect(shouldRedrawScreen(undefined)).toBe(false);
    expect(shouldRedrawScreen(NaN)).toBe(false);
  });
});
