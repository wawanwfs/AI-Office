// @vitest-environment jsdom
// Unit test runtime createCafe (cafe.js) & createBookshelf (bookshelf.js) —
// builder kafe / rak buku kantor 3D. Mengikuti pola decor_runtime.test.js:
// THREE di-stub minimal, kanvas di-stub (node_modules tanpa paket `canvas`),
// asersi via mesh yang di-add ke office.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', shadowColor: '', shadowBlur: 0,
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, fillText() {}, measureText(s) { return { width: String(s).length * 10 } },
  }
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
class Obj {
  constructor() { this.children = []; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.visible = true; this.userData = {} }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.castShadow = false }
}
const THREE = {
  Mesh, Group: Obj, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom, SphereGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
}

function makeSceneCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c) => { matLog.push(c); return new Mat({ color: c }) }
  const MB = (c) => { matLog.push(c); return new Mat({ color: c }) }
  const rng = {
    r: (a, b) => a + (b - a) * 0.5, // deterministik (midpoint)
    pick: (arr) => arr[0],
  }
  return { THREE, office, M, MB, rng, matLog, added: office.children }
}

let origCreate
beforeEach(() => { canvases = []; origCreate = stubCreateElement() })
afterEach(() => { document.createElement = origCreate; vi.restoreAllMocks() })

async function buildCafe(withBlob = true) {
  const { createCafe } = await import('../scene/parts/cafe.js')
  const ctx = makeSceneCtx()
  const blobMat = withBlob ? new Mat({ color: 0x000000 }) : undefined
  const refs = createCafe({ ...ctx, blobMat })
  return { ...ctx, blobMat, refs }
}

async function buildBookshelf() {
  const { createBookshelf } = await import('../scene/parts/bookshelf.js')
  const ctx = makeSceneCtx()
  const blobMat = new Mat({ color: 0x000000 })
  const refs = createBookshelf({ ...ctx, blobMat })
  return { ...ctx, blobMat, refs }
}

describe('createCafe — kafe / coffee bar kantor 3D', () => {
  it('mengembalikan referensi lengkap & office berisi satu grup cafe', async () => {
    const { refs, added } = await buildCafe()
    expect(refs.cafe).toBeInstanceOf(Obj)
    expect(added).toHaveLength(1)
    expect(added[0]).toBe(refs.cafe)
    expect(refs.CFX).toBe(-9.5)
    expect(refs.CFZ).toBe(7.5)
    expect(refs.cups).toHaveLength(3)
    expect(refs.stools).toHaveLength(4)
    expect(refs.menuBoard).toBeInstanceOf(Mesh)
    expect(refs.fridge).toBeInstanceOf(Mesh)
  })

  it('grup cafe memuat 21 objek puncak dgn blob shadow (4 counter + 4 aksen + 1 ketel + 3 cangkir + 2 menu + 4 stool + 2 kulkas + 3 shadow)', async () => {
    const { refs } = await buildCafe(true)
    expect(refs.cafe.children).toHaveLength(21)
  })

  it('tanpa blobMat (mode hemat) grup cafe memuat 18 objek puncak', async () => {
    const { refs } = await buildCafe(false)
    expect(refs.cafe.children).toHaveLength(18)
  })

  it('setiap bar stool adalah grup berisi 3 bagian (dudukan, tiang, alas) di depan counter z=CFZ+1', async () => {
    const { refs } = await buildCafe()
    refs.stools.forEach((st) => {
      expect(st).toBeInstanceOf(Obj)
      expect(st.children).toHaveLength(3)
      expect(st.position.z).toBe(8.5)
    })
  })

  it('menu board memakai kanvas 256×140 (drawMenuBoard) & plane 1.7×0.95', async () => {
    const { refs } = await buildCafe()
    expect(canvases).toHaveLength(1)
    expect(canvases[0].width).toBe(256)
    expect(canvases[0].height).toBe(140)
    expect(refs.menuBoard.geometry.args).toEqual([1.7, 0.95])
  })

  it('lampu/glow memakai material MB: espresso hijau 0x10E5A0 & kulkas biru 0x4FC3F7', async () => {
    const { matLog } = await buildCafe()
    expect(matLog).toContain(0x10E5A0)
    expect(matLog).toContain(0x4FC3F7)
  })
})

describe('createBookshelf — rak buku dinding kiri belakang', () => {
  it('mengembalikan { shelf, books } & shelf di-add ke office', async () => {
    const { refs, added } = await buildBookshelf()
    expect(refs.shelf).toBeInstanceOf(Obj)
    expect(added).toHaveLength(1)
    expect(added[0]).toBe(refs.shelf)
  })

  it('menghasilkan buku acak > 0, tiap buku box 0.34 (tebal), tinggi 0.28..0.40, warna dari palet', async () => {
    const { refs, matLog } = await buildBookshelf()
    expect(refs.books.length).toBeGreaterThan(0)
    refs.books.forEach((bk) => {
      expect(bk).toBeInstanceOf(Mesh)
      expect(bk.geometry.args[0]).toBe(0.34)
      expect(bk.geometry.args[1]).toBeGreaterThanOrEqual(0.28)
      expect(bk.geometry.args[1]).toBeLessThanOrEqual(0.40)
    })
    const palet = [0xEF5350, 0xFFCA28, 0x42A5F5, 0x66BB6A, 0xAB47BC, 0xFF7043, 0x26C6DA, 0xEC407A]
    expect(matLog.some((c) => palet.includes(c))).toBe(true)
  })

  it('struktur rak: 1 bingkai + 1 shadow + 4 papan + N buku (dgn blobMat)', async () => {
    const { refs } = await buildBookshelf()
    expect(refs.shelf.children).toHaveLength(6 + refs.books.length)
  })

  it('papan rak di y = 0.35 + lvl·0.55 dan buku duduk di atasnya (y + 0.17)', async () => {
    const { refs } = await buildBookshelf()
    const boards = refs.shelf.children.filter((c) => c instanceof Mesh && c.geometry.args && c.geometry.args[0] === 0.48)
    expect(boards).toHaveLength(4)
    boards.forEach((b, lvl) => {
      expect(b.position.y).toBeCloseTo(0.35 + lvl * 0.55)
    })
    const firstBook = refs.books[0]
    expect(firstBook.position.y).toBeCloseTo(boards[0].position.y + 0.17)
  })
})
