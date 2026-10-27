import { describe, it, expect } from 'vitest';
import { SEL_RING, HOVER_RING, selAnchorOf, selectedAgent, ringFloorY, hoverRingPos } from '../scene/parts/ring_spec.js';

describe('ring constants', () => {
  it('selection ring historical values', () => {
    expect(SEL_RING.PLANE).toBe(3.1);
    expect(SEL_RING.INNER).toBe(46);
    expect(SEL_RING.OUTER).toBe(62);
    expect(SEL_RING.MID).toBe(0.68);
    expect(SEL_RING.COLOR).toBe(0xFFD75E);
    expect(SEL_RING.RGB).toBe('255,205,80');
    expect(SEL_RING.OPACITY).toBe(0.9);
    expect(SEL_RING.Y).toBe(0.03);
    expect(SEL_RING.SIZE).toBe(128);
  });
  it('hover ring historical values', () => {
    expect(HOVER_RING.PLANE).toBe(2.6);
    expect(HOVER_RING.INNER).toBe(44);
    expect(HOVER_RING.OUTER).toBe(62);
    expect(HOVER_RING.MID).toBe(0.7);
    expect(HOVER_RING.COLOR).toBe(0x9FE8FF);
    expect(HOVER_RING.RGB).toBe('120,220,255');
    expect(HOVER_RING.OPACITY).toBe(0.85);
    expect(HOVER_RING.Y).toBe(0.02);
  });
  it('hover ring plane < selection ring plane', () => {
    expect(HOVER_RING.PLANE).toBeLessThan(SEL_RING.PLANE);
  });
  it('gradient inner radius < outer radius for both rings', () => {
    expect(SEL_RING.INNER).toBeLessThan(SEL_RING.OUTER);
    expect(HOVER_RING.INNER).toBeLessThan(HOVER_RING.OUTER);
  });
});

describe('selAnchorOf', () => {
  it('walker visible → walker position, off 0', () => {
    const a = { walker: { visible: true, position: { x: 5, z: -7 } }, home: { x: 1, z: 1 }, sittingChar: { visible: false } };
    expect(selAnchorOf(a)).toEqual({ x: 5, z: -7, off: 0 });
  });
  it('sitting → home position with seat offset 0.55', () => {
    const a = { walker: { visible: false }, home: { x: 2, z: 3 }, sittingChar: { visible: true } };
    expect(selAnchorOf(a)).toEqual({ x: 2, z: 3, off: 0.55 });
  });
  it('sitting → walker wins when both visible', () => {
    const a = { walker: { visible: true, position: { x: 9, z: 9 } }, home: { x: 2, z: 3 }, sittingChar: { visible: true } };
    expect(selAnchorOf(a)).toEqual({ x: 9, z: 9, off: 0 });
  });
  it('nothing visible → null', () => {
    const a = { walker: { visible: false }, home: { x: 0, z: 0 }, sittingChar: { visible: false } };
    expect(selAnchorOf(a)).toBeNull();
  });
  it('missing walker → falls back to sitting', () => {
    const a = { home: { x: 4, z: 5 }, sittingChar: { visible: true } };
    expect(selAnchorOf(a)).toEqual({ x: 4, z: 5, off: 0.55 });
  });
  it('null/undefined agent → null without throwing', () => {
    expect(selAnchorOf(null)).toBeNull();
    expect(selAnchorOf(undefined)).toBeNull();
  });
  it('custom seat offset respected', () => {
    const a = { home: { x: 0, z: 0 }, sittingChar: { visible: true } };
    expect(selAnchorOf(a, 1.25).off).toBe(1.25);
  });
});

describe('ringFloorY', () => {
  it('walker visible → walker.position.y', () => {
    const a = { walker: { visible: true, position: { x: 1, y: 3.25, z: 2 } }, home: { x: 0, y: 9, z: 0 } };
    expect(ringFloorY(a)).toBe(3.25);
  });
  it('walker visible with falsy y → 0 (|| 0 semantics preserved)', () => {
    const a = { walker: { visible: true, position: { x: 1, y: 0, z: 2 } }, home: { x: 0, y: 9, z: 0 } };
    expect(ringFloorY(a)).toBe(0);
  });
  it('walker hidden → home.y (duduk)', () => {
    const a = { walker: { visible: false, position: { x: 1, y: 3, z: 2 } }, home: { x: 2, y: 0.72, z: 3 } };
    expect(ringFloorY(a)).toBe(0.72);
  });
  it('walker hidden, home.y missing → 0', () => {
    const a = { walker: { visible: false, position: { x: 1, y: 3, z: 2 } }, home: { x: 2, z: 3 } };
    expect(ringFloorY(a)).toBe(0);
  });
  it('walker hidden, home.y NaN → 0 (guard Number.isFinite)', () => {
    const a = { walker: { visible: false, position: { x: 1, y: 3, z: 2 } }, home: { x: 2, y: NaN, z: 3 } };
    expect(ringFloorY(a)).toBe(0);
  });
  it('walker visible but position missing → fallback home (tidak throw)', () => {
    const a = { walker: { visible: true }, home: { x: 2, y: 1.5, z: 3 } };
    expect(ringFloorY(a)).toBe(1.5);
  });
  it('no home at all → 0 tanpa throw', () => {
    expect(ringFloorY({ walker: { visible: false } })).toBe(0);
    expect(ringFloorY({})).toBe(0);
  });
  it('null/undefined agent → 0 tanpa throw', () => {
    expect(ringFloorY(null)).toBe(0);
    expect(ringFloorY(undefined)).toBe(0);
  });
  it('konsisten dengan selAnchorOf: agent tak terlihat (offsite) → anchor null & Y fallback 0', () => {
    const a = { walker: { visible: false }, home: { x: 5, y: 1.2, z: 6 }, sittingChar: { visible: false } };
    expect(selAnchorOf(a)).toBeNull(); // ring disembunyikan, bukan dipindah ke meja kosong
    expect(ringFloorY(a)).toBe(1.2);
  });
});

