import { describe, it, expect } from 'vitest';
import { deckNeonBreath, DECK_LED_SEC, STEP_STRIP_SEC } from '../src/scene/parts/effects.js';

describe('deckNeonBreath', () => {
  it('input non-finite netral (0.5)', () => {
    for (const v of [NaN, Infinity, -Infinity, 'x', undefined]) {
      const r = deckNeonBreath(v);
      expect(r.led).toBeCloseTo(0.5, 10); // netral eksak (fase dipilih utk led)
      expect(r.step).toBeGreaterThanOrEqual(-1e-9);
      expect(r.step).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('rentang 0…1 dan tak pernah padam dipetakan caller 0.45…1.0', () => {
    for (let t = 0; t < 12; t += 0.05) {
      const r = deckNeonBreath(t);
      expect(r.led).toBeGreaterThanOrEqual(-1e-9);
      expect(r.led).toBeLessThanOrEqual(1 + 1e-9);
      expect(r.step).toBeGreaterThanOrEqual(-1e-9);
      expect(r.step).toBeLessThanOrEqual(1 + 1e-9);
      expect(0.45 + 0.55 * r.led).toBeGreaterThanOrEqual(0.45 - 1e-9);
    }
  });
  it('deterministik & kontinuitas seam periodik', () => {
    const T = DECK_LED_SEC;
    const a = deckNeonBreath(3.7);
    const b = deckNeonBreath(3.7);
    expect(a.led).toBe(b.led);
    expect(deckNeonBreath(0).led).toBeCloseTo(deckNeonBreath(T).led, 9);
    expect(deckNeonBreath(0).led).toBeCloseTo(deckNeonBreath(19 * T).led, 6);
  });
  it('konstanta kontrak: puncak & lembah eksak', () => {
    expect(deckNeonBreath(DECK_LED_SEC / 4).led).toBeCloseTo(1, 9);
    expect(deckNeonBreath((3 * DECK_LED_SEC) / 4).led).toBeCloseTo(0, 9);
    expect(deckNeonBreath(STEP_STRIP_SEC / 4).step).toBeCloseTo(1, 9);
  });
  it('rasio siklus tak sinkron (bukan kelipatan bulat)', () => {
    expect(DECK_LED_SEC / STEP_STRIP_SEC).not.toBeCloseTo(Math.round(DECK_LED_SEC / STEP_STRIP_SEC), 3);
  });
});
