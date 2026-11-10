// Siklus 364: expDamp satu sumber — pola `1 - Math.exp(-rate*dt)` dihapus
// dari kamera_focus (focusStep), ring_spec (ringDampFactor), bubbles
// (updateBubbles) & OfficeScene (LBL_SMOOTH). Semua kini via expDamp di
// lib/math_util.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expDamp } from '../lib/math_util.js';
import { ringDampFactor } from '../scene/parts/ring_spec.js';
import { FOCUS_LERP_RATE, focusStep } from '../scene/parts/kamera_focus.js';

const root = resolve(__dirname, '../..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('siklus 364: expDamp satu sumber', () => {
  it('salian pola exp damp dihapus dari 4 file pemakai', () => {
    for (const f of [
      'src/scene/OfficeScene.js',
      'src/scene/parts/kamera_focus.js',
      'src/scene/parts/ring_spec.js',
      'src/scene/parts/bubbles.js',
    ]) {
      expect(read(f), f).not.toMatch(/1\s*-\s*Math\.exp\(/);
    }
  });

  it('pemakai meng-import expDamp dari math_util', () => {
    for (const [f, lib] of [
      ['src/scene/OfficeScene.js', '../lib/math_util.js'],
      ['src/scene/parts/kamera_focus.js', '../../lib/math_util.js'],
      ['src/scene/parts/ring_spec.js', '../../lib/math_util.js'],
      ['src/scene/parts/bubbles.js', '../../lib/math_util.js'],
    ]) {
      expect(read(f), f).toContain('expDamp');
    }
    expect(read('src/lib/math_util.js')).toContain('export function expDamp');
  });

  it('paritas dgn pola lama 1 - exp(-rate*dt) pada 8 kasus', () => {
    const old = (rate, dt) => 1 - Math.exp(-rate * dt);
    const cases = [
      [3.7125, 0.016], [3.7125, 1], [3.7125, 0.5],
      [17.26, 0.016], [35.87, 0.016], [10, 0.3],
      [12, 0.066], [1e-6, 100],
    ];
    for (const [r, d] of cases) {
      expect(expDamp(r, d)).toBeCloseTo(old(r, d), 12);
    }
  });

  it('anti-poisoning: rate/dt non-finite, <=0 → 0; hasil selalu [0,1]', () => {
    for (const [r, d] of [
      [NaN, 0.1], [Infinity, 0.1], [-1, 0.1], [0, 0.1],
      [3, NaN], [3, Infinity], [3, -0.1], [3, 0], ['x', 0.1], [3, 'x'],
      [null, 0.1], [undefined, 0.1],
    ]) {
      const v = expDamp(r, d);
      expect(v).toBe(0);
    }
    // dt sangat besar → 1 (clamped, bukan NaN)
    expect(expDamp(3, 1e9)).toBe(1);
    // string numerik dinormalisasi
    expect(expDamp('10', '0.1')).toBeCloseTo(1 - Math.exp(-1), 12);
  });

  it('konsistensi pemakai: focusStep/ringDampFactor sama perilakunya dgn expDamp', () => {
    // focusStep: satu langkah dt=1/60 dgn rate FOCUS_LERP_RATE ≈ lerp manual
    const tgt = { x: 0, y: 0, z: 0 };
    const sph = { radius: 100, phi: 1 };
    const goalT = { x: 10, y: 0, z: 0 };
    focusStep(tgt, sph, goalT, 50, undefined, 1 / 60);
    const k = expDamp(FOCUS_LERP_RATE, 1 / 60);
    expect(tgt.x).toBeCloseTo(10 * k, 12);
    expect(sph.radius).toBeCloseTo(100 + (50 - 100) * k, 12);
    // ringDampFactor === expDamp utk rate/dt valid
    expect(ringDampFactor(17.26, 0.016)).toBe(expDamp(17.26, 0.016));
    expect(ringDampFactor(NaN, 0.016)).toBe(0);
  });
});
