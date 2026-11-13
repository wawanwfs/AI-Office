import { describe, it, expect } from 'vitest';
import { rackEdgeBreath, RACK_EDGE_SEC } from '../src/scene/parts/effects.js';

describe('rackEdgeBreath (siklus 506)', () => {
  it('guard non-finite netral (sin 0 → 0.5)', () => {
    expect(rackEdgeBreath(NaN)).toBeCloseTo(0.50 + 0.42 * 0.5 + 0.08 * 0.5, 10);
    expect(rackEdgeBreath(undefined)).toBeCloseTo(0.75, 10);
  });

  it('rentang + tak pernah padam', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t <= 80; t += 0.01) {
      const v = rackEdgeBreath(t);
      mn = Math.min(mn, v); mx = Math.max(mx, v);
    }
    expect(mn).toBeGreaterThanOrEqual(0.4999);
    expect(mx).toBeLessThanOrEqual(1.0001);
  });

  it('kontrak puncak/lembah eksak via rumus w', () => {
    const w = (t, sec) => 0.5 + 0.5 * Math.sin((t / sec) * Math.PI * 2);
    const tPeak = RACK_EDGE_SEC / 4;
    const microP = w(tPeak, RACK_EDGE_SEC * 2.41);
    expect(rackEdgeBreath(tPeak)).toBeCloseTo(0.50 + 0.42 + 0.08 * microP, 10);
    const tValley = (3 * RACK_EDGE_SEC) / 4;
    const microV = w(tValley, RACK_EDGE_SEC * 2.41);
    expect(rackEdgeBreath(tValley)).toBeCloseTo(0.50 + 0.08 * microV, 10);
  });

  it('deterministik + seam periodik (2.41 = 241/100, 241 prima → LCM 984.1 dtk)', () => {
    const L = RACK_EDGE_SEC * 241;
    for (const t of [0.9, 3.3, 7.7]) {
      expect(rackEdgeBreath(t)).toBeCloseTo(rackEdgeBreath(t + L), 10);
      expect(rackEdgeBreath(t)).toEqual(rackEdgeBreath(t));
    }
  });

  it('fase tak sinkron vs 9 siklus lain (8 lampu + kulkas kafe)', () => {
    const secs = [5.2, 4.3, 3.9, 3.6, 5.6, 4.7, 6.1, 2.9, 3.3];
    for (const s of secs) {
      const ratio = RACK_EDGE_SEC / s;
      expect(Math.abs(ratio - 1)).toBeGreaterThan(0.05);
    }
  });
});
