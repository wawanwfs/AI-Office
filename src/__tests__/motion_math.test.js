import { describe, it, expect } from 'vitest';
import { BOUNDS, ARRIVE, dist2, stepMove, angleDelta } from '../scene/parts/motion_math.js';

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
  it('clamp pojok: X dan Z terjepit sekaligus dalam satu langkah', () => {
    const s = stepMove({ x: 12, z: 9, rot: 0 }, { x: 50, z: 50 }, 100, 1);
    expect(s.x).toBe(BOUNDS.xMax);
    expect(s.z).toBe(BOUNDS.zMax);
    expect(s.clamped).toBe(true);
  });
  it('delta 0 / speed×delta=0: tidak bergerak, belum arrived bila jarak jauh', () => {
    const s = stepMove({ x: 0, z: 0, rot: 0 }, { x: 10, z: 0 }, 2, 0);
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
    expect(s.arrived).toBe(false);
    expect(s.clamped).toBe(false);
  });
  it('rot dipertahankan saat arrived (tidak di-reorientasi ke target)', () => {
    const s = stepMove({ x: 1, z: 1, rot: 1.23 }, { x: 1.01, z: 1.01 }, 2, 1);
    expect(s.arrived).toBe(true);
    expect(s.rot).toBe(1.23);
  });
});

describe('motion_math: angleDelta (selisih sudut terpendek)', () => {
  it('sudut sama → 0', () => {
    expect(angleDelta(0.5, 0.5)).toBe(0);
    expect(angleDelta(-2, -2)).toBe(0);
  });
  it('selisih kecil biasa tanpa wrap', () => {
    expect(angleDelta(1.0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0.2, 1.0)).toBeCloseTo(-0.8);
  });
  it('wrap: target +π, current -π → jalur terpendek lewat 0 (negatif kecil)', () => {
    const d = angleDelta(Math.PI - 0.1, -Math.PI + 0.1);
    expect(d).toBeCloseTo(-0.2); // 2π - 0.2 dibungkus ke -0.2
  });
  it('wrap arah berlawanan: target -π, current +π → positif kecil', () => {
    const d = angleDelta(-Math.PI + 0.1, Math.PI - 0.1);
    expect(d).toBeCloseTo(0.2);
  });
  it('+π dan -π mewakili arah sama → 0', () => {
    expect(angleDelta(Math.PI, -Math.PI)).toBe(0);
    expect(angleDelta(-Math.PI, Math.PI)).toBe(0);
  });
  it('selalu dalam [-π, π]', () => {
    for (const a of [-9, -5, -3, -2, -1, 0, 1, 2, 3, 5, 9]) {
      const d = angleDelta(a, 0);
      expect(d).toBeGreaterThanOrEqual(-Math.PI);
      expect(d).toBeLessThanOrEqual(Math.PI);
    }
  });
  it('konsisten dengan interpolasi rotasi (arah terpendek tidak memutar)', () => {
    const cur = -Math.PI + 0.1;
    const tgt = Math.PI - 0.1;
    const d = angleDelta(tgt, cur);
    expect(d).toBeCloseTo(-0.2);         // arah terpendek: putar searah jarum jam 0.2 rad
    const after = cur + d * 0.5;         // setengah langkah
    expect(after).toBeCloseTo(-Math.PI); // bergerak menuju -π, bukan melompat lewat +π
  });
});
