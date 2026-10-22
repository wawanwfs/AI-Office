// @vitest-environment jsdom
// Unit test runtime createServerRoom (serverroom.js): 3 rak server dgn LED
// berkedip (72 LED), lampu cyan, bulb, kabel bundel, water cooler — kantor 3D.
// node_modules TANPA paket `canvas`; THREE di-stub minimal, asersi via mesh.
import { describe, it, expect } from 'vitest'

class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false }, o) } }
class Obj {
  constructor() {
    this.children = []
    this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = {}; this.visible = true; this.castShadow = false
  }
  add(o) { this.children.push(o) }
  traverse(fn) { this.children.forEach(fn) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
class PointLight extends Obj {
  constructor(c, i, d, dec) { super(); this.color = c; this.intensity = i; this.distance = d; this.decay = dec; this.isPointLight = true }
}
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, CylinderGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, PointLight,
}

function makeCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c, o) => { matLog.push(c); return new Mat({ color: c, ...o }) }
  const MB = (c) => { matLog.push(c); return new Mat({ color: c }) }
  return { THREE, office, M, MB, matLog, added: office.children }
}

async function build(ctx) {
  const { createServerRoom } = await import('../scene/parts/serverroom.js')
  return { refs: createServerRoom(ctx), ...ctx }
}

