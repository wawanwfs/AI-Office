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

describe('shouldUpdateLeds + ledOpacity', () => {
  it('LED di-update tiap kelipatan LED_UPDATE_EVERY saja', async () => {
    const { shouldUpdateLeds, LED_UPDATE_EVERY } = await import('../scene/parts/effects.js');
    const on = [];
    for (let f = 0; f < LED_UPDATE_EVERY * 3; f++) if (shouldUpdateLeds(f)) on.push(f);
    expect(on).toEqual([0, LED_UPDATE_EVERY, LED_UPDATE_EVERY * 2]);
    expect(shouldUpdateLeds(undefined)).toBe(false);
  });

  it('ledOpacity: biner 1 / 0.12 sesuai ambang, guard input jelek → 0', async () => {
    const { ledOpacity } = await import('../scene/parts/effects.js');
    const L = { sp: 2, ph: 0, on: 0.5 };
    expect(ledOpacity(L, Math.PI / 4)).toBe(1);      // sin(0.5π)=1 > 0.5
    expect(ledOpacity(L, 0)).toBe(0.12);             // sin(0)=0 ≤ 0.5
    expect(ledOpacity(null, 1)).toBe(0);
    expect(ledOpacity(L, NaN)).toBe(0);
    expect(ledOpacity({ sp: 'x', ph: 0, on: 0.3 }, 1)).toBe(0);
  });

  it('ledOpacity periodik: nilai pada t dan t+2π identik', async () => {
    const { ledOpacity } = await import('../scene/parts/effects.js');
    const L = { sp: 3, ph: 1.1, on: 0.4 };
    for (const t of [0.3, 1.7, 4.2]) expect(ledOpacity(L, t)).toBe(ledOpacity(L, t + 2 * Math.PI));
  });
});
