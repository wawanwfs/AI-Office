// Siklus 523: tagline logo dinding belakang berganti (wallTaglineIdx) —
// unit test murni + kontrak painter drawWallLogo(ctx, taglineIdx).
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { drawWallLogo, wallTaglineIdx, wallTaglines, WALL_TAGLINE_SEC } from '../scene/parts/logo_canvas.js';

function makeCtx() {
  const ops = [];
  const grads = [];
  const ctx = {
    _ops: ops, _grads: grads,
    createLinearGradient: (...a) => { const g = { addColorStop: () => {} }; grads.push(g); return g; },
    fillRect: (...a) => ops.push(['fillRect', a]),
    strokeRect: (...a) => ops.push(['strokeRect', a]),
    beginPath: () => ops.push(['beginPath']),
    closePath: () => ops.push(['closePath']),
    lineTo: (...a) => ops.push(['lineTo', a]),
    fill: () => ops.push(['fill']),
    fillText: (t, ...a) => ops.push(['fillText', t, a]),
    set fillStyle(v) { ops.push(['fillStyle', v]); },
    set strokeStyle(v) { ops.push(['strokeStyle', v]); },
    set lineWidth(v) { ops.push(['lineWidth', v]); },
    set font(v) { ops.push(['font', v]); },
    set textAlign(v) { ops.push(['textAlign', v]); },
    set textBaseline(v) { ops.push(['textBaseline', v]); },
  };
  return ctx;
}
const tagText = (c) => {
  const t = c._ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
  return t[t.length - 1]; // tagline = teks terakhir (y=570)
};

describe('wallTaglineIdx (murni)', () => {
  it('4 draf tagline, dtk-0 → draf 0 (posisi awal identik kode lama)', () => {
    expect(wallTaglines().length).toBe(4);
    expect(wallTaglineIdx(0)).toBe(0);
    expect(wallTaglineIdx(WALL_TAGLINE_SEC * 0.99)).toBe(0);
  });

  it('rotasi eksak per slot & periodik penuh', () => {
    for (let k = 0; k < 8; k++) expect(wallTaglineIdx(WALL_TAGLINE_SEC * k * (1 + 1e-9))).toBe(k % 4);
  });

  it('guard non-finite → 0 (netral), elapsed negatif tetap dalam rentang', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      expect(wallTaglineIdx(bad)).toBe(0);
    }
    for (const t of [-1, -WALL_TAGLINE_SEC, -WALL_TAGLINE_SEC * 7.5]) {
      const i = wallTaglineIdx(t);
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(4);
    }
  });

  it('rotasi merata: semua 4 draf pernah tampil', () => {
    const seen = new Set();
    for (let k = 0; k < 4; k++) seen.add(wallTaglineIdx(WALL_TAGLINE_SEC * k + 0.1));
    expect(seen.size).toBe(4);
  });
});

describe('drawWallLogo(ctx, taglineIdx) — kontrak painter', () => {
  it('default (tanpa arg) → tagline draf 0 = identik kode lama', () => {
    const c = makeCtx();
    drawWallLogo(c);
    expect(tagText(c)).toBe('SOFTWARE HOUSE  \u00b7  AI TEAM');
  });

  it('setiap indeks valid → tagline sesuai daftar, di posisi (620,570) & font/warna tetap', () => {
    const list = wallTaglines();
    for (let i = 0; i < list.length; i++) {
      const c = makeCtx();
      drawWallLogo(c, i);
      expect(tagText(c)).toBe(list[i]);
      const hit = c._ops.map((o, k) => [o, k]).filter(([o]) => o[0] === 'fillText' && o[1] === list[i])[0];
      expect(hit).toBeTruthy();
      const [op, idx] = hit;
      expect(op[2]).toEqual([620, 570]);
      const before = (key) => { for (let j = idx - 1; j >= 0; j--) if (c._ops[j][0] === key) return c._ops[j][1]; };
      expect(before('fillStyle')).toBe('rgba(255,255,255,.75)');
      expect(before('font')).toBe('600 62px "Segoe UI",Arial,sans-serif');
    }
  });

  it('indeks tak valid (non-integer / di luar rentang) → fallback draf 0', () => {
    for (const bad of [-1, 4, 99, 1.5, NaN, '2', null]) {
      const c = makeCtx();
      drawWallLogo(c, bad);
      expect(tagText(c)).toBe('SOFTWARE HOUSE  \u00b7  AI TEAM');
    }
  });

  it('regresi struktur: tetap 4 teks, 1 gradien, 2 heksagon (judul tidak tersentuh)', () => {
    const c = makeCtx();
    drawWallLogo(c, 2);
    expect(c._ops.filter((o) => o[0] === 'fillText').length).toBe(4);
    expect(c._grads.length).toBe(1);
    expect(c._ops.filter((o) => o[0] === 'beginPath').length).toBe(2);
    const texts = c._ops.filter((o) => o[0] === 'fillText').map((o) => o[1]);
    expect(texts).toContain('W');
    expect(texts).toContain('WFS');
    expect(texts).toContain('PROJECT');
  });
});
