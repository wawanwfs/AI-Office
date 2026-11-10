// Siklus 368: faceYaw — satu sumber rotasi menghadap (atan2(dx,dz)) di lib/math_util.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { faceYaw } from '../lib/math_util.js';

const root = resolve(__dirname, '..', '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('siklus 368 — faceYaw satu sumber', () => {
  it('salinan atan2(dx,dz) hilang dari motion.js, motion_math.js tetap import faceYaw', () => {
    const motion = read('src/scene/parts/motion.js');
    expect(motion).not.toMatch(/Math\.atan2\(/);
    expect(motion).toMatch(/import \{ faceYaw \} from '\.\.\/\.\.\/lib\/math_util\.js'/);
    const mm = read('src/scene/parts/motion_math.js');
    expect(mm).not.toMatch(/Math\.atan2\(/);
    expect(mm).toMatch(/import \{ faceYaw \}/);
    const mu = read('src/lib/math_util.js');
    expect(mu).toMatch(/export function faceYaw/);
  });

  it('pemakai: converse (motion.js) & stepMove (motion_math.js) memakai faceYaw', () => {
    const motion = read('src/scene/parts/motion.js');
    expect((motion.match(/faceYaw\(/g) || []).length).toBe(2);
    const mm = read('src/scene/parts/motion_math.js');
    expect(mm).toMatch(/const rot = faceYaw\(pos, target\)/);
  });

  it('paritas 8 kasus vs pola lama Math.atan2(dx, dz)', () => {
    const cases = [
      [{ x: 0, z: 0 }, { x: 1, z: 0 }],
      [{ x: 0, z: 0 }, { x: 0, z: 1 }],
      [{ x: 2, z: 3 }, { x: -1, z: -4 }],
      [{ x: 5, z: 5 }, { x: 5, z: 9 }],
      [{ x: -7, z: 2 }, { x: 7, z: 2 }],
      [{ x: 0.5, z: -0.5 }, { x: -0.5, z: 0.5 }],
      [{ x: 100, z: 0 }, { x: 100, z: 0 }],
      [{ x: 3.3, z: 1.1 }, { x: 9.9, z: -2.2 }],
    ];
    for (const [a, b] of cases) {
      const legacy = Math.atan2(b.x - a.x, b.z - a.z);
      expect(faceYaw(a, b)).toBeCloseTo(legacy, 12);
    }
  });

  it('anti-poisoning: non-finite/null/string non-numerik → null', () => {
    expect(faceYaw(null, { x: 1, z: 1 })).toBeNull();
    expect(faceYaw({ x: 0, z: 0 }, null)).toBeNull();
    expect(faceYaw({ x: NaN, z: 0 }, { x: 1, z: 1 })).toBeNull();
    expect(faceYaw({ x: 0, z: Infinity }, { x: 1, z: 1 })).toBeNull();
    expect(faceYaw({ x: 0, z: 0 }, { x: NaN, z: 1 })).toBeNull();
    expect(faceYaw({ x: 'abc', z: 0 }, { x: 1, z: 1 })).toBeNull();
    expect(faceYaw(undefined, undefined)).toBeNull();
    expect(faceYaw({ x: 0, z: '2' }, { x: 1, z: 1 })).toBeCloseTo(Math.atan2(1, -1), 12);
  });

  it('konsistensi: stepMove rot = arah menuju target; converse simetris', () => {
    // stepMove: rot harus sama dengan faceYaw(pos→target) saat bergerak
    const pos = { x: 0, z: 0, rot: 1 };
    const target = { x: 3, z: 4 };
    // re-implementasi ringan: faceYaw konsisten dgn atan2 nx,nz
    const d = Math.hypot(target.x - pos.x, target.z - pos.z);
    const expectRot = Math.atan2((target.x - pos.x) / d, (target.z - pos.z) / d);
    expect(faceYaw(pos, target)).toBeCloseTo(expectRot, 12);
    // converse simetris: faceYaw(a→b) = faceYaw(b→a) + π (mod 2π)
    const ab = faceYaw({ x: 1, z: 2 }, { x: 4, z: 6 });
    const ba = faceYaw({ x: 4, z: 6 }, { x: 1, z: 2 });
    let diff = (ba - ab) % (2 * Math.PI);
    if (diff < 0) diff += 2 * Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    expect(Math.abs(diff)).toBeCloseTo(Math.PI, 10);
  });
});
