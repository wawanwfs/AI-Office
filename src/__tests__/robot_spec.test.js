// Unit test spesifikasi robot "Bantuin AI" (robot_spec.js) — koordinat per pose, simetri wajah, urutan bagian.
import { describe, it, expect } from 'vitest';
import { pose, eyes, smile, chestBars, legsStanding, accents, ROBOT_COLORS } from '../scene/parts/robot_spec.js';

describe('pose', () => {
  it('berdiri: hipY 0.56, ty 0.79, hy 1.12, wajah +Z, tanpa offset z', () => {
    const p = pose(true);
    expect(p).toEqual({ hipY: 0.56, tz: 0, fz: 1, ty: 0.79, hy: 1.12 });
  });
  it('duduk: semua level lebih rendah, wajah -Z, sedikit offset z', () => {
    const p = pose(false);
    expect(p.hipY).toBe(0.5); expect(p.ty).toBe(0.74); expect(p.hy).toBe(1.1);
    expect(p.fz).toBe(-1); expect(p.tz).toBe(0.02);
  });
  it('urutan vertikal konsisten di kedua pose: hip < torso < kepala', () => {
    for (const standing of [true, false]) {
      const p = pose(standing);
      expect(p.hipY).toBeLessThan(p.ty);
      expect(p.ty).toBeLessThan(p.hy);
    }
  });
});

describe('wajah', () => {
  const p = pose(true);
  it('2 mata LED simetris, di atas pusat kepala & di depan layar wajah', () => {
    const e = eyes(p);
    expect(e).toHaveLength(2);
    expect(e[0].x).toBeCloseTo(-e[1].x);
    expect(e[0].y).toBeGreaterThan(p.hy);
    expect(Math.abs(e[0].z - (p.tz + p.fz * 0.143))).toBeLessThan(1e-9);
  });
  it('senyum: 3 segmen (garis tengah lebih lebar, dua ujung simetris & lebih tinggi dari garis)', () => {
    const s = smile(p);
    expect(s).toHaveLength(3);
    expect(s[0].w).toBeGreaterThan(s[1].w);
    expect(s[1].x).toBeCloseTo(-s[2].x);
    expect(s[1].y).toBe(s[2].y);
    expect(s[1].y).toBeGreaterThan(s[0].y); // ujung senyum naik
  });
  it('duduk: z wajah membalik tanda (fz = -1)', () => {
    const s = pose(false);
    expect(eyes(s)[0].z).toBeLessThan(0);
    expect(smile(s)[0].z).toBeLessThan(0);
  });
});

describe('panel dada & kaki', () => {
  it('3 bar dada dengan tinggi bervariasi & jarak seragam 0.055', () => {
    const b = chestBars(pose(true));
    expect(b.map((x) => x.h)).toEqual([0.04, 0.08, 0.06]);
    expect(b[1].x - b[0].x).toBeCloseTo(0.055);
    expect(b[2].x - b[1].x).toBeCloseTo(0.055);
    // bar lebih tinggi → pusatnya lebih tinggi
    expect(b[1].y).toBeGreaterThan(b[0].y);
  });
  it('kaki berdiri: 2 kaki simetris dengan fase animasi berlawanan (0 dan π)', () => {
    const l = legsStanding();
    expect(l).toHaveLength(2);
    expect(l[0].phase).toBe(Math.PI);
    expect(l[1].phase).toBe(0);
    expect(l[0].x).toBeCloseTo(-l[1].x);
  });
});

describe('aksen', () => {
  it('lampu status putih di dada kanan-atas; antena di atas kepala dengan ujung lebih tinggi', () => {
    const p = pose(true), a = accents(p);
    expect(a.status.color).toBe(0xffffff);
    expect(a.status.x).toBeGreaterThan(0);
    expect(a.status.y).toBeGreaterThan(p.ty);
    expect(a.antenna.tipY).toBeGreaterThan(a.antenna.y);
    expect(a.antenna.tipY).toBeGreaterThan(p.hy);
  });
  it('palet warna logam lengkap & layar wajah lebih gelap dari pelat dada', () => {
    expect(Object.values(ROBOT_COLORS)).toEqual([0xdfe6ec, 0x2a3340, 0x9aa7b4, 0x07141a, 0x050d12]);
  });
});
