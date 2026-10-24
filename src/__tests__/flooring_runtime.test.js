// @vitest-environment jsdom
// Unit test runtime createZones (flooring.js): patch lantai zona + sprite label.
// jsdom getContext = null → canvas di-stub dengan context 2D palsu (roundRect, fillText dicatat);
// THREE stub minimal; asersi via mesh/sprite yang di-add ke office + window.__zoneLabels/__zoneBase.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const drawCalls = []
function makeCtx() {
  return new Proxy({
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, measureText(s) { return { width: String(s).length * 10 } },
    fillText(t) { drawCalls.push({ style: this.fillStyle, text: String(t) }) },
  }, { set(t, k, v) { t[k] = v; return true }, get(t, k) { return t[k] } })
}
function stubCreateElement() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag) => tag === 'canvas'
    ? { width: 0, height: 0, getContext: () => makeCtx() }
    : orig(tag)
  return orig
}

class Tex { constructor(cv) { this.canvas = cv; this.minFilter = null; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1, color: 0, transparent: false, depthTest: true }, o) } }
class Sprite { constructor(mat) { this.material = mat; this.children = []; this.center = { set() {} }; this.scale = { ...setPos }; this.position = { ...setPos }; this.visible = true; this.renderOrder = 0; this.userData = {} } add() {} }
const setPos = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
class Group { constructor() { this.children = []; this.position = { ...setPos } } add(o) { this.children.push(o) } }
const Mesh = class extends Group { constructor(g, m) { super(); this.geometry = g; this.material = m; this.castShadow = false; this.receiveShadow = false } }
const SpriteMat = class extends Mat {}
const THREE = { Group, Mesh, Sprite, SpriteMaterial: SpriteMat, CanvasTexture: Tex, BoxGeometry: Geom, MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, LinearFilter: 'linear' }

function makeCtxScene() {
  const office = new Group()
  return { THREE, office, namesVisible: true, added: office.children }
}

let origCreate
beforeEach(() => {
  drawCalls.length = 0
  delete window.__zoneLabels
  delete window.__zoneBase
  origCreate = stubCreateElement()
})
afterEach(() => {
  document.createElement = origCreate
  vi.restoreAllMocks()
  delete window.__zoneLabels
  delete window.__zoneBase
})

async function build() {
  const { createZones } = await import('../scene/parts/flooring.js')
  const ctx = makeCtxScene()
  createZones(ctx)
  return ctx
}

describe('createZones — patch lantai & label zona', () => {
  it('menambahkan 5 patch lantai untuk 5 zona', async () => {
    const { added } = await build()
    const patches = added.filter((o) => o instanceof Mesh && o.geometry instanceof Geom && o.geometry.args[0] === 11)
    expect(added.filter((o) => o instanceof Mesh).length).toBe(5)
    expect(patches.length).toBe(1) // DEV DESK w=11
  })
  it('patch: BoxGeometry w×0.02×d, posisi (x, 0.015, z), receiveShadow', async () => {
    const { added } = await build()
    const p = added[0]
    expect(p.geometry.args).toEqual([11, 0.02, 7.5])
    expect(p.position.y).toBe(0.015)
    expect(p.position.x).toBe(-6)
    expect(p.receiveShadow).toBe(true)
  })
  it('warna & opacity patch sesuai ZONES (MEETING op .9, default .55)', async () => {
    const { added } = await build()
    expect(added[0].material.color).toBe(0x1E3A5F)
    expect(added[0].material.opacity).toBe(0.55)
    const meet = added.filter((o) => o instanceof Mesh && o.geometry.args[0] === 5.4)[0]
    expect(meet.material.color).toBe(0x4A3A1A)
    expect(meet.material.opacity).toBe(0.9)
  })
  it('menambahkan 5 sprite label + window.__zoneLabels berisi 5', async () => {
    const { added } = await build()
    expect(added.filter((o) => o instanceof Sprite).length).toBe(5)
    expect(window.__zoneLabels.length).toBe(5)
  })
  it('label digambar di canvas 512×96, putih, teks = label zona', async () => {
    await build()
    expect(drawCalls.map((d) => d.text)).toEqual(['DEV DESK', 'MEETING', 'WELCOME & LOUNGE', 'CAFÉ', 'SERVER ROOM'])
    expect(drawCalls.every((d) => d.style === '#FFFFFF')).toBe(true)
  })
  it('sprite: center (.5,1), renderOrder 25, depthTest false, visible ikut namesVisible', async () => {
    const { added } = await build()
    const s = added.filter((o) => o instanceof Sprite)[0]
    expect(s.material.depthTest).toBe(false)
    expect(s.material.transparent).toBe(true)
    expect(s.renderOrder).toBe(25)
    expect(s.visible).toBe(true)
  })
  it('posisi label di tepi depan zona: y=1.15, y_zona = zoneLabelY(z)', async () => {
    const { added } = await build()
    const s = added.filter((o) => o instanceof Sprite)[0]
    expect(s.position.y).toBe(1.15)
    // DEV DESK: z=-1.2, d=7.5 → tepi depan -4.95 + 0.7 = -4.25
    expect(s.position.z).toBe(-4.25)
    expect(s.position.x).toBe(-6)
  })
  it('zoneLabelY: patch dy=-0.9 (SERVER ROOM) digeser turun', async () => {
    const { added } = await build()
    const server = added.filter((o) => o instanceof Sprite)[4]
    // SERVER ROOM: z=-8, d=2.6 → -9.3+0.7-0.9 = -9.5
    expect(server.position.z).toBeCloseTo(-9.5)
  })
  it('skala: label panjang >9 karakter diskala 1.25 (WELCOME & LOUNGE 3.4×1.25)', async () => {
    const { added } = await build()
    const spr = added.filter((o) => o instanceof Sprite)
    expect(spr[0].scale.x).toBe(3.4)
    expect(spr[2].scale.x).toBeCloseTo(4.25)
    expect(spr[2].scale.y).toBeCloseTo(0.8)
  })
  it('window.__zoneBase: Map label→posisi dasar (x, y) untuk anti-tumpuk', async () => {
    const { added } = await build()
    expect(window.__zoneBase).toBeInstanceOf(Map)
    expect(window.__zoneBase.size).toBe(5)
    const [sprite, base] = [...window.__zoneBase.entries()][0]
    expect(sprite).toBeInstanceOf(Sprite)
    expect(base).toEqual({ y: 1.15, x: -6 })
    expect(added.filter((o) => o.userData && o.userData.label).length).toBe(5) // userData.label = label zona
    expect([...window.__zoneLabels].every((s) => s.userData.label)).toBe(true)
  })
})
