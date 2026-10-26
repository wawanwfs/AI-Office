// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { createTerraces } from '../scene/parts/terraces.js'

class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) {
    const col = o.color !== undefined ? o.color : 0
    this.opacity = o.opacity !== undefined ? o.opacity : 1
    this.transparent = !!o.transparent
    this.color = { set: (c) => { this._c = c } }
    this.color.set(col)
  }
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
class Light extends Obj {
  constructor(c, intensity) {
    super()
    this.color = { set: (v) => { this._c = v } }
    this.intensity = intensity
  }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom, SphereGeometry: Geom, PointLight: Light,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, MeshPhysicalMaterial: Mat,
  CanvasTexture: class { constructor(src) { this.src = src; this.repeat = { set() {} } } },
}

const fakeCtx = () => ({
  fillStyle: '', font: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
  fillRect() {}, stroke() {}, fill() {}, roundRect() {}, rect() {},
  fillText() {}, beginPath() {}, ellipse() {}, moveTo() {}, lineTo() {},
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
    expect(res.L2_Y).toBe(0.60)
    expect(res.L3_Y).toBe(1.20)
    expect(office.children).toContain(res.terraces)
    expect(res.terraces.children.length).toBeGreaterThan(10)

    // Pengujian sinkronisasi mode Gelap dan Terang
    expect(typeof res.setMode).toBe('function')
    res.setMode(true) // Mode Gelap
    expect(res.l1Deck.material._c).toBe(0x162236)
    expect(res.l2Deck.material._c).toBe(0x182842)
    expect(res.l3Deck.material._c).toBe(0x121E30)

    res.setMode(false) // Mode Terang
    expect(res.l1Deck.material._c).toBe(0xF1F5F9)
    expect(res.l2Deck.material._c).toBe(0xE2E8F0)
    expect(res.l3Deck.material._c).toBe(0xCBD5E1)
  })
})
