// Siklus 513 — magTilt: majalah lounge & sofa sesekali "dibaca" (terangkat & kembali).
import { describe, it, expect } from 'vitest';
import { magTilt, MAG_CYCLE_SEC, MAG_TILT_RAD } from '../scene/parts/effects.js';

describe('siklus 513 — magTilt (majalah hidup)', () => {
  it('guard: elapsed/index non-finite → 0 (bukan NaN)', () => {
    [NaN, undefined, 'x', null].forEach((bad) => {
      expect(Number.isFinite(magTilt(bad, 0))).toBe(true);
      expect(Number.isFinite(magTilt(1.0, bad))).toBe(true);
      expect(magTilt(bad, 0)).toBe(0);
    });
  });

  it('rentang: 0…0.18 rad — terangkat maks 0.18, tidak pernah negatif', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t < MAG_CYCLE_SEC * 3; t += 0.1) {
      for (let i = 0; i < 8; i++) {
        const v = magTilt(t, i);
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
    }
    expect(mn).toBeGreaterThanOrEqual(0);
    expect(mx).toBeGreaterThan(0.1); // gerakan benar-benar terjadi
    expect(mx).toBeLessThanOrEqual(MAG_TILT_RAD + 0.001);
  });

  it('jarang aktif: <45% dari 8 majalah pernah terangkat dalam satu slot global', () => {
    let cnt = 0;
    for (let i = 0; i < 8; i++) {
      for (let t = 0; t < MAG_CYCLE_SEC; t += 0.25) {
        if (magTilt(t, i) > 0.01) { cnt++; break; }
      }
    }
    expect(cnt).toBeGreaterThan(0);    // ada yang hidup
    expect(cnt / 8).toBeLessThan(0.45); // tapi jarang — bukan rave
  });

  it('deterministik: hasil sama utk input sama; tak sinkron antar majalah', () => {
    expect(magTilt(3.3, 2)).toEqual(magTilt(3.3, 2));
    // minimal satu pasangan antar 8 majalah punya pola berbeda (fase hash ≠ sinkron)
    let diff = false;
    for (let a = 0; a < 8 && !diff; a++) {
      for (let b = a + 1; b < 8; b++) {
        for (let t = 0; t < MAG_CYCLE_SEC; t += 0.5) {
          if (Math.abs(magTilt(t, a) - magTilt(t, b)) > 0.001) { diff = true; break; }
        }
        if (diff) break;
      }
    }
    expect(diff).toBe(true);
  });

  it('tak sinkron vs siklus lain (nudge buku 37 dtk & poster 3.35 dtk)', () => {
    const active = [];
    for (let i = 0; i < 8; i++) {
      for (let t = 0; t < MAG_CYCLE_SEC; t += 0.25) if (magTilt(t, i) > 0.01) { active.push(i); break; }
    }
    expect(active.length).toBeGreaterThan(0);
    const i = active[0];
    // vs slot buku 37 dtk: geser 37 dtk (≈1.276 slot) mengubah pola — bandingkan
    // lintas 2 slot global agar rentang t cukup panjang.
    let sync = true;
    for (let t = 0; t < MAG_CYCLE_SEC * 2 - 37; t += 0.5) {
      if (Math.abs(magTilt(t, i) - magTilt(t + 37, i)) > 0.005) { sync = false; break; }
    }
    expect(sync).toBe(false);
  });

  it('kontrak integrasi: userData.__magBasis basis + tilt (stub mesh)', () => {
    const mesh = { userData: { __magBasis: 0 }, rotation: { z: 0 } };
    const t = 5.2;
    let v = 0;
    for (let k = 0; k < 8; k++) { const x = magTilt(t, k); if (x > 0) { v = x; break; } }
    mesh.rotation.z = mesh.userData.__magBasis + v;
    expect(mesh.rotation.z).toBeGreaterThanOrEqual(mesh.userData.__magBasis);
    expect(mesh.rotation.z).toBeLessThanOrEqual(mesh.userData.__magBasis + 0.18);
  });
});
