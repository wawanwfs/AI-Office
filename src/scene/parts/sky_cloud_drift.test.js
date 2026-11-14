// Siklus 521: awan langit siang jendela bergerak (cloudOffset + drawSky elapsed).
// Murni — tanpa kanvas; recorder ctx untuk asersi posisi ellipse.
import { describe, it, expect } from 'vitest';
import { drawSky, cloudOffset, SKY_CLOUDS } from './sky_canvas.js';
import { createLighting } from './daycycle.js';

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
  h.arc = (...a) => ops.push(['arc', ...a]);
  h.globalAlpha = 1;
  h.fill = () => ops.push(['fill']);
  h.ops = ops;
  return h;
};
const cloudX = (c) => c.ops.filter(o => o[0] === 'ellipse').map(o => o[1]);

describe('cloudOffset (siklus 521)', () => {
  it('elapsed 0 → posisi awal = pusat awan asli (regresi tampilan lama)', () => {
    SKY_CLOUDS.forEach(([cx], i) => expect(cloudOffset(i, 0)).toBe(cx));
  });
  it('guard non-finite (NaN/Infinity) → netral 0 (posisi awal)', () => {
    expect(cloudOffset(1, NaN)).toBe(SKY_CLOUDS[1][0]);
    expect(cloudOffset(2, Infinity)).toBe(SKY_CLOUDS[2][0]);
    // idx non-finite → fallback awan 0, tapi elapsed valid tetap berlaku (drift)
    expect(cloudOffset(NaN, 100)).toBe(cloudOffset(0, 100));
  });
  it('deterministik + makin lama makin jauh (drift positif) sebelum wrap', () => {
    const a = cloudOffset(0, 10), b = cloudOffset(0, 20);
    expect(cloudOffset(0, 10)).toBe(a); // deterministik
    expect(b).toBeGreaterThan(a);       // bergerak ke kanan
  });
  it('laju beda antar awan (tak sinkron): posisi t=100 ≠ rasio sama', () => {
    const x0 = cloudOffset(0, 100) - SKY_CLOUDS[0][0];
    const x1 = cloudOffset(1, 100) - SKY_CLOUDS[1][0];
    // kecepatan 1.6 vs 2.4 → drift beda (mod beda lebar, tapi tak boleh identik persis dgn rasio sama)
    expect(x0).not.toBe(x1);
  });
  it('wrap: selalu dalam rentang kanvas 256 (+margin lebar), tak lolos kanan jauh', () => {
    for (const t of [0, 50, 120, 500, 1e4]) {
      for (let i = 0; i < SKY_CLOUDS.length; i++) {
        const px = cloudOffset(i, t);
        expect(px).toBeLessThanOrEqual(256 + SKY_CLOUDS[i][2] / 2 + 1);
        expect(px).toBeGreaterThanOrEqual(-SKY_CLOUDS[i][2] / 2 - 1);
      }
    }
  });
});

describe('drawSky(x, elapsed) — posisi awan mengikuti elapsed', () => {
  it('default (tanpa arg) = posisi awal identik kode lama (4 awan di posisi asli)', () => {
    const c = rec();
    drawSky(c);
    const xs = cloudX(c);
    SKY_CLOUDS.forEach(([cx], i) => expect(xs[i]).toBe(cx));
  });
  it('elapsed besar → posisi ellipse berubah (awan benar-benar digambar di tempat lain)', () => {
    const a = rec(); drawSky(a, 0);
    const b = rec(); drawSky(b, 400);
    expect(cloudX(b)).not.toEqual(cloudX(a));
    expect(cloudX(b)).toEqual(SKY_CLOUDS.map((_, i) => cloudOffset(i, 400)));
  });
  it('tetap 4 awan ellipse + 4 fill (struktur gambar tak berubah)', () => {
    const c = rec(); drawSky(c, 777);
    expect(c.ops.filter(o => o[0] === 'ellipse').length).toBe(4);
    expect(c.ops.filter(o => o[0] === 'fill').length).toBe(4);
  });
});

describe('createLighting.paintClouds — repaint langit siang berkala (siklus 521)', () => {
  const THREE = { Color: function Color(c) { this.c = c; } };
  const mkLight = (canvas) => createLighting({
    THREE, scene: { fog: { color: null } }, renderer: {}, sun: {}, ambient: {}, agentData: [],
    skyWinCanvas: canvas,
  });
  const fakeCv = () => {
    const calls = [];
    return { getContext: () => rec(), __needsUpdate: () => calls.push(1), calls };
  };
  it('siang: repaint tiap ≥3 dtk akumulasi (2×1.5 dtk → 1 repaint); malam NO-OP total', () => {
    const cv = fakeCv();
    const L = mkLight(cv);
    L.apply(720); // siang (daylight 1) → skyNight=false
    const before = cv.calls.length;
    L.paintClouds(1.5); L.paintClouds(1.5); // total 3.0 → repaint sekali
    expect(cv.calls.length).toBe(before + 1);
    L.apply(0); // malam → skyNight=true
    const b2 = cv.calls.length;
    L.paintClouds(10); L.paintClouds(10);
    expect(cv.calls.length).toBe(b2);
  });
  it('akumulasi 3 dtk di bawah ambang tak repaint (2.9 dtk)', () => {
    const cv = fakeCv();
    const L = mkLight(cv);
    L.apply(720);
    const before = cv.calls.length;
    L.paintClouds(1.4); L.paintClouds(1.5); // 2.9 < 3
    expect(cv.calls.length).toBe(before);
  });
  it('tanpa skyWinCanvas: paintClouds tak error (guard harness lama)', () => {
    const L = createLighting({ THREE: {}, scene: {}, renderer: {}, sun: {}, ambient: {}, agentData: [] });
    expect(() => { L.paintClouds(3); }).not.toThrow();
  });
});
