// Unit test pemodelan elevasi lantai bertingkat 3 lantai (L1, L2, L3) dan tangga arsitektural.
import { describe, it, expect } from 'vitest';
import {
  L1_Y, L2_Y, L3_Y,
  STAIR1_START_Z, STAIR1_END_Z, STAIR2_START_Z, STAIR2_END_Z,
  STAIR_WIDTH, isNearStairX,
  floorElevationAt,
} from '../scene/parts/floor_elevation.js';

describe('floor_elevation.js — konstanta arsitektur', () => {
  it('ketinggian 3 lantai proporsional & presisi', () => {
    expect(L1_Y).toBe(0);
    expect(L2_Y).toBe(0.60);
    expect(L3_Y).toBe(1.20);
  });

  it('lebar bentang tangga kembar terdefinisi 3.4m dan deteksi isNearStairX akurat', () => {
    expect(STAIR_WIDTH).toBe(3.4);
    // Tangga kiri (x = -2.6): rentang [-4.3, -0.9]
    expect(isNearStairX(-2.6)).toBe(true);
    expect(isNearStairX(-2.0)).toBe(true);
    expect(isNearStairX(-4.0)).toBe(true);
    // Tangga kanan (x = 2.6): rentang [0.9, 4.3]
    expect(isNearStairX(2.6)).toBe(true);
    expect(isNearStairX(3.5)).toBe(true);
    // Di luar bentang tangga (misal di sayap barat/timur jauh atau tengah atrium)
    expect(isNearStairX(0)).toBe(false);
    expect(isNearStairX(-8.0)).toBe(false);
    expect(isNearStairX(10.0)).toBe(false);
    // Backward compatibility: x tidak disediakan (undefined/null) diasumsikan true
    expect(isNearStairX(undefined)).toBe(true);
    expect(isNearStairX(null)).toBe(true);
    // Non-finite (NaN / ±Infinity) juga diasumsikan true — guard !Number.isFinite
    expect(isNearStairX(NaN)).toBe(true);
    expect(isNearStairX(Infinity)).toBe(true);
    expect(isNearStairX(-Infinity)).toBe(true);
  });

  it('batas Z tangga arsitektural L1→L2 dan L2→L3 terdefinisi konsisten', () => {
    expect(STAIR1_START_Z).toBe(-1.8);
    expect(STAIR1_END_Z).toBe(-0.6);
    expect(STAIR2_START_Z).toBe(3.8);
    expect(STAIR2_END_Z).toBe(5.0);
    expect(STAIR1_START_Z).toBeLessThan(STAIR1_END_Z);
    expect(STAIR2_START_Z).toBeLessThan(STAIR2_END_Z);
  });
});

