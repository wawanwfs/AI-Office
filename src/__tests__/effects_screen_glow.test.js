import { describe, it, expect } from 'vitest';
import { screenGlowBreath, SCREEN_GLOW_SEC, SCREEN_STAGGER_SEC } from '../scene/parts/effects.js';

const lcmPeriod = (a, b) => { // cari kelipatan bersama terkecil yang wajar
  let p = a;
  for (let k = 1; k <= 500; k++) {
    if (Math.abs((p * k) % b) < 1e-9) return p * k;
  }
  return null;
};

describe('screenGlowBreath (siklus 508)', () => {
  it('guard non-finite: netral 0.89 (sin 0 → w=0.5, sesuai 507)', () => {
    expect(screenGlowBreath(NaN)).toBeCloseTo(0.89, 10);
    expect(screenGlowBreath(Infinity)).toBeCloseTo(0.89, 10);
    expect(screenGlowBreath(undefined, NaN)).toBeCloseTo(0.89, 10);
  });

  it('rentang 0.78…1.0 dan tak pernah padam (< 0.78 tak ada)', () => {
    for (let t = 0; t < 600; t += 0.01) {
      const v = screenGlowBreath(t, 3);
      expect(v).toBeGreaterThanOrEqual(0.78 - 1e-12);
      expect(v).toBeLessThanOrEqual(1.0 + 1e-12);
    }
  });

  it('kontrak puncak/lembah eksak via rumus w', () => {
    // puncak main+micro ser_SYNC tak mungkin; uji puncak main saja:
    const peak = SCREEN_GLOW_SEC / 4; // sin(π/2)=1
    const val = screenGlowBreath(peak);
    const wm = 0.5 + 0.5 * Math.sin((peak / SCREEN_GLOW_SEC) * Math.PI * 2);
    const wc = 0.5 + 0.5 * Math.sin((peak / (SCREEN_GLOW_SEC * 2.61)) * Math.PI * 2);
    expect(val).toBeCloseTo(0.78 + 0.17 * wm + 0.05 * wc, 12);
    // lembah main:
    const valley = (3 * SCREEN_GLOW_SEC) / 4;
    const vm = 0.5 + 0.5 * Math.sin((valley / SCREEN_GLOW_SEC) * Math.PI * 2);
    const vc = 0.5 + 0.5 * Math.sin((valley / (SCREEN_GLOW_SEC * 2.61)) * Math.PI * 2);
    expect(screenGlowBreath(valley)).toBeCloseTo(0.78 + 0.17 * vm + 0.05 * vc, 12);
  });

  it('deterministik + seam periodik LCM (3.4×2.61 = 887.4 dtk)', () => {
    const seam = 887.4; // LCM(3.4, 8.874): 3.4=17/5, 8.874=4437/500 → 887.4 dtk
    expect(screenGlowBreath(seam)).toBeCloseTo(screenGlowBreath(0), 12);
    expect(screenGlowBreath(seam * 3 + 1.234)).toBeCloseTo(screenGlowBreath(1.234), 10); // seam×3 tetap periodik
  });

  it('stagger fase per agen: i berbeda → nilai berbeda pada t sama (tak sinkron)', () => {
    const t = 1.137;
    const a = screenGlowBreath(t, 0);
    const b = screenGlowBreath(t, 7);
    const c = screenGlowBreath(t, 19);
    expect(Math.abs(a - b)).toBeGreaterThan(1e-6);
    expect(Math.abs(a - c)).toBeGreaterThan(1e-6);
    // fase kembali setelah stagger penuh 26 agen? tetap deterministik per i
    expect(screenGlowBreath(t + 5, 7)).toBeCloseTo(screenGlowBreath(t + 5, 7), 12);
  });

  it('fase tak sinkron vs 11 siklus lain (rasio ≠ kelipatan halus)', () => {
    const others = [5.2, 4.3, 3.9, 3.6, 5.6, 2.9, 4.7, 6.1, 3.3, 3.1, 2.7, 3.4];
    const ratios = others.map((o) => SCREEN_GLOW_SEC * 2.61 / o);
    ratios.forEach((r) => {
      const nearest = Math.min(...[1, 2, 3, 4].map((k) => Math.abs(r - k)));
      expect(nearest).toBeGreaterThan(0.05);
    });
  });
});
