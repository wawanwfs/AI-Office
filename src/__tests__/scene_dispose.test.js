// disposeSceneGraph (parts/scene_dispose.js) — pelepasan graph scene 3D
// (siklus 124: dulu destroy hanya melepas konteks GPU via forceContextLoss;
// geometri/material/tekstur tidak pernah di-dispose → pelepasan menunggu GC).
import { describe, it, expect } from 'vitest';
import { disposeSceneGraph } from '../scene/parts/scene_dispose.js';

// Fake node graph: root.traverse mengunjungi diri + seluruh keturunan.
function node(props = {}, children = []) {
  const n = { ...props, children };
  n.traverse = (cb) => { cb(n); children.forEach((c) => c.traverse(cb)); };
  return n;
}
function fakeGeo() { return { dispose() { this.n = (this.n || 0) + 1; } }; }
function fakeMat(tex = {}) { return { dispose() { this.n = (this.n || 0) + 1; }, ...tex }; }
function fakeTex() { return { isTexture: true, dispose() { this.n = (this.n || 0) + 1; } }; }

describe('disposeSceneGraph — pengumpulan & dispose', () => {
  it('me-dispose semua geometri/material/tekstur persis 1× per objek unik', () => {
    const g1 = fakeGeo(), m1 = fakeMat(), t1 = fakeTex();
    m1.map = t1;
    const meshA = node({ geometry: g1, material: m1 });
    const meshB = node({ geometry: g1, material: m1 }); // dipakai bersama
    const root = node({}, [meshA, meshB]);
    const r = disposeSceneGraph(root);
    expect(r).toEqual({ geometries: 1, materials: 1, textures: 1 });
    expect(g1.n).toBe(1); expect(m1.n).toBe(1); expect(t1.n).toBe(1);
  });

  it('material array (multi-material) & banyak slot tekstur ikut terkumpul', () => {
    const g = fakeGeo();
    const tMap = fakeTex(), tEmi = fakeTex(), tAlpha = fakeTex();
    const mA = fakeMat(); mA.map = tMap;
    const mB = fakeMat(); mB.emissiveMap = tEmi; mB.alphaMap = tAlpha;
    const mesh = node({ geometry: g, material: [mA, mB] });
    const r = disposeSceneGraph(node({}, [mesh]));
    expect(r.geometries).toBe(1);
    expect(r.materials).toBe(2);
    expect(r.textures).toBe(3);
    expect(tMap.n).toBe(1); expect(tEmi.n).toBe(1); expect(tAlpha.n).toBe(1);
  });

  it('node tanpa geometri/material (Group, Light) diabaikan tanpa error', () => {
    const r = disposeSceneGraph(node({}, [node(), node({ children: [node()] })]));
    expect(r).toEqual({ geometries: 0, materials: 0, textures: 0 });
  });

  it('entri korup diabaikan: material tanpa dispose, tekstur tanpa isTexture, nilai non-objek', () => {
    const g = fakeGeo();
    const badMat = { map: fakeTex() }; // tanpa dispose
    const noTexMat = fakeMat(); noTexMat.map = { color: 0x123 }; // bukan tekstur
    noTexMat.scalar = 5; noTexMat.str = 'x';
    const mesh = node({ geometry: g, material: [badMat, noTexMat] });
    const r = disposeSceneGraph(node({}, [mesh]));
    expect(r.geometries).toBe(1);
    expect(r.materials).toBe(1); // hanya noTexMat (punya dispose)
    expect(r.textures).toBe(0);  // map badMat tak terjangkau (material skip)
    expect(g.n).toBe(1);
  });

  it('null-safe: root null / tanpa traverse / bukan objek → hitungan nol', () => {
    expect(disposeSceneGraph(null)).toEqual({ geometries: 0, materials: 0, textures: 0 });
    expect(disposeSceneGraph(undefined)).toEqual({ geometries: 0, materials: 0, textures: 0 });
    expect(disposeSceneGraph(42)).toEqual({ geometries: 0, materials: 0, textures: 0 });
    expect(disposeSceneGraph({})).toEqual({ geometries: 0, materials: 0, textures: 0 });
  });

  it('traverse yang melempar tidak merusak pemanggil (hitungan parsial)', () => {
    const g = fakeGeo();
    const bad = { traverse() { throw new Error('korup'); } };
    const root = node({}, [node({ geometry: g }), bad]);
    let r = { geometries: 0, materials: 0, textures: 0 };
    expect(() => { r = disposeSceneGraph(root); }).not.toThrow();
    expect(r.geometries).toBeGreaterThanOrEqual(0);
  });
});
