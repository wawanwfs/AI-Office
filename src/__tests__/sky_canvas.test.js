import { describe, it, expect } from 'vitest';
import { drawSky, drawGlassSheen } from '../scene/parts/sky_canvas.js';

// recorder ctx: mencatat ops & argumen; gradien palsu yang mencatat addColorStop
const grad = ops => ({
  stops: [],
  addColorStop(...a) { this.stops.push(a); ops.push(['stop', ...a]); },
});
const rec = () => {
  const ops = [];
  const h = {
    _fs: '#000',
    get fillStyle() { return h._fs; }, set fillStyle(v) { h._fs = v; ops.push(['fillStyle', v]); },
  };
  h.createLinearGradient = (...a) => { ops.push(['linGrad', ...a]); return grad(ops); };
  h.createRadialGradient = (...a) => { ops.push(['radGrad', ...a]); return grad(ops); };
  h.fillRect = (...a) => ops.push(['fillRect', ...a]);
  h.beginPath = () => ops.push(['beginPath']);
  h.ellipse = (...a) => ops.push(['ellipse', ...a]);
  h.fill = () => ops.push(['fill']);
  h.ops = ops;
  return h;
};

describe('drawSky (256×128 langit jendela)', () => {
  it('gradien vertikal dengan 3 stop warna lalu fillRect penuh', () => {
    const c = rec();
    drawSky(c);
    expect(c.ops[0]).toEqual(['linGrad', 0, 0, 0, 128]);
    expect(c.ops[1]).toEqual(['stop', 0, '#4EA8EE']);
    expect(c.ops[2]).toEqual(['stop', 0.65, '#93D0F5']);
    expect(c.ops[3]).toEqual(['stop', 1, '#D6EDFB']);
    expect(c.ops[4]).toEqual(['fillStyle', c.ops[4][1]]);
    expect(c.ops[5]).toEqual(['fillRect', 0, 0, 256, 128]);
  });
  it('pita matahari radial di (210,22) r 4→80 dgn 2 stop', () => {
    const c = rec();
    drawSky(c);
    const i = c.ops.findIndex(o => o[0] === 'radGrad');
    expect(c.ops[i]).toEqual(['radGrad', 210, 22, 4, 210, 22, 80]);
    expect(c.ops[i + 1]).toEqual(['stop', 0, 'rgba(255,250,220,0.95)']);
    expect(c.ops[i + 2]).toEqual(['stop', 1, 'rgba(255,250,220,0)']);
  });
  it('tepat 4 awan ellipse putih via beginPath+ellipse+fill', () => {
    const c = rec();
    drawSky(c);
    const clouds = c.ops.filter(o => o[0] === 'ellipse');
    expect(clouds.length).toBe(4);
    expect(clouds[0].slice(1)).toEqual([40, 38, 30, 7, 0, 0, 7]); // cw/2, ch/2
    expect(clouds[1].slice(1)).toEqual([130, 60, 40, 6, 0, 0, 7]);
    expect(clouds[2].slice(1)).toEqual([190, 30, 27.5, 5, 0, 0, 7]);
    expect(clouds[3].slice(1)).toEqual([80, 90, 35, 6, 0, 0, 7]);
    expect(c.ops.filter(o => o[0] === 'beginPath').length).toBe(4);
    expect(c.ops.filter(o => o[0] === 'fill').length).toBe(4);
    expect(c.ops.filter(o => o[0] === 'fillStyle' && o[1] === 'rgba(255,255,255,0.85)').length).toBe(1);
  });
});

describe('drawGlassSheen (256×128 overlay kaca)', () => {
  it('2 gradien diagonal dgn 5+3 stop, tiap gradien di-fillRect penuh', () => {
    const c = rec();
    drawGlassSheen(c);
    const g1 = c.ops[0];
    expect(g1).toEqual(['linGrad', 0, 128, 256, 0]);
    expect(c.ops[1]).toEqual(['stop', 0, 'rgba(255,255,255,0.00)']);
    expect(c.ops[2]).toEqual(['stop', 0.42, 'rgba(210,235,255,0.05)']);
    expect(c.ops[3]).toEqual(['stop', 0.5, 'rgba(255,255,255,0.22)']);
    expect(c.ops[4]).toEqual(['stop', 0.58, 'rgba(210,235,255,0.05)']);
    expect(c.ops[5]).toEqual(['stop', 1, 'rgba(255,255,255,0.00)']);
    expect(c.ops[8]).toEqual(['linGrad', 256, 128, 60, 0]);
    expect(c.ops[9]).toEqual(['stop', 0, 'rgba(255,255,255,0.00)']);
    expect(c.ops[10]).toEqual(['stop', 0.46, 'rgba(255,255,255,0.11)']);
    expect(c.ops[11]).toEqual(['stop', 0.54, 'rgba(255,255,255,0.00)']);
    const rects = c.ops.filter(o => o[0] === 'fillRect');
    expect(rects).toEqual([
      ['fillRect', 0, 0, 256, 128],
      ['fillRect', 0, 0, 256, 128],
      ['fillRect', 0, 0, 256, 128],
    ]);
  });
  it('tint biru rgba(140,200,255,0.10) adalah fillStyle terakhir', () => {
    const c = rec();
    drawGlassSheen(c);
    const fs = c.ops.filter(o => o[0] === 'fillStyle');
    expect(fs[fs.length - 1]).toEqual(['fillStyle', 'rgba(140,200,255,0.10)']);
    const lastRect = [...c.ops].reverse().find(o => o[0] === 'fillRect');
    expect(lastRect).toEqual(['fillRect', 0, 0, 256, 128]);
  });
});
