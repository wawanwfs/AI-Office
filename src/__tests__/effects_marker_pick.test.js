// Siklus 515 — markerPick: spidol whiteboard sesekali "diambil menulis" (terangkat & turun).
import { describe, it, expect } from 'vitest';
import { markerPick, MARKER_CYCLE_SEC, MARKER_LIFT_UP } from '../scene/parts/effects.js';

describe('siklus 515 — markerPick (spidol whiteboard hidup)', () => {
  it('guard: elapsed/index non-finite → 0 (bukan NaN)', () => {
    [NaN, undefined, 'x', null].forEach((bad) => {
      expect(Number.isFinite(markerPick(bad, 0))).toBe(true);
      expect(Number.isFinite(markerPick(1.0, bad))).toBe(true);
      expect(markerPick(bad, 0)).toBe(0);
    });
  });

  it('rentang: 0…0.03 unit — terangkat maks 0.03, tidak pernah negatif', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t < MARKER_CYCLE_SEC * 3; t += 0.1) {
      for (let i = 0; i < 5; i++) {
        const v = markerPick(t, i);
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
    }
    expect(mn).toBeGreaterThanOrEqual(0);
    expect(mx).toBeGreaterThan(0.02); // gerakan benar-benar terjadi
    expect(mx).toBeLessThanOrEqual(MARKER_LIFT_UP + 0.001);
  });

  it('jarang aktif: <50% dari 5 item baki pernah terangkat dalam satu slot global', () => {
    let cnt = 0;
    for (let i = 0; i < 5; i++) {
      for (let t = 0; t < MARKER_CYCLE_SEC; t += 0.25) {
        if (markerPick(t, i) > 0.01) { cnt++; break; }
      }
    }
    expect(cnt).toBeGreaterThan(0);    // ada yang hidup
    expect(cnt / 5).toBeLessThan(0.5); // tapi jarang — bukan semua sesama hidup
  });

  it('deterministik: hasil sama utk input sama; tak sinkron antar spidol', () => {
    expect(markerPick(7.7, 2)).toEqual(markerPick(7.7, 2));
    // minimal satu pasangan antar 5 item punya pola berbeda (fase hash ≠ sinkron)
    let diff = false;
    for (let a = 0; a < 5 && !diff; a++) {
      for (let b = a + 1; b < 5; b++) {
        for (let t = 0; t < MARKER_CYCLE_SEC; t += 0.5) {
          if (Math.abs(markerPick(t, a) - markerPick(t, b)) > 0.001) { diff = true; break; }
        }
        if (diff) break;
      }
    }
    expect(diff).toBe(true);
  });

  it('tak sinkron vs slot cupLift 41 dtk (geser 41 dtk mengubah pola)', () => {
    // cari spidol aktif
    let idx = -1;
    for (let i = 0; i < 5; i++) {
      for (let t = 0; t < MARKER_CYCLE_SEC; t += 0.25) if (markerPick(t, i) > 0.01) { idx = i; break; }
      if (idx >= 0) break;
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    let sync = true;
    for (let t = 0; t < MARKER_CYCLE_SEC * 2 - 41; t += 0.5) {
      if (Math.abs(markerPick(t, idx) - markerPick(t + 41, idx)) > 0.005) { sync = false; break; }
    }
    expect(sync).toBe(false);
  });

  it('kontrak integrasi: userData.__markerBasis basis + pick (stub mesh)', () => {
    const mesh = { userData: { __markerBasis: 1.64 }, position: { y: 0 } };
    const t = 9.4;
    let v = 0;
    for (let k = 0; k < 5; k++) { const x = markerPick(t, k); if (x > 0) { v = x; break; } }
    mesh.position.y = mesh.userData.__markerBasis + v;
    expect(mesh.position.y).toBeGreaterThanOrEqual(mesh.userData.__markerBasis);
    expect(mesh.position.y).toBeLessThanOrEqual(mesh.userData.__markerBasis + 0.03);
  });
});
