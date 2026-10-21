import { describe, it, expect } from 'vitest';
import { shouldRefreshShadow, SHADOW_REFRESH_EVERY } from '../scene/parts/effects.js';

describe('shouldRefreshShadow', () => {
  it('refresh tiap kelipatan SHADOW_REFRESH_EVERY (≥5x hemat vs 60fps)', () => {
    const hits = [];
    for (let f = 0; f < SHADOW_REFRESH_EVERY * 3; f++) if (shouldRefreshShadow(f)) hits.push(f);
    expect(hits).toEqual([0, 10, 20]);
    expect(SHADOW_REFRESH_EVERY).toBeGreaterThanOrEqual(5);
  });
  it('guard frame non-numerik', () => {
    expect(shouldRefreshShadow(undefined)).toBe(false);
    expect(shouldRefreshShadow(NaN)).toBe(false);
    expect(shouldRefreshShadow(10)).toBe(true);
  });
});
