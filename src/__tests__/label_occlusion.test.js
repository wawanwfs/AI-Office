// label_occlusion.test.js — guard oklusi antar-sprite nameplate (backlog visual 238c).
// Masalah yang ditutup: label agen X-ray (depthTest false, renderOrder 35) membuat
// nameplate baris belakang tergambar PENUH di atas nameplate baris depan di kluster
// tengah — teks-atas-teks "bertumpuk kertas". occlusionPass memudarkan label yang
// menumpuk di layar dgn label LEBIH DEKAT ke kamera (fade berbasis selisih kedalaman).
import { describe, it, expect } from 'vitest';
import { occlusionFade, occlusionPass, OCCL_START, OCCL_END, OCCL_MIN_OPACITY, OCCL_PX } from '../scene/parts/label_occlusion.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// pt label agent ala buildAgentPts + dist kamera. Koordinat piksel layar pusat.
const lbl = (name, x, y, sw, sh, dist, extra = {}) => ({
  a: { name }, zone: false, x, y, offX: 0, offY: 0, sw, sh, dist, ...extra,
});

describe('occlusionFade — kurva fade kedalaman', () => {
  it('konstanta kontrak: START 2.5, END 6.0, MIN 0.18, PAD 26', () => {
    expect(OCCL_START).toBe(2.5);
    expect(OCCL_END).toBe(6.0);
    expect(OCCL_MIN_OPACITY).toBeGreaterThan(0);
    expect(OCCL_MIN_OPACITY).toBeLessThan(0.5);
    expect(OCCL_PX).toBeGreaterThan(0);
  });
  it('selisih ≤ START → 1 (tak tertutup berarti)', () => {
    expect(occlusionFade(5, 5)).toBe(1);
    expect(occlusionFade(5, 5 + OCCL_START - 0.01)).toBe(1);
  });
  it('selisih ≥ END → OCCL_MIN_OPACITY (samar tapi terbaca, TIDAK 0)', () => {
    expect(occlusionFade(5 + OCCL_END, 5)).toBe(OCCL_MIN_OPACITY);
    expect(occlusionFade(5 + OCCL_END + 10, 5)).toBe(OCCL_MIN_OPACITY);
  });
  it('di antara START..END → linear 1→MIN', () => {
    const mid = OCCL_START + (OCCL_END - OCCL_START) / 2;
    const f = occlusionFade(5 + mid, 5); // label 5+mid, penutup 5 (lebih dekat)
    expect(f).toBeGreaterThan(OCCL_MIN_OPACITY);
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(1 - 0.5 * (1 - OCCL_MIN_OPACITY), 10);
  });
  it('anti-poisoning: dist non-finite → 1', () => {
    expect(occlusionFade(NaN, 3)).toBe(1);
    expect(occlusionFade(5, Infinity)).toBe(1);
    expect(occlusionFade(undefined, 3)).toBe(1);
  });
});

