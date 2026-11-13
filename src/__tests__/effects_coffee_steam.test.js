// Test siklus 488 — coffeeSteam: uap espresso kafe (murni, kontrak waktu-nyata).
import { describe, it, expect } from 'vitest';
import { coffeeSteam } from '../scene/parts/effects.js';

function makePuffs(n = 4) {
  return Array.from({ length: n }, (_, i) => ({
    position: { x: -0.8, y: 1.4 + i * 0.02, z: -0.05 },
    material: { opacity: 0 },
    userData: {},
  }));
}

describe('coffeeSteam', () => {
  it('guard: elapsed non-finite / input rusak → 0 update', () => {
    const p = makePuffs();
    expect(coffeeSteam(NaN, p)).toBe(0);
    expect(coffeeSteam(1, null)).toBe(0);
    expect(coffeeSteam(1, 'x')).toBe(0);
    expect(coffeeSteam(1, [null, {}])).toBe(0);
  });

  it('base posisi di-latch panggilan pertama (pola plantSway)', () => {
    const p = makePuffs();
    coffeeSteam(0, p);
    coffeeSteam(5.5, p);
    p.forEach((s) => {
      expect(s.userData.baseY).toBeCloseTo(1.4 + (p.indexOf(s)) * 0.02, 5);
    });
  });

  it('deterministik: elapsed sama → hasil sama persis', () => {
    const a = makePuffs(), b = makePuffs();
    coffeeSteam(1.23, a); coffeeSteam(1.23, b);
    a.forEach((s, i) => {
      expect(s.position.y).toBe(b[i].position.y);
      expect(s.material.opacity).toBe(b[i].material.opacity);
    });
  });

  it('osilasi naik terbatas: rise ≤ 0.35, sway ≤ 0.015, opacity ∈ [0,0.55]', () => {
    const p = makePuffs();
    for (let t = 0; t < 10; t += 0.05) {
      coffeeSteam(t, p);
      p.forEach((s, i) => {
        expect(s.position.y).toBeLessThanOrEqual(1.4 + i * 0.02 + 0.35 + 1e-9);
        expect(Math.abs(s.position.x - -0.8)).toBeLessThanOrEqual(0.015 + 1e-9);
        expect(s.material.opacity).toBeGreaterThanOrEqual(0);
        expect(s.material.opacity).toBeLessThanOrEqual(0.55 + 1e-9);
      });
    }
  });

  it('kontinu di seam siklus: opacity & posisi kontinu saat elapsed+ph wrap', () => {
    const p = makePuffs();
    // Fase puff 0: t→1 (opacity→0) lalu wrap ke t=0 (opacity→0) — kontinu di seam.
    const CYCLE = 2.4;
    coffeeSteam(CYCLE - 0.01, p);
    const o1 = p[0].material.opacity;
    coffeeSteam(0.0, p);
    const o0 = p[0].material.opacity;
    expect(o1).toBeLessThan(0.05);
    expect(o0).toBeLessThan(0.05);
  });

  it('stagger: puff berbeda fase → opacity berbeda pada elapsed sama', () => {
    const p = makePuffs(4);
    coffeeSteam(0.6, p);
    const ops = p.map((s) => s.material.opacity);
    expect(new Set(ops.map((o) => o.toFixed(3))).size).toBeGreaterThan(1);
  });
});
