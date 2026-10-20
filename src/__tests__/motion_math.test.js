import { describe, it, expect } from 'vitest';
import { BOUNDS, ARRIVE, dist2, stepMove } from '../scene/parts/motion_math.js';

describe('motion_math: BOUNDS & ARRIVE', () => {
  it('batas dunia lebih kecil dari lantai ±13/±10 (walker tak menembus dinding)', () => {
    expect(BOUNDS.xMin).toBeLessThan(-12);
    expect(BOUNDS.xMax).toBeGreaterThan(12);
    expect(BOUNDS.zMin).toBeLessThan(-9);
    expect(BOUNDS.zMax).toBeGreaterThan(9);
  });
  it('ARRIVE threshold positif kecil (< 1 unit)', () => {
    expect(ARRIVE).toBeGreaterThan(0);
    expect(ARRIVE).toBeLessThan(1);
  });
});

describe('motion_math: dist2', () => {
  it('delta & jarak benar (3-4-5)', () => {
    const r = dist2({ x: 0, z: 0 }, { x: 3, z: 4 });
    expect(r).toEqual({ dx: 3, dz: 4, d: 5 });
  });
  it('posisi sama → d = 0', () => {
    expect(dist2({ x: 2, z: -1 }, { x: 2, z: -1 }).d).toBe(0);
  });
});

describe('motion_math: stepMove', () => {
  it('sudah dekat (< ARRIVE) → arrived tanpa bergerak', () => {
    const s = stepMove({ x: 1, z: 1, rot: 0.7 }, { x: 1.05, z: 1 }, 2, 0.5);
    expect(s.arrived).toBe(true);
    expect(s.x).toBe(1);
    expect(s.z).toBe(1);
    expect(s.rot).toBe(0.7); // arah hadap dipertahankan
  });
  it('bergerak sejauh speed×delta ke arah target', () => {
    const s = stepMove({ x: 0, z: 0, rot: 0 }, { x: 10, z: 0 }, 2, 0.5);
    expect(s.arrived).toBe(false);
    expect(s.x).toBeCloseTo(1); // 2×0.5 ke arah +x
    expect(s.z).toBeCloseTo(0);
    expect(s.rot).toBeCloseTo(Math.atan2(1, 0)); // atan2(dx, dz)
  });
  it('arah diagonal dinormalisasi (jarak tempuh = speed×delta, bukan lebih)', () => {
    const s = stepMove({ x: 0, z: 0, rot: 0 }, { x: 5, z: 5 }, 2, 1);
    const moved = Math.hypot(s.x, s.z);
    expect(moved).toBeCloseTo(2);
  });
  it('hard clamp X: target jauh di luar dinding tetap dibatasi BOUNDS', () => {
    const s = stepMove({ x: 0, z: 0, rot: 0 }, { x: 50, z: 0 }, 100, 1);
    expect(s.x).toBe(BOUNDS.xMax);
    expect(s.clamped).toBe(true);
  });
  it('hard clamp Z (dua sisi)', () => {
    const lo = stepMove({ x: 0, z: 0, rot: 0 }, { x: 0, z: -50 }, 100, 1);
    const hi = stepMove({ x: 0, z: 0, rot: 0 }, { x: 0, z: 50 }, 100, 1);
    expect(lo.z).toBe(BOUNDS.zMin);
    expect(hi.z).toBe(BOUNDS.zMax);
    expect(lo.clamped).toBe(true);
    expect(hi.clamped).toBe(true);
  });
  it('bergerak bebas di dalam batas → clamped false', () => {
    const s = stepMove({ x: 0, z: 0, rot: 0 }, { x: 1, z: 0 }, 0.5, 0.1);
    expect(s.clamped).toBe(false);
  });
  it('tidak pernah keluar dari BOUNDS setelah langkah acak apa pun', () => {
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 200; i++) {
      const pos = { x: (rnd() - 0.5) * 26, z: (rnd() - 0.5) * 20, rot: 0 };
      const tgt = { x: (rnd() - 0.5) * 40, z: (rnd() - 0.5) * 30 };
      const s = stepMove(pos, tgt, 5, 0.2);
      expect(s.x).toBeGreaterThanOrEqual(BOUNDS.xMin);
      expect(s.x).toBeLessThanOrEqual(BOUNDS.xMax);
      expect(s.z).toBeGreaterThanOrEqual(BOUNDS.zMin);
      expect(s.z).toBeLessThanOrEqual(BOUNDS.zMax);
    }
  });
});
