import { describe, it, expect } from 'vitest';
import { panelBreath, PANEL_BREATH_SEC } from '../scene/parts/effects.js';

const TOL = 1e-9;
const T = PANEL_BREATH_SEC;
const RATIO = 2.77;              // mikro = T * 2.77 (277/100) → seam di 100T
const wAt = (t, sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);

describe('panelBreath (siklus 504)', () => {
  it('guard non-finite netral (sin 0 → 0.5): 0.80+0.085+0.015', () => {
    for (const v of [NaN, Infinity, -Infinity, 'x', null, undefined]) {
      expect(panelBreath(v)).toBeCloseTo(0.90, 9);
    }
  });

  it('rentang 0.80…1.0 — tak pernah padam', () => {
    for (let t = 0; t < 60; t += 0.01) {
      const v = panelBreath(t);
      expect(v).toBeGreaterThanOrEqual(0.80 - TOL);
      expect(v).toBeLessThanOrEqual(1.0 + TOL);
    }
  });

  it('deterministik + seam periodik 277T (main & mikro sejajar)', () => {
    const seam = 277 * T; // 2.77 = 277/100 (277 prima) → LCM(T, T*277/100) = 277T
    expect(panelBreath(seam)).toBeCloseTo(panelBreath(0), 6);
    for (let k = 1; k <= 9; k++) {
      expect(panelBreath(k * seam)).toBeCloseTo(panelBreath(0), 6);
    }
    expect(panelBreath(3.3)).toBeCloseTo(panelBreath(3.3), 12);
  });

  it('kontrak puncak main eksak + lembah', () => {
    // main puncak di t=T/4 (sin π/2); mikro fase dihitung eksak dgn rumus w
    const peak = panelBreath(T / 4);
    expect(peak).toBeCloseTo(0.80 + 0.17 * 1 + 0.03 * wAt(T / 4, T * RATIO), 9);
    // lembah main di t=3T/4 (sin 3π/2 = -1)
    const valley = panelBreath((3 * T) / 4);
    expect(valley).toBeCloseTo(0.80 + 0.03 * wAt((3 * T) / 4, T * RATIO), 9);
  });

  it('fase tak sinkron vs 7 siklus lampu lain (5.2/4.3/3.9/3.6/5.6/4.7/2.9)', () => {
    for (const other of [5.2, 4.3, 3.9, 3.6, 5.6, 4.7, 2.9]) {
      const ratio = PANEL_BREATH_SEC / other;
      expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(0.05);
    }
  });

  it('tekstur mikro: dua komponen — main identik, mikro berlawanan → nilai beda', () => {
    const halfMicro = (T * RATIO) / 2;
    const a = panelBreath(T / 4);
    const b = panelBreath(T / 4 + halfMicro); // main + setengah mikro-period
    expect(Math.abs(a - b)).toBeGreaterThan(0.005);
  });
});