// Posisi penuh cincin hover (siklus 117): satu sumber kebenaran utk handler
// pointermove & blok follow per-frame — dulu formula duplikat 2×.
describe('hoverRingPos', () => {
  const NX = { x: 7.6, y: 1.20, z: 6.1 };
  it('agen duduk → anchor home + off 0.55, Y = home.y + HOVER_RING.Y', () => {
    const a = { walker: { visible: false }, home: { x: 2, y: 0.72, z: 3 }, sittingChar: { visible: true } };
    expect(hoverRingPos(a, false, NX)).toEqual({ x: 2, y: 0.72 + HOVER_RING.Y, z: 3 + 0.55 });
  });
  it('agen berjalan → posisi walker, off 0', () => {
    const a = { walker: { visible: true, position: { x: 5, y: 1.1, z: -7 } }, home: { x: 1, y: 0.72, z: 1 }, sittingChar: { visible: false } };
    expect(hoverRingPos(a, false, NX)).toEqual({ x: 5, y: 1.1 + HOVER_RING.Y, z: -7 });
  });
  it('agen offsite (tak terlihat) → null (ring disembunyikan, bukan nyangkut di meja)', () => {
    const a = { walker: { visible: false }, home: { x: 2, y: 0.72, z: 3 }, sittingChar: { visible: false } };
    expect(hoverRingPos(a, false, NX)).toBeNull();
  });
  it('null agent + isNexus → posisi nexus + HOVER_RING.Y (formula hardcode 7.6/1.20/6.1 → konstanta)', () => {
    expect(hoverRingPos(null, true, NX)).toEqual({ x: 7.6, y: 1.20 + HOVER_RING.Y, z: 6.1 });
  });
  it('isNexus tanpa posisi valid → null (null-safe, tidak throw)', () => {
    expect(hoverRingPos(null, true, null)).toBeNull();
    expect(hoverRingPos(null, true, undefined)).toBeNull();
    expect(hoverRingPos(null, true, { x: NaN, y: 1, z: 1 })).toBeNull();
    expect(hoverRingPos(null, true, { x: 1, y: Infinity, z: 1 })).toBeNull();
  });
  it('agent null & bukan nexus → null', () => {
    expect(hoverRingPos(null, false, NX)).toBeNull();
    expect(hoverRingPos(undefined, false, NX)).toBeNull();
  });
  it('agent diprioritaskan di atas nexus bila keduanya ada', () => {
    const a = { walker: { visible: true, position: { x: 9, y: 0, z: 9 } }, home: { x: 0, y: 0, z: 0 }, sittingChar: { visible: true } };
    const p = hoverRingPos(a, true, NX);
    expect(p.x).toBe(9);
  });
  it('konsisten dengan selAnchorOf + ringFloorY (X/Z dari anchor, Y dari ringFloorY)', () => {
    const a = { walker: { visible: false }, home: { x: -3, y: 1.44, z: 8 }, sittingChar: { visible: true } };
    const anchor = selAnchorOf(a);
    const p = hoverRingPos(a, false, NX);
    expect(p.x).toBe(anchor.x);
    expect(p.z).toBe(anchor.z + anchor.off);
    expect(p.y).toBe(ringFloorY(a) + HOVER_RING.Y);
  });
});

describe('selectedAgent', () => {
  const data = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('valid index → agent', () => {
    expect(selectedAgent(data, 1).id).toBe('b');
  });
  it('index 0 and last index valid', () => {
    expect(selectedAgent(data, 0).id).toBe('a');
    expect(selectedAgent(data, 2).id).toBe('c');
  });
  it('negative index → null', () => {
    expect(selectedAgent(data, -1)).toBeNull();
  });
  it('index >= length → null', () => {
    expect(selectedAgent(data, 3)).toBeNull();
  });
  it('null data → null without throwing', () => {
    expect(selectedAgent(null, 0)).toBeNull();
  });
});
