// @vitest-environment jsdom
// Unit test runtime createWalls (walls.js): 4 dinding + tiang + jendela sky-view,
// koleksi fade (wallDefs/collect), pengecualian __keep & papan proyek, dan
// window.__wallFade/__wallState — kantor 3D.
// node_modules TANPA paket `canvas` → document.createElement('canvas') di-stub
// memakai fake canvas dgn 2D context Proxy no-op; THREE di-stub minimal.
import { describe, it, expect, beforeAll } from 'vitest'

class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false }, o) }
  clone() { return new Mat({ ...this }) }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.visible = true; this.userData = {}
  }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
class PointLight extends Obj { constructor() { super(); this.isPointLight = true } }
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, PointLight,
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

function makeCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c) => { matLog.push(c); return new Mat({ color: c }) }
  const fl = new Mesh(new Geom(26, .15, 20), new Mat())
  const ceil = new Mesh(new Geom(26, .1, 20), new Mat())
  const skyWinMats = []
  return {
    THREE, office, M, matLog, fl, ceil, skyWinMats,
    skyTex: new THREE.CanvasTexture('sky'),
    glassSheen: new THREE.CanvasTexture('sheen'),
    added: office.children,
  }
}

let createWalls
beforeAll(async () => {
  installCanvasStub()
  ;({ createWalls } = await import('../scene/parts/walls.js'))
})

function build(ctx) {
  const refs = createWalls(ctx)
  return { refs, ...ctx }
}

describe('createWalls — struktur dinding kantor 3D', () => {
  it('mengembalikan wallDefs 4 sisi dgn daftar objek & fungsi out per sisi', () => {
    const { refs } = build(makeCtx())
    expect(Object.keys(refs.wallDefs).sort()).toEqual(['back', 'front', 'left', 'right'])
    for (const k of Object.keys(refs.wallDefs)) {
      expect(typeof refs.wallDefs[k].out).toBe('function')
      expect(Array.isArray(refs.wallDefs[k].objs)).toBe(true)
    }
  })
  it('dinding depan & kanan solid: 5 tiang + shell di masing-masing', () => {
    const { refs } = build(makeCtx())
    expect(refs.wallDefs.front.objs.length).toBeGreaterThanOrEqual(10) // 5 shell + 5 tiang
    expect(refs.wallDefs.right.objs.length).toBeGreaterThanOrEqual(5)
  })
  it('jendela sky-view mendaftar materialnya ke skyWinMats (mode neon malam)', () => {
    const ctx = makeCtx()
    build(ctx)
    // 4 (depan) + 3 (kanan) + 2 (belakang) + 2 (kiri) = 11 jendela
    expect(ctx.skyWinMats.length).toBe(11)
  })
  it('papan proyek + bingkai (__keep) & lantai/ceiling tidak ikut dikoleksi fade', () => {
    const ctx = makeCtx()
    const { refs } = build(ctx)
    const board = new Mesh(new Geom(1, 1, 1), new Mat())
    board.position.set(-8.6, 2.6, 9.3)
    window.__projectBoard = board
    ctx.office.add(board)
    refs.wallDefs // collect terjadi via __wallFade
    window.__wallFade({ x: 0, y: 2, z: 0 })
    const back = refs.wallDefs.back.objs
    expect(back).not.toContain(board)
    expect(back).not.toContain(ctx.fl)
    expect(back).not.toContain(ctx.ceil)
    delete window.__projectBoard
  })
  it('objek menempel dinding belakang/kiri ikut dikoleksi; material di-clone jadi transparan', () => {
    const ctx = makeCtx()
    build(ctx)
    const poster = new Mesh(new Geom(1, 1, 1), new Mat())
    poster.position.set(2, 1.5, 9.5)
    ctx.office.add(poster)
    window.__wallFade({ x: 0, y: 2, z: 0 })
    
    expect(poster.material.transparent).toBe(true)
    expect(poster.userData.__fm).toBe(1)
  })
  it('__wallFade mengisi window.__wallLast & __wallState membaca nilai yang sama', () => {
    const ctx = makeCtx()
    build(ctx)
    const r1 = window.__wallFade({ x: 0, y: 2, z: 0 })
    expect(window.__wallLast).toBe(r1)
    expect(window.__wallState()).toBe(r1)
    expect(r1.cam).toEqual([0, 2, 0])
    // kamera di dalam: dinding solid
    expect(r1.front).toBe(1)
  })
  it('fade dinding depan: kamera di luar (z<-9.5) → opacity 0 & hidden', () => {
    const ctx = makeCtx()
    const { refs } = build(ctx)
    window.__wallFade({ x: 0, y: 2, z: -30 })
    const m = refs.wallDefs.front.objs[0]
    expect(m.visible).toBe(false)
  })
  it('lampu sorot logo (PointLight) ditambahkan ke scene', () => {
    const { added } = build(makeCtx())
    expect(added.some((o) => o.isPointLight)).toBe(true)
  })
  it('setelah collect, window.__corners berisi tiang sudut 4 kombinasi ±12.5/±9.5', () => {
    const ctx = makeCtx()
    build(ctx)
    window.__wallFade({ x: 0, y: 2, z: 0 })
    const corners = window.__corners
    expect(corners.length).toBe(4)
    for (const c of corners) {
      expect(Math.abs(Math.abs(c.position.x) - 12.5)).toBeLessThan(0.1)
      expect(Math.abs(Math.abs(c.position.z) - 9.5)).toBeLessThan(0.1)
    }
  })
  it('collect hanya sekali: panggilan __wallFade berikutnya tidak menduplikasi objek fade', () => {
    const ctx = makeCtx()
    const { refs } = build(ctx)
    const poster = new Mesh(new Geom(1, 1, 1), new Mat())
    poster.position.set(2, 1.5, 9.5)
    ctx.office.add(poster)
    window.__wallFade({ x: 0, y: 2, z: 0 })
    const n1 = refs.wallDefs.back.objs.length
    window.__wallFade({ x: 0, y: 2, z: -30 })
    expect(refs.wallDefs.back.objs.length).toBe(n1)
    expect(refs.collected).toBe(true)
  })
})
