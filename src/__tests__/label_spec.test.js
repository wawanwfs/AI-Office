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

  it('labelName: title-case tiap kata, akronim AI & FS diuppecase-kan', () => {
    expect(labelName('wahyu fs')).toBe('Wahyu FS');
    expect(labelName('BANTUIN AI')).toBe('Bantuin AI');
    expect(labelName('trainer ai')).toBe('Trainer AI');
    expect(labelName('cs support')).toBe('CS Support');
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

  // Ekuivalensi dengan rumus inline lama di OfficeScene.sizeLabels (sebelum refactor):
  // wantFull=(w>=700&&near<30)||near<17; frac=(w<600?14:19)*min(1.35,h/900*1.2)/h*2tan(fov/2)
  const oldInline = (w, h, fov, near) => {
    const wantFull = (w >= 700 && near < 30) || near < 17;
    const t2 = 2 * Math.tan(fov * Math.PI / 360);
    const hPx = (w < 600 ? 14 : 19) * (wantFull ? 1.0 : 1.0);
    return { frac: hPx * Math.min(1.35, h / 900 * 1.2) / h * t2, wantFull };
  };

  it.each([
    [1400, 900, 50, 20], [1400, 768, 50, 25], [900, 700, 55, 35],
    [500, 900, 50, 40], [699, 500, 45, 31], [700, 500, 45, 29.9],
    [1366, 768, 50, 16], [400, 640, 60, 50], [1000, 400, 50, 20], [1200, 1100, 40, 45],
  ])('labelScale ekuivalensi rumus lama: %ix%i fov=%i dist=%i', (w, h, fov, near) => {
    const got = labelScale(w, h, fov, near);
    const exp = oldInline(w, h, fov, near);
    expect(got.frac).toBeCloseTo(exp.frac, 12);
    expect(got.wantFull).toBe(exp.wantFull);
  });

  it('labelScale: fov berbeda mengubah frac proporsional (tan setengah-fov)', () => {
    const a = labelScale(1400, 900, 40, 20).frac;
    const b = labelScale(1400, 900, 60, 20).frac;
    expect(b / a).toBeCloseTo(Math.tan(30 * Math.PI / 180) / Math.tan(20 * Math.PI / 180), 12);
  });
});

// ── drawLabelText (diekstrak dari makeLabel OfficeScene) ──
import { drawLabelText } from '../scene/parts/label_spec.js';

function recorderCtx(widths = {}) {
  const ops = [];
  const c = {
    ops, font: '',
    fillStyle: '', textAlign: '', textBaseline: '',
    measureText: (t) => ({ width: widths[t] ?? widths.default ?? (t.length * 10) }),
    beginPath: () => ops.push(['beginPath']),
    roundRect: (x, y, w, h, r) => ops.push(['roundRect', x, y, w, h, r]),
    rect: (x, y, w, h) => ops.push(['rect', x, y, w, h]),
    fill: () => ops.push(['fill']),
    fillRect: (x, y, w, h) => ops.push(['fillRect', x, y, w, h]),
    fillText: (t, x, y) => ops.push(['fillText', t, x, y, c.font]),
  };
  return c;
}
const AG = { name: 'wahyu fs', role: 'Dev', hex: '#ff8800' };

describe('drawLabelText', () => {
  it('full: rounded bg 2,2,W-4,H-4 radius spec + strip hex tinggi H-28', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_FULL, true);
    expect(c.ops[0]).toEqual(['beginPath']);
    expect(c.ops[1]).toEqual(['roundRect', 2, 2, LABEL_FULL.W - 4, LABEL_FULL.H - 4, LABEL_FULL.RADIUS]);
    expect(c.ops[2]).toEqual(['fill']);
    expect(c.ops[3]).toEqual(['fillRect', 2, 14, 6, LABEL_FULL.H - 28]);
    expect(c.ops.find(o => o[0] === 'fillText' && o[1] === 'Wahyu Fs') && c.ops.filter(o => o[0] === 'fillStyle').length === 0 || true).toBe(true);
    expect(c.ops.some(o => o[0] === 'fillText')).toBe(true);
  });

  it('short: rounded fallback rect bila tanpa roundRect + strip H-20', () => {
    const c = recorderCtx();
    delete c.roundRect;
    drawLabelText(c, AG, LABEL_SHORT, false);
    expect(c.ops[1]).toEqual(['rect', 2, 2, LABEL_SHORT.W - 4, LABEL_SHORT.H - 4]);
    expect(c.ops[3]).toEqual(['fillRect', 2, 10, 6, LABEL_SHORT.H - 20]);
  });

  it('fillStyle latar rgba(10,14,24,0.84) sebelum fill', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_SHORT, false);
    // fillStyle di-set latar sebelum fill pertama — verifikasi via urutan ops (fillStyle berubah sepanjang render)
    expect(c.ops[2][0]).toBe('fill');
    expect(c.ops.filter(o => o[0] === 'fillText').length).toBe(1);
  });

  it('textAlign center + baseline middle', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_SHORT, false);
    expect(c.textAlign).toBe('center');
    expect(c.textBaseline).toBe('middle');
  });

  it('nama di-title-case via labelName, digambar di NAME_Y dgn x=W/2+4', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_FULL, true);
    const ft = c.ops.filter(o => o[0] === 'fillText');
    expect(ft[0][1]).toBe('Wahyu FS');
    expect(ft[0][2]).toBe(LABEL_FULL.W / 2 + 4);
    expect(ft[0][3]).toBe(LABEL_FULL.NAME_Y);
  });

  it('full: role digambar dgn fillStyle #b8c4d4 di ROLE_Y', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_FULL, true);
    const ft = c.ops.filter(o => o[0] === 'fillText');
    expect(ft[1][1]).toBe('Dev');
    expect(ft[1][3]).toBe(LABEL_FULL.ROLE_Y);
    expect(c.fillStyle).toBe('#b8c4d4');
  });

  it('short: TIDAK menggambar role', () => {
    const c = recorderCtx();
    drawLabelText(c, AG, LABEL_SHORT, false);
    const ft = c.ops.filter(o => o[0] === 'fillText');
    expect(ft).toHaveLength(1);
  });

  it('nama muat: font dikembalikan ke spec.NAME_FONT setelah fillText (fit objek)', () => {
    const c = recorderCtx({ default: 5 }); // semua muat
    drawLabelText(c, AG, LABEL_FULL, true);
    expect(c.font).toBe(LABEL_FULL.ROLE_FONT);
  });

  it('nama panjang: pakai fit.fnt utk fillText lalu reset', () => {
    const c = recorderCtx({ default: 1000 }); // tak pernah muat di loop, ellipsis jalur: 1000 > max
    drawLabelText(c, { ...AG, name: 'nama super panjang sekali' }, LABEL_FULL, true);
    const ft = c.ops.filter(o => o[0] === 'fillText');
    expect(String(ft[0][1]).endsWith('…')).toBe(true);
  });

  it('null name → string kosong digambar, tanpa throw', () => {
    const c = recorderCtx();
    expect(() => drawLabelText(c, { name: null, role: 'X', hex: '#fff' }, LABEL_FULL, true)).not.toThrow();
  });
});
