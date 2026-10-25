// @vitest-environment jsdom
// Unit test runtime addDeskTrinkets (effects.js): detail meja — tanaman mini
// (pot + daun) di meja ber-indeks genap, keyboard + headphone di meja genap
// dengan indeks < 8. THREE di-stub minimal; asersi via mesh yang di-add ke
// office. Data meja pakai DESKS asli dari desk_layout.js.
import { describe, it, expect, beforeEach } from 'vitest'
import { DESKS } from '../scene/parts/desk_layout.js'

class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o = {}) { Object.assign(this, { color: 0, opacity: 1 }, o) } }
class Obj {
  constructor() {
    this.children = []
    this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = {}
    this.visible = true
  }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}

async function build() {
  const office = new Obj()
  const ctx = {
    THREE: { Mesh, BoxGeometry: Geom },
    office,
    M: (c) => new Mat({ color: c }),
    rng: { r: (a, b) => a + (b - a) / 2 }, // deterministik: titik tengah
  }
  const { addDeskTrinkets } = await import('../scene/parts/effects.js')
  addDeskTrinkets(ctx, DESKS)
  return office.children
}

describe('addDeskTrinkets — detail meja (tanaman & keyboard/headphone)', () => {
  let added
  beforeEach(async () => { added = await build() })

  it('total mesh sesuai pola: genap → tanaman; genap <8 → + keyboard/headphone', () => {
    const evenUnder8 = DESKS.filter((_, i) => i % 2 === 0 && i < 8).length // 4
    const evenAll = DESKS.filter((_, i) => i % 2 === 0).length               // 7
    const expected = evenAll * 3 + evenUnder8 * 3 // pot+2daun + keyboard+2cup
    expect(added.length).toBe(expected)
    expect(evenUnder8).toBe(4)
    expect(evenAll).toBe(7)
  })

  it('pot tanaman: 7 box 0.09 di (d.x-0.55, 0.8, d.z+0.2) warna 0xc4b5ae', () => {
    const pots = added.filter((m) => m.material.color === 0xc4b5ae)
    expect(pots.length).toBe(7)
    for (const m of pots) expect(m.geometry.args).toEqual([0.09, 0.09, 0.09])
    const deskList = DESKS.filter((_, i) => i % 2 === 0)
    pots.forEach((m, i) => {
      expect(m.position.x).toBeCloseTo(deskList[i].x - 0.55)
      expect(m.position.y).toBe(0.8)
      expect(m.position.z).toBeCloseTo(deskList[i].z + 0.2)
    })
  })

  it('daun: 2 per meja genap (14), tinggi rng midpoint 0.13, warna 0x57a85b', () => {
    const leaves = added.filter((m) => m.material.color === 0x57a85b)
    expect(leaves.length).toBe(14)
    const deskList = DESKS.filter((_, i) => i % 2 === 0)
    leaves.forEach((m, i) => {
      const d = deskList[Math.floor(i / 2)]
      expect(m.geometry.args[0]).toBe(0.06)
      expect(m.geometry.args[1]).toBeCloseTo(0.13) // 0.1 + rng.r(0,0.06)
      expect(m.geometry.args[2]).toBe(0.06)
      expect([0.88, 0.95]).toContain(m.position.y)
      expect(m.position.x).toBeCloseTo(d.x - 0.55) // rng.r(-0.02,0.02)=0
      expect(m.position.z).toBeCloseTo(d.z + 0.2)
    })
  })

  it('keyboard: 4 (genap <8) box 0.22×0.03×0.16 warna 0x2f3236, rotasi z 0.15', () => {
    const kbs = added.filter((m) => m.material.color === 0x2f3236)
    expect(kbs.length).toBe(4)
    for (const m of kbs) {
      expect(m.geometry.args).toEqual([0.22, 0.03, 0.16])
      expect(m.rotation.z).toBe(0.15)
      expect(m.position.y).toBe(0.82)
    }
  })

  it('cup headphone: 8 (2 per keyboard), warna 0x1d1f22, x = d.x-0.5 ± 0.11', () => {
    const cups = added.filter((m) => m.material.color === 0x1d1f22)
    expect(cups.length).toBe(8)
    const evenUnder8 = DESKS.filter((_, i) => i % 2 === 0 && i < 8)
    cups.forEach((m, i) => {
      const d = evenUnder8[Math.floor(i / 2)]
      expect(m.position.x).toBeCloseTo(d.x - 0.5 + (i % 2 === 0 ? -0.11 : 0.11))
      expect(m.position.z).toBeCloseTo(d.z - 0.1)
    })
  })
})
