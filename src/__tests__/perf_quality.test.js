import { describe, it, expect } from 'vitest';
import { perfStep, perfChip } from '../scene/parts/perf_quality.js';

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

describe('perfStep — recovery bayangan (siklus 147)', () => {
  function shadowOffState() {
    // sampel fps≈2: pixelRatio 1.5→1.25 + tangga shadow penuh (level 2, mati).
    // r & sun yang dikembalikan adalah mock YANG SUDAH terdegradasi —
    // sun.castShadow=false, map di-dispose — persis runtime scene nyata.
    const r = mockRenderer(1.5); const sun = mockSun();
    let needsUpdate = 0;
    const s = perfStep({ ...BASE, t0: 1000 }, 3000, 4, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ });
    return { s, r, sun, needs: () => needsUpdate };
  }

  it('satu sampel sehat (16 dtk belum penuh) → bayangan TETAP mati (hysteresis 8 sampel)', () => {
    const { s, r, sun } = shadowOffState();
    const out = perfStep({ ...s }, 5000, 200, { renderer: r, sun }); // fps 98, streak 1
    expect(out.shadowLevel).toBe(2);
    expect(sun.castShadow).toBe(false);
  });

  it('8 sampel sehat berturut-turut (16 dtk) → L2 → L1: castShadow hidup kembali + map 1024 + needsUpdate', () => {
    const { s, r, sun } = shadowOffState();
    let needsUpdate = 0;
    let cur = { ...s };
    let now = 5000, frame = 200;
    for (let i = 0; i < 7; i++) { // 7 sampel sehat: streak 1..7, belum pulih
      now += 2000; frame += 120;
      cur = perfStep(cur, now, frame, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ });
      expect(cur.shadowLevel).toBe(2);
      expect(sun.castShadow).toBe(false);
    }
    now += 2000; frame += 120;
    cur = perfStep(cur, now, frame, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ }); // streak 8 → pulih
    expect(cur.shadowLevel).toBe(1);
    expect(sun.castShadow).toBe(true);
    expect(mockSun._size).toEqual([1024, 1024]);
    expect(needsUpdate).toBe(1);
  });

  it('L1 stabil 8 sampel lagi → latch lepas (shadowLevel 0) tanpa menaikkan map ke 2048', () => {
    const { s, r, sun } = shadowOffState();
    sun.shadow.mapSize.set(1024, 1024); // status L1 realistis
    let cur = { ...s };
    let now = 5000, frame = 200;
    for (let i = 0; i < 8; i++) { now += 2000; frame += 120; cur = perfStep(cur, now, frame, { renderer: r, sun }); }
    expect(cur.shadowLevel).toBe(1); // L2 → L1 selesai
    for (let i = 0; i < 7; i++) { now += 2000; frame += 120; cur = perfStep(cur, now, frame, { renderer: r, sun }); }
    expect(cur.shadowLevel).toBe(1); // 7 sampel: belum lepas
    now += 2000; frame += 120;
    cur = perfStep(cur, now, frame, { renderer: r, sun }); // streak 8 di L1 → lepas
    expect(cur.shadowLevel).toBe(0);
    expect(mockSun._size).toEqual([1024, 1024]); // TIDAK otomatis naik ke 2048
  });

  it('hysteresis: satu sampel fps<28 di tengah streak → hitungan reset dari nol', () => {
    const { s, r, sun } = shadowOffState();
    let cur = { ...s };
    let now = 5000, frame = 200;
    for (let i = 0; i < 7; i++) { now += 2000; frame += 120; cur = perfStep(cur, now, frame, { renderer: r, sun }); }
    expect(cur.shadowStreak).toBe(7);
    // sampel gagal: 50 frame / 2 dtk = 25 fps (< 28) → shadowStreak reset
    cur = perfStep(cur, now + 2000, frame + 50, { renderer: r, sun });
    expect(cur.shadowStreak).toBe(0);
    expect(cur.shadowLevel).toBe(2);
    expect(sun.castShadow).toBe(false);
  });

  it('tanpa sun → shadowStreak dibersihkan, tanpa crash', () => {
    const { s } = shadowOffState();
    const cur = perfStep({ ...s }, 5000, 200, {});
    expect(cur.shadowLevel).toBe(2);
    expect(cur.shadowStreak).toBe(0);
  });
});

