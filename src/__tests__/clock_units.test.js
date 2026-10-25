// Unit konversi waktu jam dinding (parts/clock_units.js) + regresi bug jarum jam.
// Bug yang ditangkap: OfficeScene memanggil drawClock(timeOfDay) dengan MENIT
// simulasi (0–1440) padahal drawClockFace mengharapkan DETIK sejak tengah malam
// (minutes = nowSeconds/60) → jam dinding 3D selalu menunjukkan ~00:xx.
import { describe, it, expect } from 'vitest';
import { simMinutesToClockSeconds } from '../scene/parts/clock_units.js';
import { hourHandAngle, minuteHandAngle } from '../scene/parts/clock_spec.js';

describe('clock_units — konversi menit simulasi → detik jam', () => {
  it('×60 (1440 menit = 86400 detik, tengah malam berikutnya)', () => {
    expect(simMinutesToClockSeconds(0)).toBe(0);
    expect(simMinutesToClockSeconds(60)).toBe(3600);
    expect(simMinutesToClockSeconds(1440)).toBe(86400);
  });

  it('regresi: 14:30 (870 menit) TIDAK lagi tergambar sebagai 00:14', () => {
    // dulu: drawClockFace(870) → minutes=14.5 → jarum jam hampir di 12 (00:14)
    const badMinutes = 870 / 60; // 14.5 → terlihat seperti 00:14
    expect(badMinutes).toBeLessThan(15);
    // kini: 870*60 = 52200 detik → 14.5 jam → jarum jam di antara 2 & 3
    const fixedMinutes = simMinutesToClockSeconds(870) / 60;
    expect(fixedMinutes / 60).toBeCloseTo(14.5, 6);
    // sudut jarum jam di 14:30 = (14.5 % 12)/12 × 2π = 2.5/12 × 2π (≈ antara 2 & 3)
    expect(hourHandAngle(fixedMinutes)).toBeCloseTo((2.5 / 12) * Math.PI * 2, 6);
    expect(minuteHandAngle(fixedMinutes)).toBeCloseTo(Math.PI, 6);
  });

  it('regresi: jam kerja 09:00 (540 menit) → jarum jam di angka 9, menit di 12', () => {
    const m = simMinutesToClockSeconds(540) / 60; // 540 menit
    expect(hourHandAngle(m)).toBeCloseTo((9 / 12) * Math.PI * 2, 6);
    expect(minuteHandAngle(m)).toBeCloseTo(0, 6);
  });

  it('input non-numerik tetap dilempar sebagai NaN (tidak di-silent), kontrak murni', () => {
    expect(Number.isNaN(simMinutesToClockSeconds('x'))).toBe(true);
    expect(simMinutesToClockSeconds(undefined)).toBeNaN();
  });
});
