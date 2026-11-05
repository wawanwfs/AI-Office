// Guard siklus 265 — SATU sumber waktu untuk KETIGA jarum jam dinding 3D.
//
// Bug (audit sumber-waktu, lanjutan pola "dua sumber kebenaran" kelas 251):
// drawClockFace menarik jarum JAM & MENIT dari nowSeconds = simMinutesToClockSeconds
// (timeOfDay — WAKTU SIMULASI), tapi jarum DETIK dari dateMs = Date.now()
// (WAKTU NYATA) via default-param di room.js::createWallClock. Konsekuensi:
//  1. Sim berjalan 1 menit-sim / 5 dtk nyata (SIM_SEC_PER_MIN): dalam SATU
//     putaran detik NYATA (60 dtk) menit-sim sudah maju 12 menit — jarum detik
//     "menyalip" menitnya sendiri 12× (tak pernah sinkron dgn jam nyata pun,
//     karena jam dinding menampilkan waktu sim, bukan waktu nyata).
//  2. Slider manual (setSimManual → sim beku selama MANUAL_RESUME_MS=8 dtk,
//     bisa diperpanjang terus): jarum jam/menit diam, detik TERUS BERPUTAR —
//     jam tampak rusak/mati-menyala.
// Fix: OfficeScene kini memanggil simClockSeconds(timeOfDay, frac) — detik
// jarum DETIK = menit-sim × 60 + sisa detik-SIMULASI dalam menit berjalan —
// sehingga ketiga jarum dari SATU sumber (timeOfDay + acc sim clock).
// Kontrak konstanta: clock_units.SIM_SEC_PER_MIN == sim_clock.SIM_SEC_PER_MIN.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simMinutesToClockSeconds, simClockSeconds, SIM_SEC_PER_MIN } from '../scene/parts/clock_units.js';
import { SIM_SEC_PER_MIN as SIM_SPM_SOURCE } from '../scene/parts/sim_clock.js';
import { secondHandAngle } from '../scene/parts/clock_spec.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('clock_units — satu sumber waktu ketiga jarum (siklus 265)', () => {
  it('paritas konstanta: clock_units.SIM_SEC_PER_MIN == sim_clock.SIM_SEC_PER_MIN', () => {
    expect(SIM_SEC_PER_MIN).toBe(SIM_SPM_SOURCE);
    expect(SIM_SEC_PER_MIN).toBe(5);
  });

  it('simClockSeconds: menit-sim × 60 (base eksak kontrak lama)', () => {
    expect(simClockSeconds(870, 0)).toBe(52200);           // 14:30
    expect(simClockSeconds(870)).toBe(52200);              // frac default 0
    expect(simClockSeconds(0, 0)).toBe(0);
  });

  it('frac menit berjalan: +sisa detik-sim, di-clamp [0..CLOCK_FRAC_MAX)', () => {
    expect(simClockSeconds(870, 2.5)).toBe(52200 + 2.5);      // sisa 2.5 dtk-sim
    expect(simClockSeconds(870, 12)).toBe(52212);             // 1 dtk nyata @laju sim = 12 dtk-sim
    expect(simClockSeconds(870, 59.999)).toBe(52259.999);     // batas atas: tak pernah melewati menit
    expect(simClockSeconds(870, 99)).toBe(52259.999);         // clamp: menit-sim tidak terlewati
    expect(simClockSeconds(870, -1)).toBe(52200);             // negatif → 0
    expect(simClockSeconds(870, NaN)).toBe(52200);            // NaN → 0 (anti-poisoning)
    expect(simClockSeconds(870, Infinity)).toBe(52259.999);   // Infinity → clamp
  });
  it('anti-poisoning: menit non-finite → 0 detik (jarum 12:00), tidak menulari NaN', () => {
    expect(simClockSeconds(NaN, 2)).toBe(2);
    expect(simClockSeconds(undefined)).toBe(0);
    expect(Number.isFinite(simClockSeconds('x', 1))).toBe(true);
  });

  it('detik-sim kontrak: sudut jarum detik bergerak PROPORSIONAL laju sim (bukan 1 dtk nyata = 6°)', () => {
    // satu menit-sim = 5 dtk nyata → dalam 1 dtk nyata, jarum detik harus maju
    // 60/5 = 12 dtk-sim = 72° (bukan 6° seperti detik nyata).
    const degPerSimSec = 360 / 60;
    const ang1 = secondHandAngle(simClockSeconds(600, 1) % 60);
    const ang2 = secondHandAngle(simClockSeconds(600, 13) % 60);
    // 12 dtk-sim = satu detik-nyata pada laju sim → selisih sudut 72°
    const d = Math.abs(ang2 - ang1) * 180 / Math.PI;
    const dd = Math.min(d, 360 - d);
    expect(dd).toBeCloseTo(12 * degPerSimSec, 6);
  });

  it('regresi inti: sim MANUAL (acc beku) → detik-sim juga beku (tidak berputar sendiri)', () => {
    // dua pembacaan waktu berbeda, timeOfDay & acc SAMA (manual beku):
    // sudut yang dilukis harus identik — dulu Date.now() berbeda → detik jalan.
    const a = simClockSeconds(660, 3.2);
    const b = simClockSeconds(660, 3.2);
    expect(secondHandAngle(a % 60)).toBe(secondHandAngle(b % 60));
    // dan beda dgn detik NYATA default: detik-sim 3.2 ≠ detik wall-clock acak
    // (kontrak: sumber detik adalah argumen, bukan Date.now di painter)
  });

  it('drift-gate sumber: OfficeScene wajib simClockSeconds(timeOfDay, frac dari __sim.acc×konversi)', () => {
    const os = readFileSync(join(here, '..', 'scene', 'OfficeScene.js'), 'utf8');
    expect(os).toContain('drawClock(simClockSeconds(timeOfDay');
    // frac dihitung dari akumulator sim clock (__sim.acc) — bukan Date.now
    expect(os).toMatch(/__sim\.acc/);
    // pola lama DILARANG kembali: drawClock(timeOfDay) tanpa konversi detik-sim
    expect(os).not.toMatch(/drawClock\(simMinutesToClockSeconds\(/);
  });

  it('drift-gate sumber: painter TETAP menerima dateMs (kompat API), kontrak clamp CLOCK_FRAC_MAX dipertahankan', () => {
    const cu = readFileSync(join(here, '..', 'scene', 'parts', 'clock_units.js'), 'utf8');
    expect(cu).toContain('export function simClockSeconds');
    expect(cu).toContain('Math.min(fracSec, CLOCK_FRAC_MAX)');
  });
});
