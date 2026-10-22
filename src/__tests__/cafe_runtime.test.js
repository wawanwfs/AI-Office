// @vitest-environment jsdom
// Unit test runtime createCafe (cafe.js): counter L, countertop, espresso machine,
// kettle + cangkir, menu board kanvas, 4 bar stool, snack fridge — kafe kantor 3D.
// node_modules TANPA paket `canvas` → createElement('canvas') di-stub dgn ctx 2D
// palsu; THREE di-stub minimal dan asersi via mesh yang di-add ke office.
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
  constructor() { this.children = []; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.visible = true }
  add(o) { this.children.push(o) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.castShadow = false }
}
const THREE = {
  Mesh, Group: Obj, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
}

function makeSceneCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c) => { matLog.push(c); return new Mat({ color: c }) }
  const MB = (c) => { matLog.push(c); return new Mat({ color: c }) }
  return { THREE, office, M, MB, matLog, added: office.children }
}

let origCreate
beforeEach(() => { canvases = []; origCreate = stubCreateElement() })
afterEach(() => { document.createElement = origCreate; vi.restoreAllMocks() })

async function build() {
  const { createCafe } = await import('../scene/parts/cafe.js')
  const ctx = makeSceneCtx()
  const refs = createCafe(ctx)
  return { ...ctx, refs }
}

