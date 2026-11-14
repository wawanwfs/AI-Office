import { describe, it, expect } from 'vitest';
import { menuHighlight, MENU_HIGHLIGHT_SEC } from '../scene/parts/effects.js';
import { drawMenuBoard } from '../scene/parts/sign_canvas.js';

describe('menuHighlight (siklus 518)', () => {
  it('guard: waktu non-finite → netral (item 0)', () => {
    expect(menuHighlight('x')).toBe(0);
    expect(menuHighlight(NaN)).toBe(0);
    expect(menuHighlight(Infinity)).toBe(0);
  });

  it('indeks selalu 0…2 (3 item menu kafe)', () => {
    for (let k = 0; k < 500; k++) {
      const v = menuHighlight(k * 1.37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('berganti tiap MENU_HIGHLIGHT_SEC (rotasi deterministik)', () => {
    expect(menuHighlight(0)).toBe(0);
    expect(menuHighlight(MENU_HIGHLIGHT_SEC)).toBe(1);
    expect(menuHighlight(MENU_HIGHLIGHT_SEC * 2)).toBe(2);
    expect(menuHighlight(MENU_HIGHLIGHT_SEC * 3)).toBe(0); // siklus penuh
    // di dalam slot → tetap sama
    expect(menuHighlight(MENU_HIGHLIGHT_SEC * 0.99)).toBe(0);
    expect(menuHighlight(MENU_HIGHLIGHT_SEC * 2.5)).toBe(2);
  });

  it('aman utk elapsed negatif (mod aman)', () => {
    const v = menuHighlight(-1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(2);
  });

  it('semua item ter-highlight dalam satu siklus penuh (rotasi merata)', () => {
    const seen = new Set();
    for (let k = 0; k < 60; k++) seen.add(menuHighlight(k * 1.1));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe('drawMenuBoard highlight (siklus 518)', () => {
  const rec = () => {
    const ops = [];
    const h = {
      set fillStyle(v) { ops.push(['fillStyle', v]); },
      set strokeStyle(v) { ops.push(['strokeStyle', v]); },
      set lineWidth(v) { ops.push(['lineWidth', v]); },
      set font(v) { ops.push(['font', v]); },
    };
    h.fillRect = () => ops.push(['fillRect']);
    h.strokeRect = () => ops.push(['strokeRect']);
    h.fillText = (...a) => ops.push(['fillText', ...a]);
    h.ops = ops;
    return h;
  };
  const rows = (c) => c.ops.filter(o => o[0] === 'fillText').slice(1);
  const styleOfRow = (c, i) => {
    const all = c.ops;
    const idx = all.findIndex(o => o[0] === 'fillText' && all.indexOf(o) > 0 && all[o] !== undefined);
    // sederhana: temukan fillText ke-(i+1) lalu fillStyle terdekat sebelumnya setelah font monospace
    const fills = all.map((o, j) => [o, j]).filter(([o]) => o[0] === 'fillText');
    const [row, rowJ] = fills[i + 1]; // +1: skip judul
    let st = null;
    for (let j = rowJ - 1; j >= 0; j--) if (all[j][0] === 'fillStyle') { st = all[j][1]; break; }
    return st;
  };

  it('tanpa argumen: semua baris warna dasar #EEE (kompat lama)', () => {
    const c = rec();
    drawMenuBoard(c);
    rows(c).forEach(() => {}); // struktur
    [0, 1, 2].forEach(i => expect(styleOfRow(c, i)).toBe('#EEE'));
  });

  it('highlight=1: baris kedua kuning #FFE082, lainnya #EEE', () => {
    const c = rec();
    drawMenuBoard(c, 1);
    expect(styleOfRow(c, 0)).toBe('#EEE');
    expect(styleOfRow(c, 1)).toBe('#FFE082');
    expect(styleOfRow(c, 2)).toBe('#EEE');
  });

  it('highlight di luar rentang / bukan integer → tak ada highlight', () => {
    const c = rec();
    drawMenuBoard(c, 5);
    [0, 1, 2].forEach(i => expect(styleOfRow(c, i)).toBe('#EEE'));
    const c2 = rec();
    drawMenuBoard(c2, 1.5);
    [0, 1, 2].forEach(i => expect(styleOfRow(c2, i)).toBe('#EEE'));
  });

  it('teks & posisi baris tidak berubah (regresi konten)', () => {
    const c = rec();
    drawMenuBoard(c, 2);
    expect(rows(c).map(o => [o[1], o[3]])).toEqual([
      ['Kopi susu      15k', 75],
      ['Americano     18k', 100],
      ['Matcha latte  22k', 125],
    ]);
  });
});