describe('perfChip — chip kualitas render HUD (siklus 147)', () => {
  it('perf tak tersedia / FPS 0 → null (chip disembunyikan, bukan angka karangan)', () => {
    expect(perfChip(null)).toBeNull();
    expect(perfChip(undefined)).toBeNull();
    expect(perfChip({ fps: 0 })).toBeNull();
    expect(perfChip({ fps: NaN })).toBeNull();
  });

  it('state ideal → hijau "GPU 60 FPS" + detail mulus + pixelRatio', () => {
    const c = perfChip({ fps: 60.4, pixelRatio: 1.5, shadowLevel: 0, downgraded: false });
    expect(c.state).toBe('ideal');
    expect(c.label).toBe('GPU 60 FPS');
    expect(c.detail).toContain('x1.5');
    expect(c.detail).toContain('mulus');
  });

  it('FPS < 10 → 1 desimal gaya Indonesia (0,4), bukan "GPU 0 FPS"', () => {
    const c = perfChip({ fps: 0.42, pixelRatio: 0.75, shadowLevel: 2, downgraded: true });
    expect(c.label).toBe('GPU 0,4 FPS');
    expect(c.detail).toContain('(FPS 0,4)');
    const c2 = perfChip({ fps: 9.96, pixelRatio: 1, shadowLevel: 0, downgraded: true });
    expect(c2.label).toBe('GPU 10 FPS'); // 9.96 → 10 → format bulat
  });

  it('downgraded (pixelRatio turun) → amber stale dgn detail pulih bertahap', () => {
    const c = perfChip({ fps: 15, pixelRatio: 1, shadowLevel: 0, downgraded: true });
    expect(c.state).toBe('stale');
    expect(c.label).toBe('GPU 15 FPS');
    expect(c.detail).toContain('x1');
  });

  it('shadowLevel 2 → merah down: bayangan dimatikan + info pemulihan otomatis', () => {
    const c = perfChip({ fps: 4, pixelRatio: 0.75, shadowLevel: 2, downgraded: true });
    expect(c.state).toBe('down');
    expect(c.detail).toContain('bayangan dimatikan');
    expect(c.detail).toContain('16 dtk');
  });

  it('shadowLevel 1 → amber stale menyebut peta bayangan 1024', () => {
    const c = perfChip({ fps: 12, pixelRatio: 0.75, shadowLevel: 1, downgraded: false });
    expect(c.state).toBe('stale');
    expect(c.detail).toContain('1024');
  });

  it('recovering → biru recover dgn detail pulih', () => {
    const c = perfChip({ fps: 30, pixelRatio: 1.25, shadowLevel: 0, downgraded: true, recovering: true });
    expect(c.state).toBe('recover');
    expect(c.detail).toContain('pulih');
  });
});

// ── Siklus 148: higiene pengukuran & recovery ──
describe('perfStep — jendela sampling usang (siklus 148)', () => {
  it('jendela > 6 dtk (pasca-sleep/stall) → fps TIDAK dihitung, tangga degradasi dilewati', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let needsUpdate = 0;
    // t0=1000, kembali di 61000 (60 dtk tidur) dgn 3 frame saja → dulu fps≈0,05
    // memicu pixelRatio turun + bayangan mati. Kini: sampel usang diabaikan.
    const s = perfStep({ ...BASE, t0: 1000 }, 61000, 3, { renderer: r, sun, needsShadowUpdate: () => needsUpdate++ });
    expect(s.stale).toBe(true);
    expect(s.fps).toBe(0); // fps lama dipertahankan, tak dihitung dari jendela usang
    expect(r.current).toBe(1.5); // TIDAK turun
    expect(sun.castShadow).toBe(true); // bayangan TIDAK mati
    expect(s.shadowLevel).toBe(0);
    expect(needsUpdate).toBe(0);
  });

  it('jendela usang me-reset jendela & streak recovery, lalu sampel berikut normal kembali', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    let s = { ...BASE, t0: 1000, goodStreak: 3, shadowStreak: 5, downgraded: true, shadowLevel: 0 };
    s = perfStep(s, 61000, 3, { renderer: r, sun });
    expect(s.stale).toBe(true);
    expect(s.goodStreak).toBe(0);
    expect(s.shadowStreak).toBe(0);
    expect(s.t0).toBe(61000); // jendela baru dimulai dari titik resume
    expect(s.lastFrame).toBe(3);
    // sampel valid berikutnya: fps 30 (60 frame / 2 dtk) — berjalan normal, stale bersih
    s = perfStep(s, 63000, 63, { renderer: r, sun });
    expect(s.stale).toBe(false);
    expect(s.fps).toBe(30);
    expect(r.current).toBe(1.5);
  });

  it('jendela pasca-degradasi lama TIDAK dianggap usang (fps benar-benar rendah tetap mendegradasi)', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    // SwiftShader nyata: jendela valid 2 dtk, 4 frame → fps 2. Harus tetap
    // mendegradasi — proteksi usang tak boleh membutakan tangga (6 dtk = 3×
    // sampleMs, jendela 2 dtk normal jauh di bawah ambang).
    const s = perfStep({ ...BASE, t0: 1000 }, 3000, 4, { renderer: r, sun });
    expect(s.stale).toBe(false);
    expect(s.fps).toBeLessThan(5);
    expect(r.current).toBe(1.25);
    expect(sun.castShadow).toBe(false);
  });

  it('tepat di ambang 3× sampleMs (6 dtk) → TIDAK usang (hanya > ambang)', () => {
    const r = mockRenderer(1.5); const sun = mockSun();
    // t0=1000 → 7000 = 6000 ms tepat; bukan >6000 → sampel valid: 90 frame / 6 dtk = fps 15
    const s = perfStep({ ...BASE, t0: 1000 }, 7000, 90, { renderer: r, sun });
    expect(s.stale).toBe(false);
    expect(s.fps).toBe(15);
    expect(r.current).toBe(1.25); // degradasi sah (fps 15 < 18)
  });
});

