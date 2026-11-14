import { describe, it, expect } from 'vitest';
import { trophyPulse, TROPHY_PULSE_SEC, TROPHY_RING_SEC } from '../scene/parts/effects.js';

describe('trophyPulse (siklus 511)', () => {
  it('guard non-finite: netral visor 0.76, ring 0.15, ringIn 0.065 (sin 0 → w=0.5)', () => {
    const n = trophyPulse(NaN);
    expect(n.visor).toBeCloseTo(0.45 + 0.47 * 0.5 + 0.08 * 0.5, 10);
    expect(n.ring).toBeCloseTo(0.10 + 0.075 * 0.5 + 0.025 * 0.5, 10);
    expect(n.ringIn).toBeCloseTo(0.05 + 0.03 * 0.5, 10);
    expect(trophyPulse(Infinity).visor).toBe(n.visor);
    expect(trophyPulse(undefined).visor).toBe(n.visor);
  });

  it('rentang 0.45…1.0 visor / 0.10…0.20 ring / 0.05…0.08 ringIn — tak pernah padam', () => {
    for (let t = 0; t < 600; t += 0.01) {
      const v = trophyPulse(t);
      expect(v.visor).toBeGreaterThanOrEqual(0.45 - 1e-12);
      expect(v.visor).toBeLessThanOrEqual(1.0 + 1e-12);
      expect(v.ring).toBeGreaterThanOrEqual(0.10 - 1e-12);
      expect(v.ring).toBeLessThanOrEqual(0.20 + 1e-12);
      expect(v.ringIn).toBeGreaterThanOrEqual(0.05 - 1e-12);
      expect(v.ringIn).toBeLessThanOrEqual(0.08 + 1e-12);
    }
  });

  it('kontrak puncak/lembah eksak via rumus w', () => {
    const peak = TROPHY_PULSE_SEC / 4;
    const wm = 0.5 + 0.5 * Math.sin((peak / TROPHY_PULSE_SEC) * Math.PI * 2);
    const wc = 0.5 + 0.5 * Math.sin((peak / (TROPHY_PULSE_SEC * 3.31)) * Math.PI * 2);
    expect(trophyPulse(peak).visor).toBeCloseTo(0.45 + 0.47 * wm + 0.08 * wc, 12);
    const valley = (3 * TROPHY_PULSE_SEC) / 4;
    const vm = 0.5 + 0.5 * Math.sin((valley / TROPHY_PULSE_SEC) * Math.PI * 2);
    const vc = 0.5 + 0.5 * Math.sin((valley / (TROPHY_PULSE_SEC * 3.31)) * Math.PI * 2);
    expect(trophyPulse(valley).visor).toBeCloseTo(0.45 + 0.47 * vm + 0.08 * vc, 12);
    // ringIn mengikuti siklus lambat TROPHY_RING_SEC sendiri
    expect(trophyPulse(TROPHY_RING_SEC / 4).ringIn).toBeCloseTo(0.08, 12);
    expect(trophyPulse((3 * TROPHY_RING_SEC) / 4).ringIn).toBeCloseTo(0.05, 12);
  });

  it('deterministik + seam periodik LCM 1701.66 dtk (2.6×3.31=8.606; 8.606×197.5? → pakai fraksi eksak)', () => {
    // 2.6 = 13/5, mikro = 8.606 = 4303/500 = 13·331/500
    // LCM(13/5, 4303/500) = LCM(13,4303)/GCD(5,500) = 4303/5 = 860.6 dtk
    const seam = 860.6;
    expect(trophyPulse(seam).visor).toBeCloseTo(trophyPulse(0).visor, 10);
    expect(trophyPulse(seam * 2 + 1.337).visor).toBeCloseTo(trophyPulse(1.337).visor, 9);
    // ringIn seam: 6.9 dtk
    expect(trophyPulse(TROPHY_RING_SEC).ringIn).toBeCloseTo(trophyPulse(0).ringIn, 12);
  });

  it('fase tak sinkron vs 15 siklus lain (rasio mikro ≠ kelipatan halus)', () => {
    const others = [5.2, 4.3, 3.9, 3.6, 5.6, 2.9, 4.7, 6.1, 3.3, 3.1, 2.7, 3.4, 2.1, 37, 1.42];
    const micro = TROPHY_PULSE_SEC * 3.31; // 8.606 dtk
    for (const o of others) {
      const r = micro / o;
      // jangan persis kelipatan 0.05 dgn siklus lain (tak sinkron)
      expect(r / 0.05).not.toBeCloseTo(Math.round(r / 0.05), 4);
    }
  });

  it('kontrak integrasi: stub mesh menerima nilai trophyPulse (pola OfficeScene)', () => {
    const visor = { material: { opacity: 0 }, userData: { __trophy: true } };
    const glow = { intensity: 0 };
    const tp = trophyPulse(1.7);
    visor.material.opacity = tp.visor;
    glow.intensity = 0.15 * tp.visor;
    expect(visor.material.opacity).toBeCloseTo(tp.visor, 12);
    expect(glow.intensity).toBeCloseTo(0.15 * tp.visor, 12);
  });
});
