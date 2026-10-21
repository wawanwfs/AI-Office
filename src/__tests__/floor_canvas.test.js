import { describe, it, expect } from 'vitest';
import { drawWoodFloor, drawAoStrip } from '../scene/parts/floor_canvas.js';

// recorder ctx + gradien palsu (pola sama dgn sky_canvas.test.js)
const rec = () => {
  const ops = [];
  const h = {};
  ['fillStyle', 'strokeStyle'].forEach(p => Object.defineProperty(h, p, {
    get() { return h['_' + p]; },
    set(v) { h['_' + p] = v; ops.push([p, v]); },
  }));
  h.createLinearGradient = (x0, y0, x1, y1) => {
    ops.push(['createLinearGradient', x0, y0, x1, y1]);
    const stops = [];
    const g = {
      addColorStop: (o, c) => { stops.push([o, c]); ops.push(['addColorStop', o, c]); },
      _stops: stops,
    };
    (h._grads = h._grads || []).push(g);
    return g;
  };
  h.fillRect = (...a) => ops.push(['fillRect', ...a]);
  h.ops = ops;
  return h;
};

describe('drawWoodFloor (512×512)', () => {
  it('latar #8A7C68 penuh lalu 10 baris papan (y kelipatan 52)', () => {
    const c = rec();
    drawWoodFloor(c);
    expect(c.ops[0]).toEqual(['fillStyle', '#8A7C68']);
    expect(c.ops[1]).toEqual(['fillRect', 0, 0, 512, 512]);
    const boards = c.ops.filter(o => o[0] === 'fillRect').slice(1);
    const ys = [...new Set(boards.map(o => o[2]))];
    expect(ys).toEqual([0, 52, 104, 156, 208, 260, 312, 364, 416, 468].map(y => y + 2));
    // tiap baris punya top board mengarah ke kiri saat baris ganjil (x0 mulai -60)
    expect(boards.some(o => o[1] === -58)).toBe(true);
  });

  it('lebar & warna papan deterministik sesuai rumus asli', () => {
    const c = rec();
    drawWoodFloor(c);
    const fills = c.ops.filter(o => o[0] === 'fillStyle' && o[1].startsWith('rgb('));
    // baris pertama, papan pertama: r=0, x0=0 → w=120, shade=112 → rgb(112,94,67)
    expect(fills[0][1]).toBe('rgb(112,94,67)');
    const rects = c.ops.filter(o => o[0] === 'fillRect').slice(1);
    expect(rects[0]).toEqual(['fillRect', 2, 2, 117, 48]); // w-3=117
    expect(rects[1]).toEqual(['fillRect', 2, 2, 117, 2]);   // nat tipis
    // papan kedua baris 0: x0=120 → w=150, shade=112
    const second = c.ops.find(o => o[0] === 'fillRect' && o[1] === 122 && o[2] === 2);
    expect(second[3]).toBe(147); // w-3
  });

  it('nurutan loop: papan terakhir baris berakhir ≥ 512 lalu berhenti', () => {
    const c = rec();
    drawWoodFloor(c);
    const rects = c.ops.filter(o => o[0] === 'fillRect').slice(1);
    // semua x0 + w ≤ 512 + w (x0 < 512 saat masuk loop) & x0 selalu < 512
    rects.forEach(o => expect(o[1]).toBeLessThan(512));
    // jumlah papan > 10 baris × ≥1 papan
    expect(rects.length).toBeGreaterThan(20);
    // tiap dua fillRect papan disusul nat rgba
    for (let i = 0; i < rects.length - 1; i += 2) {
      expect(c.ops.filter(o => o[0] === 'fillStyle' && o[1] === 'rgba(90,70,50,0.25)').length).toBeGreaterThan(0);
      break;
    }
    expect(c.ops.filter(o => o[0] === 'fillStyle' && o[1] === 'rgba(90,70,50,0.25)').length)
      .toBe(c.ops.filter(o => o[0] === 'fillStyle' && o[1].startsWith('rgb(')).length);
  });
});

describe('drawAoStrip (16×64)', () => {
  it('gradien vertikal 3 stop dgn kegelapan menurun lalu fillRect penuh', () => {
    const c = rec();
    drawAoStrip(c);
    expect(c.ops[0]).toEqual(['createLinearGradient', 0, 0, 0, 64]);
    expect(c.ops[1]).toEqual(['addColorStop', 0, 'rgba(0,0,0,0.52)']);
    expect(c.ops[2]).toEqual(['addColorStop', 0.45, 'rgba(0,0,0,0.24)']);
    expect(c.ops[3]).toEqual(['addColorStop', 1, 'rgba(0,0,0,0)']);
    expect(c.ops[4][0]).toBe('fillStyle');
    expect(c.ops[4][1]).toBe(c._grads[0]);
    expect(c.ops[5]).toEqual(['fillRect', 0, 0, 16, 64]);
  });

  it('tidak ada oper lain selain gradien+fill', () => {
    const c = rec();
    drawAoStrip(c);
    const kinds = new Set(c.ops.map(o => o[0]));
    expect([...kinds].sort()).toEqual(['addColorStop', 'createLinearGradient', 'fillRect', 'fillStyle']);
  });
});
