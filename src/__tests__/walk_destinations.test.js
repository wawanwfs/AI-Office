import { describe, it, expect } from 'vitest';
import { WALK_DESTINATIONS, isSafeDestination } from '../scene/parts/walk_destinations.js';
import { OBSTACLES, inObstacle } from '../scene/parts/obstacles.js';
import { DESKS } from '../scene/parts/desk_layout.js';

describe('WALK_DESTINATIONS — 8 tujuan jalan-jalan agent', () => {
  it('tepat 8 tujuan', () => {
    expect(WALK_DESTINATIONS).toHaveLength(8);
  });

  it('posisi historis semua 8 tujuan (urutan pantry→tanaman)', () => {
    const expected = [
      [-9.4, 3.6], [-9.5, 0.9], [2.2, -7.0],
      [9.0, 3.9], [6.0, -0.6], [6.8, 4.9], [-0.5, 4.2], [-3.2, -6.2],
    ];
    WALK_DESTINATIONS.forEach((d, i) => {
      expect(d.x).toBe(expected[i][0]);
      expect(d.z).toBe(expected[i][1]);
    });
  });

  it('koordinat finite', () => {
    WALK_DESTINATIONS.forEach((d) => {
      expect(Number.isFinite(d.x)).toBe(true);
      expect(Number.isFinite(d.z)).toBe(true);
    });
  });

  it('semua tujuan dalam batas ruangan (|x|≤12.5, |z|≤9.5)', () => {
    WALK_DESTINATIONS.forEach((d) => {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(12.5);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(9.5);
    });
  });

  it('tidak ada tujuan di dalam rintangan statis', () => {
    WALK_DESTINATIONS.forEach((d) => {
      expect(inObstacle(d.x, d.z)).toBe(false);
    });
  });

  it('tidak menumpuk meja agent (jarak min 1.2 dari pusat meja mana pun)', () => {
    WALK_DESTINATIONS.forEach((d) => {
      DESKS.forEach((k) => {
        expect(Math.hypot(d.x - k.x, d.z - k.z)).toBeGreaterThanOrEqual(1.2);
      });
    });
  });

  it('semua tujuan lulus isSafeDestination dengan OBSTACLES nyata', () => {
    WALK_DESTINATIONS.forEach((d) => {
      expect(isSafeDestination(d, inObstacle)).toBe(true);
    });
  });

  it('tujuan unik (tidak ada duplikat posisi)', () => {
    const keys = WALK_DESTINATIONS.map((d) => `${d.x},${d.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isSafeDestination — validasi tujuan', () => {
  it('menolak titik di dalam rintangan (counter pantry)', () => {
    expect(isSafeDestination({ x: -10.5, z: 2.5 }, inObstacle)).toBe(false);
  });

  it('menolak titik di luar batas ruangan', () => {
    expect(isSafeDestination({ x: 13, z: 0 }, inObstacle)).toBe(false);
    expect(isSafeDestination({ x: 0, z: -10.5 }, inObstacle)).toBe(false);
  });

  it('menolak koordinat non-finite', () => {
    expect(isSafeDestination({ x: NaN, z: 0 }, inObstacle)).toBe(false);
    expect(isSafeDestination({ x: Infinity, z: 0 }, inObstacle)).toBe(false);
  });

  it('menerima titik bebas', () => {
    expect(isSafeDestination({ x: 0, z: 4 }, inObstacle)).toBe(true);
  });

  it('menghormati bounds kustom & fungsi obstacle injeksi', () => {
    expect(isSafeDestination({ x: 11.9, z: 9.3 }, () => false, { x: 12.5, z: 9.5 })).toBe(true);
    expect(isSafeDestination({ x: 0, z: 0 }, () => true)).toBe(false);
  });
});
