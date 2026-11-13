// Siklus 501 — kedipan bintang langit malam jendela (sky_canvas + daycycle).
// Dulu 15 bintang digambar statis dgn alpha konstan 0.9 → langit malam beku.
// Kini starTwinkle(i, t) memodulasi alpha per bintang; daycycle.paintStars(dt)
// repaint kanvas tiap 2 dtk saat malam saja (hemat GPU, tak repaint siang).
import { describe, it, expect, vi } from 'vitest';
import { drawSkyNight, starTwinkle, STAR_TWINKLE_SEC, STAR_TWINKLE_MIN } from '../scene/parts/sky_canvas.js';
import { createLighting } from '../scene/parts/daycycle.js';

const grad = (ops) => ({ stops: [], addColorStop(...a) { this.stops.push(a); ops.push(['stop', ...a]); } });
const rec = () => {
  const ops = [];
  const h = { _fs: '#000', _ga: 1 };
  Object.defineProperty(h, 'fillStyle', { get: () => h._fs, set: (v) => { h._fs = v; ops.push(['fillStyle', v]); } });
  Object.defineProperty(h, 'globalAlpha', { get: () => h._ga, set: (v) => { h._ga = v; ops.push(['ga', v]); } });
  h.createLinearGradient = (...a) => { ops.push(['linGrad', ...a]); return grad(ops); };
  h.createRadialGradient = (...a) => { ops.push(['radGrad', ...a]); return grad(ops); };
  h.fillRect = (...a) => ops.push(['fillRect', ...a]);
  h.beginPath = () => ops.push(['beginPath']);
  h.arc = (...a) => ops.push(['arc', ...a]);
  h.fill = () => ops.push(['fill']);
  h.ops = ops;
  return h;
};

