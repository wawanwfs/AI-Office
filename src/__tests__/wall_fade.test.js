// Unit test wall fade (diekstrak dari IIFE dinding OfficeScene ke parts/wall_fade.js).
import { describe, it, expect } from 'vitest';
import { wallFadeOf, applyWallFade, cornerVisibility, wallFadeTick } from '../scene/parts/wall_fade.js';

const mesh = (x = 0, z = 0, mat = {}) => ({
  visible: true,
  position: { x, z },
  material: { transparent: false, opacity: 1, ...mat },
});

describe('wallFadeOf', () => {
  it('persis kode lama: max(0, min(1, 1-(d+1.5)/6))', () => {
    for (const d of [-10, -1.5, 0, 1, 4.5, 10]) {
      expect(wallFadeOf(d)).toBeCloseTo(Math.max(0, Math.min(1, 1 - (d + 1.5) / 6)), 12);
    }
  });
  it('kamera di dalam (d=-1.5) → solid 1', () => {
    expect(wallFadeOf(-1.5)).toBe(1);
  });
  it('semakin jauh di luar makin pudar, clamped 0', () => {
    expect(wallFadeOf(0)).toBeCloseTo(1 - 1.5 / 6, 12);
    expect(wallFadeOf(4.5)).toBe(0);
    expect(wallFadeOf(100)).toBe(0);
  });
});

describe('applyWallFade', () => {
  it('fade > 0.04: visible + opacity = fade', () => {
    const m = mesh();
    applyWallFade([m], 0.6);
    expect(m.visible).toBe(true);
    expect(m.material.transparent).toBe(true);
    expect(m.material.opacity).toBe(0.6);
  });
  it('fade ≤ 0.04: hidden, opacity tak disentuh', () => {
    const m = mesh(0, 0, { opacity: 0.7 });
    applyWallFade([m], 0.03);
    expect(m.visible).toBe(false);
    expect(m.material.opacity).toBe(0.7);
  });
  it('material array dilewati (tak disentuh)', () => {
    const m = mesh();
    m.material = [{ opacity: 1 }];
    applyWallFade([m], 0.5);
    expect(m.visible).toBe(true);
    expect(m.material[0].opacity).toBe(1);
    expect(Array.isArray(m.material)).toBe(true);
  });
  it('ambang tepat 0.04 → hidden; 0.041 → visible', () => {
    const a = mesh(), b = mesh();
    applyWallFade([a], 0.04); applyWallFade([b], 0.0400001);
    expect(a.visible).toBe(false); expect(b.visible).toBe(true);
  });
  it('objs null/undefined aman', () => {
    expect(() => applyWallFade(null, 0.5)).not.toThrow();
  });
});

describe('cornerVisibility', () => {
  it('tiang memilih dinding yang lebih terlihat (max > 0.5)', () => {
    const corners = [mesh(-12.5, -9.5), mesh(12.5, 9.5)];
    const out = cornerVisibility(corners, { front: 1, right: 0, back: 0, left: 0 });
    expect(out[0].vis).toBe(true);  // kiri+depan → front=1
    expect(out[1].vis).toBe(false); // kanan+belakang → 0
  });
  it('ambang 0.5: max = 0.5 → hidden', () => {
    const out = cornerVisibility([mesh(5, -5)], { front: 0.5, right: 0.5, back: 1, left: 1 });
    expect(out[0].vis).toBe(false);
  });
  it('mengembalikan pasangan {m, vis} searah', () => {
    const c = mesh(1, 1);
    const out = cornerVisibility([c], { front: 0, right: 1, back: 0, left: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].m).toBe(c);
    expect(out[0].vis).toBe(true);
  });
});

describe('wallFadeTick', () => {
  const mkDefs = () => ({
    front: { objs: [mesh()], out: (c) => -9.5 - c.z },
    right: { objs: [mesh()], out: (c) => c.x - 12.5 },
    back: { objs: [mesh()], out: (c) => c.z - 9.5 },
    left: { objs: [], out: (c) => -12.5 - c.x },
  });
  it('kamera di dalam kantor → semua dinding solid 1, tiang tampak', () => {
    const defs = mkDefs();
    const corner = mesh(12.5, -9.5);
    const cam = { x: 8, y: 6, z: -8 };
    const val = wallFadeTick(defs, [corner], cam);
    expect(val.front).toBe(1); expect(val.right).toBe(1);
    expect(val.back).toBe(1); expect(val.left).toBe(1);
    expect(val.cam).toEqual([8, 6, -8]);
    expect(corner.visible).toBe(true);
  });
  it('kamera di luar depan (z < -9.5): dinding depan pudar, lainnya solid', () => {
    const defs = mkDefs();
    const cam = { x: 0, y: 6, z: -14 };
    const val = wallFadeTick(defs, [], cam);
    expect(val.front).toBe(0); // -9.5-(-14)=4.5 → 0
    expect(val.back).toBe(1);
    expect(defs.front.objs[0].visible).toBe(false);
    expect(defs.back.objs[0].visible).toBe(true);
  });
  it('pembulatan val 2 desimal & posisi kamera dibulatkan', () => {
    const defs = mkDefs();
    const cam = { x: 1.234, y: 5.678, z: -12.3456 };
    const val = wallFadeTick(defs, [], cam);
    expect(val.front).toBe(+wallFadeOf(-9.5 - -12.3456).toFixed(2));
    expect(val.cam).toEqual([1.2, 5.7, -12.3]);
  });
  it('menerapkan opacity fade ke material nyata', () => {
    const defs = mkDefs();
    wallFadeTick(defs, [], { x: 0, y: 6, z: -12 });
    expect(defs.front.objs[0].material.opacity).toBe(wallFadeOf(2.5));
  });
});
