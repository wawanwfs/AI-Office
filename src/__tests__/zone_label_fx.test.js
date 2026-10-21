import { describe, it, expect } from 'vitest';
import { zoneHash, zoneJitter, zoneScreenFade } from '../scene/parts/label_overlap.js';

describe('zoneHash', () => {
  it('deterministik: label sama → hash sama', () => {
    expect(zoneHash('Pantry')).toBe(zoneHash('Pantry'));
  });
  it('label beda → hash beda (kasus umum)', () => {
    const a = zoneHash('Pantry'), b = zoneHash('Meeting');
    expect(a).not.toBe(b);
  });
  it('label null/undefined → 0 (loop tak jalan)', () => {
    expect(zoneHash(null)).toBe(0);
    expect(zoneHash(undefined)).toBe(0);
    expect(zoneHash('')).toBe(0);
  });
  it('ordinal: h = h*31 + charCode, signed 32-bit', () => {
    // "a" → 97; "ab" → 97*31+98 = 3105
    expect(zoneHash('a')).toBe(97);
    expect(zoneHash('ab')).toBe(3105);
  });
});

describe('zoneJitter', () => {
  it('jy = (h%7)-3 ∈ [-3,3], jx = ((h>>3)%9)-4 ∈ [-4,4]', () => {
    for (const lbl of ['Pantry', 'Meeting', 'Server', 'Resepsionis', 'Kafe', 'Lounge']) {
      const { jy, jx } = zoneJitter(lbl);
      // % JS bisa negatif (hash negatif): jy ∈ [-9,3], jx ∈ [-12,4] — sama seperti rumus lama
      expect(jy).toBeGreaterThanOrEqual(-9);
      expect(jy).toBeLessThanOrEqual(3);
      expect(jx).toBeGreaterThanOrEqual(-12);
      expect(jx).toBeLessThanOrEqual(4);
    }
  });
  it('ekuivalen rumus lama persis', () => {
    for (const lbl of ['Pantry', 'Meeting', 'Server Room', 'Toilet']) {
      let hsh = 0;
      for (const ch of lbl) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
      const exp = { jy: (hsh % 7) - 3, jx: ((hsh >> 3) % 9) - 4 };
      expect(zoneJitter(lbl)).toEqual(exp);
    }
  });
  it('deterministik & fallback label kosong', () => {
    expect(zoneJitter('X')).toEqual(zoneJitter('X'));
    expect(zoneJitter(null)).toEqual({ jy: -3, jx: -4 }); // h=0
  });
});

describe('zoneScreenFade', () => {
  it('pw ≤ 340 → opacity 1, visible true', () => {
    expect(zoneScreenFade(0)).toEqual({ opacity: 1, visible: true });
    expect(zoneScreenFade(340)).toEqual({ opacity: 1, visible: true });
  });
  it('pw > 340: linear fade, clamp 0, visible false saat ≤0.03', () => {
    expect(zoneScreenFade(470).opacity).toBeCloseTo(0.5); // 1 - 130/260
    expect(zoneScreenFade(600).opacity).toBe(0);           // clamp
    expect(zoneScreenFade(600).visible).toBe(false);
    // ambang: visible ⇔ f > 0.03 (f=0.03 persis secara float bisa 0.03+ε → visible;
    // bandingkan konsisten dgn f yang dihitung dari pw yang sama)
    const pw = 347.8;
    const r = zoneScreenFade(pw);
    const f = 1 - (pw - 340) / 260;
    expect(r.opacity).toBe(f);
    expect(r.visible).toBe(f > 0.03);
  });
  it('ekuivalen rumus lama: pw=470 → f=0.5, pw=340 → opaque', () => {
    const pw = 470;
    const oldF = Math.max(0, 1 - (pw - 340) / 260);
    expect(zoneScreenFade(pw).opacity).toBe(oldF);
    expect(zoneScreenFade(pw).visible).toBe(oldF > 0.03);
  });
  it('non-numerik pw → dianggap ≤ 340 (NaN comparison false → opaque)', () => {
    expect(zoneScreenFade(NaN).opacity).toBe(1);
  });
});
