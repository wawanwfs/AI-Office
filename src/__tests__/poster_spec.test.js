import { describe, it, expect } from 'vitest';
import {
  POSTERS, POSTER_Y, POSTER_W, POSTER_H, CANVAS_W, CANVAS_H, LINE_H,
  posterFacing, posterOffset, posterLineY,
} from '../scene/parts/poster_spec.js';

const HEX = /^#[0-9a-f]{6}$/i;

describe('poster_spec — poster dinding kantor', () => {
  it('ada 5 poster', () => {
    expect(POSTERS).toHaveLength(5);
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

  it('semua poster menempel di dinding samping (x ±11.4, di dalam lantai ±13/±10)', () => {
    for (const p of POSTERS) {
      expect(Math.abs(p.x)).toBeCloseTo(11.4, 5);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(13);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(10);
    }
  });

  it('ada poster di kedua sisi dinding (kiri & kanan)', () => {
    expect(POSTERS.filter((p) => p.x < 0).length).toBeGreaterThan(0);
    expect(POSTERS.filter((p) => p.x > 0).length).toBeGreaterThan(0);
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
