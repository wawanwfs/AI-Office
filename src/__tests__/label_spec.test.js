import { describe, it, expect } from 'vitest';
import { LABEL_Y, LABEL_FULL, LABEL_SHORT, labelName, fitLabel, labelScale } from '../scene/parts/label_spec.js';

function mockCtx(widths = {}) {
  return {
    font: '',
    measureText: (t) => ({ width: widths[t] ?? widths.default ?? (t.length * 10) }),
  };
}

describe('label_spec', () => {
  it('LABEL_Y historis 2.45', () => {
    expect(LABEL_Y).toBe(2.45);
  });

  it('LABEL_FULL: kanvas 360×84, radius 18', () => {
    expect(LABEL_FULL.W).toBe(360);
    expect(LABEL_FULL.H).toBe(84);
    expect(LABEL_FULL.RADIUS).toBe(18);
    expect(LABEL_FULL.NAME_FONT).toContain('800 36px');
    expect(LABEL_FULL.ROLE_FONT).toContain('600 22px');
    expect(LABEL_FULL.NAME_Y).toBe(32);
    expect(LABEL_FULL.ROLE_Y).toBe(62);
  });

  it('LABEL_SHORT: kanvas 210×50, radius 14', () => {
    expect(LABEL_SHORT.W).toBe(210);
    expect(LABEL_SHORT.H).toBe(50);
    expect(LABEL_SHORT.RADIUS).toBe(14);
    expect(LABEL_SHORT.NAME_FONT).toContain('800 28px');
    expect(LABEL_SHORT.NAME_Y).toBe(26);
  });

  it('labelName: title-case tiap kata', () => {
    expect(labelName('wahyu fs')).toBe('Wahyu Fs');
    expect(labelName('BANTUIN AI')).toBe('Bantuin Ai');
    expect(labelName('dewi')).toBe('Dewi');
    expect(labelName('a')).toBe('A');
    expect(labelName('  multi  space ')).toBe('  Multi  Space ');
  });

  it('labelName: null/undefined/angka aman', () => {
    expect(labelName(null)).toBe('');
    expect(labelName(undefined)).toBe('');
    expect(labelName(42)).toBe('42');
  });

  it('fitLabel: teks muat → kembalikan string asli & font tak berubah', () => {
    const c = mockCtx({ default: 100 });
    const f = '800 36px X';
    const r = fitLabel(c, 'Dewi', 300, f);
    expect(r).toBe('Dewi');
    expect(c.font).toBe(f);
  });

  it('fitLabel: kepanjangan → shrink font sampai muat ({fit,fnt})', () => {
    // ctx font-aware: lebar = panjang teks × fontPx × 0.5
    const fontAware = {
      font: '',
      measureText: (t) => ({ width: t.length * (parseInt(fontAware.font) || 36) * 0.5 }),
    };
    const r = fitLabel(fontAware, 'Alexander Hamilton', 300, '800 36px X');
    // shrink diterapkan pada 30px (0.9*36=32 → 32,29,26...): 17 huruf *32*0.5=272 ≤300 → muat
    expect(typeof r).toBe('object');
    expect(r.fit).toBe('Alexander Hamilton');
    // format historis: f + ' ' + rest (' X') → '32  X'
    expect(r.fnt).toBe('32  X');
    // font dikembalikan ke asli setelah sukses
    expect(fontAware.font).toBe('800 36px X');
  });

  it('fitLabel: tidak mungkin muat → ellipsis', () => {
    const c = mockCtx({ default: 9999 });
    const r = fitLabel(c, 'Super Super Long Name Here', 100, '800 36px X');
    expect(r.endsWith('…')).toBe(true);
    expect(r.length).toBeLessThan('Super Super Long Name Here'.length);
    expect(c.font).toBe('800 36px X'); // dikembalikan
  });

  it('fitLabel: null/undefined aman', () => {
    const c = mockCtx();
    expect(fitLabel(c, null, 100, '800 36px X')).toBe('');
    expect(fitLabel(c, undefined, 100, '800 36px X')).toBe('');
  });

  it('fitLabel: boundary teks tepat = max → string asli', () => {
    const c = mockCtx({ default: 100 });
    expect(fitLabel(c, 'Abc', 100, '800 36px X')).toBe('Abc');
  });

  it('labelScale: wantFull dihitung dari lebar & jarak kamera', () => {
    const a = labelScale(1400, 900, 50, 20);
    expect(a.wantFull).toBe(true);   // w>=700 && near<30
    const b = labelScale(1400, 900, 50, 40);
    expect(b.wantFull).toBe(false);  // jauh
    const d = labelScale(500, 900, 50, 40);
    expect(d.wantFull).toBe(false);
    const e = labelScale(1400, 900, 50, 40, true); // override
    expect(e.wantFull).toBe(true);
  });

  it('labelScale: frac = hPx*min(1.35,h/900*1.2)/h * 2tan(fov/2)', () => {
    const r = labelScale(1400, 900, 50, 20);
    const t2 = 2 * Math.tan(50 * Math.PI / 360);
    expect(r.frac).toBeCloseTo(19 * Math.min(1.35, 900 / 900 * 1.2) / 900 * t2, 10);
    expect(r.frac).toBeGreaterThan(0);
  });

  it('labelScale: layar sempit (<600px) → hPx 14 (label lebih kecil)', () => {
    const wide = labelScale(1400, 900, 50, 20);
    const narrow = labelScale(500, 900, 50, 20);
    const t2 = 2 * Math.tan(50 * Math.PI / 360);
    expect(narrow.frac).toBeCloseTo(14 * Math.min(1.35, 1.2) / 900 * t2, 10);
    expect(narrow.frac).toBeLessThan(wide.frac);
  });

  it('labelScale: layar pendek (h kecil) → proporsi label naik (cap 1.35)', () => {
    const short = labelScale(1400, 600, 50, 20);
    const t2 = 2 * Math.tan(50 * Math.PI / 360);
    // min(1.35, 600/900*1.2=0.8) = 0.8
    expect(short.frac).toBeCloseTo(19 * 0.8 / 600 * t2, 10);
  });

  it('labelScale: fallback viewport kosong (800×600)', () => {
    const r = labelScale(0, 0, 50, 20);
    const t2 = 2 * Math.tan(50 * Math.PI / 360);
    expect(r.frac).toBeCloseTo(19 * Math.min(1.35, 600 / 900 * 1.2) / 600 * t2, 10);
  });
});
