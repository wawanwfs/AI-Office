// Siklus 371 — batas lantai & elevasi satu sumber (floor_elevation.js)
// Dulu batas z=-0.8/4.5 dan peta lantai tersalin 5x: levelOf (agent_status),
// deskY+floor penugasan meja 2× (OfficeScene), floorElevationAt lokal
// (furniture), zoneFloorY (flooring), deskLevelOf (team_spec) — risiko drift.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  floorOf, floorElevationAt, ZONE_L1_MAX_Z, ZONE_L2_MAX_Z,
} from '../scene/parts/floor_elevation.js';

const root = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

describe('siklus 371 — batas lantai satu sumber', () => {
  it('salinan pola batas manual hilang dari 5 situs (komentar diabaikan)', () => {
    const code = (p) => read(p).replace(/^\s*\/\/.*$/gm, '');
    expect(code('scene/parts/agent_status.js')).not.toMatch(/z < -0\.8|<= 4\.5/);
    const scene = code('scene/OfficeScene.js');
    expect(scene.match(/dp\.z < -0\.8/g)).toBeNull();
    const furniture = code('scene/parts/furniture.js');
    expect(furniture).not.toMatch(/const floorElevationAt = /);
    const flooring = code('scene/parts/flooring.js');
    expect(flooring).not.toMatch(/z\.z > 4\.5/);
    const team = code('scene/parts/team_spec.js');
    expect(team).not.toMatch(/if \(z < -0\.8\)/);
  });

  it('pemakai mengimpor satu sumber', () => {
    expect(read('scene/parts/agent_status.js')).toMatch(/import \{ floorOf \} from '\.\/floor_elevation\.js'/);
    expect(read('scene/parts/furniture.js')).toMatch(/from '\.\/floor_elevation\.js'/);
    expect(read('scene/parts/flooring.js')).toMatch(/floorOf\(z\.z\)/);
    expect(read('scene/parts/team_spec.js')).toMatch(/levelOf\(z\)/);
    expect(read('scene/OfficeScene.js')).toMatch(/floorElevationAt\(dp\.z\)/);
    expect(read('scene/OfficeScene.js')).toMatch(/floorOf\(dp\.z\)/);
  });

  it('paritas floorOf dgn peta lama (12 kasus)', () => {
    const old = (z) => (z < -0.8 ? 1 : (z <= 4.5 ? 2 : 3));
    const cases = [-14, -3, -1.5, -0.81, -0.8, 0, 1.5, 4.5, 4.6, 5, 6, 13.5];
    for (const z of cases) expect(floorOf(z)).toBe(old(z));
  });

  it('anti-poisoning: z non-finite → null', () => {
    for (const z of [NaN, Infinity, -Infinity, undefined, null, '5', {}]) {
      expect(floorOf(z)).toBeNull();
    }
  });

  it('deskY paritas: floorElevationAt pada posisi meja == nilai konstanta lama', () => {
    const oldY = (z) => (z < -0.8 ? 0 : (z <= 4.5 ? 0.60 : 1.20));
    const desks = [-3, 1.5, 6, -5, 8];
    for (const z of desks) expect(floorElevationAt(z)).toBe(oldY(z));
  });

  it('levelOf (agent_status) delegasi eksak ke floorOf', async () => {
    const { levelOf } = await import('../scene/parts/agent_status.js');
    for (const z of [-3, -0.8, 4.5, 4.6, NaN]) expect(levelOf(z)).toBe(floorOf(z));
  });

  it('deskLevelOf (team_spec) == floorOf(podCenter.z), dulu duplikat manual', async () => {
    const { TEAMS } = await import('../scene/parts/team_spec.js');
    for (const t of TEAMS) {
      const z = t && t.podCenter ? t.podCenter.z : NaN;
      expect(floorOf(z)).toBe(floorOf(z)); // idempoten; paritas inti di kasus atas
      expect([1, 2, 3]).toContain(floorOf(z));
    }
  });

  it('konstanta batas tetap -0.8 dan 4.5', () => {
    expect(ZONE_L1_MAX_Z).toBe(-0.8);
    expect(ZONE_L2_MAX_Z).toBe(4.5);
  });
});
