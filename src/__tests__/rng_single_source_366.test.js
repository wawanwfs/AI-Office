// Siklus 366: RNG deterministik satu sumber (lib/rng.js) — salinan kelas
// RNG inline di OfficeScene dihapus; semua pemakai via ctx.rng kini DetRNG.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DetRNG, RNG_DEFAULT_SEED, sceneRng } from '../lib/rng.js';

const sceneSrc = readFileSync(resolve(__dirname, '../scene/OfficeScene.js'), 'utf8');

// Implementasi lama (referensi paritas — disalin persis dari OfficeScene
// sebelum refactor, seed 42 default).
class RefRNG {
  constructor(s = 42) { this.s = s; }
  n() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  r(a, b) { return a + this.n() * (b - a); }
  i(a, b) { return Math.floor(this.r(a, b + 1)); }
  pick(a) { return a[this.i(0, a.length - 1)]; }
}

describe('siklus 366: DetRNG satu sumber', () => {
  it('kelas RNG inline sudah dihapus dari OfficeScene (satu sumber)', () => {
    expect(sceneSrc).not.toContain('class RNG{');
    expect(sceneSrc).toContain("from '../lib/rng.js'");
  });

  it('paritas urutan angka dgn implementasi lama (n/r/i/pick, 3 seed)', () => {
    for (const seed of [42, 2026, 7]) {
      const a = new DetRNG(seed), b = new RefRNG(seed);
      const na = [], nb = [];
      for (let k = 0; k < 50; k++) na.push(a.n());
      for (let k = 0; k < 50; k++) nb.push(b.n());
      expect(na).toEqual(nb);
      const ra = [], rb = [];
      for (let k = 0; k < 50; k++) ra.push(a.r(-3, 5));
      for (let k = 0; k < 50; k++) rb.push(b.r(-3, 5));
      expect(ra).toEqual(rb);
      const ia = [], ib = [];
      for (let k = 0; k < 50; k++) ia.push(a.i(0, 9));
      for (let k = 0; k < 50; k++) ib.push(b.i(0, 9));
      expect(ia).toEqual(ib);
      expect(new DetRNG(seed).pick(['x', 'y', 'z']))
        .toBe(new RefRNG(seed).pick(['x', 'y', 'z']));
    }
  });

  it('seed produksi 2026: sceneRng adalah instance dgn paritas RefRNG(2026)', () => {
    expect(sceneRng).toBeInstanceOf(DetRNG);
    const ref = new RefRNG(2026), fresh = new DetRNG(2026);
    expect([0, 1, 2, 3, 4].map(() => fresh.n()))
      .toEqual([0, 1, 2, 3, 4].map(() => ref.n()));
    expect(sceneRng.s).toBe(2026);
  });

  it('anti-poisoning: seed & argumen tidak valid tidak menghasilkan NaN', () => {
    const r = new DetRNG(0); // seed <= 0 → default 42
    expect(r.s).toBe(RNG_DEFAULT_SEED);
    expect(new DetRNG(NaN).s).toBe(RNG_DEFAULT_SEED);
    expect(new DetRNG('x').s).toBe(RNG_DEFAULT_SEED);
    const vals = [r.r(NaN, 5), r.r(2, Infinity), r.r(5, -5), r.r(NaN, NaN), r.i(NaN, 3)];
    vals.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(r.r(5, -5)).toBeGreaterThanOrEqual(-5); // b < a ditukar
    expect(r.pick([])).toBeUndefined();
    expect(r.pick('bukan array')).toBeUndefined();
  });
});
