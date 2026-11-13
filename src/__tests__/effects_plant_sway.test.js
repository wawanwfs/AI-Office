// Unit test plantSway (effects.js, siklus 487): daun tanaman dekorasi bersway
// angin berbasis waktu nyata — dipanggil di dalam gate ambient (siklus 485).
// Murni: base posisi di-latch panggilan pertama, fase per (tanaman, daun).
import { describe, it, expect } from 'vitest';
import { plantSway } from '../scene/parts/effects.js';

const mkLeaf = (x, y, z) => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 },
});
const mkPlant = (n, ox = 0, oy = 0.85, oz = 0) => ({
  leaves: Array.from({ length: n }, (_, i) => mkLeaf(ox + i * 0.05, oy + i * 0.3, oz)),
});

describe('plantSway — daun tanaman bersway kontrak waktu-nyata (siklus 487)', () => {
  it('panggilan pertama: latch base (userData), posisi mulai osilasi; return jumlah daun', () => {
    const pl = mkPlant(3);
    const n = plantSway(0.0, [pl]);
    expect(n).toBe(3);
    pl.leaves.forEach((lf) => {
      expect(Number.isFinite(lf.userData.baseY)).toBe(true);
      expect(Number.isFinite(lf.userData.ph)).toBe(true);
    });
  });

  it('elapsed bertambah → posisi berubah; dua elapsed sama → posisi identik (deterministik)', () => {
    const a = mkPlant(2), b = mkPlant(2);
    plantSway(1.0, a.leaves ? [a] : []);
    plantSway(2.0, [a]);
    const xAt2 = a.leaves[0].position.x;
    plantSway(1.0, [b]);
    plantSway(2.0, [b]);
    expect(b.leaves[0].position.x).toBe(xAt2); // fase sama → hasil sama
  });

  it('amplitudo kecil (≤0.02 unit) — dekoratif, tidak merusak layout tanaman', () => {
    const pl = mkPlant(5);
    plantSway(0, [pl]);
    const baseX = pl.leaves[0].userData.baseX;
    for (let t = 0; t <= 20; t += 0.1) {
      plantSway(t, [pl]);
      expect(Math.abs(pl.leaves[0].position.x - baseX)).toBeLessThanOrEqual(0.021);
    }
  });

  it('base tetap: osilasi berpusat di posisi awal daun (rata-rata dekat base)', () => {
    const pl = mkPlant(4);
    plantSway(0.5, [pl]);
    let sum = 0, cnt = 0;
    for (let t = 0.5; t < 20; t += 0.05) { plantSway(t, [pl]); sum += pl.leaves[1].position.x; cnt++; }
    const base = pl.leaves[1].userData.baseX;
    expect(Math.abs(sum / cnt - base)).toBeLessThan(0.01);
  });

  it('guard: elapsed non-finite / plants bukan array / leaf tanpa position → 0, tidak throw', () => {
    expect(plantSway(NaN, [mkPlant(1)])).toBe(0);
    expect(plantSway(1, null)).toBe(0);
    expect(plantSway(1, 'x')).toBe(0);
    expect(plantSway(1, [null, {}, { leaves: [null, {}] }])).toBe(0);
  });
});
