import { describe, it, expect } from 'vitest';
import { routePath, STAIR_X, getNearestStairX } from '../scene/parts/routing.js';

describe('Stair Routing — Antar Lantai WFS PROJECT', () => {
  it('berpindah L1 -> L2 wajib melewati tangga 1 (z: -1.8 -> -0.6) di x = ±2.6', () => {
    const a = { x: -8, z: -3 }; // meja L1
    const b = { x: 4, z: 1.5 };  // meja L2
    const path = routePath(a, b);

    // Harus melewati koordinat tangga x = -2.6
    expect(path.some(p => Math.abs(p.x - (-2.6)) < 0.1 && Math.abs(p.z - (-1.8)) < 0.1)).toBe(true);
    expect(path.some(p => Math.abs(p.x - (-2.6)) < 0.1 && Math.abs(p.z - (-0.6)) < 0.1)).toBe(true);
  });

  it('berpindah L2 -> L3 wajib melewati tangga 2 (z: 3.8 -> 5.0) di x = ±2.6', () => {
    const a = { x: 4, z: 1.5 };  // meja L2
    const b = { x: -4, z: 6 };   // meja L3
    const path = routePath(a, b);

    expect(path.some(p => Math.abs(p.x - 2.6) < 0.1 && Math.abs(p.z - 3.8) < 0.1)).toBe(true);
    expect(path.some(p => Math.abs(p.x - 2.6) < 0.1 && Math.abs(p.z - 5.0) < 0.1)).toBe(true);
  });

  it('berpindah L1 -> L3 wajib melewati KEDUA tangga secara berurutan', () => {
    const a = { x: -8, z: -3 }; // meja L1
    const b = { x: 4, z: 6 };    // meja L3
    const path = routePath(a, b);

    const idxStair1 = path.findIndex(p => Math.abs(p.z - (-0.6)) < 0.1);
    const idxStair2 = path.findIndex(p => Math.abs(p.z - 5.0) < 0.1);

    expect(idxStair1).toBeGreaterThan(0);
    expect(idxStair2).toBeGreaterThan(idxStair1);
  });

  it('berpindah L3 -> L1 wajib menuruni tangga 2 lalu menuruni tangga 1 secara berurutan', () => {
    const a = { x: 0, z: 6 };    // meja L3
    const b = { x: -8, z: -3 };  // meja L1
    const path = routePath(a, b);

    const idxStair2Down = path.findIndex(p => Math.abs(p.z - 3.8) < 0.1);
    const idxStair1Down = path.findIndex(p => Math.abs(p.z - (-1.8)) < 0.1);

    expect(idxStair2Down).toBeGreaterThan(0);
    expect(idxStair1Down).toBeGreaterThan(idxStair2Down);
  });
});

describe('routing.getNearestStairX', () => {
  it('mengembalikan x tangga terdekat (±2.6) untuk titik di kiri/kanan', () => {
    expect(getNearestStairX(-5)).toBe(-2.6);
    expect(getNearestStairX(5)).toBe(2.6);
  });

  it('mengembalikan posisi eksak saat titik tepat berada di tangga', () => {
    expect(getNearestStairX(-2.6)).toBe(-2.6);
    expect(getNearestStairX(2.6)).toBe(2.6);
  });

  it('menentukan tangga terdekat di sekitar titik tengah (x=0)', () => {
    expect(getNearestStairX(-0.1)).toBe(-2.6);
    expect(getNearestStairX(0.1)).toBe(2.6);
  });

  it('tie-break di titik tengah tepat jatuh ke tangga kanan', () => {
    expect(getNearestStairX(0)).toBe(2.6);
  });

  it('konsisten dengan konstanta STAIR_X', () => {
    expect(STAIR_X).toContain(-2.6);
    expect(STAIR_X).toContain(2.6);
  });
});
