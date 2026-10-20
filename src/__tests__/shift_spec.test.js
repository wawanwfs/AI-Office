// Unit test untuk spesifikasi mesin fase shift (src/scene/parts/shift_spec.js).
import { describe, it, expect } from 'vitest';
import { SHIFT, lunchWindowOpen, lunchSpot, lunchPause, shiftStep } from '../scene/parts/shift_spec.js';

const rngStub = { r: (a, b) => a + (b - a) / 2 };

describe('shift: konstanta historis', () => {
  it('pintu di (-12, 8)', () => {
    expect(SHIFT.DOOR).toEqual({ x: -12, z: 8 });
  });
  it('urutan kedatangan & kepergian historis (kebalikan)', () => {
    expect(SHIFT.ARRIVE).toEqual([0, 2, 4, 1, 5, 3, 6, 7]);
    expect(SHIFT.DEPART).toEqual([7, 6, 3, 5, 1, 4, 2, 0]);
    expect([...SHIFT.DEPART].reverse()).toEqual(SHIFT.ARRIVE);
  });
  it('jam jendela fase: datang 480-510, lunch 720-780, pulang 1080-1110', () => {
    expect(SHIFT.ARRIVE_FROM).toBe(480); expect(SHIFT.ARRIVE_TO).toBe(510);
    expect(SHIFT.LUNCH_START).toBe(720); expect(SHIFT.LUNCH_END).toBe(780);
    expect(SHIFT.LEAVE_FROM).toBe(1080); expect(SHIFT.LEAVE_TO).toBe(1110);
  });
  it('spot lunch di depan bar stools (z 9.0 > 8.5) dengan jitter', () => {
    expect(SHIFT.LUNCH_SPOT_X).toBe(-9.5);
    expect(SHIFT.LUNCH_SPOT_Z).toBe(9.0);
    expect(SHIFT.LUNCH_SPOT_JITTER_X).toBe(1.2);
    expect(SHIFT.LUNCH_SPOT_JITTER_Z).toBe(0.35);
    expect(SHIFT.LUNCH_PAUSE_MIN).toBe(6); expect(SHIFT.LUNCH_PAUSE_MAX).toBe(14);
  });
});

describe('shift: lunchWindowOpen', () => {
  it('terbuka 720..779, tertutup di 780', () => {
    expect(lunchWindowOpen(719)).toBe(false);
    expect(lunchWindowOpen(720)).toBe(true);
    expect(lunchWindowOpen(779)).toBe(true);
    expect(lunchWindowOpen(780)).toBe(false);
  });
  it('tertutup di malam & dini hari', () => {
    expect(lunchWindowOpen(0)).toBe(false);
    expect(lunchWindowOpen(1439)).toBe(false);
  });
});

describe('shift: lunchSpot & lunchPause', () => {
  it('spot di sekitar (-9.5, 9.0) sesuai jitter stub', () => {
    expect(lunchSpot(rngStub)).toEqual({ x: -9.5, z: 9.0 + 0.175 });
  });
  it('jitter z hanya positif (agen tidak di atas stools z<9)', () => {
    const r = { r: (a) => a };
    expect(lunchSpot(r).z).toBeCloseTo(9.0);
  });
  it('pause di tengah rentang stub', () => {
    expect(lunchPause(rngStub)).toBe(10);
  });
  it('pause boundary rng mengikuti r(min,max)', () => {
    const lo = { r: (a) => a }, hi = { r: (a, b) => b };
    expect(lunchPause(lo)).toBe(6);
    expect(lunchPause(hi)).toBe(14);
  });
});

describe('shift: shiftStep fase & event', () => {
  const S = (phase) => ({ phase, lunch: false });

  it('malam (m=200) dari working → night + nightfall', () => {
    const r = shiftStep(S('working'), 200);
    expect(r.phase).toBe('night');
    expect(r.lunch).toBe(false);
    expect(r.events).toContain('nightfall');
  });
  it('pagi 08:00 tepat → arriving + arrive', () => {
    const r = shiftStep(S('night'), 480);
    expect(r.phase).toBe('arriving');
    expect(r.events).toContain('arrive');
  });
  it('pagi 08:15 dari arriving → TIDAK re-trigger arrive', () => {
    const r = shiftStep(S('arriving'), 495);
    expect(r.events).not.toContain('arrive');
  });
  it('pagi 08:31 → working (AM)', () => {
    const r = shiftStep(S('arriving'), 511);
    expect(r.phase).toBe('working');
    expect(r.events).toContain('working_am');
  });
  it('12:00 dari working → lunch_start & phase tetap working hingga event dieksekusi', () => {
    const r = shiftStep(S('working'), 720);
    expect(r.lunch).toBe(true);
    expect(r.events).toContain('lunch_start');
  });
  it('12:30 dari lunch → tidak re-trigger', () => {
    const r = shiftStep({ phase: 'working', lunch: true }, 750);
    expect(r.lunch).toBe(true);
    expect(r.events).not.toContain('lunch_start');
  });
  it('13:00 → lunch_end (fase kembali working)', () => {
    const r = shiftStep({ phase: 'working', lunch: true }, 780);
    expect(r.lunch).toBe(false);
    expect(r.phase).toBe('working');
    expect(r.events).toContain('lunch_end');
  });
  it('13:00 dari leaving (jarang) → lunch_end + working_pm', () => {
    const r = shiftStep({ phase: 'leaving', lunch: true }, 780);
    expect(r.events).toContain('working_pm');
  });
  it('18:00 dari working → leaving + depart', () => {
    const r = shiftStep(S('working'), 1080);
    expect(r.phase).toBe('leaving');
    expect(r.events).toContain('depart');
  });
  it('18:15 dari leaving → tidak re-trigger depart', () => {
    const r = shiftStep(S('leaving'), 1095);
    expect(r.events).not.toContain('depart');
  });
  it('18:31 → night + nightfall', () => {
    const r = shiftStep(S('leaving'), 1111);
    expect(r.phase).toBe('night');
    expect(r.events).toContain('nightfall');
  });
  it('23:59 & 00:00 → night', () => {
    expect(shiftStep(S('working'), 1439).phase).toBe('night');
    expect(shiftStep(S('working'), 0).phase).toBe('night');
  });
  it('urutan event historis saat transisi leaving→lunch_end+working_pm', () => {
    const r = shiftStep({ phase: 'leaving', lunch: true }, 780);
    expect(r.events.indexOf('lunch_end')).toBeLessThan(r.events.indexOf('working_pm'));
  });
  it('dari working di jam kerja → tanpa event apa pun (stabil)', () => {
    expect(shiftStep(S('working'), 600).events).toEqual([]);
    expect(shiftStep({ phase: 'working', lunch: true }, 750).events).toEqual([]);
  });
});
