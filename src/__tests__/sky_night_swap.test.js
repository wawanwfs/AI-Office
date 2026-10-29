// Siklus 164 — swap tekstur langit jendela siang↔malam (sky_canvas + daycycle).
// Dulu skyTex digambar SEKALI (langit siang) dan tak pernah di-update: saat jam
// malam (daylight 0.3, latar NAVY) semua jendela memancarkan langit biru terang
// + awan putih. Sekarang createLighting me-repaint kanvas skyTex sesuai daylight.
import { describe, it, expect, vi } from 'vitest';
import { drawSky, drawSkyNight } from '../scene/parts/sky_canvas.js';
import { createLighting } from '../scene/parts/daycycle.js';

// ── recorder ctx (pola sky_canvas.test.js) ──
const grad = (ops) => ({ stops: [], addColorStop(...a) { this.stops.push(a); ops.push(['stop', ...a]); } });
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
  h.arc = (...a) => ops.push(['arc', ...a]);
  h.ellipse = (...a) => ops.push(['ellipse', ...a]);
  h.fill = () => ops.push(['fill']);
  h.ops = ops;
  return h;
};

describe('drawSkyNight — langit malam jendela', () => {
  it('gradien vertikal gelap (#050B22→#16264E), BUKAN warna langit siang', () => {
    const c = rec();
    drawSkyNight(c);
    expect(c.ops[0]).toEqual(['linGrad', 0, 0, 0, 128]);
    expect(c.ops[1]).toEqual(['stop', 0, '#050B22']);
    expect(c.ops[2]).toEqual(['stop', 0.65, '#0A1636']);
    expect(c.ops[3]).toEqual(['stop', 1, '#16264E']);
    // tidak ada warna biru siang di stop manapun
    const stops = c.ops.filter(o => o[0] === 'stop').map(o => o[2]);
    ['#4EA8EE', '#93D0F5', '#D6EDFB'].forEach((dayCol) => expect(stops).not.toContain(dayCol));
  });
  it('glow bulan radial di posisi sama dgn matahari siang (210,22)', () => {
    const c = rec();
    drawSkyNight(c);
    const i = c.ops.findIndex(o => o[0] === 'radGrad');
    expect(c.ops[i]).toEqual(['radGrad', 210, 22, 2, 210, 22, 46]);
    expect(c.ops[i + 1]).toEqual(['stop', 0, 'rgba(215,228,255,0.85)']);
    expect(c.ops[i + 2]).toEqual(['stop', 1, 'rgba(215,228,255,0)']);
  });
  it('tepat 15 bintang (arc) via beginPath+fill; TANPA awan ellipse', () => {
    const c = rec();
    drawSkyNight(c);
    expect(c.ops.filter(o => o[0] === 'arc').length).toBe(15);
    expect(c.ops.filter(o => o[0] === 'beginPath').length).toBe(15);
    expect(c.ops.filter(o => o[0] === 'ellipse').length).toBe(0); // awan siang hilang
  });
  it('glow kota hangat di horizon bawah (linear gradient y 84→128)', () => {
    const c = rec();
    drawSkyNight(c);
    const gi = c.ops.map(o => o.join('|')).join('\n');
    expect(gi).toContain('linGrad|0|84|0|128');
    const stops = c.ops.filter(o => o[0] === 'stop').map(o => o[2]);
    expect(stops).toContain('rgba(255,190,110,0)');
    expect(stops).toContain('rgba(255,190,110,0.22)');
  });
  it('drawSky (siang) tetap punya 4 awan — kontras dgn versi malam', () => {
    const c = rec();
    drawSky(c);
    expect(c.ops.filter(o => o[0] === 'ellipse').length).toBe(4);
    expect(c.ops.filter(o => o[0] === 'arc').length).toBe(0);
  });
});

// ── integrasi createLighting: apply() memicu repaint sesuai daylight ──
function makeSkyHarness() {
  const cv = rec(); // kanvas skyTex palsu dgn recorder
  let updated = 0;
  cv.__needsUpdate = () => { updated++; };
  cv.getContext = () => cv;
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    skyWinCanvas: cv,
    THREE: { Color: class {} },
  };
  return { cv, ctx, count: () => updated };
}

describe('createLighting — swap langit jendela sesuai waktu (siklus 164)', () => {
  it('malam (60): repaint ke langit malam + needsUpdate terpanggil', () => {
    const { cv, ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    const base = cv.ops.length;
    L.apply(60);
    expect(count()).toBe(1);
    // ops baru muncul di canvas = repaint terjadi
    expect(cv.ops.length).toBeGreaterThan(base);
    // gradien pertama repaint = warna malam
    const lin = cv.ops.filter(o => o[0] === 'linGrad');
    expect(lin[0].slice(1)).toEqual([0, 0, 0, 128]);
    const stops = cv.ops.filter(o => o[0] === 'stop').map(o => o[2]);
    expect(stops).toContain('#050B22');
  });
  it('siang (720): repaint balik ke langit siang (4 awan ellipse)', () => {
    const { cv, ctx } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(60);  // malam dulu
    const afterNight = cv.ops.filter(o => o[0] === 'ellipse').length;
    expect(afterNight).toBe(0);
    L.apply(720); // siang
    expect(cv.ops.filter(o => o[0] === 'ellipse').length).toBe(4);
  });
  it('repaint TIDAK berulang tiap tick dgn nilai sama (idempoten, hemat GPU)', () => {
    const { ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(720); L.apply(721); L.apply(722); // siang terus → 0 repaint (mulai day)
    expect(count()).toBe(0);
    L.apply(60); L.apply(61); L.apply(62);    // malam → 1 repaint saja
    expect(count()).toBe(1);
    L.apply(1380);                            // masih malam (daylight 0.3)
    expect(count()).toBe(1);
  });
  it('senja transisi (1100): daylight turun di bawah 0.55 → swap malam', () => {
    const { ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(1000); // siang penuh
    expect(count()).toBe(0);
    L.apply(1100); // daylight(1100) = 1-0.7*smooth(1020,1140,1100) ≈ 0.44 < 0.55
    expect(count()).toBe(1);
  });
  it('tanpa skyWinCanvas (test lama/ctx lama): apply tetap jalan tanpa error', () => {
    const ctx = {
      ambient: { intensity: 1 }, sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 }, scene: { background: null, fog: { color: null } },
      agentData: [], THREE: { Color: class {} },
    };
    const L = createLighting(ctx);
    expect(() => L.apply(60)).not.toThrow();
    expect(L.minutes).toBe(60);
  });
});
