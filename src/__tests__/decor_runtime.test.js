// @vitest-environment jsdom
// Unit test runtime createDecor (decor.js): poster motivasi, tanaman besar,
// partisi kaca, rug, lampu lounge — builder dekorasi tambahan kantor 3D.
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
class Light extends Obj { constructor(color, intensity, distance, decay) { super(); this.color = color; this.intensity = intensity; this.distance = distance; this.decay = decay } }
const THREE = {
  Mesh, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom, SphereGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, PointLight: Light,
}

function makeSceneCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c) => { matLog.push(c); return new Mat({ color: c }) }
  return { THREE, office, M, matLog, added: office.children }
}

let origCreate
beforeEach(() => { canvases = []; origCreate = stubCreateElement() })
afterEach(() => { document.createElement = origCreate; vi.restoreAllMocks() })

async function build() {
  const { createDecor } = await import('../scene/parts/decor.js')
  const ctx = makeSceneCtx()
  const refs = createDecor(ctx)
  return { ...ctx, refs }
}

describe('createDecor — dekorasi tambahan kantor 3D', () => {
  it('mengembalikan referensi lengkap: 2 poster, 3 tanaman, 3 partisi, rug, rugInner, lampu', async () => {
    const { refs } = await build()
    expect(refs.posterMeshes).toHaveLength(2)
    expect(refs.plants).toHaveLength(3)
    expect(refs.partitions).toHaveLength(3)
    expect(refs.rug).toBeInstanceOf(Mesh)
    expect(refs.rugInner).toBeInstanceOf(Mesh)
    expect(refs.loungeLight).toBeInstanceOf(Light)
  })

  it('semua objek dekorasi di-add ke office (2 poster + 18 mesh tanaman + 3 partisi + 2 rug + 1 light = 26)', async () => {
    const { added } = await build()
    expect(added.length).toBe(2 + 18 + 3 + 2 + 1)
  })

  it('poster: plane 1.1×1.45 di dinding belakang z=9.2, menghadap dalam (rotation.y=π), posisi x = 8.0 & 10.2', async () => {
    const { refs } = await build()
    refs.posterMeshes.forEach((p) => {
      expect(p.geometry.args).toEqual([1.1, 1.45])
      expect(p.rotation.y).toBe(Math.PI)
      expect(p.position.z).toBe(9.2)
      expect(p.position.y).toBe(2.4)
    })
    expect(refs.posterMeshes[0].position.x).toBe(8.0)
    expect(refs.posterMeshes[1].position.x).toBe(10.2)
    // kanvas poster dibuat & digambar 256×340
    expect(canvases).toHaveLength(2)
    expect(canvases[0].width).toBe(256)
    expect(canvases[0].height).toBe(340)
  })

  it('tanaman besar: pot silinder 0.35/0.28/0.55 warna 0x8B5E3C + 5 daun per tanaman, warna daun bergantian', async () => {
    const { refs, matLog } = await build()
    const potCols = matLog.filter((c) => c === 0x8B5E3C)
    expect(potCols).toHaveLength(3)
    refs.plants.forEach((pl) => {
      expect(pl.leaves).toHaveLength(5)
      expect(pl.pot.geometry.args).toEqual([0.35, 0.28, 0.55, 10])
      // daun: radius menyusut 0.38 − i·0.03
      pl.leaves.forEach((lf, i) => {
        expect(lf.geometry.args[0]).toBeCloseTo(0.38 - i * 0.03)
      })
    })
    // posisi pot sesuai 3 sudut
    const xs = refs.plants.map((p) => p.pot.position.x).sort()
    expect(xs).toEqual([-11.4, 11.4, 11.4])
  })

  it('partisi kaca: box 0.04×0.9×2.2 transparan 0.18 di x = −6/−2/2, renderOrder 2', async () => {
    const { refs } = await build()
    refs.partitions.forEach((gl) => {
      expect(gl.geometry.args).toEqual([0.04, 0.9, 2.2])
      expect(gl.material.opacity).toBe(0.18)
      expect(gl.material.transparent).toBe(true)
      expect(gl.renderOrder).toBe(2)
      expect(gl.position.y).toBe(0.5)
    })
    expect(refs.partitions.map((p) => p.position.x)).toEqual([-6, -2, 2])
  })

  it('rug area tengah: biru 3.6×0.015×2.4 di y=0.02 receiveShadow + inner oranye 2.6×0.017×1.6 di y=0.022', async () => {
    const { refs } = await build()
    expect(refs.rug.geometry.args).toEqual([3.6, 0.015, 2.4])
    expect(refs.rug.material.color).toBe(0x1565C0)
    expect(refs.rug.position.y).toBe(0.02)
    expect(refs.rug.receiveShadow).toBe(true)
    expect(refs.rugInner.geometry.args).toEqual([2.6, 0.017, 1.6])
    expect(refs.rugInner.material.color).toBe(0xEF6C00)
    expect(refs.rugInner.position.y).toBe(0.022)
  })

  it('lampu lounge: PointLight hangat 0xFFC97A intensitas 0.9 jarak 9 di (−9.5, 2.4, −1)', async () => {
    const { refs } = await build()
    expect(refs.loungeLight.color).toBe(0xFFC97A)
    expect(refs.loungeLight.intensity).toBe(0.9)
    expect(refs.loungeLight.distance).toBe(9)
    expect(refs.loungeLight.position.x).toBe(-9.5)
    expect(refs.loungeLight.position.y).toBe(2.4)
    expect(refs.loungeLight.position.z).toBe(-1)
  })
})
