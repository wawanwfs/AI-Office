import { describe, it, expect } from 'vitest';
import { cafeGlowBreath, FRIDGE_GLOW_SEC, ESPRESSO_LED_SEC } from '../src/scene/parts/effects.js';

describe('cafeGlowBreath (siklus 505)', () => {
  it('guard non-finite netral (sin 0 → 0.5)', () => {
    const r = cafeGlowBreath(NaN);
    expect(r.fridge).toBeCloseTo(0.60 + 0.34 * 0.5 + 0.06 * 0.5, 10);
    expect(r.led).toBeCloseTo(0.55 + 0.38 * 0.5 + 0.07 * 0.5, 10);
  });

  it('rentang + tak pernah padam', () => {
    let fMin = 1, fMax = 0, lMin = 1, lMax = 0;
    for (let t = 0; t <= 60; t += 0.01) {
      const r = cafeGlowBreath(t);
      fMin = Math.min(fMin, r.fridge); fMax = Math.max(fMax, r.fridge);
      lMin = Math.min(lMin, r.led); lMax = Math.max(lMax, r.led);
    }
    expect(fMin).toBeGreaterThanOrEqual(0.5999);
    expect(fMax).toBeLessThanOrEqual(1.0001);
    expect(lMin).toBeGreaterThanOrEqual(0.5499);
    expect(lMax).toBeLessThanOrEqual(1.0001);
  });

  it('kontrak puncak/lembah eksak via rumus w', () => {
    // puncak main pada t = FRIDGE_GLOW_SEC/4 (sin=1), mikro ≈1.3 dtk fase lain
    const w = (t, sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
    const tPeak = FRIDGE_GLOW_SEC / 4;
    const microP = w(tPeak, FRIDGE_GLOW_SEC * 2.54);
    expect(cafeGlowBreath(tPeak).fridge)
      .toBeCloseTo(0.60 + 0.34 + 0.06 * microP, 10);
    const tValley = (3 * FRIDGE_GLOW_SEC) / 4;
    const microV = w(tValley, FRIDGE_GLOW_SEC * 2.54);
    expect(cafeGlowBreath(tValley).fridge)
      .toBeCloseTo(0.60 + 0.06 * microV, 10);
  });

  it('deterministik + seam periodik (kedua gelombang kulkas; LED diuji terpisah)', () => {
    const L = FRIDGE_GLOW_SEC * 127; // LCM gelombang kulkas: 2.54=127/50, 127 prima
    for (const t of [0.7, 3.1, 9.9]) {
      expect(cafeGlowBreath(t).fridge).toBeCloseTo(cafeGlowBreath(t + L).fridge, 10);
      // LED: tak wajib eksak di L kulkas (gelombang 1.3 dtk independen)
      expect(cafeGlowBreath(t).led).toBeGreaterThan(0.5499);
      expect(cafeGlowBreath(t).led).toBeLessThan(1.0001);
      expect(cafeGlowBreath(t)).toEqual(cafeGlowBreath(t));
    }
    // LED: LCM eksak LED(1.3=13/10) & mikro(8.382=4191/500) = 5448.3 dtk
    for (const t of [0.3, 2.9]) {
      expect(cafeGlowBreath(t).led).toBeCloseTo(cafeGlowBreath(t + 5448.3).led, 10);
    }
  });

  it('fase tak sinkron vs siklus lampu lain', () => {
    const secs = [5.2, 4.3, 3.9, 3.6, 5.6, 4.7, 6.1, 2.9];
    for (const s of secs) {
      const ratio = FRIDGE_GLOW_SEC / s;
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.05);
    }
    expect(ESPRESSO_LED_SEC).not.toBe(2.2); // ≠ mikro receptionGlow
  });
});
