// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { createTerraces } from '../scene/parts/terraces.js'

class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false }, o) }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.visible = true
  }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, MeshPhysicalMaterial: Mat,
  CanvasTexture: class { constructor(src) { this.src = src } },
}

const fakeCtx = () => ({
  fillStyle: '', font: '', strokeStyle: '', lineWidth: 0,
  fillRect() {}, stroke() {}, fill() {}, roundRect() {}, rect() {},
  fillText() {},
})

beforeAll(() => {
  const orig = document.createElement.bind(document)
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const c = { width: 300, height: 150, style: {} }
      c.getContext = () => fakeCtx()
      return c
    }
    return orig(tag, ...rest)
  }
})

describe('createTerraces — struktur 3 lantai bertingkat & tangga', () => {
  it('berhasil membuat platform Lantai 2, Lantai 3, dan tangga penghubung', () => {
    const office = new Obj()
    const M = (c) => new Mat({ color: c })
    const MB = (c) => new Mat({ color: c })

    const res = createTerraces({ THREE, office, M, MB })
    expect(res.L2_Y).toBe(0.22)
    expect(res.L3_Y).toBe(0.44)
    expect(office.children).toContain(res.terraces)
    expect(res.terraces.children.length).toBeGreaterThan(10)
  })
})
