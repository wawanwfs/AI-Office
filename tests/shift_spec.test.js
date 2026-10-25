import { describe, it, expect } from 'vitest';
import { SHIFT, lunchWindowOpen, lunchSpot, lunchPause, shiftStep } from '../src/scene/parts/shift_spec.js';

// rng stub deterministik: selalu mengembalikan midpoint interval.
const midRng = { r: (min, max) => (min + max) / 2 };

describe('shift_spec: lunchWindowOpen', () => {
  it('terbuka 12:00–12:59 (720–779), tertutup di luar', () => {
    expect(lunchWindowOpen(719)).toBe(false);
    expect(lunchWindowOpen(720)).toBe(true);
    expect(lunchWindowOpen(779)).toBe(true);
    expect(lunchWindowOpen(780)).toBe(false);
  });
});

describe('shift_spec: lunchSpot & lunchPause', () => {
  it('titik berdiri dalam batas jitter depan bar stools', () => {
    const s = lunchSpot(midRng);
    expect(s.x).toBeCloseTo(SHIFT.LUNCH_SPOT_X); // midpoint jitter x = 0
    expect(s.z).toBeCloseTo(SHIFT.LUNCH_SPOT_Z + SHIFT.LUNCH_SPOT_JITTER_Z / 2);
  });
  it('lunchPause dalam rentang [6, 14] menit', () => {
    const p = lunchPause(midRng);
    expect(p).toBeGreaterThanOrEqual(SHIFT.LUNCH_PAUSE_MIN);
    expect(p).toBeLessThanOrEqual(SHIFT.LUNCH_PAUSE_MAX);
  });
});

describe('shift_spec: shiftStep', () => {
  it('08:00 – phase night → arriving + event arrive', () => {
    expect(shiftStep({ phase: 'night', lunch: false }, 485)).toEqual({
      phase: 'arriving', lunch: false, events: ['arrive'],
    });
  });
  it('idempoten: tetap arriving di jendela yang sama tanpa event duplikat', () => {
    expect(shiftStep({ phase: 'arriving', lunch: false }, 490).events).toEqual([]);
  });
  it('12:00 – mulai lunch', () => {
    expect(shiftStep({ phase: 'working', lunch: false }, 720)).toEqual({
      phase: 'working', lunch: true, events: ['lunch_start'],
    });
  });
  it('13:00 – selesai lunch', () => {
    expect(shiftStep({ phase: 'working', lunch: true }, 780)).toEqual({
      phase: 'working', lunch: false, events: ['lunch_end'],
    });
  });
  it('13:00 – phase non-working dijajarkan ke working (working_pm)', () => {
    expect(shiftStep({ phase: 'night', lunch: false }, 800)).toEqual({
      phase: 'working', lunch: false, events: ['working_pm'],
    });
  });
  it('18:00 – phase leaving + event depart', () => {
    expect(shiftStep({ phase: 'working', lunch: false }, 1100)).toEqual({
      phase: 'leaving', lunch: false, events: ['depart'],
    });
  });
  it('18:31 – nightfall', () => {
    expect(shiftStep({ phase: 'leaving', lunch: false }, 1111)).toEqual({
      phase: 'night', lunch: false, events: ['nightfall'],
    });
  });
  it('dini hari (sebelum 08:00) → nightfall', () => {
    expect(shiftStep({ phase: 'working', lunch: false }, 400).events).toEqual(['nightfall']);
  });
});
