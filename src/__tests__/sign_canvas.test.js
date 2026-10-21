import { describe, it, expect } from 'vitest';
import { drawMenuBoard, drawPoster, drawWelcomeSign } from '../scene/parts/sign_canvas.js';

// recorder ctx: mencatat ops & argumen (pola sama dgn tv_canvas.test.js)
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

describe('drawMenuBoard (256×140)', () => {
  it('latar gelap penuh lalu bingkai oranye', () => {
    const c = rec();
    drawMenuBoard(c);
    expect(c.ops[0]).toEqual(['fillStyle', '#1A1A2E']);
    expect(c.ops[1]).toEqual(['fillRect', 0, 0, 256, 140]);
    expect(c.ops[2]).toEqual(['strokeStyle', '#F59E0B']);
    expect(c.ops[3]).toEqual(['lineWidth', 6]);
    expect(c.ops[4]).toEqual(['strokeRect', 3, 3, 250, 134]);
  });
  it('judul WFS CAFÉ oranye bold 26px', () => {
    const c = rec();
    drawMenuBoard(c);
    const i = c.ops.findIndex(o => o[0] === 'fillText');
    expect(c.ops[i]).toEqual(['fillText', 'WFS CAFÉ', 34, 40]);
    expect(c.ops[i - 1]).toEqual(['fillStyle', '#F59E0B']);
    expect(c.ops[i - 2]).toEqual(['font', 'bold 26px sans-serif']);
  });
  it('tiga baris menu monospace 15px warna #EEE pada y 75/100/125', () => {
    const c = rec();
    drawMenuBoard(c);
    const items = c.ops.filter(o => o[0] === 'fillText').slice(1);
    expect(items.map(o => [o[1], o[3]])).toEqual([
      ['Kopi susu      15k', 75],
      ['Americano     18k', 100],
      ['Matcha latte  22k', 125],
    ]);
    items.forEach(o => expect(o[1] && c.ops).toBeTruthy());
    expect(c.ops.filter(o => o[0] === 'font' && o[1] === '15px monospace').length).toBe(1);
  });
});

describe('drawPoster (256×340)', () => {
  it('latar navy + bingkai warna tema lineWidth 8', () => {
    const p = rec();
    drawPoster(p, 'SHIP IT', '#F59E0B');
    expect(p.ops[0]).toEqual(['fillStyle', '#0f1a2e']);
    expect(p.ops[1]).toEqual(['fillRect', 0, 0, 256, 340]);
    expect(p.ops[2]).toEqual(['strokeStyle', '#F59E0B']);
    expect(p.ops[3]).toEqual(['lineWidth', 8]);
    expect(p.ops[4]).toEqual(['strokeRect', 10, 10, 236, 320]);
  });
  it('satu baris → satu fillText di (128,150), textAlign center', () => {
    const p = rec();
    drawPoster(p, 'SHIP IT', '#F59E0B');
    const texts = p.ops.filter(o => o[0] === 'fillText');
    expect(texts).toEqual([['fillText', 'SHIP IT', 128, 150]]);
    expect(p.ops.find(o => o[0] === 'textAlign')[1]).toBe('center');
  });
  it('dua baris (\n) → baris kedua y=206 (150+56)', () => {
    const p = rec();
    drawPoster(p, 'CODE\nCOFFEE', '#F472B6');
    const texts = p.ops.filter(o => o[0] === 'fillText');
    expect(texts.map(o => [o[1], o[3]])).toEqual([['CODE', 150], ['COFFEE', 206]]);
  });
  it('tiga baris → y=150/206/262', () => {
    const p = rec();
    drawPoster(p, 'A\nB\nC', '#FFF');
    expect(p.ops.filter(o => o[0] === 'fillText').map(o => o[3])).toEqual([150, 206, 262]);
  });
  it('font bold 48px & fillStyle teks = warna tema', () => {
    const p = rec();
    drawPoster(p, 'X', '#123456');
    expect(p.ops.find(o => o[0] === 'font')[1]).toBe('bold 48px sans-serif');
    // sebelum fillText pertama: textAlign=center lalu fillStyle=warna tema
    const i = p.ops.findIndex(o => o[0] === 'fillText');
    expect(p.ops[i - 1]).toEqual(['textAlign', 'center']);
    expect(p.ops.slice(0, i - 1).some(o => o[0] === 'fillStyle' && o[1] === '#123456')).toBe(true);
  });
});

describe('drawWelcomeSign (1024×320)', () => {
  it('latar navy + bingkai emas lineWidth 10', () => {
    const n = rec();
    drawWelcomeSign(n);
    expect(n.ops[0]).toEqual(['fillStyle', '#0F1B2E']);
    expect(n.ops[1]).toEqual(['fillRect', 0, 0, 1024, 320]);
    expect(n.ops[2]).toEqual(['strokeStyle', '#D4AF37']);
    expect(n.ops[3]).toEqual(['lineWidth', 10]);
    expect(n.ops[4]).toEqual(['strokeRect', 10, 10, 1004, 300]);
  });
  it('judul WFS PROJECT emas 900 130px center di (512,150)', () => {
    const n = rec();
    drawWelcomeSign(n);
    const texts = n.ops.filter(o => o[0] === 'fillText');
    expect(texts[0]).toEqual(['fillText', 'WFS PROJECT', 512, 150]);
    expect(n.ops.find(o => o[0] === 'textAlign')[1]).toBe('center');
    expect(n.ops.find(o => o[0] === 'font')[1]).toBe('900 130px "Segoe UI",Arial,sans-serif');
  });
  it('subjudul putih 600 60px dgn pemisah middot di (512,250)', () => {
    const n = rec();
    drawWelcomeSign(n);
    const texts = n.ops.filter(o => o[0] === 'fillText');
    expect(texts[1][1]).toBe('Selamat Datang \u00b7 Welcome');
    expect(texts[1][2]).toBe(512);
    expect(texts[1][3]).toBe(250);
    expect(n.ops.find(o => o[0] === 'fillStyle' && o[1] === '#FFFFFF')).toBeTruthy();
    expect(n.ops.find(o => o[0] === 'font' && o[1] === '600 60px "Segoe UI",Arial,sans-serif')).toBeTruthy();
  });
  it('tepat 2 teks, tanpa state lain liar', () => {
    const n = rec();
    drawWelcomeSign(n);
    expect(n.ops.filter(o => o[0] === 'fillText').length).toBe(2);
  });
});
