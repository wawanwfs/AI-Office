import { describe, it, expect } from 'vitest';
import {
  POSTERS, POSTER_Y, POSTER_W, POSTER_H, CANVAS_W, CANVAS_H, LINE_H,
  posterFacing, posterOffset, posterLineY, posterWall, posterFacingFor, posterOffsetFor,
} from '../scene/parts/poster_spec.js';

const HEX = /^#[0-9a-f]{6}$/i;

describe('poster_spec — poster dinding kantor', () => {
  it('ada 8 poster (5 dinding samping + 3 dinding z)', () => {
    expect(POSTERS).toHaveLength(8);
  });

  it('setiap poster punya field lengkap & valid', () => {
    for (const p of POSTERS) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.z).toBe('number');
      expect(p.c).toMatch(HEX);
      expect(typeof p.t).toBe('string');
      expect(p.t.trim().length).toBeGreaterThan(0);
    }
  });

  it('dinding samping: semua poster menempel di x ±11.4, di dalam lantai ±13/±10', () => {
    for (const p of POSTERS.filter((q) => !q.wall)) {
      expect(Math.abs(p.x)).toBeCloseTo(11.4, 5);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(13);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(10);
    }
  });

  it('poster dinding z punya wall z-/z+, koordinat di dalam lantai ±13/±10', () => {
    const zw = POSTERS.filter((p) => p.wall === 'z-' || p.wall === 'z+');
    expect(zw.length).toBeGreaterThanOrEqual(3);
    for (const p of zw) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(13);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(10);
      expect(Math.abs(p.z)).toBeGreaterThan(9); // dekat dinding
    }
  });

  it('posterFacingFor: z- menghadap 0, z+ menghadap π, samping tetap posterFacing', () => {
    expect(posterFacingFor({ wall: 'z-', x: 0, z: -9.9 })).toBe(0);
    expect(posterFacingFor({ wall: 'z+', x: 4, z: 9.9 })).toBe(Math.PI);
    expect(posterFacingFor({ x: -11.4, z: 3 })).toBe(posterFacing(-11.4));
  });

  it('posterOffsetFor: menjauh dari dinding, magnitudo 0.03 semua dinding', () => {
    for (const p of POSTERS) {
      expect(Math.abs(posterOffsetFor(p))).toBeCloseTo(0.03, 5);
    }
    expect(posterOffsetFor({ wall: 'z-', x: 0, z: -9.9 })).toBeCloseTo(0.03, 5);
    expect(posterOffsetFor({ wall: 'z+', x: 4, z: 9.9 })).toBeCloseTo(-0.03, 5);
  });

  it('posterWall: fallback dinding samping dari tanda x, wall eksplisit dipertahankan', () => {
    expect(posterWall({ x: -11.4, z: 3 })).toBe('x-');
    expect(posterWall({ x: 11.4, z: 3 })).toBe('x+');
    expect(posterWall({ wall: 'z+', x: 4, z: 9.9 })).toBe('z+');
  });

  it('ada poster di kedua sisi dinding samping (kiri & kanan) & di dinding z', () => {
    expect(POSTERS.filter((p) => p.x < 0 && !p.wall).length).toBeGreaterThan(0);
    expect(POSTERS.filter((p) => p.x > 0 && !p.wall).length).toBeGreaterThan(0);
    expect(POSTERS.some((p) => p.wall === 'z-')).toBe(true);
    expect(POSTERS.some((p) => p.wall === 'z+')).toBe(true);
  });

  it('tidak ada dua poster pada posisi dinding yang sama', () => {
    const keys = POSTERS.map((p) => `${p.x},${p.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('teks slogan unik & sesuai isi markas', () => {
    const t = POSTERS.map((p) => p.t);
    expect(new Set(t).size).toBe(t.length);
    expect(t).toContain('SHIP IT');
    expect(t).toContain('WFS PROJECT');
  });

  it('warna poster unik', () => {
    expect(new Set(POSTERS.map((p) => p.c)).size).toBe(POSTERS.length);
  });

  it('ukuran konstanta render tetap (tanpa regresi visual)', () => {
    expect(POSTER_Y).toBe(2.2);
    expect(POSTER_W).toBeCloseTo(0.46, 5);
    expect(POSTER_H).toBeCloseTo(0.66, 5);
    expect(CANVAS_W).toBe(120);
    expect(CANVAS_H).toBe(160);
    expect(LINE_H).toBe(24);
  });

  it('posterFacing: dinding kiri menghadap +π/2, kanan −π/2', () => {
    expect(posterFacing(-11.4)).toBeCloseTo(Math.PI / 2, 10);
    expect(posterFacing(11.4)).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('posterOffset: menjauh dari dinding, magnitudo 0.03', () => {
    expect(posterOffset(-11.4)).toBeCloseTo(0.03, 5);
    expect(posterOffset(11.4)).toBeCloseTo(-0.03, 5);
    expect(Math.abs(posterOffset(0))).toBeCloseTo(0.03, 5);
  });

  it('posterLineY: baris pertama 64, turun LINE_H per baris', () => {
    expect(posterLineY(0)).toBe(64);
    expect(posterLineY(1)).toBe(88);
    expect(posterLineY(2)).toBe(112);
  });

  it('teks ≤3 baris tetap muat di canvas (baris terakhir < CANVAS_H − margin)', () => {
    for (const p of POSTERS) {
      const lines = p.t.split(' ');
      expect(lines.length).toBeLessThanOrEqual(3);
      const last = posterLineY(lines.length - 1);
      expect(last).toBeLessThan(CANVAS_H - 10);
    }
  });

  it('plane lebih kecil dari frame kayu (0.72×0.52)', () => {
    expect(POSTER_W).toBeLessThan(0.52);
    expect(POSTER_H).toBeLessThan(0.72);
  });
});
