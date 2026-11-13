import { describe, it, expect } from 'vitest';
import { LABEL_RELAYOUT_SEC, labelRelayoutTimeGate, shouldRelayoutLabels, LABEL_RELAYOUT_EVERY } from '../scene/parts/effects.js';

describe('gate waktu relayout label (siklus 484)', () => {
  it('SEC paritas laju identik gate lama @60FPS (4/60 s)', () => {
    expect(LABEL_RELAYOUT_SEC).toBeCloseTo(4 / 60, 6);
    // @60FPS: tick tiap ~4 frame — sama dgn shouldRelayoutLabels
    const g = labelRelayoutTimeGate();
    const hits = [];
    for (let f = 0; f < 60; f++) if (g(f / 60)) hits.push(f);
    expect(hits.length).toBeGreaterThanOrEqual(12);
    expect(hits.length).toBeLessThanOrEqual(16);
  });

  it('relayout @1FPS: tetap jalan tiap frame (tak beku 4 dtk)', () => {
    const g = labelRelayoutTimeGate();
    const on = [];
    for (let f = 0; f < 12; f++) if (g(f)) on.push(f); // 1 FPS → dt 1 s
    // 12 dtk / (4/60 s per tick) ≈ 180 tick — tiap frame pasti tick
    expect(on.length).toBe(11); // semua frame kecuali awal (sinkronisasi t0)
  });

  it('input non-numerik → false (guard konsisten)', () => {
    const g = labelRelayoutTimeGate();
    expect(g(NaN)).toBe(false);
    expect(g(undefined)).toBe(false);
  });

  it('kontrak lama frame-count tetap ada (kedua jalur OR)', () => {
    expect(shouldRelayoutLabels(LABEL_RELAYOUT_EVERY)).toBe(true);
    expect(shouldRelayoutLabels(2)).toBe(false);
  });
});
