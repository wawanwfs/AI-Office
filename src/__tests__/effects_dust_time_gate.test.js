import { describe, it, expect } from 'vitest';
import { DUST_SEC, dustTimeGate, shouldUpdateDust, DUST_UPDATE_EVERY } from '../scene/parts/effects.js';

describe('siklus 486 — dust tick gate waktu-nyata', () => {
  it('DUST_SEC = 3/60 s (paritas @60FPS dgn gate frame-count lama)', () => {
    expect(DUST_SEC).toBeCloseTo(3 / 60, 12);
    expect(DUST_UPDATE_EVERY).toBe(3);
  });

  it('gate @60FPS: laju identik dgn shouldUpdateDust (20×/dtk, jeda 3 frame)', () => {
    const g = dustTimeGate();
    const fired = [];
    let t = 0;
    for (let f = 0; f < 600; f++) {
      t += 1 / 60;
      if (g(t)) fired.push(f);
    }
    const old = [];
    for (let f = 0; f < 600; f++) if (shouldUpdateDust(f)) old.push(f);
    // gate waktu tak menyala di tick pertama (t0 inisialisasi) → 199 vs 200
    expect(fired.length).toBe(old.length - 1);
    // jeda antar tick gate waktu 2–4 frame (drift akumulasi float t+=1/60), vs kelipatan 3 gate lama
    const gaps = fired.slice(1).map((f, i) => f - fired[i]);
    expect(gaps.every((gp) => gp >= 2 && gp <= 4)).toBe(true);
    // total laju tetap ~20×/dtk (199 tick vs 200 gate lama dalam 10 dtk)
    expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeCloseTo(3, 1);
  });

  it('@5FPS gate tetap ON tiap frame (drift debu tak beku di GPU lambat)', () => {
    const g = dustTimeGate();
    let t = 0; let fired = 0;
    for (let f = 0; f < 30; f++) { // 6 detik @5FPS
      t += 1 / 5;
      if (g(t)) fired++;
    }
    // gate lama hanya 6 tick dalam 6 dtk; gate waktu ~30 (toleransi float akumulasi)
    expect(fired).toBeGreaterThanOrEqual(29);
  });

  it('catch-up: waktu besar terlewat maju eksak tanpa drift laju', () => {
    const g = dustTimeGate();
    expect(g(0)).toBe(false); // inisialisasi
    expect(g(10)).toBe(true); // 10 dtk — catch-up
    const t0 = 10 + DUST_SEC;
    expect(g(t0 + 1e-6)).toBe(true); // fase = kelipatan 3/60 s, bukan reset penuh
    expect(g(t0 + 1e-6 + DUST_SEC + 1e-6)).toBe(true); // jeda tetap 1 interval
  });

  it('guard: elapsed non-finite → false (anti-poisoning)', () => {
    const g = dustTimeGate();
    expect(g(NaN)).toBe(false);
    expect(g(Infinity)).toBe(false);
    expect(g('x')).toBe(false);
  });
});
