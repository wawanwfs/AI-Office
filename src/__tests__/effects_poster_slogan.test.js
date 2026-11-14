// Siklus 522: poster lounge dinding belakang berganti slogan (posterSloganIdx
// + posterSloganFor di parts/effects.js; redraw on-change di OfficeScene).
import { describe, it, expect } from 'vitest';
import {
  POSTER_SLOGAN_SEC, POSTER_SLOGANS, POSTER_SLOGANS_COUNT,
  posterSloganIdx, posterSloganFor,
} from '../scene/parts/effects.js';
import { drawPoster } from '../scene/parts/poster_canvas.js';

describe('siklus 522 — posterSloganIdx', () => {
  it('guard non-finite → indeks 0', () => {
    expect(posterSloganIdx(NaN)).toBe(0);
    expect(posterSloganIdx(Infinity)).toBe(0);
    expect(posterSloganIdx('x')).toBe(0);
    expect(posterSloganIdx(undefined)).toBe(0);
  });

  it('rentang 0…COUNT-1 & deterministik per slot', () => {
    for (let t = 0; t < 400; t += 0.37) {
      const v = posterSloganIdx(t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(POSTER_SLOGANS_COUNT);
    }
    expect(posterSloganIdx(0)).toBe(posterSloganIdx(0.1));
    expect(posterSloganIdx(POSTER_SLOGAN_SEC)).toBe(posterSloganIdx(POSTER_SLOGAN_SEC + 0.5));
    expect(posterSloganIdx(0)).not.toBe(posterSloganIdx(POSTER_SLOGAN_SEC));
  });

  it('aman utk elapsed negatif (0…COUNT-1)', () => {
    for (const t of [-0.01, -POSTER_SLOGAN_SEC, -123.4]) {
      const v = posterSloganIdx(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(POSTER_SLOGANS_COUNT);
    }
  });

  it('rotasi merata: semua slogan muncul sepanjang waktu', () => {
    const seen = new Set();
    for (let k = 0; k < POSTER_SLOGANS_COUNT * 3; k++) seen.add(posterSloganIdx(k * POSTER_SLOGAN_SEC + 0.01));
    expect(seen.size).toBe(POSTER_SLOGANS_COUNT);
  });
});

describe('siklus 522 — posterSloganFor (fase awal & kontrak)', () => {
  it('poster 0 & 1 mulai dari draft asli (SHIP IT / CODE\\nCOFFEE)', () => {
    expect(posterSloganFor(0, 0)).toEqual(['SHIP IT', '#F59E0B']);
    expect(posterSloganFor(1, 0)).toEqual(['CODE\nCOFFEE', '#F472B6']);
  });

  it('offset fase: poster 0 & 1 tak pernah menampilkan draft sama bersamaan', () => {
    for (let k = 0; k < POSTER_SLOGANS_COUNT * 2; k++) {
      const a = posterSloganFor(0, k), b = posterSloganFor(1, k);
      expect(a[0]).not.toBe(b[0]);
    }
  });

  it('guard: i/idx tak valid → draft basis (tak melempar)', () => {
    expect(() => posterSloganFor(9, 0)).not.toThrow();
    expect(() => posterSloganFor(-1, 0)).not.toThrow();
    expect(() => posterSloganFor(0, 99)).not.toThrow();
    expect(posterSloganFor(9, 0)).toEqual(['SHIP IT', '#F59E0B']);
    expect(posterSloganFor(0, 99)).toEqual(['SHIP IT', '#F59E0B']);
  });

  it('setiap draft punya teks + warna hex dan berbeda antar draft', () => {
    expect(POSTER_SLOGANS.length).toBe(4);
    const texts = new Set();
    for (const [t, c] of POSTER_SLOGANS) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      texts.add(t);
    }
    expect(texts.size).toBe(POSTER_SLOGANS.length);
  });
});

describe('siklus 522 — kontrak drawPoster (redraw identik initial paint)', () => {
  const paint = (col, txt) => {
    const cv = { ops: [] };
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '',
      fillRect(...a) { cv.ops.push(['fillRect', this.fillStyle, ...a]); },
      strokeRect(...a) { cv.ops.push(['strokeRect', this.strokeStyle, ...a]); },
      fillText(t, x, y) { cv.ops.push(['fillText', t, x, y, this.fillStyle, this.font]); },
    };
    drawPoster(ctx, col, txt); // kontrak painter: (ctx, color, text)
    return cv.ops;
  };

  it('redraw dgn draft sama menghasilkan urutan perintah identik (initial paint)', () => {
    const a = paint('#F59E0B', 'SHIP IT');
    const b = paint('#F59E0B', 'SHIP IT');
    expect(b).toEqual(a);
  });

  it('redraw dgn draft beda mengubah teks & warna garis', () => {
    const a = paint('#F59E0B', 'SHIP IT');
    const b = paint('#34D399', 'SHIP VALUE');
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
    expect(b.some((o) => o[0] === 'fillText' && o[1] === 'SHIP')).toBe(true);
    expect(b.some((o) => o[0] === 'strokeRect' && o[1] === '#34D399')).toBe(true);
  });

  // drawPoster memecah per SPASI (bukan '\n') — kontrak nyata painter.
  it('teks digambar terpecah per spasi (kontrak split spasi)', () => {
    const ops = paint('#F472B6', 'CODE COFFEE');
    const texts = ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
    expect(texts).toEqual(['CODE', 'COFFEE']);
  });
});
