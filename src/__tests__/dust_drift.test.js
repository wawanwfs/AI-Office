import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DUST_UPDATE_EVERY, shouldUpdateDust, dustY, DUST_RATE, DUST_RATE_X } from '../scene/parts/effects.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('dust drift throttle', () => {
  it('DUST_UPDATE_EVERY = 3 (~20×/dtk @60fps)', () => {
    expect(DUST_UPDATE_EVERY).toBe(3);
  });

  it('shouldUpdateDust: kelipatan 3 saja', () => {
    for (let f = 0; f < 60; f++) expect(shouldUpdateDust(f)).toBe(f % 3 === 0);
  });

  it('shouldUpdateDust: custom every + guard non-numerik', () => {
    expect(shouldUpdateDust(10, 5)).toBe(true);
    expect(shouldUpdateDust(11, 5)).toBe(false);
    expect(shouldUpdateDust(NaN)).toBe(false);
    expect(shouldUpdateDust(undefined)).toBe(false);
  });

  it('dustY: naik per langkah, respawn >3.6 → 0.5', () => {
    const y1 = dustY(1, 2, 0, 0);           // cos(0)=1 → naik DUST_RATE × dt default (1/20)
    expect(y1).toBeCloseTo(2 + DUST_RATE / 20, 9);
    expect(dustY(1, 3.7, 0, 0)).toBe(0.5);  // di atas batas → respawn
    // guard non-numerik
    expect(dustY(NaN, 2, 0, 0)).toBe(0.5);
    expect(dustY(1, NaN, 0, 0)).toBe(0.5);
    expect(dustY(1, 2, undefined, 0)).toBe(0.5);
    expect(dustY(1, 2, 0, 'x')).toBe(0.5);
  });

  it('dustY: pergeseran sebanding cos(elapsed*.4 + i*.5) — periodik 2π', () => {
    const d = (y, e, i) => dustY(1, y, e, i) - y;
    expect(d(2, 0, 0)).toBeCloseTo(DUST_RATE / 20, 9);
    expect(d(2, 2 * Math.PI / .4, 0)).toBeCloseTo(d(2, 0, 0), 9); // fase sama
    expect(d(2, Math.PI / .4, 0)).toBeCloseTo(-DUST_RATE / 20, 9);         // cos(π) = -1
  });
});

