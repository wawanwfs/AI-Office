// Siklus 526: plakat lantai (LEVEL 01–03) berganti misi — guard murni,
// rotasi eksak, fase awal = teks asli, keunikan antar plakat, kontrak painter.
import { describe, it, expect } from 'vitest';
import {
  FLOOR_MISSIONS, FLOOR_MISSIONS_COUNT, floorMissionTextFor,
  FLOOR_BADGE_SEC, floorBadgeIdx,
} from '../scene/parts/effects.js';
import { drawFloorBadge, FB_W, FB_H } from '../scene/parts/floor_badge_canvas.js';

describe('floorBadgeIdx — guard & rotasi', () => {
  it('guard netral: non-finite → 0, aman negatif', () => {
    expect(floorBadgeIdx(NaN)).toBe(0);
    expect(floorBadgeIdx(Infinity)).toBe(0);
    expect(floorBadgeIdx(-100)).toBe(0); // sebelum awal: teks basis
    expect(floorBadgeIdx(0)).toBe(0);
  });

  it('rentang 0…5 & deterministik', () => {
    for (let t = 0; t < 60; t += 0.5) {
      const v = floorBadgeIdx(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(FLOOR_MISSIONS_COUNT);
      expect(floorBadgeIdx(t)).toBe(v);
    }
  });

  it('periode 8.5 dtk: tepat setelah FLOOR_BADGE_SEC → indeks 1', () => {
    expect(floorBadgeIdx(FLOOR_BADGE_SEC - 0.01)).toBe(0);
    expect(floorBadgeIdx(FLOOR_BADGE_SEC)).toBe(1);
  });

  it('rotasi merata menjangkau semua draf', () => {
    const seen = new Set();
    for (let t = 0; t < FLOOR_BADGE_SEC * FLOOR_MISSIONS_COUNT; t += FLOOR_BADGE_SEC / 2) {
      seen.add(floorBadgeIdx(t));
    }
    expect(seen.size).toBe(FLOOR_MISSIONS_COUNT);
  });
});

describe('floorMissionTextFor — fase & keunikan', () => {
  it('fase awal (idx 0): teks asli tiap plakat', () => {
    expect(floorMissionTextFor(0, 0)).toBe('DATACENTER, AI LAB & TECH OPS');
    expect(floorMissionTextFor(1, 0)).toBe('CORE ENGINEERING & PRODUCT STUDIO');
    expect(floorMissionTextFor(2, 0)).toBe('EXECUTIVE PENTHOUSE & FOUNDER SUITE');
  });

  it('guard: i/idx tak valid → teks basis / draf 0', () => {
    expect(floorMissionTextFor(9, 0)).toBe(FLOOR_MISSIONS[0]);
    expect(floorMissionTextFor(-1, 0)).toBe(FLOOR_MISSIONS[0]);
    expect(floorMissionTextFor(0, 99)).toBe(FLOOR_MISSIONS[0]);
    expect(floorMissionTextFor(0, NaN)).toBe(FLOOR_MISSIONS[0]);
  });

  it('3 plakat tak pernah seragam bersamaan (offset fase per-indeks)', () => {
    for (let idx = 0; idx < FLOOR_MISSIONS_COUNT; idx++) {
      const t = [floorMissionTextFor(0, idx), floorMissionTextFor(1, idx), floorMissionTextFor(2, idx)];
      expect(new Set(t).size).toBe(3);
    }
  });

  it('kolam teks = teks awal 3 plakat + draf tambahan', () => {
    expect(FLOOR_MISSIONS_COUNT).toBe(6);
    expect(FLOOR_MISSIONS[3]).toBe('SHIP VALUE EVERY SPRINT');
  });
});

describe('drawFloorBadge — kontrak painter (urutan & parameter identik inline lama)', () => {
  const recorder = () => {
    const calls = [];
    const ctx = {
      set fillStyle(v) {}, get fillStyle() { return ''; },
      set font(v) {}, get font() { return ''; },
      set strokeStyle(v) {}, get strokeStyle() { return ''; },
      set lineWidth(v) {}, get lineWidth() { return 0; },
      fillRect() {}, fill() {}, stroke() {}, fillText(...a) { calls.push(['fillText', ...a]); },
      roundRect(...a) { calls.push(['roundRect', ...a]); },
      rect(...a) { calls.push(['rect', ...a]); },
    };
    return { ctx, calls };
  };

  it('struktur: bg + bingkai + 2 teks (level aksen, misi putih)', () => {
    const { ctx, calls } = recorder();
    drawFloorBadge(ctx, '#F59E0B', 'LEVEL 01', 'DATACENTER, AI LAB & TECH OPS');
    expect(calls.filter(c => c[0] === 'fillText')).toEqual([
      ['fillText', 'LEVEL 01', 28, 42],
      ['fillText', 'DATACENTER, AI LAB & TECH OPS', 28, 82],
    ]);
    const shape = calls.find(c => c[0] === 'roundRect');
    expect(shape).toEqual(['roundRect', 4, 4, FB_W - 8, FB_H - 8, 16]);
  });

  it('fallback tanpa roundRect: rect persegi dipakai', () => {
    const { ctx, calls } = recorder();
    ctx.roundRect = undefined;
    drawFloorBadge(ctx, '#22D3EE', 'LEVEL 02', 'x');
    expect(calls.some(c => c[0] === 'rect')).toBe(true);
    expect(calls.some(c => c[0] === 'roundRect')).toBe(false);
  });
});
