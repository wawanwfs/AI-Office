import { describe, it, expect } from 'vitest';
import { perfStep } from '../scene/parts/perf_quality.js';

function mockRenderer(pr) {
  let p = pr;
  return {
    getPixelRatio: () => p,
    setPixelRatio: (v) => { p = v; },
    get current() { return p; },
  };
}
function mockSun(withMap = true) {
  return {
    castShadow: true,
    shadow: {
      mapSize: { set: (a, b) => { mockSun._size = [a, b]; }, ...(() => { mockSun._size = [2048, 2048]; return {}; })() },
      map: withMap ? { disposed: false, dispose() { this.disposed = true; } } : null,
    },
  };
}
const BASE = { t0: 0, lastFrame: 0, fps: 0, downgraded: false, shadowLevel: 0, goodStreak: 0, basePR: 0 };

describe('perfStep — tangga adaptive quality', () => {
  it('sampling pertama hanya mencatat t0 (tanpa aksi)', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    const s = perfStep({ ...BASE }, 1000, 10, { renderer: r, sun });
    expect(s.t0).toBe(1000);
    expect(r.current).toBe(1.5);
    expect(sun.castShadow).toBe(true);
  });

  it('belum 2 dtk → tidak ada aksi', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    const s = perfStep({ ...BASE, t0: 1000 }, 2500, 10, { renderer: r, sun });
    expect(s.fps).toBe(0);
    expect(r.current).toBe(1.5);
  });

  it('FPS sangat rendah → pixelRatio turun + shadow map 1024 + castShadow mati (tangga lengkap)', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let needsUpdate = 0;
    let s = { ...BASE, t0: 1000 };
    s = perfStep(s, 3000, 4, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ }); // fps ≈ 2
    expect(s.fps).toBeLessThan(5);
    expect(r.current).toBe(1.25); // turun satu langkah
    expect(s.downgraded).toBe(true);
    expect(s.shadowLevel).toBe(2);
    expect(sun.castShadow).toBe(false);
    expect(sun.shadow.map).toBe(null); // map di-dispose lalu di-null-kan
    expect(needsUpdate).toBe(1);
  });

  it('latch: level shadow tak bolak-balik & tak re-trigger setelah terpasang', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let needsUpdate = 0;
    let s = { ...BASE, t0: 1000 };
    s = perfStep(s, 3000, 2, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ });
    // frame berikut: sun.castShadow sudah false → tangga 2/3 tak bisa picu lagi
    s = perfStep(s, 5000, 4, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ });
    expect(s.shadowLevel).toBe(2);
    expect(needsUpdate).toBe(1);
    expect(sun.castShadow).toBe(false);
  });

  it('FPS 15 → hanya pixelRatio turun, shadow tetap', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    const s = perfStep({ ...BASE, t0: 1000 }, 3000, 30, { renderer: r, sun }); // fps 15
    expect(s.fps).toBe(15);
    expect(r.current).toBe(1.25);
    expect(s.downgraded).toBe(true);
    expect(s.shadowLevel).toBe(0);
    expect(sun.castShadow).toBe(true);
  });

  it('FPS 12 setelah pixelRatio 0.75 → hanya tangga shadow (pixelRatio tak negatif)', () => {
    const r = mockRenderer(0.75); const sun = mockSun();
    const s = perfStep({ ...BASE, t0: 1000 }, 3000, 18, { renderer: r, sun }); // fps 9
    expect(r.current).toBe(0.75);
    expect(s.shadowLevel).toBe(1);
    expect(sun.castShadow).toBe(true);
  });

  it('recovery: 4 sampel sehat berturut-turut (fps≥28) → pixelRatio naik bertahap lalu latch lepas', () => {
    const r = mockRenderer(1.0); const sun = mockSun(false);
    let s = { ...BASE, downgraded: true, goodStreak: 0, basePR: 1.5, t0: 1000 };
    let now = 1000, frame = 0;
    for (let i = 0; i < 3; i++) { // 3 sampel sehat: streak 1..3, belum naik
      now += 2000; frame += 60; // fps 30
      s = perfStep(s, now, frame, { renderer: r, sun, basePixelRatio: 1.5 });
    }
    expect(r.current).toBe(1.0);
    now += 2000; frame += 60;
    s = perfStep(s, now, frame, { renderer: r, sun, basePixelRatio: 1.5 }); // streak 4 → naik
    expect(r.current).toBe(1.25);
    expect(s.downgraded).toBe(true);
    // lanjut sampai mencapai basePR
    now += 2000; frame += 60;
    s = perfStep(s, now, frame, { renderer: r, sun, basePixelRatio: 1.5 });
    now += 2000; frame += 60;
    s = perfStep(s, now, frame, { renderer: r, sun, basePixelRatio: 1.5 });
    expect(r.current).toBe(1.5);
    expect(s.downgraded).toBe(false);
    expect(s.goodStreak).toBe(0);
  });

  it('recovery diblokir bila shadowLevel sudah terpasang (latch)', () => {
    const r = mockRenderer(1.0); const sun = mockSun(false);
    let s = { ...BASE, downgraded: true, goodStreak: 3, shadowLevel: 2, basePR: 1.5, t0: 1000, lastFrame: 60 };
    s = perfStep(s, 3000, 120, { renderer: r, sun }); // fps 30 tapi shadowLevel=2
    expect(r.current).toBe(1.0);
    expect(s.goodStreak).toBe(3);
  });

  it('tanpa renderer/sun → tidak crash', () => {
    const out = perfStep({ ...BASE, t0: 1000 }, 3000, 10, {});
    expect(out.fps).toBe(5);
  });

  it('anti-poisoning: nowMs/frame non-finite → no-op (t0/lastFrame/fps tak tertulari)', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let s = { ...BASE, t0: 1000, lastFrame: 10 };
    s = perfStep(s, NaN, 20, { renderer: r, sun });
    expect(s.t0).toBe(1000);
    expect(s.lastFrame).toBe(10);
    expect(s.fps).toBe(0);
    expect(r.current).toBe(1.5);
    expect(sun.castShadow).toBe(true);
    s = perfStep(s, Infinity, 20, { renderer: r, sun });
    expect(s.t0).toBe(1000);
    s = perfStep(s, 3000, NaN, { renderer: r, sun });
    expect(s.lastFrame).toBe(10);
    expect(s.fps).toBe(0);
  });

  it('anti-poisoning: setelah sampel korup, sampel sehat berikutnya tetap jalan normal', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let s = { ...BASE, t0: 1000, lastFrame: 10 };
    s = perfStep(s, NaN, NaN, { renderer: r, sun }); // sampel korup diabaikan
    s = perfStep(s, 3000, 30, { renderer: r, sun }); // fps 15 → pixelRatio turun
    expect(r.current).toBe(1.25);
    expect(s.downgraded).toBe(true);
  });

  it('anti-poisoning: state t0/lastFrame/fps rusak (NaN) → di-reset saat sampel sehat', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    const s = perfStep({ ...BASE, t0: NaN, lastFrame: NaN, fps: NaN }, 1000, 10, { renderer: r, sun });
    // t0 NaN dianggap baseline kosong → dicatat ulang, tanpa aksi
    expect(s.t0).toBe(1000);
    expect(r.current).toBe(1.5);
    expect(sun.castShadow).toBe(true);
  });
});
