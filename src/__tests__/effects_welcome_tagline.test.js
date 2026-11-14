import { describe, it, expect } from 'vitest';
import { drawWelcomeSign, welcomeTaglineIdx, welcomeTaglines, WELCOME_TAGLINE_SEC } from '../scene/parts/sign_canvas.js';

// recorder ctx (pola sign_canvas.test.js)
const rec = () => {
  const ops = [];
  const h = {
    get fillStyle() { return h._fs; }, set fillStyle(v) { h._fs = v; ops.push(['fillStyle', v]); },
    get strokeStyle() { return h._ss; }, set strokeStyle(v) { h._ss = v; ops.push(['strokeStyle', v]); },
    get lineWidth() { return h._lw; }, set lineWidth(v) { h._lw = v; ops.push(['lineWidth', v]); },
    get font() { return h._f; }, set font(v) { h._f = v; ops.push(['font', v]); },
    get textAlign() { return h._ta; }, set textAlign(v) { h._ta = v; ops.push(['textAlign', v]); },
  };
  h.fillRect = (...a) => ops.push(['fillRect', ...a]);
  h.strokeRect = (...a) => ops.push(['strokeRect', ...a]);
  h.fillText = (...a) => ops.push(['fillText', ...a]);
  h.ops = ops;
  return h;
};

describe('welcomeTaglineIdx (siklus 519)', () => {
  it('guard non-finite netral → 0', () => {
    for (const bad of [NaN, Infinity, -Infinity, 'x', undefined, null, {}]) {
      expect(welcomeTaglineIdx(bad)).toBe(0);
    }
  });
  it('rentang integer 0..2 utk semua waktu', () => {
    for (let t = -1000; t < 1000; t += 0.37) {
      const i = welcomeTaglineIdx(t);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(3);
    }
  });
  it('rotasi deterministik tiap slot WELCOME_TAGLINE_SEC', () => {
    expect(welcomeTaglineIdx(0)).toBe(0);
    expect(welcomeTaglineIdx(WELCOME_TAGLINE_SEC)).toBe(1);
    expect(welcomeTaglineIdx(2 * WELCOME_TAGLINE_SEC)).toBe(2);
    expect(welcomeTaglineIdx(3 * WELCOME_TAGLINE_SEC)).toBe(0);
    expect(welcomeTaglineIdx(WELCOME_TAGLINE_SEC * 7.5)).toBe(1);
  });
  it('aman utk elapsed negatif', () => {
    expect(welcomeTaglineIdx(-WELCOME_TAGLINE_SEC)).toBe(2);
    expect(welcomeTaglineIdx(-0.001)).toBe(2);
  });
  it('rotasi merata: semua tagline ter-tampilkan dalam 3 slot', () => {
    const seen = new Set();
    for (let k = 0; k < 30; k++) seen.add(welcomeTaglineIdx(k * WELCOME_TAGLINE_SEC + 0.1));
    expect(seen.size).toBe(3);
  });
});

describe('drawWelcomeSign kontrak tagline', () => {
  it('default (tanpa arg / idx tak valid) → tagline pertama & layout regresi tetap', () => {
    for (const arg of [undefined, -1, 3, 1.5, 'x', NaN]) {
      const n = rec();
      drawWelcomeSign(n, arg);
      const texts = n.ops.filter(o => o[0] === 'fillText');
      expect(texts).toHaveLength(2);
      expect(texts[0]).toEqual(['fillText', 'WFS PROJECT', 512, 150]);
      expect(texts[1]).toEqual(['fillText', 'Selamat Datang \u00b7 Welcome', 512, 250]);
    }
  });
  it('idx valid → tagline sesuai daftar, judul & posisi tak berubah', () => {
    const list = welcomeTaglines();
    expect(list).toHaveLength(3);
    list.forEach((tag, i) => {
      const n = rec();
      drawWelcomeSign(n, i);
      const texts = n.ops.filter(o => o[0] === 'fillText');
      expect(texts[0][1]).toBe('WFS PROJECT');
      expect(texts[1]).toEqual(['fillText', tag, 512, 250]);
    });
  });
  it('font & warna subjudul tak berubah utk semua idx', () => {
    for (let i = 0; i < 3; i++) {
      const n = rec();
      drawWelcomeSign(n, i);
      expect(n.ops.find(o => o[0] === 'font' && String(o[1]).includes('600 60px'))).toBeTruthy();
      expect(n.ops.find(o => o[0] === 'fillStyle' && o[1] === '#FFFFFF')).toBeTruthy();
    }
  });
});
