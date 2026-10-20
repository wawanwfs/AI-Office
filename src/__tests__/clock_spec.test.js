import { describe, it, expect } from 'vitest';
import {
  HANDS, TICKS, tickAngle, tickInnerR,
  hourHandAngle, minuteHandAngle, secondHandAngle,
} from '../scene/parts/clock_spec.js';

describe('clock_spec — jam dinding', () => {
  it('12 tick (jarum 3/6/9/12 inner radius pendek)', () => {
    expect(TICKS).toBe(12);
    [0, 3, 6, 9].forEach((i) => expect(tickInnerR(i)).toBe(35));
    [1, 2, 4, 5, 7, 8, 10, 11].forEach((i) => expect(tickInnerR(i)).toBe(39));
  });

  it('tickAngle: setiap tick = 30°, siklus penuh 2π', () => {
    expect(tickAngle(0)).toBe(0);
    expect(tickAngle(6)).toBeCloseTo(Math.PI);
    expect(tickAngle(3)).toBeCloseTo(Math.PI / 2);
  });

  it('hourHandAngle: 12:00 = 0, 06:00 = π, 15:00 = 3π/4', () => {
    expect(hourHandAngle(0)).toBe(0);
    expect(hourHandAngle(12 * 60)).toBeCloseTo(0);
    expect(hourHandAngle(6 * 60)).toBeCloseTo(Math.PI);
    expect(hourHandAngle(15 * 60)).toBeCloseTo(Math.PI / 2);
  });

  it('minuteHandAngle: 0 dan 60 menit = 0 (satu putaran), 30 menit = π', () => {
    expect(minuteHandAngle(0)).toBe(0);
    expect(minuteHandAngle(60)).toBeCloseTo(0);
    expect(minuteHandAngle(30)).toBeCloseTo(Math.PI);
  });

  it('secondHandAngle modul 60', () => {
    expect(secondHandAngle(0)).toBe(0);
    expect(secondHandAngle(60)).toBeCloseTo(0);
    expect(secondHandAngle(90)).toBeCloseTo(secondHandAngle(30));
  });

  it('jarum jam menit konsisten: 03:00 sudut jam = 90° dan monoton naik', () => {
    expect(hourHandAngle(3 * 60)).toBeCloseTo(Math.PI / 2);
    const a = hourHandAngle(100), b = hourHandAngle(200), c2 = hourHandAngle(300);
    expect(a).toBeLessThan(b); expect(b).toBeLessThan(c2);
  });

  it('spesifikasi jarum: detik terpanjang, jam terpendek, warna', () => {
    expect(HANDS.second.len).toBeGreaterThan(HANDS.minute.len);
    expect(HANDS.minute.len).toBeGreaterThan(HANDS.hour.len);
    expect(HANDS.hour.color).toBe('#222');
    expect(HANDS.second.color).toBe('#f97316');
  });
});
