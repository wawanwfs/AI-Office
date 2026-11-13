import { describe, it, expect } from 'vitest';
import { LED_UPDATE_SEC, CLOCK_REDRAW_SEC, ledTimeGate, clockTimeGate } from '../scene/parts/effects.js';

describe('gate waktu LED & jam dinding (siklus 482)', () => {
  it('LED gate: paritas ~20 tick/s @60FPS (SEC = 3/60)', () => {
    expect(LED_UPDATE_SEC).toBeCloseTo(3 / 60, 6);
    // @60FPS (dt 1/60): tick tiap ~3 frame
    const g = ledTimeGate();
    const on = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) on.push(f);
    expect(on.length).toBeGreaterThanOrEqual(18);
    expect(on.length).toBeLessThanOrEqual(21);
  });

  it('LED gate @5FPS: tetap ON tiap frame (nilai segar, tak beku)', () => {
    const g = ledTimeGate();
    const on = [];
    for (let f = 0; f < 10; f++) if (g(f * 0.2)) on.push(f);
    expect(on.length).toBe(9); // semua frame kecuali awal
  });

  it('CLOCK gate: paritas ~3 tick/s @60FPS (SEC = 20/60)', () => {
    expect(CLOCK_REDRAW_SEC).toBeCloseTo(20 / 60, 6);
    const g = clockTimeGate();
    const on = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) on.push(f);
    expect(on.length).toBeGreaterThanOrEqual(2);
    expect(on.length).toBeLessThanOrEqual(4);
  });

  it('CLOCK gate @1FPS: jam tetap digambar tiap frame yang ada (tak beku 20 dtk)', () => {
    const g = clockTimeGate();
    const on = [];
    for (let f = 0; f < 5; f++) if (g(f * 1)) on.push(f);
    expect(on).toEqual([1, 2, 3, 4]);
  });

  it('guard input non-numerik → false, state tak rusak', () => {
    const g = ledTimeGate();
    expect(g(NaN)).toBe(false);
    expect(g(undefined)).toBe(false);
    expect(g(0)).toBe(false);   // mulai
    expect(g(0.05)).toBe(true); // lanjut normal
  });
});
