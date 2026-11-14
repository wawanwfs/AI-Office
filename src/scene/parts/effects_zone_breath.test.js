import { describe, it, expect } from 'vitest';
import { zoneBreath, ZONE_BREATH_SEC } from './effects.js';

// LCM via iterasi fase (presisi 1e-3): kapan kedua gelombang kembali sinkron
const seam = (secMain, secMicro) => {
  const P = (sec, t) => Math.sin((t / sec) * Math.PI * 2);
  for (let t = 0.5; t < 5000; t += 0.001) {
    if (Math.abs(P(secMain, t)) < 1e-4 && P(secMain, t + 0.051) > 0 &&
        Math.abs(P(secMicro, t)) < 1e-4 && P(secMicro, t + 0.051) > 0) return t;
  }
  return NaN;
};

describe('zoneBreath (siklus 512)', () => {
  it('guard non-finite → netral 0.91 (t=0, i=0 → kedua w=0.5)', () => {
    expect(zoneBreath(NaN)).toBeCloseTo(0.91, 9);
    expect(zoneBreath(undefined)).toBeCloseTo(0.91, 9);
    expect(zoneBreath(1, NaN)).toBeCloseTo(zoneBreath(1, 0), 9);
  });

  it('rentang 0.82…1.0, tak pernah padam', () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 60; t += 0.01) for (let i = 0; i < 5; i++) {
      const v = zoneBreath(t, i);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0.82 - 1e-9);
    expect(hi).toBeLessThanOrEqual(1.0 + 1e-9);
    expect(hi).toBeGreaterThan(0.999);
    expect(lo).toBeLessThan(0.821);
  });

  it('kontrak puncak utama eksak via rumus w (stagger fase 0.55·i)', () => {
    // puncak gelombang UTAMA: (t - 0.55i) ≡ ZONE/4 (mod ZONE) → main w=1
    for (let i = 0; i < 5; i++) {
      const tPeak = ZONE_BREATH_SEC / 4 + i * 0.55;
      const v = zoneBreath(tPeak, i);
      // main penuh; mikro dihitung eksak dari rumus
      const microT = ((tPeak - i * 0.55) / (ZONE_BREATH_SEC * 2.6)) % 1;
      const wMic = 0.5 + 0.5 * Math.sin(microT * Math.PI * 2);
      expect(v).toBeCloseTo(0.82 + 0.13 + 0.05 * wMic, 9);
      // nilai di tVal lain cocok rumus gabungan
      const tVal = ZONE_BREATH_SEC * 2 + i * 0.55;
      const tt = ((tVal - i * 0.55) / ZONE_BREATH_SEC) % 1;
      const wExp = 0.5 + 0.5 * Math.sin(tt * Math.PI * 2);
      const mT = ((tVal - i * 0.55) / (ZONE_BREATH_SEC * 2.6)) % 1;
      const wMic2 = 0.5 + 0.5 * Math.sin(mT * Math.PI * 2);
      expect(zoneBreath(tVal, i)).toBeCloseTo(0.82 + 0.13 * wExp + 0.05 * wMic2, 9);
    }
  });

  it('deterministik + stagger fase antar zona (tak serempak)', () => {
    expect(zoneBreath(7.3, 2)).toBe(zoneBreath(7.3, 2));
    let differ = false;
    for (let t = 0; t < 20 && !differ; t += 0.05) {
      if (Math.abs(zoneBreath(t, 0) - zoneBreath(t, 1)) > 1e-6) differ = true;
    }
    expect(differ).toBe(true);
  });

  it('seam LCM eksak (3.2=16/5, mikro 8.32=208/25) & tak sinkron vs siklus lain', () => {
    const s = seam(ZONE_BREATH_SEC, ZONE_BREATH_SEC * 2.6);
    expect(s).toBeCloseTo(41.6, 1); // LCM(16/5, 208/25) = 208/25 · 5 = 41.6
    // tak sinkron vs trophyPulse utama 2.6 dtk pada rentang panjang
    let sync = true;
    const P = (sec, t) => Math.sin((t / sec) * Math.PI * 2);
    for (let t = 0; t < 400; t += 0.1) {
      if (Math.abs(P(ZONE_BREATH_SEC, t) - P(2.6, t)) > 1e-9) { sync = false; break; }
    }
    expect(sync).toBe(false);
  });
});
