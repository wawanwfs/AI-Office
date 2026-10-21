// Test painter wajah jam dinding (parts/clock_canvas.js).
// ctx recorder: setter & panggilan metode direkam sebagai oper berurutan.
import { describe, it, expect } from 'vitest';
import {
  drawClockFace, CLOCK_SIZE, CLOCK_CENTER, CLOCK_BG, CLOCK_RIM, CLOCK_RIM_W,
  CLOCK_RIM_R, CLOCK_TICK_OUTER_R, CLOCK_PIN, CLOCK_PIN_R,
} from '../scene/parts/clock_canvas.js';
import {
  TICKS, tickAngle, tickInnerR, hourHandAngle, minuteHandAngle, secondHandAngle, HANDS,
} from '../scene/parts/clock_spec.js';

function mkCtx() {
  const ops = [];
  const rec = (name) => (...a) => ops.push([name, ...a]);
  const ctx = {
    fillRect: rec('fillRect'), strokeRect: rec('strokeRect'),
    beginPath: rec('beginPath'), arc: rec('arc'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'), fill: rec('fill'),
  };
  for (const key of ['fillStyle', 'strokeStyle', 'lineWidth']) {
    let v;
    Object.defineProperty(ctx, key, {
      get: () => v,
      set: (nv) => { v = nv; ops.push(['set:' + key, nv]); },
    });
  }
  return { ops, ctx };
}
const styleBefore = (ops, key, name, arg1) => {
  const i = ops.findIndex((o) => o[0] === name && o[1] === arg1);
  expect(i).toBeGreaterThan(-1);
  const setter = ops.slice(0, i).reverse().find((o) => o[0] === 'set:' + key);
  expect(setter).toBeTruthy();
  return setter[1];
};

const NOW = 60 * 10 + 30; // 10:30
const FIXED_DATE = 1700000000000;

describe('clock_canvas — konstanta & painter wajah jam', () => {
  it('mengekspor konstanta sesuai kanvas lama (96×96, pusat 48, rim & pin)', () => {
    expect(CLOCK_SIZE).toBe(96);
    expect(CLOCK_CENTER).toBe(48);
    expect(CLOCK_BG).toBe('#fafafa');
    expect(CLOCK_RIM).toBe('#2a2f36');
    expect(CLOCK_RIM_W).toBe(3);
    expect(CLOCK_RIM_R).toBe(45);
    expect(CLOCK_TICK_OUTER_R).toBe(43);
    expect(CLOCK_PIN).toBe('#f97316');
    expect(CLOCK_PIN_R).toBe(3);
  });

  it('latar fillRect penuh adalah oper pertama dengan warna latar', () => {
    const { ops, ctx } = mkCtx();
    drawClockFace(ctx, NOW);
    expect(ops[0]).toEqual(['set:fillStyle', CLOCK_BG]);
    expect(ops[1]).toEqual(['fillRect', 0, 0, CLOCK_SIZE, CLOCK_SIZE]);
  });

  it('rim: strokeStyle+lineWidth lalu lingkaran penuh radius 45', () => {
    const { ops, ctx } = mkCtx();
    drawClockFace(ctx, NOW);
    const arc = ops.find((o) => o[0] === 'arc' && o[3] === CLOCK_RIM_R);
    expect(arc).toEqual(['arc', CLOCK_CENTER, CLOCK_CENTER, CLOCK_RIM_R, 0, Math.PI * 2]);
    expect(styleBefore(ops, 'strokeStyle', 'arc', CLOCK_CENTER, CLOCK_CENTER)).toBe(CLOCK_RIM);
    expect(styleBefore(ops, 'lineWidth', 'arc', CLOCK_CENTER, CLOCK_CENTER)).toBe(CLOCK_RIM_W);
  });

  it('garis tick: TICKS garis dari tickInnerR(i) ke radius 43 sesuai sudut', () => {
    const { ops, ctx } = mkCtx();
    drawClockFace(ctx, NOW);
    const rimStrokeIdx = ops.findIndex((o) => o[0] === 'stroke') + 1;
    const lines = [];
    let mv = null;
    for (const [name, ...a] of ops.slice(rimStrokeIdx)) {
      if (name === 'moveTo') mv = a;
      else if (name === 'lineTo' && mv) { lines.push([mv, a]); mv = null; }
    }
    expect(lines).toHaveLength(TICKS + 3);
    // 12 tick pertama sesuai spec; 3 garis terakhir adalah jarum jam/menit/detik
    for (let i = 0; i < TICKS; i++) {
      const a = tickAngle(i);
      const r1 = tickInnerR(i);
      expect(lines[i][0]).toEqual([CLOCK_CENTER + Math.sin(a) * r1, CLOCK_CENTER - Math.cos(a) * r1]);
      expect(lines[i][1]).toEqual([CLOCK_CENTER + Math.sin(a) * CLOCK_TICK_OUTER_R, CLOCK_CENTER - Math.cos(a) * CLOCK_TICK_OUTER_R]);
    }
  });

  it('tiga jarum sesuai spec HANDS: panjang, tebal, warna, dan sudut waktu', () => {
    const { ops, ctx } = mkCtx();
    drawClockFace(ctx, NOW, FIXED_DATE);
    const minutes = NOW / 60;
    const specs = [
      [hourHandAngle(minutes), HANDS.hour],
      [minuteHandAngle(minutes), HANDS.minute],
      [secondHandAngle(((FIXED_DATE / 1000) % 60)), HANDS.second],
    ];
    for (const [ang, s] of specs) {
      const lt = ops.find((o) => o[0] === 'lineTo' && Math.abs(o[1] - (CLOCK_CENTER + Math.sin(ang) * s.len)) < 1e-6);
      expect(lt).toBeTruthy();
      expect(lt[2]).toBeCloseTo(CLOCK_CENTER - Math.cos(ang) * s.len, 6);
      expect(styleBefore(ops, 'strokeStyle', 'lineTo', lt[1])).toBe(s.color);
      expect(styleBefore(ops, 'lineWidth', 'lineTo', lt[1])).toBe(s.w);
    }
  });

  it('pin oranye sebagai penutup (arc radius 3 + fill) tanpa oper liar', () => {
    const { ops, ctx } = mkCtx();
    drawClockFace(ctx, NOW);
    const pinArc = ['arc', CLOCK_CENTER, CLOCK_CENTER, CLOCK_PIN_R, 0, Math.PI * 2];
    const i = ops.findIndex((o) => o[0] === 'arc' && o[3] === CLOCK_PIN_R);
    expect(i).toBeGreaterThan(-1);
    expect(ops[i]).toEqual(pinArc);
    expect(ops[i + 1]).toEqual(['fill']);
    expect(ops.slice(i + 2)).toHaveLength(0);
    const pinFill = ops.slice(0, i).reverse().find((o) => o[0] === 'set:fillStyle');
    expect(pinFill[1]).toBe(CLOCK_PIN);
  });

  it('dua pemanggilan tak share state (recorder terpisah, hasil identik struktur)', () => {
    const a = mkCtx(); const b = mkCtx();
    drawClockFace(a.ctx, NOW, FIXED_DATE);
    drawClockFace(b.ctx, NOW + 15, FIXED_DATE);
    expect(a.ops.map((o) => o[0])).toEqual(b.ops.map((o) => o[0]));
    expect(a.ctx.fillStyle).toBe(CLOCK_PIN);
    expect(b.ctx.fillStyle).toBe(CLOCK_PIN);
  });
});