describe('starTwinkle — fungsi murni kedipan bintang', () => {
  it('guard non-finite netral (fallback 0) — tak NaN material', () => {
    for (const bad of [NaN, Infinity, -Infinity, 'x', null, undefined]) {
      const v = starTwinkle(0, bad);
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(starTwinkle(NaN, 1)).toBeGreaterThan(0);
  });

  it('rentang aman: nilai dalam (1-ampMax…1], tak pernah negatif/padam total', () => {
    let min = 2, max = -2;
    for (let i = 0; i < 15; i++) for (let t = 0; t < 40; t += 0.05) {
      const v = starTwinkle(i, t);
      min = Math.min(min, v); max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(0.5 - 1e-9); // amplitudo maks 0.5 → paling redup 0.5
    expect(min).toBeGreaterThan(0);                 // tak padam total
    expect(max).toBeLessThanOrEqual(1 + 1e-9);      // tak lebih terang dari penuh
    expect(max).toBeCloseTo(1, 6);                  // puncak eksak 1 tercapai
  });

  it('deterministik: (i, t) sama → nilai sama; fase antar bintang berbeda', () => {
    expect(starTwinkle(3, 2.5)).toBe(starTwinkle(3, 2.5));
    // dua bintang berbeda pada waktu sama TIDAK identik di umumnya (fase 0.618×i)
    const a = [0, 1, 2, 3, 4].map((i) => starTwinkle(i, 1.3));
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it('seam periodik: periode kelompok (1 + (i%3)*0.23)×T → nilai berulang eksak', () => {
    const sec = (i) => STAR_TWINKLE_SEC * (1 + (i % 3) * 0.23);
    for (const i of [0, 1, 2, 5, 7, 14]) {
      expect(starTwinkle(i, sec(i))).toBeCloseTo(starTwinkle(i, 0), 9);
    }
  });

  it('kontrak nilai: lembah/lembah-amp, puncak eksak 1 tercapai di rentang', () => {
    // bintang 0 (amp 0.32): t=0 → sin=0 → w=0.5 → nilai tengah 1-amp/2
    expect(starTwinkle(0, 0)).toBeCloseTo(1 - 0.32 / 2, 9);
    // puncak: t = sec/4 → sin=1 → nilai 1
    expect(starTwinkle(0, STAR_TWINKLE_SEC / 4)).toBeCloseTo(1, 9);
    // bintang 3: amp = 0.5; sec = T*1.46 → puncak di t = sec/4 (numerik: max ≥0.999)
    const sec3 = STAR_TWINKLE_SEC * 1.46;
    let best = -1;
    for (let t = 0; t < sec3; t += sec3 / 4096) best = Math.max(best, starTwinkle(3, t));
    expect(best).toBeCloseTo(1, 2);
  });

  it('laju 3 kelompok tak sinkron dgn efek lampu lain (5.2/4.3/3.9/3.6/2.9)', () => {
    const secs = [0, 1, 2].map((k) => STAR_TWINKLE_SEC * (1 + k * 0.23));
    secs.forEach((s) => {
      [5.2, 4.3, 3.9, 3.6, 2.9].forEach((other) => {
        expect(Math.abs(s - other) / other).toBeGreaterThan(0.05); // beda >5% → tak sinkron
      });
    });
  });

  it('input aneh (string index, negatif t) tetap finite & deterministik', () => {
    expect(Number.isFinite(starTwinkle('a', -3.2))).toBe(true);
    expect(starTwinkle('a', -3.2)).toBe(starTwinkle('a', -3.2));
  });
});

describe('drawSkyNight(x, step) — kedipan via globalAlpha per bintang', () => {
  it('tetap 15 arc; alpha per bintang di-set via globalAlpha (STAR_TWINKLE_MIN…1)', () => {
    const c = rec();
    drawSkyNight(c, 0);
    const ga = c.ops.filter((o) => o[0] === 'ga' && o[1] < 1).map((o) => o[1]);
    expect(c.ops.filter((o) => o[0] === 'arc').length).toBe(15);
    expect(ga.length).toBeGreaterThanOrEqual(1);
    ga.forEach((v) => { expect(v).toBeGreaterThanOrEqual(STAR_TWINKLE_MIN); expect(v).toBeLessThanOrEqual(1); });
    // reset alpha setelah bintang (glow kota tak terpengaruh)
    expect(c.ops[c.ops.length - 1]).not.toEqual(['ga', 0]);
  });

  it('step berbeda → alpha bintang 0 berbeda (kedipan nyata antar repaint)', () => {
    // fase bintang 0 = 0; step = T/2 → sin=0 → nilai tengah; step=T/4 → puncak 1
    const a = rec(); drawSkyNight(a, STAR_TWINKLE_SEC * 0.25); // puncak → alpha 1
    const b = rec(); drawSkyNight(b, 0);                       // tengah → alpha 0.84
    const firstGa = (ops) => ops.find((o) => o[0] === 'ga')[1];
    expect(firstGa(a.ops)).toBeCloseTo(1, 6);
    expect(firstGa(b.ops)).toBeCloseTo(STAR_TWINKLE_MIN + (1 - STAR_TWINKLE_MIN) * 0.84, 6);
    expect(firstGa(a.ops)).not.toBeCloseTo(firstGa(b.ops), 3);
  });

  it('step default 0: tanda tangan lama tetap jalan (kompatibel test lama)', () => {
    const c = rec();
    expect(() => drawSkyNight(c)).not.toThrow();
    expect(c.ops.filter((o) => o[0] === 'arc').length).toBe(15);
  });
});

// ── integrasi daycycle: paintStars repaint berkala saat MALAM saja ──
function makeSkyHarness() {
  const cv = rec();
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

describe('createLighting.paintStars — repaint bintang malam (siklus 501)', () => {
  it('malam: repaint tepat sekali saat akumulasi ≥2 dtk; di bawah ambang → 0', () => {
    const { cv, ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(60); // malam
    const base = count();
    L.paintStars(1.0); L.paintStars(0.9);
    expect(count()).toBe(base); // 1.9 dtk < 2 → belum
    L.paintStars(0.2);          // total 2.1 → repaint
    expect(count()).toBe(base + 1);
    expect(cv.ops.filter((o) => o[0] === 'arc').length).toBe(30); // 15 swap malam + 15 repaint bintang
  });

  it('siang: paintStars NO-OP total (tak repaint, tak accrue bug saat swap)', () => {
    const { ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(720); // siang
    const base = count();
    L.paintStars(10); L.paintStars(10);
    expect(count()).toBe(base);
  });

  it('siang→malam: akumulasi tak bocor; repaint pertama hanya setelah 2 dtk malam', () => {
    const { ctx, count } = makeSkyHarness();
    const L = createLighting(ctx);
    L.apply(720); L.paintStars(1.9); // accrue saat siang? tidak — guard skyNight
    L.apply(60);                     // malam
    const base = count();            // 1 repaint sky swap (paintSkyNight)
    L.paintStars(1.9);
    expect(count()).toBe(base);
    L.paintStars(0.1);
    expect(count()).toBe(base + 1);  // repaint bintang pertama
  });

  it('tanpa skyWinCanvas: paintStars tak error (guard ctx lama)', () => {
    const ctx = {
      ambient: { intensity: 1 }, sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 }, scene: { background: null, fog: { color: null } },
      agentData: [], THREE: { Color: class {} },
    };
    const L = createLighting(ctx);
    expect(() => { L.paintStars(3); }).not.toThrow();
  });
});
