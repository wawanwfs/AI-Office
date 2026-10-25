// @vitest-environment jsdom
// Unit test runtime createFurniture (furniture.js): seluruh perabot kantor 3D.
// node_modules TANPA paket `canvas` → getContext jsdom = null, jadi createElement('canvas')
// di-stub dengan context 2D palsu yang MENCATAT fillText/fillStyle; THREE di-stub minimal
// (Group/Mesh/Geom/Mat/CanvasTexture) dan asersi dilakukan via mesh yang di-add ke office.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const drawCalls = [] // {style, text}
function makeCtx() {
  return new Proxy({
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', shadowColor: '', shadowBlur: 0,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    fillText(t) { drawCalls.push({ style: this.fillStyle, text: String(t) }) },
    measureText(s) { return { width: String(s).length * 10 } },
  }, {
    set(t, k, v) { t[k] = v; return true },
    get(t, k) { return t[k] },
  })
}
let canvases = []
function stubCreateElement() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag) => {
    if (tag === 'canvas') {
      const cv = { width: 0, height: 0, getContext: () => makeCtx() }
      canvases.push(cv)
      return cv
    }
    return orig(tag)
  }
  return orig
}

class Tex { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1, color: 0 }, o) } }
class Group {
  constructor() { this.children = []; this.position = { set() {} }; this.rotation = {}; this.visible = true }
  add(o) { this.children.push(o) }
}
const setPos = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }
class Mesh extends Group {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.position = { ...setPos }; this.castShadow = false }
}
const THREE = {
  Group, Mesh, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
}

function makeCtxScene() {
  const office = new Group()
  const matLog = []
  const M = (c) => { matLog.push(c); return new Mat({ color: c }) }
  const MB = (c) => new Mat({ color: c })
  const rng = { r: (a, b) => a + ((b - a) * 0.5), n: () => 0.9, pick: (arr) => arr[0] }
  return { THREE, office, M, MB, rng, matLog, added: office.children }
}

let origCreate
beforeEach(() => {
  drawCalls.length = 0
  canvases = []
  origCreate = stubCreateElement()
})
afterEach(() => {
  document.createElement = origCreate
  vi.restoreAllMocks()
})

async function build() {
  const { createFurniture } = await import('../scene/parts/furniture.js')
  const ctx = makeCtxScene()
  const refs = createFurniture(ctx)
  return { ...ctx, refs }
}


