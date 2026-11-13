import { describe, it, expect } from 'vitest';
import { SHADOW_REFRESH_SEC, shadowTimeGate, shouldRefreshShadow, SHADOW_REFRESH_EVERY } from '../scene/parts/effects.js';

describe('gate waktu refresh shadow map (siklus 483)', () => {
  it('SEC paritas laju identik gate lama @60FPS (10/60 s)', () => {
    expect(SHADOW_REFRESH_SEC).toBeCloseTo(10 / 60, 6);
    // @60FPS: refresh tiap ~10 frame — sama dgn shouldRefreshShadow
    const g = shadowTimeGate();
    const hits = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) hits.push(f);
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.length).toBeLessThanOrEqual(7);
  });

  it('shadow refresh @1FPS: tetap refresh tiap ~6 frame (tak beku 10 dtk)', () => {
    const g = shadowTimeGate();
    const on = [];
    for (let f = 0; f < 18; f++) if (g(f)) on.push(f); // 1 FPS → dt 1 s
    // 18 dtk / (1/6 s per refresh) ≈ 108 refresh — tiap frame pasti refresh
    expect(on.length).toBe(17); // semua frame kecuali awal (sinkronisasi t0)
  });

  it('input non-numerik → false (guard konsisten)', () => {
    const g = shadowTimeGate();
    expect(g(NaN)).toBe(false);
    expect(g(undefined)).toBe(false);
  });

  it('kontrak lama frame-count tetap ada (kedua jalur OR)', () => {
    expect(shouldRefreshShadow(SHADOW_REFRESH_EVERY)).toBe(true);
    expect(shouldRefreshShadow(3)).toBe(false);
  });
});
