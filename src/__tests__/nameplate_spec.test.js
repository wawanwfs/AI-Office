import { describe, it, expect } from 'vitest';
import { NAMEPLATE, PLATE, titleCase, clampText, drawNameplate } from '../scene/parts/nameplate_spec.js';

function mockCtx() {
  const calls = { fill: [], text: [], font: null, align: null, baseline: null };
  const c = {
    canvas: { width: 0, height: 0 },
    set font(f) { calls.font = f; }, get font() { return calls.font; },
    set textAlign(a) { calls.align = a; }, get textAlign() { return calls.align; },
    set textBaseline(b) { calls.baseline = b; }, get textBaseline() { return calls.baseline; },
    measureText: (t) => ({ width: t.length * 10 }),
    fillRect: (...a) => calls.fill.push(a),
    fillText: (t, x, y) => calls.text.push([t, x, y]),
    beginPath: () => {},
    roundRect: (...a) => calls.roundRect = a,
    rect: (...a) => calls.rect = a,
    fill: () => calls.fill.push(['path']),
  };
  c._calls = calls;
  return c;
}

describe('nameplate_spec — konstanta', () => {
  it('NAMEPLATE nilai historis (256×64, teks di x=132, nama y=24, role y=45)', () => {
    expect(NAMEPLATE.W).toBe(256);
    expect(NAMEPLATE.H).toBe(64);
    expect(NAMEPLATE.TEXT_X).toBe(132);
    expect(NAMEPLATE.NAME_Y).toBe(24);
    expect(NAMEPLATE.ROLE_Y).toBe(45);
    expect(NAMEPLATE.BG).toBe('rgba(8,12,22,0.88)');
    expect(NAMEPLATE.MAX_TEXT_W).toBe(220);
  });
  it('BAR aksen: x=2 y=10 w=7 h=44', () => {
    expect(NAMEPLATE.BAR).toEqual({ x: 2, y: 10, w: 7, h: 44 });
  });
  it('PLATE mesh historis: 0.62×0.155 di y=0.68 z=0.42, stand y=0.66 z=0.44', () => {
    expect(PLATE).toEqual({ w: 0.62, h: 0.155, y: 0.68, z: 0.42, standY: 0.66, standZ: 0.44 });
  });
});

describe('titleCase', () => {
  it('lowercase diawali kapital, akronim AI diuppecase-kan', () => { expect(titleCase('bantuin ai')).toBe('Bantuin AI'); });
  it('huruf besar semua dinormalisasi ke Title Case (akronim FS diuppecase-kan)', () => { expect(titleCase('WAHYU FS')).toBe('Wahyu FS'); });
  it('akronim lain juga diuppecase-kan (hr/qa/ui/ux/wfs/cs/pm)', () => {
    expect(titleCase('ui ux designer')).toBe('UI UX Designer');
    expect(titleCase('wfs project')).toBe('WFS Project');
    expect(titleCase('cs support')).toBe('CS Support');
    expect(titleCase('pm lead')).toBe('PM Lead');
  });
  it('non-string dipaksa string', () => { expect(titleCase(42)).toBe('42'); });
  it('kosong tetap kosong', () => { expect(titleCase('')).toBe(''); });
  it('kata setelah pemisah non-spasi ikut dikapitalisasi (hyphen/slash)', () => {
    expect(titleCase('data-science')).toBe('Data-Science');
    expect(titleCase('front-end dev')).toBe('Front-End Dev');
    expect(titleCase('intg/backend')).toBe('Intg/Backend');
  });
  it('akronim tetap uppercase walau setelah hyphen', () => {
    expect(titleCase('ai-bot')).toBe('AI-Bot');
    expect(titleCase('CTO-bot')).toBe('CTO-Bot');
  });
});

describe('clampText', () => {
  const c = mockCtx(); // lebar = 10px per char
  it('muat: pass-through tanpa ellipsis', () => {
    expect(clampText(c, 'abcdefghij', 100, 'F')).toBe('abcdefghij'); // 100 ≤ 100
  });
  it('kepanjangan: dipotong + …', () => {
    const r = clampText(c, 'abcdefghijk', 100, 'F'); // 11 char = 110 > 100
    expect(r.endsWith('…')).toBe(true);
    expect(r.length).toBeLessThanOrEqual(11); // terpotong
  });
  it('hasil selalu ≤ max setelah potong', () => {
    const r = clampText(c, 'x'.repeat(50), 100, 'F');
    expect((r.length - 1) * 10 + c.measureText('…').width).toBeLessThanOrEqual(100);
  });
  it('font di-set sebelum pengukuran', () => {
    clampText(c, 'abc', 5, 'myfont');
    expect(c._calls.font).toBe('myfont');
  });
});

describe('drawNameplate', () => {
  it('ukuran kanvas 256×64', () => {
    const c = mockCtx(); drawNameplate(c, 'RIZKY', 'Backend Engineer', '#22D3EE');
    expect(c.canvas.width).toBe(256); expect(c.canvas.height).toBe(64);
  });
  it('nama di (132,24) putih title-case; role di (132,45) warna sekunder', () => {
    const c = mockCtx(); drawNameplate(c, 'RIZKY', 'Backend Engineer', '#22D3EE');
    expect(c._calls.text).toContainEqual(['Rizky', 132, 24]);
    expect(c._calls.text).toContainEqual(['Backend Engineer', 132, 45]);
    expect(c._calls.align).toBe('center');
    expect(c._calls.baseline).toBe('middle');
  });
  it('bar aksen pakai hex agen', () => {
    const c = mockCtx(); drawNameplate(c, 'RIZKY', 'Backend Engineer', '#22D3EE');
    const bar = c._calls.fill.find(f => f[0] === NAMEPLATE.BAR.x);
    expect(bar).toBeDefined();
  });
  it('nama panjang di-clamp dengan ellipsis', () => {
    const c = mockCtx(); drawNameplate(c, 'SANGAT PANJANG SEKALI INI NAMANYA', 'Role', '#fff');
    const name = c._calls.text[0][0];
    expect(name.endsWith('…')).toBe(true);
  });
  it('role undefined tidak melempar error', () => {
    const c = mockCtx();
    expect(() => drawNameplate(c, 'RIZKY', undefined, '#fff')).not.toThrow();
  });
});
