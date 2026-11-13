import { describe, it, expect } from 'vitest';
import { AMBIENT_SEC, BUBBLE_SEC, ambientTimeGate, bubbleTimeGate } from '../scene/parts/effects.js';

describe('gate waktu ambient & bubble (siklus 485)', () => {
  it('AMBIENT gate: paritas ~20 tick/s @60FPS (SEC = 3/60)', () => {
    expect(AMBIENT_SEC).toBeCloseTo(3 / 60, 6);
    const g = ambientTimeGate();
    const on = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) on.push(f);
    expect(on.length).toBeGreaterThanOrEqual(18);
    expect(on.length).toBeLessThanOrEqual(21);
  });

  it('AMBIENT gate @5FPS: ambient tetap segar tiap frame (tak beku 2–13 dtk)', () => {
    const g = ambientTimeGate();
    const on = [];
    for (let f = 0; f < 10; f++) if (g(f * 0.2)) on.push(f);
    expect(on.length).toBe(9); // semua frame kecuali awal
  });

  it('BUBBLE gate: paritas ~20 tick/s @60FPS (SEC = 3/60)', () => {
    expect(BUBBLE_SEC).toBeCloseTo(3 / 60, 6);
    const g = bubbleTimeGate();
    const on = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) on.push(f);
    expect(on.length).toBeGreaterThanOrEqual(18);
    expect(on.length).toBeLessThanOrEqual(21);
  });

  it('BUBBLE gate @5FPS: tick tetap ON tiap frame yang ada', () => {
    const g = bubbleTimeGate();
    const on = [];
    for (let f = 0; f < 5; f++) if (g(f * 0.2)) on.push(f);
    expect(on).toEqual([1, 2, 3, 4]);
  });

  it('guard input non-numerik → false, state tak rusak', () => {
    const ga = ambientTimeGate();
    const gb = bubbleTimeGate();
    expect(ga(NaN)).toBe(false);
    expect(gb(undefined)).toBe(false);
    expect(ga(0)).toBe(false);
    expect(ga(3 / 60)).toBe(true);
    expect(gb(0)).toBe(false);
    expect(gb(3 / 60)).toBe(true);
  });
});