describe('occlusionPass — aturan siapa menutup siapa', () => {
  it('label lebih jauh yang menumpuk di layar dgn label lebih dekat → faded', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10); // 4 unit lebih dekat, box sama
    const n = occlusionPass([far, near]);
    expect(far.occ).toBeLessThan(1);
    expect(near.occ).toBe(1); // penutup tak pernah pudar
    expect(n).toBe(1);
  });
  it('TIDAK fade bila tidak menumpuk di layar (jarak bebas > PAD)', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 200, 60, 30, 10); // jauh di layar
    expect(occlusionPass([far, near])).toBe(0);
    expect(far.occ).toBe(1);
  });
  it('TIDAK fade bila selisih kedalaman kecil meski menumpuk (baris sejajar normal)', () => {
    const a = lbl('A', 0, 0, 60, 30, 11);
    const b = lbl('B', 0, 0, 60, 30, 10); // 1 unit — di bawah OCCL_START
    expect(occlusionPass([a, b])).toBe(0);
    expect(a.occ).toBe(1); expect(b.occ).toBe(1);
  });
  it('penutup wajib LEBIH dekat: label terdekat yang menumpuk TIDAK terpengaruh label belakang', () => {
    const back = lbl('BACK', 0, 0, 60, 30, 20);
    const front = lbl('FRONT', 0, 0, 60, 30, 12);
    occlusionPass([front, back]);
    expect(front.occ).toBe(1); expect(back.occ).toBeLessThan(1);
  });
  it('multi-penutup: fade terkuat (TERDEKAT) yang menang', () => {
    const l = lbl('L', 0, 0, 60, 30, 20);
    const near1 = lbl('N1', 0, 0, 60, 30, 13); // selisih 7 ≥ END → MIN
    const near2 = lbl('N2', 0, 0, 60, 30, 16); // selisih 4 → fade parsial
    occlusionPass([l, near1, near2]);
    expect(l.occ).toBe(OCCL_MIN_OPACITY); // min antar pasangan
  });
  it('posisi FINAL (offX/offY) yang dipakai — bukan posisi dasar', () => {
    const far = lbl('BEHIND', 0, 0, 60, 30, 14);
    const near = lbl('FRONT', 0, 0, 60, 30, 10);
    // dasar jauh (600px) tapi FINAL geser ke box penutup
    far.y = 600; far.offY = -600;
    expect(occlusionPass([far, near])).toBe(1);
    expect(far.occ).toBeLessThan(1);
  });
  it('zona & bubble (tanpa `a`/dengan zone) dilewati — tanpa dist juga aman', () => {
    const zonePt = { a: null, zone: true, x: 0, y: 0, zw: 100, zh: 40, dist: 10 };
    const agent = lbl('A', 0, 0, 60, 30, 10);
    expect(occlusionPass([zonePt, agent])).toBe(0);
    const noDist = lbl('B', 0, 0, 60, 30, undefined);
    expect(occlusionPass([noDist, agent])).toBe(0);
    expect(noDist.occ).toBe(1);
    expect(occlusionPass(null)).toBe(0);
  });
  it('field posisi TIDAK diubah (hanya occ ditulis)', () => {
    const far = lbl('BEHIND', 3, 4, 60, 30, 14);
    const near = lbl('FRONT', 3, 4, 60, 30, 10);
    occlusionPass([far, near]);
    expect(far.x).toBe(3); expect(far.y).toBe(4);
    expect(far.offX).toBe(0); expect(far.offY).toBe(0);
    expect(far.sw).toBe(60); expect(far.sh).toBe(30);
  });
});

describe('drift-gate sumber OfficeScene.js — oklusi terpasang di jalur relayout', () => {
  const src = readFileSync(join(here, '..', 'scene', 'OfficeScene.js'), 'utf8');
  it('occlusionPass diimpor & dipanggil setelah sweepClampRounds', () => {
    expect(src).toMatch(/import \{ occlusionPass, OCCL_MIN_OPACITY \} from '\.\/parts\/label_occlusion\.js'/);
    const iSweep = src.indexOf('sweepClampRounds(pts,');
    const iOcc = src.indexOf('occlusionPass(pts)');
    expect(iSweep).toBeGreaterThan(-1);
    expect(iOcc).toBeGreaterThan(iSweep); // pass oklusi SETELAH sweep/clamp (posisi final)
  });
  it('fade diterapkan ke material.opacity label dgn floor OCCL_MIN_OPACITY + dist kamera dibangun di pts', () => {
    expect(src).toMatch(/dist:camera\.position\.distanceTo\(a\.label\.position\)/);
    expect(src).toMatch(/p\.a\.label\.material\.opacity=OCCL_MIN_OPACITY\+prevO\*\(1-OCCL_MIN_OPACITY\)/);
    expect(src).toMatch(/window\.__occlFade/); // hook probe e2e
  });
});
