// Siklus 367: satu sumber jarak XZ — distXZ di lib/math_util.js menggantikan
// 3 salinan `Math.hypot(a.x - b.x, a.z - b.z)`: chat_check.nearbyPairs,
// obstacles.seatOccupied, OfficeScene.createBubble (samePos < 1.2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { distXZ } from '../lib/math_util.js';
import { nearbyPairs } from '../scene/parts/chat_check.js';
import { seatOccupied } from '../scene/parts/obstacles.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('siklus 367 — distXZ satu sumber', () => {
  it('salinan Math.hypot x/z hilang dari 3 file pemakai', () => {
    for (const f of ['scene/parts/chat_check.js', 'scene/parts/obstacles.js']) {
      expect(read(f).includes('Math.hypot('), f).toBe(false);
    }
    expect(read('scene/OfficeScene.js').includes('Math.hypot(b.sprite.position.x-x')).toBe(false);
  });

  it('ketiga pemakai mengimpor distXZ dari math_util', () => {
    expect(read('scene/parts/chat_check.js').includes("import { distXZ } from '../../lib/math_util.js'")).toBe(true);
    expect(read('scene/parts/obstacles.js').includes("import { distXZ } from '../../lib/math_util.js'")).toBe(true);
    expect(read('scene/OfficeScene.js').includes('distXZ } from')).toBe(true);
  });

  it('paritas dgn pola lama Math.hypot (8 kasus)', () => {
    const old = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const pairs = [
      [{ x: 0, z: 0 }, { x: 3, z: 4 }],
      [{ x: 1.5, z: -2 }, { x: 1.5, z: -2 }],
      [{ x: -12, z: 9 }, { x: 12, z: -9 }],
      [{ x: 0.1, z: 0.1 }, { x: 0.2, z: 0.2 }],
      [{ x: 100, z: 100 }, { x: 100.5, z: 100.5 }],
      [{ x: -1, z: 1 }, { x: 2, z: 5 }],
      [{ x: 7, z: 7 }, { x: 7, z: 9 }],
      [{ x: 0, z: 0 }, { x: 0, z: 1 }],
    ];
    for (const [a, b] of pairs) expect(distXZ(a, b)).toBeCloseTo(old(a, b), 12);
  });

  it('anti-poisoning: koordinat non-finite → null (bukan NaN)', () => {
    expect(distXZ({ x: NaN, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(distXZ({ x: 0, z: Infinity }, { x: 0, z: 0 })).toBeNull();
    expect(distXZ({ x: '3', z: '4' }, { x: 0, z: 0 })).toBe(5);
    expect(distXZ(null, { x: 0, z: 0 })).toBeNull();
    expect(distXZ({ x: 0, z: 0 }, undefined)).toBeNull();
    expect(distXZ({ x: NaN, z: NaN }, { x: NaN, z: NaN })).toBeNull();
  });

  it('konsistensi pemakai: nearbyPairs & seatOccupied tetap benar', () => {
    const ppl = [
      { x: 0, z: 0, visible: true, cooldown: 0 },
      { x: 1, z: 0, visible: true, cooldown: 0 },
      { x: 5, z: 5, visible: true, cooldown: 0 },
      { x: 0.5, z: 0, visible: true, cooldown: 0 },
    ];
    const pairs = nearbyPairs(ppl);
    expect(pairs.length).toBe(3);
    // koordinat korup → tidak pernah "dekat"
    expect(nearbyPairs([{ x: NaN, z: 0, visible: true, cooldown: 0 }, { x: 0, z: 0, visible: true, cooldown: 0 }]).length).toBe(0);
    const agents = [
      { agent: 'a', home: { x: 2, z: 2 }, state: 'idle' },
      { agent: 'b', home: { x: 8, z: 8 }, state: 'idle' },
    ];
    expect(seatOccupied(2.5, 2, agents, 'c')).toBe(true);
    expect(seatOccupied(8.5, 8, agents, 'a')).toBe(true);
    expect(seatOccupied(5, 5, agents, 'c')).toBe(false);
    expect(seatOccupied(2.5, 2, agents, 'a')).toBe(false);
  });
});
