import { describe, it, expect } from 'vitest';
import { drawWoodFloor, drawAoStrip, drawTerrazzo } from '../scene/parts/floor_canvas.js';

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

// ── drawTerrazzo (512×512) — painter lantai terazzo; murni, deterministik ──
describe('drawTerrazzo (512×512)', () => {
  // recorder diperluas untuk operasi path/ellipse/stroke/globalAlpha
  const recFull = () => {
    const c = rec();
    c.globalAlpha = 1;
    c.beginPath = () => c.ops.push(['beginPath']);
    c.moveTo = (...a) => c.ops.push(['moveTo', ...a]);
    c.lineTo = (...a) => c.ops.push(['lineTo', ...a]);
    c.stroke = () => c.ops.push(['stroke']);
    c.ellipse = (...a) => c.ops.push(['ellipse', ...a]);
    c.fill = () => c.ops.push(['fill']);
    return c;
  };

  it('latar default #E6E0D2; tint kustom dipakai apa adanya', () => {
    const a = recFull();
    drawTerrazzo(a);
    expect(a.ops[0]).toEqual(['fillStyle', '#E6E0D2']);
    expect(a.ops[1]).toEqual(['fillRect', 0, 0, 512, 512]);
    const b = recFull();
    drawTerrazzo(b, '#F2EDE3');
    expect(b.ops[0]).toEqual(['fillStyle', '#F2EDE3']);
    expect(b.ops[1]).toEqual(['fillRect', 0, 0, 512, 512]);
  });

  it('deterministik: dua pemanggilan menghasilkan urutan operasi identik', () => {
    const a = recFull();
    drawTerrazzo(a);
    const b = recFull();
    drawTerrazzo(b);
    expect(a.ops).toEqual(b.ops);
  });

  it('420 chip ellipse + 10 lempeng marmer ditarik dengan radius & pusat wajar, alpha kembali ke 1', () => {
    const c = recFull();
    drawTerrazzo(c);
    const ellipses = c.ops.filter(o => o[0] === 'ellipse');
    expect(ellipses).toHaveLength(430);
    // 420 chip kecil pertama
    for (let i = 0; i < 420; i++) {
      const [, cx, cy, rx, ry] = ellipses[i];
      expect(cx).toBeGreaterThanOrEqual(0); expect(cx).toBeLessThanOrEqual(512);
      expect(cy).toBeGreaterThanOrEqual(0); expect(cy).toBeLessThanOrEqual(512);
      expect(rx).toBeGreaterThanOrEqual(5); expect(rx).toBeLessThanOrEqual(22);
      expect(ry).toBeGreaterThanOrEqual(0); expect(ry).toBeLessThanOrEqual(28);
    }
    // 10 lempeng marmer kilap lembut
    for (let i = 420; i < 430; i++) {
      const [, cx, cy, rx, ry] = ellipses[i];
      expect(cx).toBeGreaterThanOrEqual(0); expect(cx).toBeLessThanOrEqual(512);
      expect(cy).toBeGreaterThanOrEqual(0); expect(cy).toBeLessThanOrEqual(512);
      expect(rx).toBeGreaterThanOrEqual(60); expect(rx).toBeLessThanOrEqual(190);
      expect(ry).toBeGreaterThanOrEqual(30); expect(ry).toBeLessThanOrEqual(200);
    }
    expect(c.globalAlpha).toBe(1);
  });

  it('5 vena marmer + grid nat 5×5 = 15 stroke; garis grid di kelipatan 128', () => {
    const c = recFull();
    drawTerrazzo(c);
    const strokes = c.ops.filter(o => o[0] === 'stroke');
    expect(strokes).toHaveLength(15);
    const ls = c.ops.filter(o => o[0] === 'lineTo');
    // vertikal: moveTo(0,0)→lineTo(0,512), dst; horizontal: lineTo(512,0)
    expect(ls.some(o => o[1] === 0 && o[2] === 512)).toBe(true);
    expect(ls.some(o => o[1] === 512 && o[2] === 0)).toBe(true);
    const gs = [0, 128, 256, 384, 512];
    const moves = c.ops.filter(o => o[0] === 'moveTo');
    gs.forEach(g => expect(moves.some(o => o[1] === g && o[2] === 0)).toBe(true));
  });
});
