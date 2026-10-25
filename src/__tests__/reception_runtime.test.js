// @vitest-environment jsdom
// Unit test runtime createReception (reception.js): meja resepsionis WFS —
// desk 0x1A2A3A, top 0xDDE4EC, side panel, logo kanvas 1024×320 dua sisi,
// glow teal + PointLight 0x0DEEF3, monitor + glow layar, keyboard+mouse,
// kursi, karakter NEXUS "WAHYU FS" scale 1.7 menghadap +Z, label Founder,
// footprint OBSTACLES didaftarkan.
import { describe, it, expect, beforeEach } from 'vitest'

class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o = {}) { Object.assign(this, { opacity: 1, color: 0, transparent: false }, o) } }
class Tex { constructor() { this.minFilter = null } }
class Obj {
  constructor() {
    this.children = []
    this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = {}; this.visible = true; this.castShadow = false
    this.scale = { setScalar(s) { this.s = s }, set(x, y, z) { this.sx = x; this.sy = y; this.sz = z } }
  }
  add(o) { this.children.push(o) }
  clone() { const c = new Mesh(); c.position = { ...this.position }; c.geometry = this.geometry; c.material = this.material; return c }
  traverse(fn) { this.children.forEach(fn) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
class Light extends Obj {
  constructor(...a) { super(); this.lightArgs = a; this.isLight = true }
}
class Sprite extends Obj {
  constructor(m) { super(); this.material = m; this.isSprite = true; this.userData = {} }
}
class SpriteMat { constructor(o = {}) { Object.assign(this, o) } }
class MeshBasicMat extends Mat { constructor(o = {}) { super(o); this.isMeshBasicMaterial = true } }

const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom,
  MeshLambertMaterial: Mat, MeshBasicMaterial: MeshBasicMat,
  PointLight: Light, CanvasTexture: Tex, Sprite, SpriteMaterial: SpriteMat,
  LinearFilter: 'linear',
}

function makeCtx() {
  const office = new Obj()
  const M = (c, o) => new Mat({ color: c, ...o })
  const MB = (c, o) => new MeshBasicMat({ color: c, ...o })
  let logoDrawn = 0
  const drawResepsiLogo = () => { logoDrawn++ }
  let labeledWith = null
  const makeLabel = (agent) => { labeledWith = agent; return new Sprite(new SpriteMat({ transparent: true })) }
  let charAgent = null, charStanding = null
  const buildChar = (agent, standing) => { charAgent = agent; charStanding = standing; return new Obj() }
  return { THREE, office, M, MB, drawResepsiLogo, makeLabel, buildChar, ctx: { logoDrawn: () => logoDrawn, labeledWith: () => labeledWith, charAgent: () => charAgent, charStanding: () => charStanding } }
}

async function build(ctx) {
  const { createReception } = await import('../scene/parts/reception.js')
  return { refs: createReception(ctx), ...ctx }
}

const RCX = 8, RCZ = 6.5

import { OBSTACLES } from '../scene/parts/obstacles.js'

describe('createReception — meja resepsionis kantor 3D', () => {
  beforeEach(() => {
    OBSTACLES.length = 0
  })

  it('mengembalikan referensi lengkap: reception, rcLight, nexusChar, nxLabel', async () => {
    const { refs } = await build(makeCtx())
    expect(refs.reception).toBeInstanceOf(Obj)
    expect(refs.rcLight).toBeInstanceOf(Light)
    expect(refs.nexusChar).toBeInstanceOf(Obj)
    expect(refs.nxLabel).toBeInstanceOf(Sprite)
  })

  it('office menerima tepat 1 grup reception', async () => {
    const ctx = makeCtx()
    const { refs } = await build(ctx)
    expect(ctx.office.children).toHaveLength(1)
    expect(ctx.office.children[0]).toBe(refs.reception)
  })

  it('desk 0x1A2A3A 2.5×.9×.6 di (RCX,.45,RCZ) castShadow + top 0xDDE4EC y=.92 + side 0x1A2A3A di RCX+1.25', async () => {
    const { refs } = await build(makeCtx())
    const kids = refs.reception.children
    expect(kids[0].geometry.args).toEqual([2.5, 0.9, 0.6])
    expect(kids[0].material.color).toBe(0x1A2A3A)
    expect(kids[0].castShadow).toBe(true)
    expect(kids[0].position).toMatchObject({ x: RCX, y: 0.45, z: RCZ })
    expect(kids[1].geometry.args).toEqual([2.6, 0.04, 0.7])
    expect(kids[1].material.color).toBe(0xDDE4EC)
    expect(kids[1].position.y).toBeCloseTo(0.92)
    expect(kids[1].castShadow).toBe(true)
    expect(kids[2].position.x).toBeCloseTo(RCX + 1.25)
    expect(kids[2].position.z).toBeCloseTo(RCZ - 0.3)
    expect(kids[2].castShadow).toBe(true)
  })

  it('logo kanvas 1024×320 digambar via drawResepsiLogo, plane 1.8×.5625 MeshBasic transparan di z=RCZ+.31, kloning di z=RCZ−.31 rot π', async () => {
    const { refs, ctx } = await build(makeCtx())
    expect(ctx.logoDrawn()).toBe(1)
    const kids = refs.reception.children
    const logo = kids.find((k) => k.material && k.material.map)
    expect(logo).toBeTruthy()
    expect(logo.geometry.args).toEqual([1.8, 0.5625])
    expect(logo.material.transparent).toBe(true)
    expect(logo.position.z).toBeCloseTo(RCZ + 0.31)
    const front = refs.reception.children.filter((k) => k.material && k.material.map)
    expect(front.length).toBe(2) // dua sisi
  })

  it('glow strip MB 0x0DEEF3 di y=.05 + PointLight 0x0DEEF3 intensity .4 distance 3.5 decay 2 di (RCX,.1,RCZ+.5)', async () => {
    const { refs } = await build(makeCtx())
    const glow = refs.reception.children.find((k) => k.material && k.material.color === 0x0DEEF3)
    expect(glow.geometry.args).toEqual([2.2, 0.02, 0.02])
    expect(glow.position.y).toBeCloseTo(0.05)
    expect(refs.rcLight.lightArgs).toEqual([0x0DEEF3, 0.4, 3.5, 2])
    expect(refs.rcLight.position).toMatchObject({ x: RCX, y: 0.1, z: RCZ + 0.5 })
  })

  it('monitor (base/stand/body 0x2A2A2A y=1.35) + screen glow MB 0x0A1628 + keyboard & mouse 0x333333', async () => {
    const { refs } = await build(makeCtx())
    const kids = refs.reception.children
    const body = kids.find((k) => k.geometry && k.geometry.args.length === 3 && k.geometry.args.join() === '0.6,0.4,0.03')
    expect(body.material.color).toBe(0x2A2A2A)
    expect(body.position).toMatchObject({ x: RCX - 0.4, y: 1.35 })
    const scrGlow = kids.find((k) => k.material && k.material.color === 0x0A1628)
    expect(scrGlow.geometry.args).toEqual([0.55, 0.35, 0.01])
    const kb = kids.find((k) => k.geometry && k.geometry.args.join() === '0.3,0.02,0.1')
    expect(kb.material.color).toBe(0x333333)
    expect(kb.position).toMatchObject({ x: RCX - 0.4, y: 0.95, z: RCZ + 0.15 })
    const mouse = kids.find((k) => k.geometry && k.geometry.args.join() === '0.05,0.02,0.07')
    expect(mouse.position.x).toBeCloseTo(RCX - 0.1)
  })

  it('kursi (seat .4×.04×.4 y=.44, back .4×.42×.04 y=.67 z=RCZ−.59) di belakang meja', async () => {
    const { refs } = await build(makeCtx())
    const kids = refs.reception.children
    const seat = kids.find((k) => k.geometry && k.geometry.args.join() === '0.4,0.04,0.4')
    const back = kids.find((k) => k.geometry && k.geometry.args.join() === '0.4,0.42,0.04')
    expect(seat.material.color).toBe(0x37474F)
    expect(seat.position).toMatchObject({ x: RCX - 0.4, y: 0.44, z: RCZ - 0.4 })
    expect(back.position).toMatchObject({ x: RCX - 0.4, y: 0.67, z: RCZ - 0.59 })
  })

  it('karakter NEXUS "WAHYU FS" dibangun (standing=false), scale 2.2, di (RCX−.4, 0.04, RCZ−.4) rot π menghadap +Z', async () => {
    const { refs, ctx } = await build(makeCtx())
    expect(ctx.charAgent()).toMatchObject({ name: 'WAHYU FS', color: 0xF59E0B, role: 'Founder / CEO', shirt: 0xB45309 })
    expect(ctx.charStanding()).toBe(false)
    expect(refs.nexusChar.scale.s || refs.nexusChar.scale.sx).toBe(2.2)
    expect(refs.nexusChar.position).toMatchObject({ x: RCX - 0.4, y: 0.04, z: RCZ - 0.4 })
    expect(refs.nexusChar.rotation.y).toBe(Math.PI)
  })

  it('label Founder dibuat via makeLabel(nexusAgent), scale (3.2,.8,1), di (RCX−.4, 3.3, RCZ−.4)', async () => {
    const { refs, ctx } = await build(makeCtx())
    expect(ctx.labeledWith().name).toBe('WAHYU FS')
    expect(refs.nxLabel.scale.sx).toBe(3.2)
    expect(refs.nxLabel.scale.sy).toBe(0.8)
    expect(refs.nxLabel.position).toMatchObject({ x: RCX - 0.4, y: 3.3, z: RCZ - 0.4 })
  })

  it('nama Founder WAHYU FS dinormalisasi dengan akronim FS menjadi Wahyu FS', async () => {
    const { labelName } = await import('../scene/parts/label_spec.js')
    const { ctx } = await build(makeCtx())
    expect(labelName(ctx.labeledWith().name)).toBe('Wahyu FS')
    expect(ctx.labeledWith().role).toBe('Founder / CEO')
  })

  it('footprint meja didaftarkan ke OBSTACLES: [RCX−1.3, RCX+1.55, RCZ−.35, RCZ+.35]', async () => {
    const { OBSTACLES } = await import('../scene/parts/obstacles.js')
    const before = OBSTACLES.length
    await build(makeCtx())
    expect(OBSTACLES.length).toBe(before + 1)
    expect(OBSTACLES[OBSTACLES.length - 1]).toEqual([RCX - 1.3, RCX + 1.55, RCZ - 0.35, RCZ + 0.35])
    OBSTACLES.length = before
  })

  it('dua pemanggilan tidak share grup/objek', async () => {
    const a = makeCtx(), b = makeCtx()
    const ra = await build(a), rb = await build(b)
    expect(ra.refs.reception).not.toBe(rb.refs.reception)
    expect(ra.refs.rcLight).not.toBe(rb.refs.rcLight)
    expect(ra.ctx.charAgent()).not.toBe(rb.ctx.charAgent())
  })
})
