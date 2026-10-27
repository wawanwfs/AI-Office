import { describe, it, expect } from 'vitest';
import { zoomRadius, zoomFocusGoal } from '../scene/parts/zoom_spec.js';

describe('zoomRadius', () => {
  it('langkah normal: current + delta (mirror eksak formula wheel lama)', () => {
    expect(zoomRadius(40, 10)).toBe(50);
    expect(zoomRadius(40, -10)).toBe(30);
    expect(zoomRadius(40, 0)).toBe(40);
  });

  it('clamp bawah 12 (mirror Math.max(12, ...) lama)', () => {
    expect(zoomRadius(14, -10)).toBe(12);
    expect(zoomRadius(12, -4)).toBe(12);
  });

  it('clamp atas 130 (mirror Math.min(130, ...) lama)', () => {
    expect(zoomRadius(128, 10)).toBe(130);
    expect(zoomRadius(130, 4)).toBe(130);
  });

  it('current non-finite → fallback 42.5 (anti-poisoning, dulu NaN menular ke sph.radius)', () => {
    expect(zoomRadius(NaN, 4)).toBe(46.5);
    expect(zoomRadius(Infinity, -4)).toBe(38.5);
    expect(zoomRadius(undefined, 4)).toBe(46.5);
  });

  it('delta non-finite → no-op (delta 0)', () => {
    expect(zoomRadius(40, NaN)).toBe(40);
    expect(zoomRadius(40, Infinity)).toBe(40);
  });
});

describe('zoomFocusGoal', () => {
  const mkGoal = (r, extra = {}) => ({ r, ...extra });

  it('goal follow: r dimutasi dgn delta, objek sama (goal dipertahankan)', () => {
    const g = mkGoal(20, { follow: { walker: {} } });
    const out = zoomFocusGoal(g, -4);
    expect(out).toBe(g);
    expect(g.r).toBe(16);
    expect(g.follow).toBeDefined();
  });

  it('goal reset TIDAK disentuh (return null) — radius dikelola lerp dgn r goal yang digeser OfficeScene', () => {
    const g = mkGoal(30, { reset: true });
    expect(zoomFocusGoal(g, -4)).toBeNull();
    expect(g.r).toBe(30);
  });

  it('goal titik statis (lantai/tim/nexus): r dimutasi, follow tetap undefined', () => {
    const g = mkGoal(18);
    const out = zoomFocusGoal(g, 4);
    expect(out).toBe(g);
    expect(g.r).toBe(22);
    expect(out.follow).toBeUndefined();
  });

  it('null/tanpa goal → null (pemanggil hanya mengubah sph.radius)', () => {
    expect(zoomFocusGoal(null, -4)).toBeNull();
  });

  it('r non-finite → fallback 42.5 lalu digeser (anti-poisoning)', () => {
    const g = mkGoal(NaN);
    zoomFocusGoal(g, -4);
    expect(g.r).toBe(38.5);
  });

  it('clamp 12..130 konsisten dgn formula wheel', () => {
    const g = mkGoal(129);
    zoomFocusGoal(g, 4);
    expect(g.r).toBe(130);
    const g2 = mkGoal(13);
    zoomFocusGoal(g2, -4);
    expect(g2.r).toBe(12);
  });

  it('clamp custom diteruskan (kompatibilitas future)', () => {
    const g = mkGoal(8);
    zoomFocusGoal(g, -4, 6, 20);
    expect(g.r).toBe(6);
  });
});
