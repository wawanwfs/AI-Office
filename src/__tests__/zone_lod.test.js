// Unit test LOD label zona (parts/zone_lod.js) — siklus 246.
// Latar: A/B kamera rendah siklus 245 (temuan B3) membuktikan billboard label
// zona (skala dunia tetap) membengkak saat kamera rendah/dekat dan menutupi
// objek yang dilihat (rak server). zoneLodFactor = min(1, dist/30) clamp 0.45.
import { describe, it, expect } from 'vitest';
import { zoneLodFactor, applyZoneLod, ZLOD_FULL_DIST, ZLOD_MIN } from '../scene/parts/zone_lod.js';

describe('zoneLodFactor', () => {
  it('kontrak utama: dist ≥ 30 → 1 (kamera rumah utuh, kontrak visual lama)', () => {
    expect(ZLOD_FULL_DIST).toBe(30);
    expect(zoneLodFactor(30)).toBe(1);
    expect(zoneLodFactor(42.5)).toBe(1); // radius rumah default desktop
    expect(zoneLodFactor(48)).toBe(1);
    expect(zoneLodFactor(1000)).toBe(1);
  });
  it('dist < 30 → linear dist/30, clamp di 0.45 (kamera dekat menyusut proporsional)', () => {
    expect(zoneLodFactor(15)).toBeCloseTo(0.5, 10);
    expect(zoneLodFactor(13.5)).toBeCloseTo(0.45, 10); // A/B siklus 245: tepi clamp
    expect(zoneLodFactor(9)).toBe(0.45);              // radius 9 → clamp (bukan 0.3)
    expect(zoneLodFactor(29)).toBeCloseTo(29 / 30, 10);
  });
  it('clamp bawah 0.45 — label tetap terbaca, tidak hilang di kamera sangat dekat', () => {
    expect(ZLOD_MIN).toBe(0.45);
    expect(zoneLodFactor(2)).toBe(0.45);
    expect(zoneLodFactor(0.1)).toBe(0.45);
  });
  it('anti-poisoning: NaN/±Infinity → 1 (ukuran penuh = aman, tidak mengecil diam-diam)', () => {
    expect(zoneLodFactor(NaN)).toBe(1);
    expect(zoneLodFactor(Infinity)).toBe(1);
    expect(zoneLodFactor(-Infinity)).toBe(1);
  });
});

describe('applyZoneLod', () => {
  const sprite = (bx = 3.4, by = 0.64, withBase = true) => {
    const s = { scale: { x: bx, y: by, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, userData: {} };
    if (withBase) s.userData.baseScale = { x: bx, y: by };
    return s;
  };
  it('kamera jauh → scale PERSIS baseScale (tidak menyentuh)', () => {
    const s = sprite();
    const f = applyZoneLod(s, 42.5);
    expect(f).toBe(1);
    expect(s.scale.x).toBe(3.4);
    expect(s.scale.y).toBe(0.64);
  });
  it('kamera dekat (radius 9) → kena clamp 0.45 (SERVER ROOM menyusut ~55%, tak menutup rak)', () => {
    const s = sprite(4.25, 0.8); // label panjang (1.25×)
    applyZoneLod(s, 9);
    expect(s.scale.x).toBeCloseTo(4.25 * 0.45, 10);
    expect(s.scale.y).toBeCloseTo(0.8 * 0.45, 10);
  });
  it('dekat menengah (dist 15) → linear 0.5 (di atas clamp)', () => {
    const s = sprite();
    applyZoneLod(s, 15);
    expect(s.scale.x).toBeCloseTo(3.4 * 0.5, 10);
    expect(s.scale.y).toBeCloseTo(0.64 * 0.5, 10);
  });
  it('sangat dekat → clamp 0.45, tidak nol', () => {
    const s = sprite();
    applyZoneLod(s, 3);
    expect(s.scale.x).toBeCloseTo(3.4 * 0.45, 10);
    expect(s.scale.y).toBeCloseTo(0.64 * 0.45, 10);
  });
  it('baseScale absen (label versi lama) → no-op aman, scale tak diubah', () => {
    const s = sprite(3.4, 0.64, false);
    expect(applyZoneLod(s, 9)).toBe(1);
    expect(s.scale.x).toBe(3.4);
    expect(s.scale.y).toBe(0.64);
  });
  it('null/tanpa scale → no-op aman (return 1)', () => {
    expect(applyZoneLod(null, 9)).toBe(1);
    expect(applyZoneLod({}, 9)).toBe(1);
  });
  it('dist NaN → tak menyentuh scale (paritas anti-poisoning faktor)', () => {
    const s = sprite();
    applyZoneLod(s, NaN);
    expect(s.scale.x).toBe(3.4);
    expect(s.scale.y).toBe(0.64);
  });
  it('idempoten: apply berulang dgn dist sama tidak terakumulasi (base selalu sumber)', () => {
    const s = sprite();
    applyZoneLod(s, 12);
    const a = { x: s.scale.x, y: s.scale.y };
    applyZoneLod(s, 12);
    applyZoneLod(s, 12);
    expect(s.scale.x).toBe(a.x);
    expect(s.scale.y).toBe(a.y);
  });
  it('kembali jauh → pulih ke ukuran penuh (LOD dua arah)', () => {
    const s = sprite();
    applyZoneLod(s, 9);
    expect(s.scale.x).toBeCloseTo(3.4 * 0.45, 10);
    applyZoneLod(s, 42.5);
    expect(s.scale.x).toBe(3.4);
    expect(s.scale.y).toBe(0.64);
  });
});
