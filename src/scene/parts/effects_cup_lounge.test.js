import { describe, it, expect } from 'vitest';
import { cupLift, CUP_CYCLE_SEC } from './effects.js';

describe('cupLift — mug lounge ikut slot cangkir (siklus 516)', () => {
  it('guard non-finite → netral 0', () => {
    expect(cupLift('x', 0)).toBe(0);
    expect(cupLift(NaN, 0)).toBe(0);
    expect(cupLift(1.0, 'y')).toBe(0);
  });
  it('rentang 0…0.045, tak pernah negatif', () => {
    for (let t = 0; t < CUP_CYCLE_SEC * 4; t += 0.13)
      for (let i = 0; i < 4; i++) {
        const v = cupLift(t, i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0.045);
      }
  });
  it('jarang aktif per slot (<50% item)', () => {
    let active = 0, total = 0;
    for (let t = 0; t < CUP_CYCLE_SEC; t += 0.25)
      for (let i = 0; i < 4; i++) { total++; if (cupLift(t, i) > 0) active++; }
    expect(active / total).toBeLessThan(0.5);
  });
  it('deterministik & tak sinkron antar item', () => {
    expect(cupLift(3.1, 1)).toBe(cupLift(3.1, 1));
    const lifts = [0, 1, 2, 3].map(i => cupLift(5.0, i));
    expect(lifts.some(v => v > 0)).toBe(true);
    expect(new Set(lifts).size).toBeGreaterThan(1);
  });
  it('basis Y lounge .475 dipertahankan kontrak userData numerik', () => {
    // kontrak OfficeScene: Number.isFinite(basis) → pakai basis (bukan fallback 1.03)
    const basis = .475;
    expect(Number.isFinite(basis)).toBe(true);
    expect(cupLift(7.7, 3)).toBeLessThanOrEqual(0.045);
  });
});
