import { describe, it, expect } from 'vitest';
import { AMBIENT_EVERY, shouldUpdateAmbient, ambientFx } from '../scene/parts/effects.js';

describe('shouldUpdateAmbient', () => {
  it('hanya true di kelipatan AMBIENT_EVERY', () => {
    let hits = 0;
    for (let f = 0; f < 60; f++) if (shouldUpdateAmbient(f)) hits++;
    expect(AMBIENT_EVERY).toBe(3);
    expect(hits).toBe(20); // ~20×/dtk pada 60fps
    expect(shouldUpdateAmbient(9)).toBe(true);
    expect(shouldUpdateAmbient(10)).toBe(false);
  });
  it('every kustom dihormati', () => {
    expect(shouldUpdateAmbient(8, 8)).toBe(true);
    expect(shouldUpdateAmbient(9, 8)).toBe(false);
  });
  it('guard input non-numerik / every ≤ 0 → false', () => {
    expect(shouldUpdateAmbient(NaN)).toBe(false);
    expect(shouldUpdateAmbient(3, 0)).toBe(false);
    expect(shouldUpdateAmbient(3, -1)).toBe(false);
  });
});

describe('ambientFx', () => {
  it('ring & visor = rumus lama persis (kompatibilitas visual)', () => {
    for (const t of [0, 1.37, 5.5, 100]) {
      expect(ambientFx(t).ring).toBeCloseTo(.12 + Math.sin(t * 1.5) * .04);
      expect(ambientFx(t).visor).toBeCloseTo(.8 + Math.sin(t * 3) * .2);
    }
  });
  it('label memakai fase per-agent (i*1.3), nx fase konstan +9', () => {
    expect(ambientFx(4.2, 3).label).toBeCloseTo(Math.sin(4.2 * 1.1 + 3 * 1.3) * .02);
    expect(ambientFx(4.2).nx).toBeCloseTo(Math.sin(4.2 * 1.1 + 9) * .03);
  });
  it('guard non-numerik → elapsed 0 / fase 0 (tak NaN ke material.opacity)', () => {
    expect(ambientFx(NaN).visor).toBeCloseTo(.8);
    expect(ambientFx(undefined, NaN).label).toBe(0);
  });
  it('periodisitas 2π: nilai pada t dan t+2π/1.5 (ring) identik', () => {
    const p = 2 * Math.PI / 1.5;
    expect(ambientFx(3.1).ring).toBeCloseTo(ambientFx(3.1 + p).ring);
  });
});
