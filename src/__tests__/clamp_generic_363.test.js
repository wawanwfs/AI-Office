// Siklus 363: satu sumber clamp generik lo..hi di lib/math_util.
// Semua pola `Math.max(lo, Math.min(hi, x))` non-0..1 kini satu sumber.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clamp } from '../lib/math_util.js';

const src = (p) => readFileSync(resolve(__dirname, p), 'utf8');

describe('clamp satu sumber (siklus 363)', () => {
  it('definisi ada di lib/math_util dan tidak ada lagi pola duplikat di pemakai', () => {
    const mu = src('../lib/math_util.js');
    expect(mu).toMatch(/export function clamp\(x, lo, hi\)/);
    // label_overlap: 5 pola lama harus hilang (setelah import)
    const lo = src('../scene/parts/label_overlap.js');
    expect(lo).not.toMatch(/Math\.max\(-36, Math\.min\(36/);
    expect(lo).not.toMatch(/Math\.max\(-16, Math\.min\(16/);
    expect(lo).not.toMatch(/Math\.max\(zu\.baseX/);
    expect(lo).not.toMatch(/Math\.max\(zu\.baseZ/);
    expect(lo).not.toMatch(/Math\.max\(zu\.baseY/);
    const zs = src('../scene/parts/zoom_spec.js');
    expect(zs).not.toMatch(/Math\.max\(12, Math\.min\(130, cur \+ d\)\)/);
    expect(zs).not.toMatch(/goal\.r = Math\.max\(clampMin/);
    const kf = src('../scene/parts/kamera_focus.js');
    expect(kf).not.toMatch(/Math\.max\(24, Math\.min\(70, r\)\)/);
    const os = src('../scene/parts/orbit_spec.js');
    expect(os).not.toMatch(/Math\.max\(PHI_MIN, Math\.min\(PHI_MAX/);
  });

  it('semua pemakai mengimpor clamp dari math_util', () => {
    for (const f of [
      '../scene/parts/label_overlap.js',
      '../scene/parts/zoom_spec.js',
      '../scene/parts/kamera_focus.js',
      '../scene/parts/orbit_spec.js',
    ]) expect(src(f)).toMatch(/import \{[^}]*clamp[^}]*\} from '\.\.\/\.\.\/lib\/math_util\.js'/);
  });

  it('paritas dengan pola Math.max/Math.min asli', () => {
    const legacy = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    for (const [x, lo, hi] of [
      [5, 0, 10], [-5, 0, 10], [15, 0, 10], [0.5, 0.018, 0.035],
      [-36, -36, 36], [40, -36, 36], [24.7, 24, 70], [1.6, 1.2, 1.6],
    ]) expect(clamp(x, lo, hi)).toBe(legacy(x, lo, hi));
  });

  it('anti-poisoning: NaN/Infinity/string/non-numerik', () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(clamp(-Infinity, 0, 10)).toBe(0);
    expect(clamp('7', 0, 10)).toBe(7);
    expect(clamp(null, 0, 10)).toBe(0);
    expect(clamp(undefined, 5, 10)).toBe(5);
    expect(clamp('x', 2, 8)).toBe(2);
  });

  it('lo>hi ditukar otomatis; output selalu finite dalam rentang', () => {
    expect(clamp(5, 10, 0)).toBe(5);
    expect(clamp(-3, 10, 0)).toBe(0);
    expect(clamp(12, 10, 0)).toBe(10);
    for (const [x, lo, hi] of [[NaN, 1, 2], [5, NaN, 2], [5, 1, NaN]]) {
      const v = clamp(x, lo, hi);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