describe('createServerRoom — server room + water cooler kantor 3D', () => {
  it('mengembalikan referensi lengkap: leds, 3 racks, light, bulb, cable, cooler', async () => {
    const { refs } = await build(makeCtx())
    expect(refs.leds).toHaveLength(72)
    expect(refs.racks).toHaveLength(3)
    expect(refs.light).toBeInstanceOf(PointLight)
    expect(refs.bulb).toBeInstanceOf(Mesh)
    expect(refs.cable).toBeInstanceOf(Mesh)
    expect(refs.cooler).toBeInstanceOf(Obj)
  })

  it('office menerima tepat 7 objek (3 rack + light + bulb + cable + cooler)', async () => {
    const { added } = await build(makeCtx())
    expect(added.length).toBe(7)
  })

  it('rack: body 0x2E3244 0.9×2.1×0.7 y=1.05 castShadow + 2 edge cyan 0x00E5FF + 8 unit 0x3A3F55 + 24 LED per rack', async () => {
    const { refs } = await build(makeCtx())
    const r0 = refs.racks[0]
    // anak-anak rack: 1 body + 2 edge + (8 unit + 24 led) = 35
    expect(r0.children.length).toBe(1 + 2 + 8 + 24)
    const body = r0.children[0]
    expect(body.geometry.args).toEqual([0.9, 2.1, 0.7])
    expect(body.material.color).toBe(0x2E3244)
    expect(body.position.y).toBe(1.05)
    expect(body.castShadow).toBe(true)
    // dua edge strip cyan di sisi kiri/kanan depan
    const edges = r0.children.filter((c) => c.material.color === 0x00E5FF)
    expect(edges.map((e) => e.position.x).sort()).toEqual([-0.46, 0.46])
    expect(edges[0].geometry.args).toEqual([0.05, 2.06, 0.03])
    expect(edges[0].position.z).toBeCloseTo(0.365)
    // 8 unit server bertumpuk +0.23
    const units = r0.children.filter((c) => c.material.color === 0x3A3F55)
    expect(units).toHaveLength(8)
    units.forEach((u, i) => expect(u.position.y).toBeCloseTo(0.25 + i * 0.23))
    // LED: warna siklus hijau/kuning/biru, posisi depan muka
    const ledMeshes = r0.children.filter((c) => [0x00E676, 0xFFC107, 0x2979FF].includes(c.material.color))
    expect(ledMeshes).toHaveLength(24)
    expect(ledMeshes[0].material.color).toBe(0x00E676)
    expect(ledMeshes[1].material.color).toBe(0xFFC107)
    expect(ledMeshes[2].material.color).toBe(0x2979FF)
    expect(ledMeshes[3].material.color).toBe(0x00E676)
    expect(ledMeshes[0].position.x).toBeCloseTo(-0.22)
    expect(ledMeshes[1].position.x).toBeCloseTo(-0.04)
    expect(ledMeshes[2].position.x).toBeCloseTo(0.14)
    expect(ledMeshes[0].position.z).toBeCloseTo(0.375)
    expect(ledMeshes[0].material.transparent).toBe(true)
  })

  it('rack diposisikan di x=1.7/2.8/3.9, z=-7.6, castShadow di-traverse ke mesh non-basic', async () => {
    const { refs } = await build(makeCtx())
    expect(refs.racks.map((r) => r.position.x)).toEqual([1.7, 2.8, 3.9])
    refs.racks.forEach((r) => {
      expect(r.position.z).toBe(-7.6)
      // body (Lambert) diberi castShadow via traverse
      const body = r.children[0]
      expect(body.castShadow).toBe(true)
      // edge (Basic) — stub Mat tidak punya isMeshBasicMaterial sehingga traverse
      // stub menandai semua mesh; asersi tepat cukup pada body Lambert (di atas).
    })
  })

  it('lampu server room: PointLight cyan 0x00BCD4 0.55/6 di (2.8, 2.6, −7.4) + bulb 0xB2EBF2 di (2.8, 2.9, −7.4) + kabel 0x333344 3×0.04×0.06 di (2.8, 0.03, −7.6)', async () => {
    const { refs } = await build(makeCtx())
    expect(refs.light.color).toBe(0x00BCD4)
    expect(refs.light.intensity).toBe(0.55)
    expect(refs.light.distance).toBe(6)
    expect(refs.light.position).toMatchObject({ x: 2.8, y: 2.6, z: -7.4 })
    expect(refs.bulb.geometry.args).toEqual([0.5, 0.06, 0.14])
    expect(refs.bulb.material.color).toBe(0xB2EBF2)
    expect(refs.bulb.position).toMatchObject({ x: 2.8, y: 2.9, z: -7.4 })
    expect(refs.cable.geometry.args).toEqual([3, 0.04, 0.06])
    expect(refs.cable.material.color).toBe(0x333344)
    expect(refs.cable.position).toMatchObject({ x: 2.8, y: 0.03, z: -7.6 })
  })

  it('water cooler: body 0xE0E0E0 0.4×1.1×0.4 y=0.55, jug biru transparan y=1.28, tap 0x607D8B, grup di (−11.6, 0, 0)', async () => {
    const { refs } = await build(makeCtx())
    const c = refs.cooler
    expect(c.children.length).toBe(3)
    const [body, jug, tap] = c.children
    expect(refs.wcBody).toBe(body)
    expect(body.geometry.args).toEqual([0.4, 1.1, 0.4])
    expect(body.material.color).toBe(0xE0E0E0)
    expect(body.position.y).toBe(0.55)
    expect(refs.jug).toBe(jug)
    expect(jug.geometry.args).toEqual([0.16, 0.18, 0.35, 10])
    expect(jug.material.color).toBe(0x4FC3F7)
    expect(jug.material.transparent).toBe(true)
    expect(jug.material.opacity).toBeCloseTo(0.7)
    expect(jug.position.y).toBe(1.28)
    expect(refs.tap).toBe(tap)
    expect(tap.material.color).toBe(0x607D8B)
    expect(tap.position).toMatchObject({ x: 0, y: 0.85, z: 0.22 })
    expect(c.castShadow).toBe(true)
    expect(c.position).toMatchObject({ x: -11.6, y: 0, z: 0 })
  })

  it('72 LED dgn state blink acak (ph, sp 2-8, on 0.3-1) — dua pemanggilan tak share array', async () => {
    const ctxA = makeCtx(); const ctxB = makeCtx()
    const a = await build(ctxA)
    const b = await build(ctxB)
    expect(a.refs.leds).not.toBe(b.refs.leds)
    a.refs.leds.forEach((L) => {
      expect(L.base).toBe(1)
      expect(L.ph).toBeGreaterThanOrEqual(0)
      expect(L.ph).toBeLessThan(Math.PI * 2)
      expect(L.sp).toBeGreaterThanOrEqual(2)
      expect(L.sp).toBeLessThanOrEqual(8)
      expect(L.on).toBeGreaterThanOrEqual(0.3)
      expect(L.on).toBeLessThanOrEqual(1)
      expect(L.m).toBeInstanceOf(Mesh)
    })
  })
})
