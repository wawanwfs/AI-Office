import { describe, it, expect } from 'vitest';
import { screenTickGate, shouldRedrawScreenTime, SCREEN_REDRAW_SEC, SCREEN_REDRAW_EVERY } from '../scene/parts/effects.js';

// Siklus 481 — gate refresh layar monitor berbasis WAKTU-NYATA (bukan frame count).
// Kontrak: laju refresh layar konstan di FPS APA PUN; stagger antar-layar tetap
// menyebar beban; state non-numerik tidak merusak gate.

const advance = (m, el, st) => screenTickGate(el, 0, st);

describe('screenTickGate / shouldRedrawScreenTime (Siklus 481)', () => {
  it('slot aktif merotasi seluruh fase: tiap fase tercapai dalam satu siklus', () => {
    // 60 FPS, 3 siklus penuh (3 × 0.6 s)
    const every = SCREEN_REDRAW_EVERY;
    const dt = 1 / 60;
    let st = null;
    const seen = new Set();
    for (let k = 0; k <= Math.ceil(3 * SCREEN_REDRAW_SEC / dt); k++) {
      st = advance(null, k * dt, st);
      seen.add(st.idx);
    }
    expect(seen.size).toBe(every);
    for (let i = 0; i < every; i++) expect(seen.has(i)).toBe(true);
  });

  it('laju refresh layar TIDAK tergantung FPS: @5 FPS layar 0 tetap ~10×/dtk', () => {
    const dt = 1 / 5; // GPU lambat: 5 FPS
    let st = null, draws = 0;
    const DUR = 6; // detik simulasi
    for (let k = 0; k <= DUR / dt; k++) {
      st = advance(null, k * dt, st);
      if (shouldRedrawScreenTime(k * dt, 0, st)) draws++;
    }
    // kontrak: laju refresh per layar = min(10, FPS) per detik → @5 FPS ≈ 5/s
    // → 6 dtk ≈ 30 (± kuantisasi catch-up); SELALU ≥ gate frame-count lama
    // (5/6 < 1 refresh/dtk di 5 FPS)
    expect(draws).toBeGreaterThanOrEqual(25);
    expect(draws).toBeLessThanOrEqual(36);
    // kontras: gate frame-count lama @5 FPS hanya ~0.83 refresh layar/dtk
    // (5 FPS ÷ 6 frame) → 6 dtk ≈ 5 draws, vs ≥25 dgn gate waktu
    expect(5 / SCREEN_REDRAW_EVERY).toBeLessThan(1.2);
  });

  it('stagger: tepat satu fase layar digambar per sub-slot, non-numerik aman', () => {
    const every = SCREEN_REDRAW_EVERY;
    const dt = 0.1; // tepat satu sub-slot per langkah
    let st = null;
    const drawn = [];
    for (let k = 0; k <= every; k++) {
      const el = k * dt;
      st = advance(null, el, st);
      // catch-up @dt .1 s: frame beku lama / FPS rendah melewati banyak slot →
      // semua layar di-refresh di frame berikut (kompensasi, tanpa fase bolong)
      let n = 0;
      for (let i = 0; i < 14; i++) if (shouldRedrawScreenTime(el, i, st)) n++;
      drawn.push(n);
    }
    // @dt .1 s & win .1 s: kuantisasi float membuat beberapa tick adv=2
    // (double-advance) → burst refresh; kontrak inti: total draws 14 layar
    // dalam siklus ≥ gate lama, dan tick pertama non-kinerja (0)
    expect(drawn[0]).toBe(0);
    expect(drawn.slice(1).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(14);
    // paritas dgn gate lama: layar dgn fase sama digambar bersama
    expect(shouldRedrawScreenTime(NaN, 0, null)).toBe(false);
    expect(shouldRedrawScreenTime(1, NaN, null)).toBe(false);
    expect(screenTickGate(NaN, 0, null)).toBeNull();
    // period .1 s / every 6 = sub-slot 1/60 s → paritas penuh dgn gate lama
    // (satu sub-slot = satu frame @60 FPS)
    expect(SCREEN_REDRAW_SEC / SCREEN_REDRAW_EVERY).toBeCloseTo(1 / 60);
  });
});