describe('floorElevationAt(z) — perhitungan ketinggian lantai', () => {
  it('Lantai 1 (Level 01: z <= -1.8) selalu bernilai Y = 0', () => {
    expect(floorElevationAt(-10)).toBe(0);
    expect(floorElevationAt(-7.6)).toBe(0); // Server room
    expect(floorElevationAt(-3.0)).toBe(0); // Row 1 desks (BANTUIN AI, BUDI, ANDI, RINA, TRAINER AI)
    expect(floorElevationAt(-1.8)).toBe(0); // Dasar tangga 1
  });

  it('Tanjakan Tangga 1 (-1.8 < z < -0.6) naik linear dari 0 ke 0.60', () => {
    expect(floorElevationAt(-1.2)).toBeCloseTo(0.30, 4); // Tengah tangga 1
    expect(floorElevationAt(-1.5)).toBeCloseTo(0.15, 4);
    expect(floorElevationAt(-0.9)).toBeCloseTo(0.45, 4);
  });

  it('elevasi 2D akurat: di luar tangga, Z transisi tetap pada level lantai masing-masing', () => {
    // Pada koordinat Z tangga 1 (z = -1.2): jika di tangga (x = -2.6 atau 2.6) -> 0.30m
    expect(floorElevationAt(-1.2, -2.6)).toBeCloseTo(0.30, 4);
    expect(floorElevationAt(-1.2, 2.6)).toBeCloseTo(0.30, 4);
    // Jika di luar tangga (misal di x = -8.0 pada deck Lantai 1) -> 0m
    expect(floorElevationAt(-1.2, -8.0)).toBe(0);
    expect(floorElevationAt(-1.2, 0)).toBe(0);
    // x non-finite (NaN) di area tangga → diasumsikan di lintasan tangga → interpolasi
    expect(floorElevationAt(-1.2, NaN)).toBeCloseTo(0.30, 4);

    // Pada koordinat Z tangga 2 (z = 4.4): jika di tangga -> 0.90m
    expect(floorElevationAt(4.4, -2.6)).toBeCloseTo(0.90, 4);
    expect(floorElevationAt(4.4, 2.6)).toBeCloseTo(0.90, 4);
    // Jika di luar tangga (misal di x = -8.0 pada deck Lantai 2) -> 0.60m
    expect(floorElevationAt(4.4, -8.0)).toBe(0.60);
    expect(floorElevationAt(4.4, 10.0)).toBe(0.60);
  });

  it('Lantai 2 (Level 02: -0.6 <= z <= 3.8) selalu bernilai Y = 0.60', () => {
    expect(floorElevationAt(-0.6)).toBe(0.60); // Puncak tangga 1
    expect(floorElevationAt(0)).toBe(0.60);
    expect(floorElevationAt(1.5)).toBe(0.60);  // Row 2 desks (RIZKY, DEWI, YOGA, LINA, INTEGRATOR BOT)
    expect(floorElevationAt(3.8)).toBe(0.60);  // Dasar tangga 2
  });

  it('Tanjakan Tangga 2 (3.8 < z < 5.0) naik linear dari 0.60 ke 1.20', () => {
    expect(floorElevationAt(4.4)).toBeCloseTo(0.90, 4); // Tengah tangga 2
    expect(floorElevationAt(4.1)).toBeCloseTo(0.75, 4);
    expect(floorElevationAt(4.7)).toBeCloseTo(1.05, 4);
  });

  it('Lantai 3 (Level 03: z >= 5.0) selalu bernilai Y = 1.20', () => {
    expect(floorElevationAt(5.0)).toBe(1.20); // Puncak tangga 2
    expect(floorElevationAt(6.0)).toBe(1.20); // Row 3 desks (MAYA, TONI, SARI, SUPPORT)
    expect(floorElevationAt(7.5)).toBe(1.20); // Cafe
    expect(floorElevationAt(8.0)).toBe(1.20); // Pintu masuk kantor (DOOR)
    expect(floorElevationAt(12.0)).toBe(1.20);
  });

  it('kontinu & monoton tidak menurun di sepanjang sumbu Z kantor (-14 .. 14)', () => {
    let prev = -Infinity;
    for (let z = -14; z <= 14; z += 0.1) {
      const y = floorElevationAt(z);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1.20);
      prev = y;
    }
  });

  it('guard anti-poisoning: z non-finite (NaN/±Infinity) → L1_Y (0), tidak terlempar ke L3', () => {
    // Bug lama: NaN menembus semua perbandingan → return L3_Y (1.20) — agen
    // dengan posisi z korup terangkat ke lantai atas. Sekarang no-op aman: dasar.
    expect(floorElevationAt(NaN)).toBe(0);
    expect(floorElevationAt(Infinity)).toBe(0);
    expect(floorElevationAt(-Infinity)).toBe(0);
    // Untuk kombinasi dengan x (guard z menang lebih dulu)
    expect(floorElevationAt(NaN, -2.6)).toBe(0);
    expect(floorElevationAt(Infinity, 2.6)).toBe(0);
    // Nilai finite normal tetap tidak berubah (regresi guard)
    expect(floorElevationAt(-1.2, -2.6)).toBeCloseTo(0.30, 4);
    expect(floorElevationAt(0)).toBe(0.60);
    expect(floorElevationAt(7.5)).toBe(1.20);
  });
});
