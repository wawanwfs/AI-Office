import { describe, it, expect } from 'vitest';
import { ZONES, zoneLabelY, zoneLabelScale } from '../scene/parts/floor_zones.js';

describe('floor_zones — data zona lantai markas', () => {
  it('mendefinisikan 5 zona dengan label yang diharapkan', () => {
    expect(ZONES).toHaveLength(5);
    expect(ZONES.map(z => z.label)).toEqual([
      'DEV DESK', 'MEETING', 'WELCOME & LOUNGE', 'CAFÉ', 'SERVER ROOM',
    ]);
  });

  it('semua zona punya field lengkap & tipe valid', () => {
    for (const z of ZONES) {
      expect(typeof z.x).toBe('number');
      expect(typeof z.z).toBe('number');
      expect(z.w).toBeGreaterThan(0);
      expect(z.d).toBeGreaterThan(0);
      expect(Number.isFinite(z.color)).toBe(true);
      expect(z.label.length).toBeGreaterThan(0);
    }
  });

  it('setiap patch zona berada di dalam lantai ±13 / ±10', () => {
    for (const z of ZONES) {
      expect(Math.abs(z.x) + z.w / 2).toBeLessThanOrEqual(13);
      expect(Math.abs(z.z) + z.d / 2).toBeLessThanOrEqual(10);
    }
  });

  it('tidak ada dua zona yang tumpang tindih (AABB)', () => {
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const a = ZONES[i], b = ZONES[j];
        const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
        const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
  });

  it('warna zona unik agar zona mudah dibedakan', () => {
    expect(new Set(ZONES.map(z => z.color)).size).toBe(ZONES.length);
  });

  it('opacity default .55 bila tidak dispesifikkan; MEETING .9', () => {
    for (const z of ZONES) {
      const op = z.op ?? .55;
      expect(op).toBeGreaterThan(0);
      expect(op).toBeLessThanOrEqual(1);
    }
    expect(ZONES.find(z => z.label === 'MEETING').op).toBe(.9);
  });

  it('CAFÉ menempel kafe fisik (counter L di -9.5, 7.5)', () => {
    const c = ZONES.find(z => z.label === 'CAFÉ');
    // patch harus mencakup titik counter pantry
    expect(c.x - c.w / 2).toBeLessThanOrEqual(-9.5);
    expect(c.x + c.w / 2).toBeGreaterThanOrEqual(-9.5);
    expect(c.z - c.d / 2).toBeLessThanOrEqual(7.5);
    expect(c.z + c.d / 2).toBeGreaterThanOrEqual(7.5);
  });

  it('MEETING patch tepat di atas meja rapat (8, -3) ukuran 5.4', () => {
    const m = ZONES.find(z => z.label === 'MEETING');
    expect(m.x).toBe(8);
    expect(m.z).toBe(-3);
    expect(m.w).toBe(5.4);
    expect(m.d).toBe(5.4);
  });

  it('SERVER ROOM adalah satu-satunya zona dengan offset label dy', () => {
    const withDy = ZONES.filter(z => z.dy);
    expect(withDy).toHaveLength(1);
    expect(withDy[0].label).toBe('SERVER ROOM');
    expect(withDy[0].dy).toBe(-0.9);
  });
});

describe('zoneLabelY — posisi label di tepi depan zona', () => {
  it('label di tepi depan (z - d/2) + margin 0.7', () => {
    const z = { z: -1.2, d: 7.5 };
    expect(zoneLabelY(z)).toBeCloseTo(-1.2 - 3.75 + 0.7);
  });

  it('dy menggeser label lebih depan lagi (SERVER ROOM)', () => {
    const srv = ZONES.find(z => z.label === 'SERVER ROOM');
    const base = srv.z - srv.d / 2 + 0.7;
    expect(zoneLabelY(srv)).toBeCloseTo(base - 0.9);
  });

  it('zona tanpa dy identik dengan dy=0', () => {
    const dev = ZONES.find(z => z.label === 'DEV DESK');
    expect(zoneLabelY(dev)).toBeCloseTo(zoneLabelY({ ...dev, dy: 0 }));
  });

  it('label selalu lebih kecil (lebih depan) dari pusat zona', () => {
    for (const z of ZONES) {
      expect(zoneLabelY(z)).toBeLessThan(z.z);
    }
  });
});

describe('zoneLabelScale — skala sprite label', () => {
  it('label pendek (≤9 karakter) skala 1', () => {
    expect(zoneLabelScale('DEV DESK')).toBe(1);
    expect(zoneLabelScale('MEETING')).toBe(1);
    expect(zoneLabelScale('CAFÉ')).toBe(1);
  });

  it('label panjang (>9 karakter) skala 1.25', () => {
    expect(zoneLabelScale('WELCOME & LOUNGE')).toBe(1.25);
    expect(zoneLabelScale('SERVER ROOM')).toBe(1.25);
  });

  it('boundary 9 karakter: tepat 9 masih skala 1', () => {
    expect(zoneLabelScale('123456789')).toBe(1);
    expect(zoneLabelScale('1234567890')).toBe(1.25);
  });
});
