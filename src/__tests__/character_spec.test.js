import { describe, it, expect } from 'vitest';
import { LONG_HAIR_RE, isLongHair, STANDING, SITTING, accessoryAnchor, charMetrics } from '../scene/parts/character_spec.js';

describe('isLongHair', () => {
  it('nama historis rambut panjang: DEWI/MAYA/RINA/LINA/SARI', () => {
    for (const n of ['DEWI', 'Maya', 'rina', 'LINA', 'Sari']) expect(isLongHair(n)).toBe(true);
  });
  it('case-insensitive', () => expect(isLongHair('dEwI')).toBe(true));
  it('nama lain false: WAHYU FS, BANTUIN AI, Toni', () => {
    for (const n of ['WAHYU FS', 'BANTUIN AI', 'Toni', 'Rizky']) expect(isLongHair(n)).toBe(false);
  });
  it('null/undefined/angka aman → false', () => {
    expect(isLongHair(null)).toBe(false);
    expect(isLongHair(undefined)).toBe(false);
    expect(isLongHair(42)).toBe(false);
  });
  it('LONG_HAIR_RE adalah regex /i', () => {
    expect(LONG_HAIR_RE.test('dewi')).toBe(true);
    expect(LONG_HAIR_RE.flags.includes('i')).toBe(true);
  });
});

describe('STANDING (konstanta historis proporsi berdiri)', () => {
  it('kaki/hips/torso/leher/kepala sesuai nilai inline lama', () => {
    expect(STANDING.legY).toBe(0.26);
    expect(STANDING.legH).toBe(0.52);
    expect(STANDING.legDX).toBe(0.075);
    expect(STANDING.hipsY).toBe(0.56);
    expect(STANDING.torsoY).toBe(0.79);
    expect(STANDING.neckY).toBe(0.99);
    expect(STANDING.headY).toBe(1.14);
  });
  it('wajah: jaw/hidung/telinga/mata/mulut', () => {
    expect(STANDING.jawY).toBe(1.01);
    expect(STANDING.noseY).toBe(1.13);
    expect(STANDING.earY).toBe(1.13);
    expect(STANDING.eyeY).toBe(1.16);
    expect(STANDING.pupilY).toBe(1.155);
    expect(STANDING.browY).toBe(1.215);
    expect(STANDING.eyeDX).toBe(0.06);
    expect(STANDING.mouthY).toBe(1.06);
  });
  it('rambut & lengan', () => {
    expect(STANDING.hairTopY).toBe(1.265);
    expect(STANDING.hairBackY).toBe(1.16);
    expect(STANDING.fringeY).toBe(1.235);
    expect(STANDING.strandY).toBe(1.05);
    expect(STANDING.armY).toBe(0.8);
    expect(STANDING.forearmY).toBe(0.62);
    expect(STANDING.handY).toBe(0.51);
    expect(STANDING.armDX).toBe(0.215);
  });
  it('badge & lanyard posisi historis di dada', () => {
    expect(STANDING.badge).toEqual({ x: 0.11, y: 0.86, z: 0.095 });
    expect(STANDING.lanyard).toEqual({ x: 0.04, y: 0.84, z: 0.096 });
  });
  it('anchor aksesori (1.14, 1, 0.8)', () => {
    expect(STANDING.accHeadY).toBe(1.14);
    expect(STANDING.accFz).toBe(1);
    expect(STANDING.accTorsoY).toBe(0.8);
  });
  it('urutan vertikal wajar: kaki < hips < torso < leher < jaw < kepala < rambut', () => {
    expect(STANDING.legY).toBeLessThan(STANDING.hipsY);
    expect(STANDING.hipsY).toBeLessThan(STANDING.torsoY);
    expect(STANDING.torsoY).toBeLessThan(STANDING.neckY);
    expect(STANDING.jawY).toBeLessThan(STANDING.headY);
    expect(STANDING.headY).toBeLessThan(STANDING.hairTopY);
  });
});

describe('SITTING (konstanta historis proporsi duduk, menghadap -Z)', () => {
  it('kaki menghadap meja: paha z negatif, shin lebih jauh, sepatu terjauh', () => {
    expect(SITTING.thighY).toBe(0.44);
    expect(SITTING.thighZ).toBe(-0.08);
    expect(SITTING.shinZ).toBeLessThan(SITTING.thighZ);
    expect(SITTING.shoeZ).toBeLessThan(SITTING.shinZ);
  });
  it('torso/leher/kepala sesuai nilai inline lama', () => {
    expect(SITTING.hipsY).toBe(0.5);
    expect(SITTING.torsoY).toBe(0.74);
    expect(SITTING.neckY).toBe(0.955);
    expect(SITTING.headY).toBe(1.1);
    expect(SITTING.jawY).toBe(0.97);
  });
  it('wajah menghadap monitor (z negatif)', () => {
    expect(SITTING.noseZ).toBe(-0.105);
    expect(SITTING.eyeZ).toBe(-0.112);
    expect(SITTING.mouthZ).toBe(-0.118);
    expect(SITTING.eyeY).toBe(1.12);
    expect(SITTING.browY).toBe(1.175);
    expect(SITTING.mouthY).toBe(1.02);
  });
  it('rambut belakang di +Z (z positif)', () => {
    expect(SITTING.hairTopY).toBe(1.225);
    expect(SITTING.hairBackY).toBe(1.12);
    expect(SITTING.fringeY).toBe(1.19);
    expect(SITTING.strandY).toBe(0.98);
  });
  it('badge & lanyard posisi historis', () => {
    expect(SITTING.badge).toEqual({ x: 0.11, y: 0.8, z: 0.115 });
    expect(SITTING.lanyard).toEqual({ x: 0.04, y: 0.78, z: 0.116 });
  });
  it('anchor aksesori (1.1, -1, 0.74) — fz negatif saat duduk', () => {
    expect(SITTING.accHeadY).toBe(1.1);
    expect(SITTING.accFz).toBe(-1);
    expect(SITTING.accTorsoY).toBe(0.74);
  });
  it('duduk lebih rendah dari berdiri (kepala & torso)', () => {
    expect(SITTING.headY).toBeLessThan(STANDING.headY);
    expect(SITTING.torsoY).toBeLessThan(STANDING.torsoY);
  });
});

describe('accessoryAnchor & charMetrics', () => {
  it('standing → {headY:1.14, fz:1, torsoY:0.8}', () => {
    expect(accessoryAnchor(true)).toEqual({ headY: 1.14, fz: 1, torsoY: 0.8 });
  });
  it('sitting → {headY:1.1, fz:-1, torsoY:0.74}', () => {
    expect(accessoryAnchor(false)).toEqual({ headY: 1.1, fz: -1, torsoY: 0.74 });
  });
  it('anchor konsisten dengan konstanta pose masing-masing', () => {
    expect(accessoryAnchor(true)).toEqual({ headY: STANDING.accHeadY, fz: STANDING.accFz, torsoY: STANDING.accTorsoY });
    expect(accessoryAnchor(false)).toEqual({ headY: SITTING.accHeadY, fz: SITTING.accFz, torsoY: SITTING.accTorsoY });
  });
  it('charMetrics mengembalikan headY & torsoY per pose', () => {
    expect(charMetrics(true)).toEqual({ headY: 1.14, torsoY: 0.79 });
    expect(charMetrics(false)).toEqual({ headY: 1.1, torsoY: 0.74 });
  });
});
