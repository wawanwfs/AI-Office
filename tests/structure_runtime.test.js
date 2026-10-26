import { describe, it, expect, vi, beforeEach } from 'vitest';
/** @vitest-environment jsdom */
import { createStructure } from '../src/scene/parts/structure.js';

// jsdom canvas.getContext('2d') tidak tersedia → stub global yang mengembalikan
// ctx palsu dgn method minimal yang dipakai painter (diuji hanya dipanggil).
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'canvas' ? null : (typeof k === 'string' ? () => {} : undefined)) });
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
  });
});

// THREE stub minimal ala test runtime lain (jsdom menyediakan canvas 2d)
class Obj {
  constructor(...args) {
    this.args = args; this.children = [];
    const pos = { px: 0, py: 0, pz: 0, x: 0, y: 0, z: 0 };
    pos.set = (x, y, z) => { pos.px = x; pos.py = y; pos.pz = z; pos.x = x; pos.y = y; pos.z = z; };
    this.position = pos;
    this.rotation = { x: 0, y: 0, z: 0 };
  }
  add(c) { this.children.push(c); }
  clone() { return Object.create(Object.getPrototypeOf(this)); }
}
class Mesh extends Obj { constructor(geo, mat) { super(geo, mat); this.isMesh = true; } }
class Group extends Obj { constructor() { super(); this.isGroup = true; } }
class Light extends Obj { constructor(...a) { super(); this.lightArgs = a; this.isPointLight = true; } }

function makeTHREE() {
  return {
    Mesh: Mesh,
    Group: Group,
    MeshBasicMaterial: class { constructor(o) { this.o = o; this.isMeshBasicMaterial = true; } },
    MeshLambertMaterial: class { constructor(o) { this.o = o; } },
    CanvasTexture: class { constructor(c) { const r = { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } }; this.canvas = c; this.repeat = r; } },
    BoxGeometry: class { constructor(w, h, d) { this.dims = [w, h, d]; } },
    PlaneGeometry: class { constructor(w, h) { this.dims = [w, h]; } },
    RepeatWrapping: 1000,
    PointLight: Light,
  };
}

const calls = { ao: 0, floor: 0, sky: 0, sheen: 0 };
const painters = {
  drawAoStrip: () => calls.ao++,
  drawWoodFloor: () => calls.floor++,
  drawSky: () => calls.sky++,
  drawGlassSheen: () => calls.sheen++,
};

function build() {
  const THREE = makeTHREE();
  const office = new Group();
  const M = (c) => ({ color: c, lambert: true });
  const refs = createStructure({ THREE, office, M, ...painters });
  return { THREE, office, refs, M };
}

beforeEach(() => { calls.ao = calls.floor = calls.sky = calls.sheen = 0; });

