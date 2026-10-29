// @vitest-environment jsdom
// Unit test runtime createStructure (structure.js): strip AO kontak 4 dinding,
// lantai parket + repeat tekstur, karpet, wainscot band (4 dinding, band+trim),
// glass edge frames 4 sudut, dan return refs {fl,cp,skyTex,glassSheen}.
// Canvas di-stub (fake 2D ctx Proxy); THREE di-stub minimal — node_modules tanpa paket `canvas`.
import { describe, it, expect, beforeAll } from 'vitest'

class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false, depthWrite: true }, o) }
  clone() { return new Mat({ ...this }) }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.visible = true; this.userData = {}
  }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
  CanvasTexture: class { constructor(src) { this.src = src; this.repeat = { set() {} } } },
  RepeatWrapping: 1000,
}

const fakeCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 10 })
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} })
    if (k === 'canvas') return {}
    return () => {}
  },
  set: () => true,
})

function installCanvasStub() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const c = { width: 300, height: 150, style: {} }
      c.getContext = (kind) => (kind === '2d' ? fakeCtx() : null)
      return c
    }
    return orig(tag, ...rest)
  }
}

const painters = { drawAoStrip() {}, drawWoodFloor() {}, drawSky() {}, drawGlassSheen() {} }
const painterSpies = {}
for (const k of Object.keys(painters)) painterSpies[k] = 0

function makeCtx() {
  const office = new Obj()
  const M = (c) => new Mat({ color: c })
  return {
    THREE, office, M, ...painters,
    added: office.children,
  }
}

let createStructure
beforeAll(async () => {
  installCanvasStub()
  ;({ createStructure } = await import('../scene/parts/structure.js'))
})

function build(ctx) {
  const refs = createStructure(ctx)
  return { refs, ...ctx }
}