describe('createCafe — kafe / coffee bar kantor 3D', () => {
  it('mengembalikan referensi lengkap: counter 2, countertop 2, espresso 2, kettle, 3 cups, menu board 2, 4 stools, fridge 2', async () => {
    const { refs } = await build()
    expect(refs.cafe).toBeInstanceOf(Obj)
    expect(refs.c1).toBeInstanceOf(Mesh)
    expect(refs.c2).toBeInstanceOf(Mesh)
    expect(refs.ct1).toBeInstanceOf(Mesh)
    expect(refs.ct2).toBeInstanceOf(Mesh)
    expect(refs.em).toBeInstanceOf(Mesh)
    expect(refs.emG).toBeInstanceOf(Mesh)
    expect(refs.kt).toBeInstanceOf(Mesh)
    expect(refs.cups).toHaveLength(3)
    expect(refs.menuBoard).toBeInstanceOf(Mesh)
    expect(refs.menuBoardBack).toBeInstanceOf(Mesh)
    expect(refs.stools).toHaveLength(4)
    expect(refs.fridge).toBeInstanceOf(Mesh)
    expect(refs.fridgeGlow).toBeInstanceOf(Mesh)
  })

  it('semua objek kafe di-add ke cafe (2 counter + 2 countertop + 2 espresso + kettle + 3 cup + 2 menuboard + 4 stool + 2 fridge = 18)', async () => {
    const { refs } = await build()
    expect(refs.cafe.children.length).toBe(2 + 2 + 2 + 1 + 3 + 2 + 4 + 2)
  })
  it('grup kafe di-add ke office tepat 1 grup', async () => {
    const { added } = await build()
    expect(added.length).toBe(1)
    expect(added[0]).toBeInstanceOf(Obj)
  })

  it('counter L: body kayu 0x6D4C41 3.2×0.95×0.6 di (−9.5, 0.475, 7.5) + sisi 0.6×0.95×1.6 di (−7.9, 0.475, 6.5), keduanya castShadow', async () => {
    const { refs, matLog } = await build()
    expect(refs.c1.geometry.args).toEqual([3.2, 0.95, 0.6])
    expect(refs.c1.material.color).toBe(0x6D4C41)
    expect(refs.c1.position).toMatchObject({ x: -9.5, y: 0.475, z: 7.5 })
    expect(refs.c1.castShadow).toBe(true)
    expect(refs.c2.geometry.args).toEqual([0.6, 0.95, 1.6])
    expect(refs.c2.position).toMatchObject({ x: -7.9, y: 0.475, z: 6.5 })
    expect(refs.c2.castShadow).toBe(true)
    // 2 material kayu dibuat
    expect(matLog.filter((c) => c === 0x6D4C41)).toHaveLength(2)
  })

  it('countertop: 0xFFECB3 3.4×0.05×0.75 di y=0.975 + sisi 0.75×0.05×1.75 di (−7.9, 0.975, 6.5)', async () => {
    const { refs } = await build()
    expect(refs.ct1.geometry.args).toEqual([3.4, 0.05, 0.75])
    expect(refs.ct1.material.color).toBe(0xFFECB3)
    expect(refs.ct1.position).toMatchObject({ x: -9.5, y: 0.975, z: 7.5 })
    expect(refs.ct2.geometry.args).toEqual([0.75, 0.05, 1.75])
    expect(refs.ct2.position).toMatchObject({ x: -7.9, y: 0.975, z: 6.5 })
  })

  it('espresso machine 0x263238 di (−10.3, 1.17, 7.45) + glow hijau 0x10E5A0 di (−10.3, 1.1, 7.63)', async () => {
    const { refs } = await build()
    expect(refs.em.geometry.args).toEqual([0.5, 0.35, 0.35])
    expect(refs.em.material.color).toBe(0x263238)
    expect(refs.em.position).toMatchObject({ x: -10.3, y: 1.17, z: 7.45 })
    expect(refs.emG.geometry.args).toEqual([0.1, 0.08, 0.02])
    expect(refs.emG.material.color).toBe(0x10E5A0)
    expect(refs.emG.position).toMatchObject({ x: -10.3, y: 1.1, z: 7.63 })
  })

  it('kettle 0x90A4AE silinder 0.09/0.12/0.18 di (−9.6, 1.09, 7.5) + 3 cangkir: pertama merah 0xEF5350, sisanya putih 0xFAFAFA, berjajar x +0.22', async () => {
    const { refs } = await build()
    expect(refs.kt.geometry.args).toEqual([0.09, 0.12, 0.18, 10])
    expect(refs.kt.material.color).toBe(0x90A4AE)
    expect(refs.kt.position).toMatchObject({ x: -9.6, y: 1.09, z: 7.5 })
    refs.cups.forEach((cup, i) => {
      expect(cup.geometry.args).toEqual([0.04, 0.035, 0.06, 8])
      expect(cup.position.x).toBeCloseTo(-9.0 + i * 0.22)
      expect(cup.position).toMatchObject({ y: 1.03, z: 7.65 })
    })
    expect(refs.cups[0].material.color).toBe(0xEF5350)
    expect(refs.cups[1].material.color).toBe(0xFAFAFA)
    expect(refs.cups[2].material.color).toBe(0xFAFAFA)
  })

  it('menu board: kanvas 256×140 digambar, plane 1.7×0.95 di (−9.5, 2.3, 7.85) + papan kayu belakang 1.8×1.05×0.04 di z=7.82', async () => {
    const { refs } = await build()
    expect(canvases).toHaveLength(1)
    expect(canvases[0].width).toBe(256)
    expect(canvases[0].height).toBe(140)
    expect(refs.menuBoard.geometry.args).toEqual([1.7, 0.95])
    expect(refs.menuBoard.position).toMatchObject({ x: -9.5, y: 2.3, z: 7.85 })
    expect(refs.menuBoardBack.geometry.args).toEqual([1.8, 1.05, 0.04])
    expect(refs.menuBoardBack.material.color).toBe(0x2A2A2A)
    expect(refs.menuBoardBack.position).toMatchObject({ x: -9.5, y: 2.3, z: 7.82 })
  })

  it('4 bar stool oranye: seat silinder 0.16 di y=0.62, tiang y=0.3, alas y=0.015, di z=CFZ+1=8.5, x = −10.6/−9.85/−9.1/−8.35, castShadow', async () => {
    const { refs } = await build()
    expect(refs.stools.map((s) => s.position.x)).toEqual([-10.6, -9.85, -9.1, -8.35])
    refs.stools.forEach((st) => {
      expect(st.position.z).toBe(8.5)
      expect(st.castShadow).toBe(true)
      expect(st.children).toHaveLength(3)
      const [seat, pole, base] = st.children
      expect(seat.geometry.args).toEqual([0.16, 0.16, 0.06, 12])
      expect(seat.material.color).toBe(0xFB8C00)
      expect(seat.position.y).toBe(0.62)
      expect(pole.geometry.args).toEqual([0.03, 0.03, 0.6, 8])
      expect(pole.material.color).toBe(0x555555)
      expect(pole.position.y).toBe(0.3)
      expect(base.geometry.args).toEqual([0.16, 0.16, 0.03, 12])
      expect(base.position.y).toBe(0.015)
    })
  })

  it('snack fridge 0xECEFF1 0.55×1.1×0.5 castShadow di (−7, 0.55, 7.3) + jendela glow 0x4FC3F7 di (−7, 0.72, 7.56)', async () => {
    const { refs } = await build()
    expect(refs.fridge.geometry.args).toEqual([0.55, 1.1, 0.5])
    expect(refs.fridge.material.color).toBe(0xECEFF1)
    expect(refs.fridge.castShadow).toBe(true)
    expect(refs.fridge.position).toMatchObject({ x: -7, y: 0.55, z: 7.3 })
    expect(refs.fridgeGlow.geometry.args).toEqual([0.4, 0.5, 0.02])
    expect(refs.fridgeGlow.material.color).toBe(0x4FC3F7)
    expect(refs.fridgeGlow.position).toMatchObject({ x: -7, y: 0.72, z: 7.56 })
  })

  it('dua pemanggilan tidak saling berbagi state (grup terpisah, canvas baru)', async () => {
    const { createCafe } = await import('../scene/parts/cafe.js')
    const a = createCafe(makeSceneCtx())
    const b = createCafe(makeSceneCtx())
    expect(a.cafe).not.toBe(b.cafe)
    expect(a.c1).not.toBe(b.c1)
    expect(b.cafe.children.length).toBe(18)
    expect(canvases).toHaveLength(2)
  })
})
