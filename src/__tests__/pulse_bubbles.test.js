import { describe, it, expect } from 'vitest';
import { pulseFx, BUBBLE_EVERY, shouldUpdateBubbles } from '../scene/parts/effects.js';
import { updateBubbles } from '../scene/parts/bubbles.js';

describe('pulseFx', () => {
  it('fase & rumus identik dengan implementasi lama (kompatibilitas visual)', () => {
    for (const t of [0, 1.37, 5.5, 100]) {
      const phase = (t * .5) % 1;
      expect(pulseFx(t).phase).toBeCloseTo(phase);
      expect(pulseFx(t).scale).toBeCloseTo(1 + phase * .3);
      expect(pulseFx(t).opacity).toBeCloseTo(.15 * (1 - phase));
    }
  });
  it('fase di [0,1) dan periodisitas 2 dtk (elapsed*0.5 mod 1)', () => {
    for (const t of [0, .3, 2, 2.4, 20, 999]) {
      expect(pulseFx(t).phase).toBeGreaterThanOrEqual(0);
      expect(pulseFx(t).phase).toBeLessThan(1);
    }
    expect(pulseFx(3.7).phase).toBeCloseTo(pulseFx(3.7 + 2).phase);
  });
  it('guard non-numerik → elapsed 0 (tak NaN ke scale/opacity)', () => {
    expect(pulseFx(NaN).phase).toBe(0);
    expect(pulseFx(undefined).scale).toBe(1);
    expect(pulseFx(null).opacity).toBeCloseTo(.15);
  });
});

describe('shouldUpdateBubbles', () => {
  it('throttle 60fps → ~20×/dtk (setiap kelipatan 3 frame)', () => {
    let hits = 0;
    for (let f = 1; f <= 60; f++) if (shouldUpdateBubbles(f)) hits++;
    expect(BUBBLE_EVERY).toBe(3);
    expect(hits).toBe(20);
    expect(shouldUpdateBubbles(3)).toBe(true);
    expect(shouldUpdateBubbles(4)).toBe(false);
  });
  it('every kustom dihormati; guard non-numerik/every ≤ 0 → false', () => {
    expect(shouldUpdateBubbles(8, 8)).toBe(true);
    expect(shouldUpdateBubbles(9, 8)).toBe(false);
    expect(shouldUpdateBubbles(NaN)).toBe(false);
    expect(shouldUpdateBubbles(3, 0)).toBe(false);
    expect(shouldUpdateBubbles(3, -1)).toBe(false);
  });
});

describe('updateBubbles (throttle via akumulasi dt)', () => {
  const mk = () => ({
    sprite: { position: { x: 0, y: 0, z: 0 }, material: { opacity: 0 } },
    life: 3.5, startY: 1, anchor: null,
  });
  const ctx = () => {
    const removed = [];
    return { removed, remove: (b) => removed.push(b) };
  };

  it('dt kecil dikurangkan langsung (throttle ada di pemanggil, bukan di sini)', () => {
    const bs = [mk()]; const c = ctx();
    updateBubbles(bs, 0.01, c);
    expect(bs[0].life).toBeCloseTo(3.5 - 0.01);
  });
  it('akumulasi tercapai → life berkurang sebesar total dt terakumulasi', () => {
    const bs = [mk()]; const c = ctx();
    updateBubbles(bs, 0.01, c);
    updateBubbles(bs, 0.02, c);
    updateBubbles(bs, 0.02, c); // total 0.05 (3 frame @60fps) → tick di frame ini
    expect(bs[0].life).toBeCloseTo(3.5 - 0.05);
  });
  it('laju per detik ekuivalen update per-frame (step akumulasi vs 60×1/60)', () => {
    const a = [mk()], b = [mk()];
    const ca = ctx(), cb = ctx();
    // jalur throttled: 90 frame × 1/60 dtk
    for (let f = 1; f <= 90; f++) updateBubbles(a, 1 / 60, ca);
    // jalur langsung: 90 kali update per-frame
    for (let f = 0; f < 90; f++) updateBubbles(b, 0, cb), b[0].life -= 1 / 60;
    expect(a[0].life).toBeCloseTo(b[0].life, 5);
  });
  it('bubble habis (life ≤ 0) dihapus oleh updateBubbles', () => {
    const bs = [mk()];
    bs[0].life = 0.01;
    const c = ctx();
    updateBubbles(bs, 0.02, c);
    expect(bs.length).toBe(0);
    expect(c.removed.length).toBe(1);
  });
  it('posisi mengikuti anchor & opacity fade sesuai rumus lama saat tick', () => {
    const bs = [mk()];
    bs[0].anchor = { x: 5, z: 7, y: 2.6 };
    updateBubbles(bs, 0.1, {});
    const b = bs[0];
    expect(b.sprite.position.x).toBe(5);
    expect(b.sprite.position.z).toBe(7);
    expect(b.sprite.position.y).toBeCloseTo(2.6 + 1.35 + (3 - b.life) * .10);
  });
});
