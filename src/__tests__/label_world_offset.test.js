// Unit test konversi piksel→dunia & penerapan offset label (labelWorldOffset dst).
// Rumus harus persis sama dengan kode inline lama di animate() OfficeScene.
import { describe, it, expect } from 'vitest';
import { worldPerPx, labelWorldOffset, accumulateZoneAnti } from '../scene/parts/label_overlap.js';

describe('labelWorldOffset: worldPerPx', () => {
  it('rumus eksak: 2·dist·tan(fov/2)/tinggi', () => {
    const dist = 30, fov = 60, h = 768;
    const expected = 2 * dist * Math.tan((fov * Math.PI) / 360) / h;
    expect(worldPerPx(dist, fov, h)).toBeCloseTo(expected, 12);
  });
  it('proporsional terhadap jarak kamera', () => {
    const a = worldPerPx(10, 60, 768), b = worldPerPx(20, 60, 768);
    expect(b / a).toBeCloseTo(2, 10);
  });
  it('berbanding terbalik dgn tinggi layar', () => {
    const a = worldPerPx(30, 60, 800), b = worldPerPx(30, 60, 400);
    expect(b / a).toBeCloseTo(2, 10);
  });
});

describe('labelWorldOffset: agent', () => {
  it('dy tanpa clamp 46, dx clamp ±16 — dx rumus lama persis', () => {
    const p = { offY: 20, offX: -30 };
    const wpp = 0.05;
    expect(labelWorldOffset(p, wpp).dy).toBeCloseTo(20 * 0.05 * 1.2, 12);
    expect(labelWorldOffset(p, wpp).dx).toBeCloseTo(Math.max(-16, Math.min(16, -30 * 0.05)), 12);
  });
  it('dy tanpa cap atas: konversi proporsional (viewport dijaga clampViewport)', () => {
    const r = labelWorldOffset({ offY: 4000, offX: 0 }, 0.05);
    expect(r.dy).toBe(4000 * 0.05 * 1.2);
  });
  it('clamp dx −16..16', () => {
    expect(labelWorldOffset({ offY: 0, offX: -500 }, 0.05).dx).toBe(-16);
    expect(labelWorldOffset({ offY: 0, offX: 500 }, 0.05).dx).toBe(16);
  });
  it('offY negatif diperbolehkan (dy tak punya batas bawah selain skala)', () => {
    const r = labelWorldOffset({ offY: -100, offX: 0 }, 0.05);
    expect(r.dy).toBeCloseTo(-100 * 0.05 * 1.2, 12);
  });
});

describe('labelWorldOffset: zona', () => {
  it('dyz clamp dihapus: offY konversi proporsional (viewport dijaga clampViewport)', () => {
    const wpp = 0.05;
    expect(labelWorldOffset({ zone: true, offY: 5000, offX: 0 }, wpp).dyz).toBeCloseTo(5000 * wpp * 1.2, 12);
    expect(labelWorldOffset({ zone: true, offY: -5000, offX: 0 }, wpp).dyz).toBeCloseTo(-5000 * wpp * 1.2, 12);
    expect(labelWorldOffset({ zone: true, offY: 0, offX: 5000 }, wpp).dxz).toBe(36);
    expect(labelWorldOffset({ zone: true, offY: 0, offX: -5000 }, wpp).dxz).toBe(-36);
  });
});

describe('accumulateZoneAnti', () => {
  it('antiY/antiX diakumulasi, bukan diganti (semantik lama)', () => {
    const zt = { userData: { antiY: 3, antiX: -2 } };
    accumulateZoneAnti(zt, 1.5, 0.5);
    expect(zt.userData.antiY).toBe(4.5);
    expect(zt.userData.antiX).toBe(-1.5);
  });
  it('fallback: userData tidak ada / antiY undefined → mulai dari 0', () => {
    const zt = {};
    accumulateZoneAnti(zt, 2, 3);
    expect(zt.userData.antiY).toBe(2);
    expect(zt.userData.antiX).toBe(3);
  });
});
