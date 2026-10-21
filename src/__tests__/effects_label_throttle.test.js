import { describe, it, expect } from 'vitest';
import { LABEL_RELAYOUT_EVERY, shouldRelayoutLabels } from '../scene/parts/effects.js';

describe('throttle relayout label', () => {
  it('default = 4 frame (~15x/dtk @60fps)', () => {
    expect(LABEL_RELAYOUT_EVERY).toBe(4);
  });
  it('hanya kelipatan every yang relayout', () => {
    expect(shouldRelayoutLabels(0)).toBe(true);
    expect(shouldRelayoutLabels(4)).toBe(true);
    expect(shouldRelayoutLabels(8)).toBe(true);
    expect(shouldRelayoutLabels(1)).toBe(false);
    expect(shouldRelayoutLabels(3)).toBe(false);
    expect(shouldRelayoutLabels(7)).toBe(false);
  });
  it('every kustom dihormati', () => {
    expect(shouldRelayoutLabels(10, 5)).toBe(true);
    expect(shouldRelayoutLabels(9, 5)).toBe(false);
  });
  it('guard input non-numerik → false', () => {
    expect(shouldRelayoutLabels(undefined)).toBe(false);
    expect(shouldRelayoutLabels(NaN)).toBe(false);
    expect(shouldRelayoutLabels('4')).toBe(false);
  });
  it('throttle ≥ 4x lebih hemat daripada tiap frame', () => {
    let ticks = 0;
    for (let f = 1; f <= 60; f++) if (shouldRelayoutLabels(f)) ticks++;
    expect(ticks).toBe(15);
    expect(60 / ticks).toBeGreaterThanOrEqual(4);
  });
});
