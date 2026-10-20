import { describe, it, expect } from 'vitest';
import { SEL_RING, HOVER_RING, selAnchorOf, selectedAgent } from '../scene/parts/ring_spec.js';

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