describe('createFurniture — perabot kantor 3D', () => {
  it('semua kelompok perabot di-add ke office (5 group + mesh loose: rak & tanaman & poster)', async () => {
    const { added } = await build()
    // dispenser, printer, sofa, pantry (4 group) + poster planes & rak & tanaman sebagai mesh langsung
    const groups = added.filter((o) => o instanceof Group && !(o instanceof Mesh))
    expect(groups.length).toBe(4)
    // poster = mesh langsung di office
    const planes = added.filter((o) => o instanceof Mesh && o.geometry?.args?.[0] === 0.46)
    expect(planes.length).toBe(8)
  })

  it('dispenser: 3 box (tub 0.3×0.6, galon biru 0x7fb8ea, keran 0x4a6a86) di (-10.5, *, 0)', async () => {
    const { added } = await build()
    const dispenser = added.find((o) => o instanceof Group && o.children.length === 3)
    expect(dispenser).toBeTruthy()
    const [tub, galon, keran] = dispenser.children
    expect(tub.geometry.args).toEqual([0.3, 0.6, 0.3])
    expect(tub.position.x).toBe(-10.5); expect(tub.position.y).toBe(0.3); expect(tub.position.z).toBe(0)
    expect(galon.material.color).toBe(0x7fb8ea)
    expect(galon.geometry.args).toEqual([0.24, 0.28, 0.24])
    expect(keran.material.color).toBe(0x4a6a86)
  })

  it('tanaman: 5 pot, pot besar diskala 1.3, daun sesuai rng (n()=0.9 → warna 0x5fae63) + castShadow', async () => {
    const { added } = await build()
    // pot = box 0.3 (kecil) / 0.39 (besar) material 0xcfd8dc, castShadow=true
    const pots = added.filter((o) => o instanceof Mesh && o.material?.color === 0xcfd8dc && o.castShadow)
    expect(pots.length).toBe(5)
    const bigs = pots.filter((p) => p.geometry.args[0] > 0.35)
    expect(bigs.length).toBe(2) // (-11,8) dan (-6,8)
    expect(bigs.every((p) => p.geometry.args[0] === 0.39)).toBe(true)
    // daun: warna 0x5fae63 (n()=0.9 → selalu hijau terang) dengan castShadow; rng deterministik:
    // 2 pot besar × 5 daun + 3 pot kecil × 3 daun = 19
    const leaves = added.filter((o) => o instanceof Mesh && o.material?.color === 0x5fae63 && o.castShadow)
    expect(leaves.length).toBe(19)
    expect(leaves.filter((l) => l.geometry.args[0] > 0.2).length).toBe(10) // daun pot besar lebih lebar
  })

  it('rak buku: 3 rak papan (1.9×0.05×0.32, 0xcfd8e3) di x=-11.5 z=-5 + 15 pustaka 5 warna tetap', async () => {
    const { added } = await build()
    const shelves = added.filter((o) => o instanceof Mesh && o.geometry?.args?.[0] === 1.9)
    expect(shelves.length).toBe(3)
    expect(shelves.every((s) => s.position.x === -11.5 && s.position.z === -5)).toBe(true)
    expect(shelves.map((s) => s.position.y)).toEqual([0.5, 1.05, 1.6])
    const spines = added.filter((o) => o instanceof Mesh &&
      [0x3f7cf0, 0xe8504f, 0xf0a42a, 0x7a4cf5, 0x16c07a].includes(o.material?.color))
    expect(spines.length).toBe(15) // 3 baris × 5 buku
  })

  it('printer: group 6 bagian di (3, *, -8), LED hijau 0x00e676 dari MB', async () => {
    const { added } = await build()
    const printer = added.find((o) => o instanceof Group && o.children.length === 6)
    expect(printer).toBeTruthy()
    expect(printer.children[0].geometry.args).toEqual([0.62, 0.5, 0.45])
    const led = printer.children.find((c) => c.material?.color === 0x00e676)
    expect(led).toBeTruthy()
  })

  it('sofa: group 12 bagian di (10.5, *, 6) + 2 bantal warna 0xff5252/0x448aff berotasi', async () => {
    const { added } = await build()
    const sofa = added.find((o) => o instanceof Group && o.children.length === 12)
    expect(sofa).toBeTruthy()
    const [base] = sofa.children
    expect(base.geometry.args).toEqual([0.72, 0.36, 2.1])
    expect(base.castShadow).toBe(true)
    const mags = sofa.children.filter((c) => [0xff5252, 0x448aff].includes(c.material?.color))
    expect(mags.length).toBe(2)
    expect(mags.map((m) => m.rotation.y).sort()).toEqual([-0.15, 0.2].sort())
  })

  it('pantry: group 12 bagian di (-10.5, *, 2.5) + 3 taburan kue + LED 0x0deef3 + microwave', async () => {
    const { added } = await build()
    const pantry = added.find((o) => o instanceof Group && o.children.length === 12 && o.children[0].geometry.args[0] === 1.7)
    expect(pantry).toBeTruthy()
    const led = pantry.children.find((c) => c.material?.color === 0x0deef3)
    expect(led).toBeTruthy()
    const cookies = pantry.children.filter((c) => [0xff5252, 0xf5a623, 0x00e676].includes(c.material?.color) &&
      c.geometry.args[0] === 0.045)
    expect(cookies.length).toBe(3)
    const micro = pantry.children.find((c) => c.geometry?.args?.[0] === 0.36)
    expect(micro.geometry.args).toEqual([0.36, 0.22, 0.26])
  })

  it('poster: 8 canvas 120×160, teks slogan digambar per kata, plane 0.46×0.66 menghadap sesuai dinding', async () => {
    const { added } = await build()
    expect(canvases.length).toBe(8)
    expect(canvases.every((c) => c.width === 120 && c.height === 160)).toBe(true)
    const texts = drawCalls.map((d) => d.text)
    expect(texts).toContain('SHIP'); expect(texts).toContain('IT')
    expect(texts).toContain('KUALITAS'); expect(texts).toContain('WFS'); expect(texts).toContain('PROJECT')
    const planes = added.filter((o) => o instanceof Mesh && o.geometry?.args?.[0] === 0.46)
    expect(planes.length).toBe(8)
    // dinding kiri (x=-11.4) → menghadap +x (rot π/2), dinding kanan → -π/2
    for (const p of planes) {
      const x = p.position.x
      if (Math.abs(p.position.z) > 9) continue // poster dinding z diuji di bawah
      expect(p.rotation.y).toBe(x < 0 ? Math.PI / 2 : -Math.PI / 2)
      expect(Math.abs(p.position.x - x)).toBeLessThan(0.05) // offset ±0.03 dari dinding
    }
    // poster dinding belakang (z-) menghadap 0, dinding depan (z+) menghadap π
    for (const p of planes.filter((q) => Math.abs(q.position.z) > 9)) {
      expect(p.rotation.y).toBe(p.position.z < 0 ? 0 : Math.PI)
    }
  })

  it('return refs berisi semua bagian yang bisa dipakai scene', async () => {
    const { refs } = await build()
    expect(Object.keys(refs).sort()).toEqual(['addPlant', 'dispenser', 'pantry', 'printer', 'sofa'])
    expect(typeof refs.addPlant).toBe('function')
    expect(refs.dispenser).toBeTruthy()
  })

  it('addPlant runtime: pot baru bisa ditambahkan kapan pun via refs', async () => {
    const { refs, added } = await build()
    const before = added.length
    refs.addPlant(5, 5, true)
    const pot = added[before] // pot pertama dari panggilan ini
    expect(pot.geometry.args[0]).toBe(0.39) // big → skala 1.3
    expect(pot.castShadow).toBe(true)
    expect(added.length).toBe(before + 6) // 1 pot + 5 daun (big)
  })
})
