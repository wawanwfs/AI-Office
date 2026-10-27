// Unit test untuk footprint rintangan statis (src/scene/parts/obstacles.js).
// Mencegah regresi: agent berhenti DI DALAM/ATAS furnitur (counter, printer,
// café, lounge) atau menempati kursi agent lain.
import { describe, it, expect } from 'vitest';
import { OBSTACLES, inObstacle, seatOccupied } from '../scene/parts/obstacles.js';

describe('obstacles: data footprint', () => {
  it('5 rintangan dengan format [x0,x1,z0,z1] valid', () => {
    expect(OBSTACLES).toHaveLength(5);
    for (const [x0, x1, z0, z1] of OBSTACLES) {
      expect(x1).toBeGreaterThan(x0);
      expect(z1).toBeGreaterThan(z0);
    }
  });

  it('footprint berada di dalam lantai (BOUNDS ±13/±10)', () => {
    for (const [x0, x1, z0, z1] of OBSTACLES) {
      expect(x0).toBeGreaterThanOrEqual(-13);
      expect(x1).toBeLessThanOrEqual(13);
      expect(z0).toBeGreaterThanOrEqual(-10);
      expect(z1).toBeLessThanOrEqual(10);
    }
  });

  it('rintangan tidak menutup seluruh area — ada celah antar-rintangan di X', () => {
    // contoh: baris koridor tengah (z sekitar 0..2) bebas counter café (z>=6.2)
    expect(inObstacle(0, 0)).toBe(false);
    expect(inObstacle(0, 4)).toBe(false);
    expect(inObstacle(-2, 0)).toBe(false);
  });
});

describe('obstacles: inObstacle', () => {
  it('counter pantry (-11.6..-9.5, 2.2..2.9): tepi termasuk, luar tidak', () => {
    expect(inObstacle(-11.6, 2.2)).toBe(true);
    expect(inObstacle(-10, 2.5)).toBe(true);
    expect(inObstacle(-9.5, 2.9)).toBe(true);
    expect(inObstacle(-11.7, 2.5)).toBe(false);
    expect(inObstacle(-9.4, 2.5)).toBe(false);
    expect(inObstacle(-10, 2.1)).toBe(false);
    expect(inObstacle(-10, 3.0)).toBe(false);
  });

  it('printer (2.5..3.5, -8.4..-7.5) terdeteksi', () => {
    expect(inObstacle(3, -8)).toBe(true);
    expect(inObstacle(3, -7.4)).toBe(false);
  });

  it('zona café (-11.4..-6.9, 6.2..9.4) & lounge (8..12.4, 4.3..9.4) terdeteksi', () => {
    expect(inObstacle(-9.5, 7.5)).toBe(true);  // counter L
    expect(inObstacle(-9.5, 8.5)).toBe(true);  // stools
    expect(inObstacle(-7, 7.3)).toBe(true);    // fridge
    expect(inObstacle(10.5, 6)).toBe(true);    // sofa
    expect(inObstacle(12.4, 9.4)).toBe(true);  // pojok lounge
    expect(inObstacle(12.5, 6)).toBe(false);
    expect(inObstacle(10.5, 4.2)).toBe(false);
  });

  it('pintu & koridor utama bebas rintangan', () => {
    expect(inObstacle(-12, 8)).toBe(false);   // pintu (target leaving/arrive)
    expect(inObstacle(0, -2)).toBe(false);    // koridor tengah
    expect(inObstacle(6, 0)).toBe(false);
  });
});

describe('obstacles: seatOccupied', () => {
  const mk = (id, hx, hz, state) => ({ agent: id, home: { x: hx, z: hz }, state });

  it('meja kosong → false', () => {
    const agents = [mk('a', -6, -1), mk('b', -4, -1)];
    expect(seatOccupied(-6.5, -2.5, agents, null)).toBe(false);
  });

  it('dekat meja agent lain (state sitting) → true; offsite diabaikan', () => {
    const agents = [mk('a', -6, -1, 'sitting'), mk('b', -4, -1, 'offsite')];
    expect(seatOccupied(-6.6, -1.3, agents, null)).toBe(true);
    expect(seatOccupied(-4.1, -0.9, agents, null)).toBe(false); // b offsite
  });

  it('agent sendiri diabaikan (selfAgent), tapi agent lain tetap dihitung', () => {
    const self = { agent: 'me-agent-obj' };
    const me = { agent: self.agent, home: { x: -6, z: -1 }, state: 'walking_back' };
    const other = mk('a', -4, -1, 'sitting');
    expect(seatOccupied(-6, -1, [me, other], me.agent)).toBe(false); // meja sendiri
    expect(seatOccupied(-4, -1, [me, other], me.agent)).toBe(true);
  });

  it('threshold 0.9: dalam → true, tepat 0.9 → false, beda state != offsite dihitung', () => {
    const agents = [mk('a', 0, 0, 'walking_out'), mk('b', 2, 0, 'meeting')];
    expect(seatOccupied(0.8, 0, agents, null)).toBe(true);   // hypot 0.8 < 0.9
    expect(seatOccupied(0.9, 0, agents, null)).toBe(false);  // hypot 0.9 !< 0.9
    expect(seatOccupied(2.5, 0, agents, null)).toBe(true);   // meeting dihitung
  });

  it('hanya jarak radial (bukan kotak): diagonal 0.7+0.7 > 0.9 → false', () => {
    const agents = [mk('a', 0, 0, 'sitting')];
    expect(seatOccupied(0.7, 0.7, agents, null)).toBe(false); // hypot ≈ 0.99
    expect(seatOccupied(0.63, 0.63, agents, null)).toBe(true); // hypot ≈ 0.891
  });
});

describe('obstacles: guard anti-poisoning non-finite (NaN/±Infinity)', () => {
  it('inObstacle NaN/±Infinity → true (terblokir), bukan false (bebas)', () => {
    expect(inObstacle(NaN, 0)).toBe(true);
    expect(inObstacle(0, NaN)).toBe(true);
    expect(inObstacle(NaN, NaN)).toBe(true);
    expect(inObstacle(Infinity, 0)).toBe(true);
    expect(inObstacle(0, -Infinity)).toBe(true);
    expect(inObstacle(undefined, 0)).toBe(true);
    expect(inObstacle(null, 0)).toBe(true);
    // koordinat valid tetap berperilaku lama
    expect(inObstacle(-10, 2.5)).toBe(true);
    expect(inObstacle(-9.4, 2.5)).toBe(false);
  });

  it('seatOccupied NaN → true (terhuni), agen tak duduk di titik korup', () => {
    const agents = [{ agent: 'a', home: { x: -6, z: -1 }, state: 'sitting' }];
    expect(seatOccupied(NaN, -1, agents, null)).toBe(true);
    expect(seatOccupied(-6, NaN, agents, null)).toBe(true);
    expect(seatOccupied(NaN, NaN, agents, null)).toBe(true);
    expect(seatOccupied(Infinity, -1, agents, null)).toBe(true);
    // koordinat valid tetap berperilaku lama
    expect(seatOccupied(-6.6, -1.3, agents, null)).toBe(true);
    expect(seatOccupied(-6.5, -2.5, agents, null)).toBe(false);
  });
});
