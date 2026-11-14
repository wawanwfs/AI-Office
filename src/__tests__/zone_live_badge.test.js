// Siklus 527 — badge live label zona: jumlah agen di area zona pada kanvas
// label 512×96 (zone_label_canvas.js). Painter & penghitung murni — ctx recorder.
import { describe, it, expect } from 'vitest';
import {
  drawZoneLive, zoneAgentCount, ZL_LIVE_Y, ZL_LIVE_FONT, ZL_LIVE_COLOR,
  drawZoneLabel, ZL_W, ZL_H,
} from '../scene/parts/zone_label_canvas.js';

// recorder ctx: setter + call terekam (pola zone_label_canvas.test.js)
function mkCtx() {
  const ops = [];
  return new Proxy({
    get ops() { return ops; },
    measureText: (t) => ({ width: t.length * 20 }),
  }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => ops.push([k, ...a]); },
    set(t, k, v) { ops.push(['set:' + k, v]); return true; },
  });
}

describe('drawZoneLive — painter badge live', () => {
  it('fallback count tak valid → render lama utuh (label di 256,50, tanpa baris kedua)', () => {
    for (const bad of [null, undefined, NaN, 'abc']) {
      const c = mkCtx(); drawZoneLive(c, 'DEV DESK', bad);
      const fills = c.ops.filter(o => o[0] === 'fillText');
      expect(fills).toEqual([['fillText', 'DEV DESK', 256, 50]]);
      expect(fills.length).toBe(1);
    }
  });

  it('ctx null/undefined → no-op tanpa error', () => {
    expect(() => drawZoneLive(null, 'X', 3)).not.toThrow();
    expect(drawZoneLive(undefined, 'X', 3)).toBeUndefined();
  });

  it('count valid: label putih (256,34) + badge amber monospace (256,72)', () => {
    const c = mkCtx(); drawZoneLive(c, 'DEV DESK', 5);
    const fills = c.ops.filter(o => o[0] === 'fillText');
    expect(fills[0]).toEqual(['fillText', 'DEV DESK', 256, 34]);
    expect(fills[1]).toEqual(['fillText', '5 di zona', 256, 72]);
    const iFont = c.ops.findIndex(o => o[0] === 'set:font');
    expect(c.ops[iFont]).toEqual(['set:font', ZL_LIVE_FONT]);
    // fillStyle amber terakhir sebelum badge = warna ZL_LIVE_COLOR
    const iBadge = c.ops.findIndex(o => o[0] === 'fillText' && o[1] === '5 di zona');
    const lastFsBefore = (idx) => { for (let j = idx - 1; j >= 0; j--) if (c.ops[j][0] === 'set:fillStyle') return c.ops[j][1]; };
    expect(lastFsBefore(iBadge)).toBe(ZL_LIVE_COLOR);
  });

  it('count 0 tetap digambar (0 di zona) — kosong = informasi, bukan fallback', () => {
    const c = mkCtx(); drawZoneLive(c, 'CAFÉ', 0);
    expect(c.ops.filter(o => o[0] === 'fillText')[1]).toEqual(['fillText', '0 di zona', 256, 72]);
  });

  it('count pecah dibulatkan ke bawah (floor)', () => {
    const c = mkCtx(); drawZoneLive(c, 'MEETING', 3.7);
    expect(c.ops.filter(o => o[0] === 'fillText')[1]).toEqual(['fillText', '3 di zona', 256, 72]);
  });

  it('konstanta ekspor utk konsumen', () => {
    expect(ZL_LIVE_Y).toBe(72);
    expect(ZL_LIVE_COLOR).toBe('#F59E0B');
    expect(ZL_LIVE_FONT).toContain('22px');
    expect(ZL_W).toBe(512); expect(ZL_H).toBe(96);
  });

  it('drawZoneLabel paritas lama tetap (256,50 putih)', () => {
    const c = mkCtx(); drawZoneLabel(c, 'SERVER ROOM');
    expect(c.ops.filter(o => o[0] === 'fillText')).toEqual([['fillText', 'SERVER ROOM', 256, 50]]);
  });
});

// Posisi agen tiruan: {walker,sittingChar,home} dengan prioritas sama dgn scene
function mkAgent({ state = 'sitting', wx, wz, wv = false, sx, sz, sv = false, hx, hz } = {}) {
  return {
    state,
    walker: wv ? { visible: true, position: { x: wx, z: wz } } : { visible: false },
    sittingChar: sv ? { visible: true, position: { x: sx, z: sz } } : { visible: false },
    home: { x: hx, z: hz },
  };
}

const Z = { x: -6, z: -1.2, w: 11, d: 7.5 }; // DEV DESK: x -11.5..-0.5, z -4.95..2.55

describe('zoneAgentCount — penghitung live AABB', () => {
  it('duduk di dalam zona dihitung (sittingChar visible)', () => {
    expect(zoneAgentCount(Z, [mkAgent({ sx: -6, sz: 0, sv: true })])).toBe(1);
  });

  it('walker visible → posisi walker dipakai (bukan home)', () => {
    const a = mkAgent({ wx: 10, wz: 5, wv: true, hx: -6, hz: 0 });
    expect(zoneAgentCount(Z, [a])).toBe(0); // walker di luar
    const b = mkAgent({ wx: -5, wz: 0, wv: true, hx: 10, hz: 9 });
    expect(zoneAgentCount(Z, [b])).toBe(1); // walker di dalam
  });

  it('char hidden → fallback home', () => {
    expect(zoneAgentCount(Z, [mkAgent({ hx: -6, hz: 0 })])).toBe(1);
    expect(zoneAgentCount(Z, [mkAgent({ hx: 12, hz: 8 })])).toBe(0);
  });

  it('offsite dilewati walau home di dalam zona', () => {
    expect(zoneAgentCount(Z, [mkAgent({ state: 'offsite', hx: -6, hz: 0 })])).toBe(0);
  });

  it('batas AABB: tepi persis dihitung, di luar tidak', () => {
    expect(zoneAgentCount(Z, [mkAgent({ sx: -0.5, sz: 2.55, sv: true })])).toBe(1);
    expect(zoneAgentCount(Z, [mkAgent({ sx: -0.4, sz: 0, sv: true })])).toBe(0);
    expect(zoneAgentCount(Z, [mkAgent({ sx: -6, sz: 2.6, sv: true })])).toBe(0);
  });

  it('jumlah banyak agen', () => {
    const ags = [
      mkAgent({ sx: -6, sz: 0, sv: true }),
      mkAgent({ sx: -8, sz: 1, sv: true }),
      mkAgent({ sx: 8, sz: -3, sv: true }), // zona MEETING, di luar DEV DESK
    ];
    expect(zoneAgentCount(Z, ags)).toBe(2);
  });

  it('guard: zona/agentData tak valid → 0 tanpa error', () => {
    expect(zoneAgentCount(null, [])).toBe(0);
    expect(zoneAgentCount({ x: NaN, z: 0, w: 1, d: 1 }, [])).toBe(0);
    expect(zoneAgentCount(Z, null)).toBe(0);
    expect(zoneAgentCount(Z, 'x')).toBe(0);
    expect(zoneAgentCount(Z, [null, {}, mkAgent({ sx: NaN, sz: 0, sv: true })])).toBe(0);
  });
});
