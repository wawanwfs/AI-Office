import { describe, it, expect } from 'vitest';
import { EXTENDED_SPECIALISTS } from '../scene/parts/extended_desks.js';

// Formula lantai yang dipakai OfficeScene (bukan field floor deklaratif):
// z < -0.8 → lantai 1; z <= 4.5 → lantai 2; else → lantai 3.
const floorFromZ = (z) => (z < -0.8 ? 1 : (z <= 4.5 ? 2 : 3));

describe('extended_desks — EXTENDED_SPECIALISTS', () => {
  it('berisi 6 spesialis dengan nama unik', () => {
    expect(EXTENDED_SPECIALISTS).toHaveLength(6);
    const names = EXTENDED_SPECIALISTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('setiap desk punya koordinat x & z numerik', () => {
    for (const a of EXTENDED_SPECIALISTS) {
      expect(a.desk).toBeTruthy();
      expect(Number.isFinite(a.desk.x)).toBe(true);
      expect(Number.isFinite(a.desk.z)).toBe(true);
    }
  });

  it('tidak ada dua meja yang menempati posisi (x, z) sama', () => {
    const keys = EXTENDED_SPECIALISTS.map((a) => `${a.desk.x},${a.desk.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('field floor deklaratif konsisten dengan formula lantai dari z', () => {
    for (const a of EXTENDED_SPECIALISTS) {
      expect(a.floor).toBe(floorFromZ(a.desk.z));
    }
  });

  it('setiap lantai (1, 2, 3) punya minimal satu spesialis', () => {
    const floors = new Set(EXTENDED_SPECIALISTS.map((a) => a.floor));
    expect(floors).toEqual(new Set([1, 2, 3]));
  });

  it('tiap spesialis punya role & screen yang terisi', () => {
    for (const a of EXTENDED_SPECIALISTS) {
      expect(typeof a.role).toBe('string');
      expect(a.role.length).toBeGreaterThan(0);
      expect(typeof a.screen).toBe('string');
      expect(a.screen.length).toBeGreaterThan(0);
    }
  });

  it('warna numerik color konsisten dengan hex string', () => {
    for (const a of EXTENDED_SPECIALISTS) {
      expect(typeof a.hex).toBe('string');
      expect(a.hex.startsWith('#')).toBe(true);
      expect(a.color).toBe(parseInt(a.hex.replace('#', ''), 16));
    }
  });

  it('warna tubuh (hair, shirt, pants) valid dalam rentang 24-bit', () => {
    for (const a of EXTENDED_SPECIALISTS) {
      for (const k of ['hair', 'shirt', 'pants']) {
        expect(Number.isFinite(a[k])).toBe(true);
        expect(a[k]).toBeGreaterThanOrEqual(0);
        expect(a[k]).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});
