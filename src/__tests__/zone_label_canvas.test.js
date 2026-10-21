import { describe, it, expect } from 'vitest';
import { drawZoneLabel, ZL_BG, ZL_BORDER, ZL_W, ZL_H } from '../scene/parts/zone_label_canvas.js';
import { fitZoneLabel, ZONE_LABEL_BASE_PX } from '../scene/parts/flooring.js';

// ctx recorder: semua oper setter/call terekam berurutan.
function mkCtx() {
  const ops = [];
  const h = {
    get ops() { return ops; },
    measureText: (t) => ({ width: t.length * 20 }),
  };
  return new Proxy(h, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => ops.push([k, ...args]);
    },
    set(t, k, v) { ops.push(['set:' + k, v]); return true; },
  });
}
const fontOf = (ops, i) => ops[i]?.[0] === 'set:font' ? ops[i][1] : null;

describe('zone_label_canvas.drawZoneLabel', () => {
  it('konstanta ekspor sesuai kanvas lama (512×96, warna latar/bingkai)', () => {
    expect(ZL_W).toBe(512); expect(ZL_H).toBe(96);
    expect(ZL_BG).toBe('rgba(5,10,22,0.75)');
    expect(ZL_BORDER).toBe('#F59E0B');
  });

  it('set textAlign center + textBaseline middle sebelum fillText', () => {
    const c = mkCtx(); drawZoneLabel(c, 'DEV ROOM');
    const iAlign = c.ops.findIndex(o => o[0] === 'set:textAlign');
    const iBase = c.ops.findIndex(o => o[0] === 'set:textBaseline');
    const iText = c.ops.findIndex(o => o[0] === 'fillText');
    expect(iAlign).toBeGreaterThanOrEqual(0);
    expect(iBase).toBe(iAlign + 1);
    expect(c.ops[iBase + 1][0]).toBe('set:fillStyle');
    expect(iText).toBe(iBase + 2);
    expect(c.ops[iAlign][1]).toBe('center');
    expect(c.ops[iBase][1]).toBe('middle');
  });

  it('fillStyle putih dan teks di (256,50) — pusat kanvas 512×96', () => {
    const c = mkCtx(); drawZoneLabel(c, 'QA ZONE');
    const iStyle = c.ops.findIndex(o => o[0] === 'set:fillStyle');
    const iText = c.ops.findIndex(o => o[0] === 'fillText');
    expect(c.ops[iStyle][1]).toBe('#FFFFFF');
    expect(c.ops[iText]).toEqual(['fillText', 'QA ZONE', 256, 50]);
  });

  it('teks persis satu fillText, tanpa oper lain selain align/baseline/style/fillText', () => {
    const c = mkCtx(); drawZoneLabel(c, 'MEETING');
    const allowed = ['set:textAlign', 'set:textBaseline', 'set:fillStyle', 'fillText'];
    expect(c.ops.every(o => allowed.includes(o[0]))).toBe(true);
    expect(c.ops.filter(o => o[0] === 'fillText').length).toBe(1);
  });

  it('dua pemanggilan tidak saling mempengaruhi (tidak share state)', () => {
    const a = mkCtx(), b = mkCtx();
    drawZoneLabel(a, 'A'); drawZoneLabel(b, 'B');
    expect(a.ops.find(o => o[0] === 'fillText')[1]).toBe('A');
    expect(b.ops.find(o => o[0] === 'fillText')[1]).toBe('B');
  });
});

describe('fitZoneLabel (tercakup di flooring)', () => {
  it('label pendek tetap pakai font dasar', () => {
    const c = mkCtx();
    const fs = fitZoneLabel(c, 'OK');
    expect(fs).toBe(ZONE_LABEL_BASE_PX);
    expect(fontOf(c.ops, 0)).toBe('800 44px "Segoe UI",Arial,sans-serif');
  });
  it('label panjang mengecil sampai muat 460px', () => {
    const c = mkCtx(); // measureText: width = len*20 → >460 bila len>23
    const fs = fitZoneLabel(c, 'X'.repeat(40));
    expect(fs).toBe(20); // width konstan 800 > 460 → turun sampai batas MIN 20 lalu berhenti
  });
});
