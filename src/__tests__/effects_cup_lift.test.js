// Siklus 514 — cupLift: cangkir kafe sesekali "diambil-diminum" (terangkat & turun).
import { describe, it, expect } from 'vitest';
import { cupLift, CUP_CYCLE_SEC, CUP_LIFT_UP } from '../scene/parts/effects.js';

describe('siklus 514 — cupLift (cangkir kafe hidup)', () => {
  it('guard: elapsed/index non-finite → 0 (bukan NaN)', () => {
    [NaN, undefined, 'x', null].forEach((bad) => {
      expect(Number.isFinite(cupLift(bad, 0))).toBe(true);
      expect(Number.isFinite(cupLift(1.0, bad))).toBe(true);
      expect(cupLift(bad, 0)).toBe(0);
    });
  });

  it('rentang: 0…0.045 unit — terangkat maks 0.045, tidak pernah negatif', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t < CUP_CYCLE_SEC * 3; t += 0.1) {
      for (let i = 0; i < 3; i++) {
        const v = cupLift(t, i);
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
    }
    expect(mn).toBeGreaterThanOrEqual(0);
    expect(mx).toBeGreaterThan(0.03); // gerakan benar-benar terjadi
    expect(mx).toBeLessThanOrEqual(CUP_LIFT_UP + 0.001);
  });

  it('jarang aktif: <50% dari 3 cangkir pernah terangkat dalam satu slot global', () => {
    let cnt = 0;
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < CUP_CYCLE_SEC; t += 0.25) {
        if (cupLift(t, i) > 0.01) { cnt++; break; }
      }
    }
    expect(cnt).toBeGreaterThan(0);   // ada yang hidup
    expect(cnt / 3).toBeLessThan(0.5); // tapi jarang — bukan semua sesama hidup
  });

  it('deterministik: hasil sama utk input sama; tak sinkron antar cangkir', () => {
    expect(cupLift(7.7, 1)).toEqual(cupLift(7.7, 1));
    // minimal satu pasangan antar 3 cangkir punya pola berbeda (fase hash ≠ sinkron)
    let diff = false;
    for (let a = 0; a < 3 && !diff; a++) {
      for (let b = a + 1; b < 3; b++) {
        for (let t = 0; t < CUP_CYCLE_SEC; t += 0.5) {
          if (Math.abs(cupLift(t, a) - cupLift(t, b)) > 0.001) { diff = true; break; }
        }
        if (diff) break;
      }
    }
    expect(diff).toBe(true);
  });

  it('tak sinkron vs slot magTilt 29 dtk (geser 29 dtk mengubah pola)', () => {
    // cari cangkir aktif
    let idx = -1;
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < CUP_CYCLE_SEC; t += 0.25) if (cupLift(t, i) > 0.01) { idx = i; break; }
      if (idx >= 0) break;
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    let sync = true;
    for (let t = 0; t < CUP_CYCLE_SEC * 2 - 29; t += 0.5) {
      if (Math.abs(cupLift(t, idx) - cupLift(t + 29, idx)) > 0.005) { sync = false; break; }
    }
    expect(sync).toBe(false);
  });

  it('kontrak integrasi: userData.__cupBasis basis + lift (stub mesh)', () => {
    const mesh = { userData: { __cupBasis: 1.03 }, position: { y: 0 } };
    const t = 9.4;
    let v = 0;
    for (let k = 0; k < 3; k++) { const x = cupLift(t, k); if (x > 0) { v = x; break; } }
    mesh.position.y = mesh.userData.__cupBasis + v;
    expect(mesh.position.y).toBeGreaterThanOrEqual(mesh.userData.__cupBasis);
    expect(mesh.position.y).toBeLessThanOrEqual(mesh.userData.__cupBasis + 0.045);
  });
});
