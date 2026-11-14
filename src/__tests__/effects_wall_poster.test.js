// Siklus 524: 8 poster dinding (furniture.js) berganti teks — wallPosterIdx +
// wallPosterTextFor di parts/effects.js; redraw on-change di OfficeScene.
// Warna aksen tetap per poster (dari poster_spec POSTERS), hanya teks berputar.
import { describe, it, expect } from 'vitest';
import {
  WALL_POSTER_SEC, WALL_SLOGANS, WALL_SLOGANS_COUNT,
  wallPosterIdx, wallPosterTextFor,
} from '../scene/parts/effects.js';
import { POSTERS } from '../scene/parts/poster_spec.js';
import { drawPoster } from '../scene/parts/poster_canvas.js';

describe('siklus 524 — wallPosterIdx', () => {
  it('guard non-finite → indeks 0', () => {
    expect(wallPosterIdx(NaN)).toBe(0);
    expect(wallPosterIdx(Infinity)).toBe(0);
    expect(wallPosterIdx('x')).toBe(0);
    expect(wallPosterIdx(undefined)).toBe(0);
  });

  it('rentang 0…COUNT-1 & deterministik per slot', () => {
    for (let t = 0; t < 500; t += 0.41) {
      const v = wallPosterIdx(t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(WALL_SLOGANS_COUNT);
    }
    expect(wallPosterIdx(0)).toBe(wallPosterIdx(0.1));
    expect(wallPosterIdx(WALL_POSTER_SEC)).toBe(wallPosterIdx(WALL_POSTER_SEC + 0.5));
    expect(wallPosterIdx(0)).not.toBe(wallPosterIdx(WALL_POSTER_SEC));
  });

  it('aman utk elapsed negatif (0…COUNT-1)', () => {
    for (const t of [-0.01, -WALL_POSTER_SEC, -321.7]) {
      const v = wallPosterIdx(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(WALL_SLOGANS_COUNT);
    }
  });

  it('rotasi merata: semua indeks muncul sepanjang waktu', () => {
    const seen = new Set();
    for (let k = 0; k < WALL_SLOGANS_COUNT * 3; k++) seen.add(wallPosterIdx(k * WALL_POSTER_SEC + 0.01));
    expect(seen.size).toBe(WALL_SLOGANS_COUNT);
  });

  it('periode 7 dtk — tak sinkron dgn slot lain (6/5.6/4.4/3.2)', () => {
    expect(WALL_POSTER_SEC).toBe(7.0);
  });
});

describe('siklus 524 — wallPosterTextFor (fase awal & kontrak)', () => {
  it('kolam slogan = teks awal POSTERS (identitas awal dipertahankan saat idx 0)', () => {
    expect(WALL_SLOGANS_COUNT).toBe(POSTERS.length);
    POSTERS.forEach((p, i) => expect(wallPosterTextFor(i, 0)).toBe(p.t));
  });

  it('offset fase: poster i ≠ j tak pernah menampilkan teks sama bersamaan', () => {
    for (let k = 0; k < WALL_SLOGANS_COUNT * 2; k++) {
      const texts = POSTERS.map((_, i) => wallPosterTextFor(i, k));
      expect(new Set(texts).size).toBe(WALL_SLOGANS_COUNT);
    }
  });

  it('guard: i/idx tak valid → teks basis (tak melempar)', () => {
    expect(() => wallPosterTextFor(9, 0)).not.toThrow();
    expect(() => wallPosterTextFor(-1, 0)).not.toThrow();
    expect(() => wallPosterTextFor(0, 99)).not.toThrow();
    expect(wallPosterTextFor(9, 0)).toBe(WALL_SLOGANS[0]);
    expect(wallPosterTextFor(-1, 0)).toBe(WALL_SLOGANS[0]);
    expect(wallPosterTextFor(0, 99)).toBe(WALL_SLOGANS[0]);
  });
});

describe('siklus 524 — kontrak drawPoster (redraw identik initial paint)', () => {
  const record = () => {
    const ops = [];
    const ctx = new Proxy({}, {
      get(_t, k) {
        if (k === 'fillText') return (...a) => ops.push(['fillText', ...a]);
        if (k === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set(_t, k, v) { ops.push(['set', k, v]); return true; },
    });
    return { ctx, ops };
  };

  it('drawPoster(ctx, col, teksBaru) menggambar teks baru dgn warna aksen asli', () => {
    const { ctx, ops } = record();
    drawPoster(ctx, '#0deef3', 'FOKUS');
    const texts = ops.filter(o => o[0] === 'fillText').map(o => o[1]);
    expect(texts).toEqual(['FOKUS']);
    const fills = ops.filter(o => o[0] === 'set' && o[1] === 'fillStyle').map(o => o[2]);
    expect(fills).toContain('#0deef3');
  });

  it('teks multi-kata dipisah spasi per baris (paritas split kanvas 120×160)', () => {
    const { ctx, ops } = record();
    drawPoster(ctx, '#f5a623', 'ANTAR TEPAT WAKTU');
    const texts = ops.filter(o => o[0] === 'fillText').map(o => o[1]);
    expect(texts).toEqual(['ANTAR', 'TEPAT', 'WAKTU']);
  });
});