describe('perfStep — flag recovering bersih pasca-pemulihan (siklus 148)', () => {
  function degradedState() {
    // fps 15 → hanya pixelRatio turun (1.5→1.0 dua langkah via downgraded),
    // shadowLevel TETAP 0 — blok recovery pixelRatio aktif (tanpa tangga shadow).
    const r = mockRenderer(1.5); const sun = mockSun();
    let s = { ...BASE, t0: 1000 };
    s = perfStep(s, 3000, 30, { renderer: r, sun }); // fps 15 → downgraded, PR 1.25
    s = perfStep(s, 5000, 40, { renderer: r, sun }); // fps 5 → PR 1.0
    return { s, r, sun };
  }
  it('pemulihan penuh (basePR tercapai) → recovering=false + downgraded=false (chip ideal, bukan biru permanen)', () => {
    const { s, r, sun } = degradedState();
    let cur = { ...s, basePR: 1.5 };
    let now = 5000, frame = 150;
    for (let i = 0; i < 3; i++) { now += 2000; frame += 60; cur = perfStep(cur, now, frame, { renderer: r, sun }); } // streak 1-3
    expect(cur.recovering).toBe(true);
    expect(r.current).toBe(1.0);
    now += 2000; frame += 60; cur = perfStep(cur, now, frame, { renderer: r, sun }); // streak 4 → PR 1.25
    now += 2000; frame += 60; cur = perfStep(cur, now, frame, { renderer: r, sun }); // streak 5 → PR 1.5 → selesai
    expect(r.current).toBe(1.5);
    expect(cur.downgraded).toBe(false);
    expect(cur.recovering).toBe(false); // dulu: tertahan true selamanya
  });

  it('sampel jelata di tengah streak → goodStreak & recovering reset (hysteresis kini benar-benar menutup)', () => {
    const { s, r, sun } = degradedState();
    let cur = { ...s, basePR: 1.5 };
    let now = 5000, frame = 150;
    for (let i = 0; i < 3; i++) { now += 2000; frame += 60; cur = perfStep(cur, now, frame, { renderer: r, sun }); } // streak 3 (fps 30)
    expect(cur.goodStreak).toBe(3);
    // sampel jelata: fps 25 (< 28) — dulu streak jadi 4 → recovery maju walau GPU masih jelata
    now += 2000; frame += 50;
    cur = perfStep(cur, now, frame, { renderer: r, sun });
    expect(cur.goodStreak).toBe(0);
    expect(cur.recovering).toBe(false);
    expect(r.current).toBe(1.0); // pixelRatio tak naik
    expect(cur.downgraded).toBe(true); // masih menunggu GPU sehat sungguhan
  });

  it('sampel campuran 30-20-30-30 TIDAK menyelesaikan pemulihan (bug streak bocor tertangkap)', () => {
    const { s, r, sun } = degradedState();
    let cur = { ...s, basePR: 1.5 };
    let now = 5000, frame = 150;
    const seq = [60, 40, 60, 60]; // fps 30, 20, 30, 30
    for (const f of seq) { now += 2000; frame += f; cur = perfStep(cur, now, frame, { renderer: r, sun }); }
    expect(cur.goodStreak).toBe(1); // hanya 2 sampel sehat terakhir yang hitung (setelah reset)
    expect(r.current).toBe(1.0); // dulu: streak 4 → PR naik walau GPU napas jelata
    expect(cur.recovering).toBe(true); // sedang mencoba lagi, belum selesai
  });
});

describe('perfChip — chip usang (siklus 148)', () => {
  it('stale → label "GPU mengukur ulang…", bukan FPS palsu ≈0', () => {
    const c = perfChip({ fps: 0.03, pixelRatio: 1.5, shadowLevel: 0, downgraded: false, stale: true });
    expect(c.state).toBe('stale');
    expect(c.label).toBe('GPU mengukur ulang…');
    expect(c.label).not.toContain('0,0');
    expect(c.detail).toContain('mengukur ulang');
  });

  it('stale TIDAK menimpa degradasi aktif di luar sampel usang (prioritas cabang): shadowLevel 2 tanpa stale tetap down', () => {
    const c = perfChip({ fps: 2, pixelRatio: 0.75, shadowLevel: 2, downgraded: true });
    expect(c.state).toBe('down');
    expect(c.label).toContain('GPU');
  });
});
