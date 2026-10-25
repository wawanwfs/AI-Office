import { describe, it, expect } from 'vitest';
import { BOUNDS, ARRIVE, dist2, stepMove } from '../src/scene/parts/motion_math.js';

describe('motion_math: dist2', () => {
  it('menghitung dx/dz dan jarak euclid', () => {
    const r = dist2({ x: 0, z: 0 }, { x: 3, z: 4 });
    expect(r.dx).toBe(3);
    expect(r.dz).toBe(4);
    expect(r.d).toBe(5);
  });
  it('jarak nol saat posisi sama', () => {
    const r = dist2({ x: 2, z: -1 }, { x: 2, z: -1 });
    expect(r.d).toBe(0);
  });
});

describe('motion_math: stepMove', () => {
  it('bergerak menuju target dengan rotasi menghadap arah gerak', () => {
    const r = stepMove({ x: 0, z: 0, rot: 0 }, { x: 1, z: 0 }, 2, 1);
    expect(r.x).toBeCloseTo(2);
    expect(r.z).toBeCloseTo(0);
    expect(r.arrived).toBe(false);
    expect(r.clamped).toBe(false);
    expect(r.rot).toBeCloseTo(Math.PI / 2); // atan2(dx, dz) untuk +x
  });
  it('tiba saat jarak < ARRIVE, rot tetap dipertahankan', () => {
    const r = stepMove({ x: 0, z: 0, rot: 0.7 }, { x: 0.1, z: 0 }, 2, 1);
    expect(r.arrived).toBe(true);
    expect(r.rot).toBe(0.7);
    expect(r.clamped).toBe(false);
  });
  it('tidak melewati batas (clamp) saat target jauh', () => {
    const r = stepMove({ x: 0, z: 0, rot: 0 }, { x: 100, z: 0 }, 100, 1);
    expect(r.x).toBe(BOUNDS.xMax);
    expect(r.clamped).toBe(true);
  });
  it('clamp juga berlaku ke sisi negatif dan sumbu z', () => {
    const rx = stepMove({ x: 0, z: 0, rot: 0 }, { x: -100, z: 0 }, 100, 1);
    expect(rx.x).toBe(BOUNDS.xMin);
    expect(rx.clamped).toBe(true);
    const rz = stepMove({ x: 0, z: 0, rot: 0 }, { x: 0, z: -100 }, 100, 1);
    expect(rz.z).toBe(BOUNDS.zMin);
    expect(rz.clamped).toBe(true);
  });
  it('ARRIVE konstanta konsisten (< 1 unit)', () => {
    expect(ARRIVE).toBeLessThan(1);
    expect(ARRIVE).toBeGreaterThan(0);
  });
});
