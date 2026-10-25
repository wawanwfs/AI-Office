import { describe, it, expect } from 'vitest';
import { charMotion, applyCharMotion } from '../scene/parts/effects.js';

describe('charMotion — perhitungan kinematika gerak karakter', () => {
  it('mode desk: menghasilkan torsoY, headRotY, headRotX, dan handY(side)', () => {
    const m = charMotion(1.5, 2, 'desk');
    expect(Number.isFinite(m.torsoY)).toBe(true);
    expect(Number.isFinite(m.headRotY)).toBe(true);
    expect(Number.isFinite(m.headRotX)).toBe(true);
    expect(typeof m.handY).toBe('function');
    expect(Number.isFinite(m.handY(1))).toBe(true);
    expect(Number.isFinite(m.handY(-1))).toBe(true);
    // Nilai terikat rentang wajar (napas dan ketik skala kecil)
    expect(Math.abs(m.torsoY)).toBeLessThanOrEqual(0.007);
    expect(Math.abs(m.headRotY)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(m.handY(1))).toBeLessThanOrEqual(0.009);
  });

  it('mode meeting: gestur santai dan rotasi kepala lebih luas untuk diskusi', () => {
    const m = charMotion(2.0, 1, 'meeting');
    expect(Number.isFinite(m.torsoY)).toBe(true);
    expect(Number.isFinite(m.headRotY)).toBe(true);
    // Rentang rotasi kepala meeting (±0.08) lebih luas dibanding mengetik (±0.035)
    expect(Math.abs(m.headRotY)).toBeLessThanOrEqual(0.09);
    // Amplitudo tangan rapat lebih tenang (±0.003) dibanding ketik cepat (±0.008)
    expect(Math.abs(m.handY(1))).toBeLessThanOrEqual(0.004);
  });

  it('mode reception: parameter unik resepsionis Nexus', () => {
    const m = charMotion(3.0, 0, 'reception');
    expect(Number.isFinite(m.torsoY)).toBe(true);
    expect(Number.isFinite(m.headRotY)).toBe(true);
    expect(Number.isFinite(m.handY(1))).toBe(true);
  });

  it('guard input non-numerik (NaN, undefined) kembali aman tanpa NaN', () => {
    const m = charMotion(NaN, undefined);
    expect(Number.isFinite(m.torsoY)).toBe(true);
    expect(Number.isFinite(m.headRotY)).toBe(true);
    expect(Number.isFinite(m.handY(NaN))).toBe(true);
  });
});

describe('applyCharMotion — manipulasi node 3D karakter', () => {
  it('guard null/undefined group atau motion tidak melempar error', () => {
    expect(() => applyCharMotion(null, {})).not.toThrow();
    expect(() => applyCharMotion({}, null)).not.toThrow();
    expect(() => applyCharMotion({ children: [] }, {})).not.toThrow();
  });

  it('mengabaikan node anak tanpa userData', () => {
    const dummy = { position: { y: 0.5 }, rotation: { x: 0, y: 0 } };
    const group = { children: [dummy] };
    const m = charMotion(1.0, 0, 'desk');
    expect(() => applyCharMotion(group, m)).not.toThrow();
    expect(dummy.position.y).toBe(0.5);
  });

  it('menerapkan motion pada torso, kepala, dan tangan secara akurat', () => {
    const torso = { position: { y: 0.74 }, userData: { isTorso: true, baseY: 0.74 } };
    const head = { rotation: { x: 0, y: 0 }, userData: { isHead: true, baseY: 1.1 } };
    const handLeft = { position: { y: 0.55 }, userData: { isTypeHand: true, side: -1, baseY: 0.55 } };
    const handRight = { position: { y: 0.55 }, userData: { isTypeHand: true, side: 1, baseY: 0.55 } };
    const group = { children: [torso, head, handLeft, handRight] };

    const m = charMotion(2.5, 0, 'desk');
    applyCharMotion(group, m);

    expect(torso.position.y).toBeCloseTo(0.74 + m.torsoY, 5);
    expect(head.rotation.y).toBeCloseTo(m.headRotY, 5);
    expect(head.rotation.x).toBeCloseTo(m.headRotX, 5);
    expect(handLeft.position.y).toBeCloseTo(0.55 + m.handY(-1), 5);
    expect(handRight.position.y).toBeCloseTo(0.55 + m.handY(1), 5);
  });

  it('fallback ke position.y bila baseY belum tercatat di userData', () => {
    const torso = { position: { y: 0.8 }, userData: { isTorso: true } };
    const group = { children: [torso] };
    const m = charMotion(1.0, 0, 'meeting');
    applyCharMotion(group, m);
    expect(torso.position.y).toBeCloseTo(0.8 + m.torsoY, 5);
  });
});