describe('parts/structure.js — createStructure', () => {
  it('mengembalikan referensi lengkap { fl, cp, skyTex, glassSheen }', () => {
    const { refs } = build();
    expect(refs.fl).toBeTruthy();
    expect(refs.cp).toBeTruthy();
    expect(refs.skyTex).toBeTruthy();
    expect(refs.glassSheen).toBeTruthy();
  });

  it('painter dipanggil: 4× AO strip (1 per dinding), lantai, sky, sheen masing-masing 1×', () => {
    build();
    expect(calls.ao).toBe(4);
    expect(calls.floor).toBe(1);
    expect(calls.sky).toBe(1);
    expect(calls.sheen).toBe(1);
  });

  it('4 strip AO di lantai: plane 33.4×0.95 / 26.4 (kanan 1.25), rot x=-π/2, y=0.006, renderOrder 1', () => {
    const { office } = build();
    const ao = office.children.filter(m => m.isMesh && m.position.y === 0.006);
    expect(ao.length).toBe(4);
    expect(ao[0].args[0].dims).toEqual([33.4, 0.95]);
    expect(ao[0].rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(ao[0].renderOrder).toBe(1);
    const right = ao.find(m => Math.abs(m.position.px - 17) < 0.01);
    expect(right.args[0].dims).toEqual([26.4, 1.25]);
  });

  it('lantai parket Box 34×0.15×27 di y=-0.075 receiveShadow, tekstur repeat (5,4)', () => {
    const { refs } = build();
    expect(refs.fl.args[0].dims).toEqual([34, 0.15, 27]);
    expect(refs.fl.position.y).toBe(-0.075);
    expect(refs.fl.receiveShadow).toBe(true);
    expect(refs.fl.args[1].o.map.repeat.x).toBe(5);
    expect(refs.fl.args[1].o.map.repeat.y).toBe(4);
    expect(refs.fl.args[1].o.map.wrapS).toBe(1000);
  });

  it('karpet Box 10×0.02×8 0xD0D8E0 di (-3,0.01,0) receiveShadow', () => {
    const { refs, M } = build();
    expect(refs.cp.args[0].dims).toEqual([10, 0.02, 8]);
    expect(refs.cp.args[1].color).toBe(0xD0D8E0);
    expect(M(refs.cp.args[1].color).lambert).toBe(true);
    expect(refs.cp.position.px).toBe(-3); expect(refs.cp.position.y).toBe(0.01);
    expect(refs.cp.receiveShadow).toBe(true);
  });

  it('4 wainscot band + 4 trim dengan warna & posisi tepat', () => {
    const { office } = build();
    const bands = office.children.filter(m => m.isMesh && m.args[1] && m.args[1].color === 0xEFE9DD);
    const trims = office.children.filter(m => m.isMesh && m.args[1] && m.args[1].color === 0xC9BFA8);
    expect(bands.length).toBe(4);
    expect(trims.length).toBe(4);
    // band horizontal belakang
    const back = bands.find(m => m.args[0].dims[0] === 34 && Math.abs(m.position.pz + 13.44) < 0.001);
    expect(back).toBeTruthy();
    expect(back.args[0].dims).toEqual([34, 1.1, 0.1]);
    expect(back.position.y).toBe(0.55);
    expect(back.castShadow).toBe(true);
    // trim horizontal
    const trimBack = trims.find(m => m.args[0].dims[0] === 34);
    expect(trimBack.args[0].dims).toEqual([34, 0.06, 0.14]);
    expect(trimBack.position.y).toBe(1.12);
    // band vertikal kiri
    const left = bands.find(m => m.args[0].dims[0] === 0.1);
    expect(left.position.px).toBe(-16.94);
    expect(left.args[0].dims).toEqual([0.1, 1.1, 27]);
  });

  it('tekstur sky & sheen dari canvas 256×128, painter menerima ctx', () => {
    const { refs } = build();
    expect(refs.skyTex.canvas.width).toBe(256);
    expect(refs.skyTex.canvas.height).toBe(128);
    expect(refs.glassSheen.canvas.width).toBe(256);
  });

  it('4 glass edge frame 0.08×4×0.08 0xAABBCC di sudut (±17, y=2, ±13.5)', () => {
    const { office } = build();
    const frames = office.children.filter(m => m.isMesh && m.args[1] && m.args[1].color === 0xAABBCC);
    expect(frames.length).toBe(4);
    frames.forEach(f => {
      expect(f.args[0].dims).toEqual([0.08, 4, 0.08]);
      expect(f.position.y).toBe(2);
    });
    expect(frames.map(f => `${f.position.px},${f.position.pz}`).sort()).toEqual(
      ['-17,-13.5', '-17,13.5', '17,-13.5', '17,13.5'].sort());
  });

  it('semua objek di-add ke office (4 AO + fl + cp + 8 wainscot + 4 frame = 18)', () => {
    const { office } = build();
    expect(office.children.length).toBe(18);
  });

  it('dua pemanggilan tidak share tekstur/mesh', () => {
    const a = build();
    const b = build();
    expect(a.refs.fl).not.toBe(b.refs.fl);
    expect(a.refs.skyTex).not.toBe(b.refs.skyTex);
    expect(a.office.children[0]).not.toBe(b.office.children[0]);
  });
});
