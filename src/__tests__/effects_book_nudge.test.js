// Siklus 510 — bookNudge: rak buku "hidup", buku sesekali meluncur keluar & kembali.
import { describe, it, expect } from 'vitest';
import { bookNudge, BOOK_CYCLE_SEC, BOOK_STAGGER_SEC } from '../scene/parts/effects.js';

describe('siklus 510 — bookNudge (rak buku hidup)', () => {
  it('guard: elapsed/index non-finite → 0 (bukan NaN)', () => {
    [NaN, undefined, 'x', null].forEach((bad) => {
      expect(Number.isFinite(bookNudge(bad, 0))).toBe(true);
      expect(Number.isFinite(bookNudge(1.0, bad))).toBe(true);
      expect(bookNudge(bad, 0)).toBe(0);
    });
  });

  it('rentang: 0…0.09 — keluar maks ~0.09 unit, tidak pernah negatif', () => {
    let mn = 1, mx = 0;
    for (let t = 0; t < BOOK_CYCLE_SEC * 3; t += 0.1) {
      for (let i = 0; i < 16; i++) {
        const v = bookNudge(t, i);
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
    }
    expect(mn).toBeGreaterThanOrEqual(0);
    expect(mx).toBeGreaterThan(0.05); // gerakan benar-benar terjadi
    expect(mx).toBeLessThanOrEqual(0.0901);
  });

  it('jarang aktif: <35% dari 48 buku pernah bergerak dalam satu slot global', () => {
    let cnt = 0;
    for (let i = 0; i < 48; i++) {
      for (let t = 0; t < BOOK_CYCLE_SEC; t += 0.25) {
        if (bookNudge(t, i) > 0.01) { cnt++; break; }
      }
    }
    expect(cnt).toBeGreaterThan(0);   // ada yang hidup
    expect(cnt / 48).toBeLessThan(0.35); // tapi jarang — bukan rave
  });

  it('deterministik: hasil sama utk input sama; tak sinkron antar buku', () => {
    expect(bookNudge(3.3, 7)).toEqual(bookNudge(3.3, 7));
    let diff = false;
    for (let t = 0; t < BOOK_CYCLE_SEC; t += 0.5) {
      if (Math.abs(bookNudge(t, 0) - bookNudge(t, 1)) > 0.001) { diff = true; break; }
    }
    expect(diff).toBe(true); // fase hash ≠ sinkron
  });

  it('tak sinkron vs 14 siklus napas lain (3.35 dtk poster dsb.)', () => {
    // cek bookNudge tak punya komponen periodik 3.35 dtk: nilai pada t dan t+3.35
    // (jika sinkron dgn poster, polanya identik utk buku aktif)
    const active = [];
    for (let i = 0; i < 48; i++) {
      for (let t = 0; t < BOOK_CYCLE_SEC; t += 0.25) if (bookNudge(t, i) > 0.01) { active.push(i); break; }
    }
    expect(active.length).toBeGreaterThan(0);
    const i = active[0];
    let sync = true;
    for (let t = 0; t < BOOK_CYCLE_SEC - 3.35; t += 0.5) {
      if (Math.abs(bookNudge(t, i) - bookNudge(t + 3.35, i)) > 0.005) { sync = false; break; }
    }
    expect(sync).toBe(false);
  });

  it('kontrak integrasi: userData.__book basis X + nudge (stub mesh)', () => {
    const mesh = { userData: { __book: -16.38 }, position: { x: -16.38 } };
    const t = 5.2;
    let v = 0;
    for (let k = 0; k < 48; k++) { const x = bookNudge(t, k); if (x > 0) { v = x; break; } }
    mesh.position.x = mesh.userData.__book + v;
    expect(mesh.position.x).toBeGreaterThanOrEqual(mesh.userData.__book);
    expect(mesh.position.x).toBeLessThanOrEqual(mesh.userData.__book + 0.09);
  });
});
