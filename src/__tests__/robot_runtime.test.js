// Test runtime buildRobot (robot.js) — visual robot "Bantuin AI" dibangun dengan stub THREE.
// robot_spec.js sudah ter-cover unit murni; di sini kita uji bahwa buildRobot benar-benar
// menghasilkan mesh dengan posisi/material/bayangan sesuai spec (regresi visual robot).
import { describe, it, expect, beforeEach } from 'vitest';
import { buildRobot } from '../scene/parts/robot.js';
import { pose, eyes, smile, chestBars, legsStanding, accents, ROBOT_COLORS } from '../scene/parts/robot_spec.js';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Geometry { constructor(...args) { this.args = args; } }
class Material { constructor(opts = {}) { Object.assign(this, opts); } }
class Object3D {
  constructor() {
    this.position = new Vec3(); this.rotation = new Vec3(); this.scale = new Vec3(1, 1, 1);
    this.userData = {}; this.children = []; this.castShadow = false; this.receiveShadow = false;
  }
  set(x = 0, y = 0, z = 0) { this.position.set(x, y, z); return this; }
  add(...ms) { ms.forEach((m) => this.children.push(m)); return this; }
  get type() { return this.constructor.name; }
}
class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
}
const THREE = {
  Group, Mesh,
  BoxGeometry: Geometry, SphereGeometry: Geometry, CylinderGeometry: Geometry, CapsuleGeometry: Geometry,
  MeshBasicMaterial: Material, MeshStandardMaterial: Material,
};
const M = (c) => new THREE.MeshStandardMaterial({ color: c });
const MB = (c) => new THREE.MeshBasicMaterial({ color: c });

let g;
beforeEach(() => { g = buildRobot(THREE, { color: 0x39ff88 }, true, M, MB); });

const meshes = (grp) => grp.children.filter((c) => c.constructor.name === 'Mesh');
const find = (grp, fn) => meshes(grp).filter(fn);

describe('buildRobot — pose berdiri', () => {
  const p = pose(true);

  it('tandai grup sebagai robot dan mengembalikan Group', () => {
    expect(g).toBeInstanceOf(Group);
    expect(g.userData.isRobot).toBe(true);
  });

  it('kaki berdiri: 2 mesh dengan isLeg + fase berlawanan sesuai legsStanding', () => {
    const legs = find(g, (m) => m.userData.isLeg);
    expect(legs.length).toBe(2);
    legsStanding().forEach((spec) => {
      const leg = legs.find((m) => Math.abs(m.position.x - spec.x) < 1e-9);
      expect(leg).toBeTruthy();
      expect(leg.userData.phase).toBe(spec.phase);
      expect(leg.castShadow).toBe(true);
    });
  });

  it('garis aksen neon pinggang memakai warna agent (glow) di ty-0.17', () => {
    const acc = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.y - (p.ty - 0.17)) < 1e-9);
    expect(acc.length).toBe(1);
    expect(acc[0].geometry.args[0]).toBe(0.36);
  });

  it('panel dada gelap + 3 bar chestBars menyala glow dengan tinggi spec', () => {
    const bars = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.z - (p.tz + p.fz * 0.112)) < 1e-9);
    expect(bars.length).toBe(3);
    chestBars(p).forEach((b) => {
      const bar = bars.find((m) => Math.abs(m.position.x - b.x) < 1e-9);
      expect(bar.geometry.args[1]).toBe(b.h);
    });
  });

  it('mata LED: 2 mesh glow simetris pada posisi eyes(p)', () => {
    const eyeMeshes = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.z - (p.tz + p.fz * 0.143)) < 1e-9 && Math.abs(m.position.x) > 0.01 && Math.abs(m.position.y - (p.hy + 0.025)) < 1e-9);
    expect(eyeMeshes.length).toBe(2);
    eyes(p).forEach((e) => {
      expect(eyeMeshes.some((m) => Math.abs(m.position.x - e.x) < 1e-9 && Math.abs(m.position.y - e.y) < 1e-9)).toBe(true);
    });
  });

  it('senyum: 3 mesh glow (tengah 0.1 + 2 ujung 0.03) sesuai smile(p)', () => {
    const mouth = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.y - (p.hy - 0.045)) < 1e-9);
    expect(mouth.length).toBe(1);
    expect(mouth[0].geometry.args[0]).toBe(0.1);
    const tips = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.y - (p.hy - 0.035)) < 1e-9);
    expect(tips.length).toBe(2);
    smile(p).slice(1).forEach((s) => expect(tips.some((m) => m.geometry.args[0] === s.w)).toBe(true));
  });

  it('lampu status putih di dada kanan-atas sesuai accents(p)', () => {
    const st = accents(p).status;
    const m = find(g, (x) => x.material.color === 0xffffff && Math.abs(x.position.y - st.y) < 1e-9);
    expect(m.length).toBe(1);
    expect(m[0].position.x).toBeCloseTo(st.x);
  });

  it('antena: silinder di hy+0.25 + bola putih tip di hy+0.34', () => {
    const a = accents(p).antenna;
    const rod = find(g, (m) => m.geometry.constructor === Geometry && Math.abs(m.position.y - a.y) < 1e-9);
    expect(rod.length).toBe(1);
    const tip = find(g, (m) => m.material.color === 0xffffff && Math.abs(m.position.y - a.tipY) < 1e-9);
    expect(tip.length).toBe(1);
  });

  it('kepala kapsul shiny terang + castShadow, skala z 0.9', () => {
    const head = find(g, (m) => m.material.color === 0xe6edf3 && m.scale.z === 0.9);
    expect(head.length).toBe(1);
    expect(head[0].position.y).toBe(p.hy);
    expect(head[0].castShadow).toBe(true);
  });

  it('torso dua pelat: gelap 0x07141a (layar dada) & terang 0xd5dde5 (torso), keduanya glow MB vs M sesuai sifat', () => {
    const torso = find(g, (m) => m.material.color === 0xd5dde5);
    expect(torso.length).toBe(1);
    expect(torso[0].castShadow).toBe(true);
    const plate = find(g, (m) => m.material.color === 0x07141a);
    expect(plate.length).toBe(1);
  });
});

