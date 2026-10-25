import { describe, it, expect } from 'vitest';
import { simMinutesToClockSeconds } from '../src/scene/parts/clock_units.js';

describe('clock_units: simMinutesToClockSeconds', () => {
  it('mengonversi menit simulasi ke detik sejak tengah malam', () => {
    expect(simMinutesToClockSeconds(0)).toBe(0);
    expect(simMinutesToClockSeconds(30)).toBe(1800);   // 00:30
    expect(simMinutesToClockSeconds(900)).toBe(54000); // 15:00
    expect(simMinutesToClockSeconds(1440)).toBe(86400);// 24:00
  });
});
