import { describe, it, expect } from 'vitest';
import { headphonePick, HEADPHONE_CYCLE_SEC, HEADPHONE_LIFT_UP } from './effects.js';

describe('headphonePick (siklus 517)', () => {
  it('guard: waktu/indeks non-finite → netral total 0', () => {
    expect(headphonePick('x', 0)).toBe(0);
    expect(headphonePick(NaN, 0)).toBe(0);
    expect(headphonePick(Infinity, 0)).toBe(0);
    expect(headphonePick(10, 'x')).toBe(0);
    expect(headphonePick(10, NaN)).toBe(0);
    expect(headphonePick(10, Infinity)).toBe(0);
  });

  it('rentang 0…HEADPHONE_LIFT_UP (tidak negatif, tidak melebihi)', () => {
    const N = 2000, CYC = 3;
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < N; k++) {
        const t = (k / N) * CYC * HEADPHONE_CYCLE_SEC;
        const v = headphonePick(t, i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(HEADPHONE_LIFT_UP + 1e-12);
      }
    }
  });

  it('jarang aktif per slot (<50% sampel per set > 0)', () => {
    const N = 4000;
    let active = 0, total = 0;
    for (let i = 0; i < 8; i++) {
      for (let k = 0; k < N; k++) {
        const t = (k / N) * HEADPHONE_CYCLE_SEC;
        total++;
        if (headphonePick(t, i) > 0) active++;
      }
    }
    expect(active / total).toBeLessThan(0.5);
  });

  it('deterministik & tak sinkron antar set (ada pasangan fase berbeda)', () => {
    for (let i = 0; i < 8; i++) {
      expect(headphonePick(123.45, i)).toBeCloseTo(headphonePick(123.45, i), 15);
      expect(headphonePick(123.45, i)).toBeCloseTo(headphonePick(123.45 + HEADPHONE_CYCLE_SEC, i), 12);
    }
    // minimal satu pasangan punya nilai berbeda di suatu t (fase hash berbeda)
    let diff = false;
    for (let k = 0; k < 40 && !diff; k++) {
      const t = (k / 40) * HEADPHONE_CYCLE_SEC;
      for (let a = 0; a < 8 && !diff; a++)
        for (let b = a + 1; b < 8; b++)
          if (headphonePick(t, a) !== headphonePick(t, b)) { diff = true; break; }
    }
    expect(diff).toBe(true);
  });

  it('tak sinkron vs slot marker 33 dtk (lintas 2 slot)', () => {
    // pola gabungan keduanya di t vs t+2×marker slot harus beda untuk
    // minimal satu headphone (fase 47 dtk ≠ kelipatan 33 dtk)
    let diff = false;
    for (let i = 0; i < 8; i++) {
      const p1 = headphonePick(66, i) + headphonePick(99, i);
      const p2 = headphonePick(66 + 66, i) + headphonePick(99 + 66, i);
      if (Math.abs(p1 - p2) > 1e-9) { diff = true; break; }
    }
    expect(diff).toBe(true);
  });

  it('kontrak integrasi: basis + pick (stub mesh)', () => {
    const basis = 0.82;
    const t = 500.5;
    for (let i = 0; i < 8; i++) {
      const y = basis + headphonePick(t, i);
      expect(y).toBeGreaterThanOrEqual(basis);
      expect(y).toBeLessThanOrEqual(basis + HEADPHONE_LIFT_UP);
    }
  });
});