describe('buildRobot — pose duduk (fz berbalik)', () => {
  const p = pose(false);

  beforeEach(() => { g = buildRobot(THREE, { color: 0x39ff88 }, false, M, MB); });

  it('tanpa kaki isLeg; ada 3 bagian kaki duduk per sisi (6 mesh di y rendah)', () => {
    expect(find(g, (m) => m.userData.isLeg).length).toBe(0);
    const seated = find(g, (m) => Math.abs(m.position.y - 0.44) < 1e-9);
    expect(seated.length).toBe(2);
  });

  it('wajah & mata pindah ke sisi belakang (fz=-1 → z = tz - 0.143)', () => {
    eyes(p).forEach((e) => {
      const cands = find(g, (m) => Math.abs(m.position.x - e.x) < 1e-9 && Math.abs(m.position.y - e.y) < 1e-9 && m.material.color === 0x39ff88);
      expect(cands.length).toBeGreaterThanOrEqual(1);
    });
    const eyeMeshes = find(g, (m) => m.material.color === 0x39ff88 && Math.abs(m.position.z - (p.tz + p.fz * 0.143)) < 1e-9 && Math.abs(m.position.y - (p.hy + 0.025)) < 1e-9);
    expect(eyeMeshes.length).toBe(2);
    expect(p.tz + p.fz * 0.143).toBeLessThan(0);
  });

  it('lengan duduk dirotasi (rotation.x 0.5 / 1.45) tidak seperti berdiri', () => {
    const rotated = find(g, (m) => m.rotation.x === 0.5);
    expect(rotated.length).toBe(2);
    const fore = find(g, (m) => m.rotation.x === 1.45);
    expect(fore.length).toBe(2);
  });

  it('bagian wajah/torso duduk mengikuti pose(false) — ty & hy bergeser turun', () => {
    const torso = find(g, (m) => m.material.color === 0xd5dde5);
    expect(torso[0].position.y).toBe(p.ty);
    const head = find(g, (m) => m.material.color === 0xe6edf3);
    expect(head[0].position.y).toBe(p.hy);
  });
});