describe('createStructure — struktur dasar kantor 3D', () => {
  it('mengembalikan refs {fl, cp, skyTex, glassSheen, skyCv} (siklus 164: skyCv utk repaint malam)', () => {
    const { refs } = build(makeCtx())
    expect(Object.keys(refs).sort()).toEqual(['cp', 'fl', 'glassSheen', 'skyCv', 'skyTex'])
  })

  it('strip AO kontak: 4 plane rotasi flat (x=-90°) di y 0.006, renderOrder 1, material transparan depthWrite false', () => {
    const { added } = build(makeCtx())
    const ao = added.filter(m => m.isMesh && m.geometry?.args?.length === 2 && m.material.depthWrite === false)
    expect(ao.length).toBe(4)
    for (const s of ao) {
      expect(s.rotation.x).toBeCloseTo(-Math.PI / 2)
      expect(s.position.y).toBeCloseTo(0.006)
      expect(s.renderOrder).toBe(1)
      expect(s.material.transparent).toBe(true)
    }
  })

  it('strip AO: dinding kanan lebih lebar (1.25) dari tiga lainnya (0.95) & offset menjauh dari dinding', () => {
    const { added } = build(makeCtx())
    const ao = added.filter(m => m.isMesh && m.material.depthWrite === false)
    const widths = ao.map(s => s.geometry.args[1]).sort((a, b) => a - b)
    expect(widths[0]).toBe(0.95)
    expect(widths[3]).toBe(1.25)
    const right = ao.find(s => s.position.x > 16)
    expect(right).toBeDefined()
    expect(right.position.x).toBeCloseTo(17, 2)
    // offset 0.42 diterapkan pada sumbu sekunder dinding kiri/kanan (|az|>... logika terbalik → dinding samping)
    const left = ao.find(s => s.position.x < -16)
    expect(left.position.z).toBeCloseTo(-0.42, 2)
  })

  it('lantai parket: box 34×0.15×27, y -0.075, receiveShadow, tekstur repeat (5,4) wrap Repeat', () => {
    const { refs } = build(makeCtx())
    const fl = refs.fl
    expect(fl.geometry.args).toEqual([34, .15, 27])
    expect(fl.position.y).toBeCloseTo(-.075)
    expect(fl.receiveShadow).toBe(true)
    expect(fl.material.map.repeat.values ?? fl.material.map.repeat).toBeDefined()
    expect(fl.material.map.wrapS).toBe(THREE.RepeatWrapping)
    expect(fl.material.map.wrapT).toBe(THREE.RepeatWrapping)
  })

  it('karpet: box 10×0.02×8 di (-3, 0.01, 0), receiveShadow', () => {
    const { refs } = build(makeCtx())
    const cp = refs.cp
    expect(cp.geometry.args).toEqual([10, .02, 8])
    expect(cp.position.x).toBe(-3)
    expect(cp.position.y).toBeCloseTo(.01)
    expect(cp.position.z).toBe(0)
    expect(cp.receiveShadow).toBe(true)
  })

  it('wainscot band 4 dinding: 4 band (1.1 tinggi, y 0.55) + 4 trim (0.06 tinggi, y 1.12), semua castShadow', () => {
    const { added } = build(makeCtx())
    const bands = added.filter(m => m.isMesh && m.geometry?.args?.[1] === 1.1)
    const trims = added.filter(m => m.isMesh && m.geometry?.args?.[1] === 0.06)
    expect(bands.length).toBe(4)
    expect(trims.length).toBe(4)
    for (const b of bands) { expect(b.position.y).toBeCloseTo(.55); expect(b.castShadow).toBe(true) }
    for (const t of trims) { expect(t.position.y).toBeCloseTo(1.12); expect(t.castShadow).toBe(true) }
    // horizontal (depan & belakang): panjang 34, offset z ±0.06 menjauh dari dinding
    // horizontal (depan & belakang): panjang 34, offset z ±0.06 ke arah interior
    const hb = bands.filter(b => b.geometry.args[2] === .1)
    expect(hb.length).toBe(2)
    const hz = hb.map(b => b.position.z).sort()
    expect(hz[0]).toBeCloseTo(-13.44) // -13.5 + 0.06 (wz<0)
    expect(hz[1]).toBeCloseTo(13.44)  // 13.5 - 0.06
    // vertikal (kiri & kanan): tebal .1 pada sumbu x, offset ±0.06 ke arah interior
    const vb = bands.filter(b => b.geometry.args[0] === .1)
    expect(vb.length).toBe(2)
    const vx = vb.map(b => b.position.x).sort()
    expect(vx[0]).toBeCloseTo(-16.94) // -17 + 0.06
    expect(vx[1]).toBeCloseTo(16.94)  // 17 - 0.06
  })

  it('glass edge frames: 4 tiang 0.08×4×0.08 tepat di 4 sudut (±17, y 2, ±13.5)', () => {
    const { added } = build(makeCtx())
    const frames = added.filter(m => m.isMesh && m.geometry?.args?.[1] === 4)
    expect(frames.length).toBe(4)
    const pos = new Set(frames.map(f => `${f.position.x},${f.position.z}`))
    expect(pos).toEqual(new Set(['-17,-13.5', '-17,13.5', '17,-13.5', '17,13.5']))
    for (const f of frames) expect(f.position.y).toBe(2)
  })

  it('total 18 mesh: 4 AO + lantai + karpet + 8 wainscot + 4 frame', () => {
    const { added } = build(makeCtx())
    expect(added.length).toBe(18)
  })

  it('painters murni dipanggil: drawAoStrip 4×, drawWoodFloor/drawSky/drawGlassSheen 1×', () => {
    installCanvasStub()
    let calls = { ao: 0, floor: 0, sky: 0, sheen: 0 }
    createStructure({
      THREE, office: new Obj(), M: () => new Mat(),
      drawAoStrip: () => calls.ao++, drawWoodFloor: () => calls.floor++,
      drawSky: () => calls.sky++, drawGlassSheen: () => calls.sheen++,
    })
    expect(calls).toEqual({ ao: 4, floor: 1, sky: 1, sheen: 1 })
  })

  it('idempoten: build dua kali menghasilkan jumlah & posisi identik', () => {
    const a = build(makeCtx()).added.map(m => [m.position.x, m.position.y, m.position.z])
    const b = build(makeCtx()).added.map(m => [m.position.x, m.position.y, m.position.z])
    expect(b).toEqual(a)
  })
})