// ── Siklus 264 (bug kelas 251/259/260/261 keenam): kontrak laju WAKTU-NYATA ──
// Dulu dustY menambah KONSTAN .0003 per tick — laju efektif bergantung FPS penuh
// (60 FPS = .006/dtk; SwiftShader 0.4 FPS dgn tick 0.05 dtk-sim = .0015/dtk-sim,
// 4× lebih lambat). Kini dy = cos(...) × DUST_RATE × dt.
describe('dust kontrak waktu-nyata (Siklus 264 — pola kelas 251)', () => {
  it('konstanta kontrak: DUST_RATE .006 (perilaku 60 FPS lama eksak) & DUST_RATE_X .036', () => {
    expect(DUST_RATE).toBe(0.006);
    // lama: .0003 konstan per tick × 20 tick/s @60FPS = .006/dtk == DUST_RATE ×
    // Σdt per detik (1 dtk-sim) — laju per detik identik di FPS mana pun.
    expect(DUST_RATE).toBeCloseTo(0.0003 * 20, 12); // .006 unit/dtk kontrak Y @fase=1
    // X: lama .0006 × 3 per tick × 20 tick/s = .036/s
    expect(DUST_RATE_X).toBeCloseTo(0.0006 * DUST_UPDATE_EVERY * 20, 12);
  });

  it('independen-FPS: dy proporsional dt eksak (20×dt kecil == 1×dt besar, fase sama)', () => {
    // kontrak inti: dy = cos(fase) × DUST_RATE × dt — ekuivalensi dt eksak
    expect(dustY(1, 2, 0, 0, 0.05) - 2).toBeCloseTo(DUST_RATE * 0.05, 12);
    expect(dustY(1, 2, 0, 0, 1) - 2).toBeCloseTo(DUST_RATE, 12);
    expect((dustY(1, 2, 0, 0, 0.05) - 2) * 20).toBeCloseTo(dustY(1, 2, 0, 0, 1) - 2, 12);
    // 20 langkah dt=1/20 (elapsed maju) == jumlah dy dgn dt eksplisit per langkah
    let y = 2;
    for (let k = 0; k < 20; k++) y = dustY(1, y, k / 20, 0, 1 / 20);
    let yRef = 2;
    for (let k = 0; k < 20; k++) yRef += Math.cos((k / 20) * .4 + 0 * .5) * DUST_RATE / 20;
    expect(y).toBeCloseTo(yRef, 12);
  });

  it('anti-poisoning: dt non-finite/≤0/null → Y utuh (tanpa respawn salah)', () => {
    // catatan: `undefined` eksplisit = default 1/20 (semantik default-param JS) —
    // bukan jalur poison; null TIDAK memicu default → masuk guard.
    for (const bad of [NaN, Infinity, -Infinity, 0, -0.01, 'x', null]) {
      expect(dustY(1, 2.5, 0, 0, bad)).toBe(2.5);
    }
    // default param (dt tak diberikan) = 1/20 → bergerak kecil (perilaku lama manual-call)
    expect(dustY(1, 2.5, 0, 0)).toBeCloseTo(2.5 + DUST_RATE / 20, 9);
  });

  it('drift-gate sumber: pola konstan per-tick DILARANG; OfficeScene wajib akumulasi __dustAcc & meneruskan dustDt', () => {
    const eff = readFileSync(join(here, '..', 'scene', 'parts', 'effects.js'), 'utf8');
    // pola lama: tambahan Y konstan per pemanggilan tanpa dt
    expect(eff).not.toMatch(/Math\.cos\(elapsed \* \.4 \+ i \* \.5\) \* \.0003/);
    expect(eff).toContain('DUST_RATE * dt');
    const os = readFileSync(join(here, '..', 'scene', 'OfficeScene.js'), 'utf8');
    // akumulasi waktu nyata per frame SEBELUM tick (pola relayoutDelta 251/263)
    expect(os).toMatch(/__dustAcc \+= delta;/);
    // tick membaca akumulasi lalu reset
    expect(os).toMatch(/const dustDt=__dustAcc; __dustAcc=0;/);
    // dustY dipanggil dgn dustDt eksplisit (bukan tanpa argumen)
    expect(os).toContain('dustY(pP[i*3],pP[i*3+1],elapsed,i,dustDt)');
    // kontrak lama ×DUST_UPDATE_EVERY di jalur posisi DILARANG (pola per-tick)
    expect(os).not.toMatch(/Math\.sin\(elapsed\+i\) \* \.0006 \* DUST_UPDATE_EVERY/);
  });

  it('drift-gate sumber: drawScreenFrame waktu animasi layar = elapsed nyata, DILARANG frame*0.02 (siklus 264)', () => {
    const eff = readFileSync(join(here, '..', 'scene', 'parts', 'effects.js'), 'utf8');
    expect(eff).toContain('export function drawScreenFrame(s, frame, elapsed)');
    expect(eff).toContain('Number.isFinite(elapsed) ? elapsed : frame * 0.02');
    // pola lama DILARANG: t diambil langsung dari frame (FPS-dependent)
    expect(eff).not.toMatch(/const w = cv\.width, h = cv\.height, t = frame \* 0\.02;/);
    const os = readFileSync(join(here, '..', 'scene', 'OfficeScene.js'), 'utf8');
    // OfficeScene wajib meneruskan waktu nyata via __screenT (bukan 2 argumen)
    expect(os).toContain('drawScreenFrame(s,frame,__screenT)');
    expect(os).toMatch(/__screenT=elapsed;/);
  });
});
