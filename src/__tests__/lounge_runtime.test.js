// @vitest-environment jsdom
// Unit test runtime createLounge (lounge.js): karpet lounge berlapis, coffee table,
// 2 kursi santai, lampu berdiri, meja majalah, TV info (canvas + interval fetch) — kantor 3D.
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
      const ctx = makeCtx()
      const cv = { width: 0, height: 0, getContext: () => ctx }
      canvases.push(cv)
      return cv
    }
    return orig(tag)
  }
  return orig
}

class Tex { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1, color: 0, side: 0 }, o) } }
class Obj {
  constructor() { this.children = []; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.visible = true }
  add(o) { this.children.push(o) }
  traverse(fn) { const walk = (o) => { fn(o); o.children?.forEach(walk) }; walk(this) }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.castShadow = false; this.isMesh = true }
}
class Sprite extends Obj { constructor(m) { super(); this.material = m } }
class Light extends Obj { constructor(color, i) { super(); this.color = color; this.intensity = i } }
const THREE = {
  Mesh, Group: Obj, Sprite, CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, PointLight: Light, DoubleSide: 2,
}

function makeSceneCtx() {
  const office = new Obj()
  const matLog = []
  const M = (c, o) => { matLog.push(c); return new Mat({ color: c, ...o }) }
  const MB = (c, o) => { matLog.push(c); return new Mat({ color: c, ...o }) }
  return { THREE, office, M, MB, matLog, added: office.children }
}

let origCreate
beforeEach(() => {
  canvases = []
  origCreate = stubCreateElement()
  window.__tvData = { project: 'WFS PROJECT', done: 23, total: 30 }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ project: 'WFS PROJECT', done: 23, total: 30 }) }))
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  document.createElement = origCreate
  vi.restoreAllMocks()
  delete window.__tvData
})

async function build() {
  const { createLounge } = await import('../scene/parts/lounge.js')
  const ctx = makeSceneCtx()
  const refs = createLounge({ ...ctx, drawTvDashboard: (c, d) => { c.fillStyle = 'tv:' + (d?.project || 'none') } })
  return { ...ctx, refs }
}

describe('createLounge — welcome & lounge kantor 3D', () => {
  it('menambahkan 1 grup lounge ke office dan mengembalikan referensi lengkap', async () => {
    const { office, refs } = await build()
    expect(office.children.filter(o => o.userData === undefined || true).some(o => o === refs.lounge)).toBe(true)
    expect(office.children).toContain(refs.lounge)
    expect(refs.rug).toBeTruthy()
    expect(refs.rugInner).toBeTruthy()
    expect(refs.coffeeBase).toBeTruthy()
    expect(refs.coffeeTop).toBeTruthy()
    expect(refs.magazine).toBeTruthy()
    expect(refs.mug).toBeTruthy()
    expect(refs.chairs).toHaveLength(2)
    expect(refs.lampPole).toBeTruthy()
    expect(refs.lampShade).toBeTruthy()
    expect(refs.lampBulb).toBeTruthy()
    expect(refs.magRack).toBeTruthy()
    expect(refs.mags).toHaveLength(3)
    expect(refs.tvFrame).toBeTruthy()
    expect(refs.tvScreen).toBeTruthy()
  })

  it('karpet lounge: dua kotak bertumpuk warna hangat + receiveShadow di rug luar', async () => {
    const { refs } = await build()
    expect(refs.rug.geometry.args).toEqual([3.2, .015, 3.0])
    expect(refs.rug.material.color).toBe(0x8D5524)
    expect(refs.rug.material.opacity).toBe(.75)
    expect(refs.rug.receiveShadow).toBe(true)
    expect(refs.rug.position).toMatchObject({ x: 9.7, y: .02, z: 7.4 })
    expect(refs.rugInner.geometry.args).toEqual([2.4, .017, 2.2])
    expect(refs.rugInner.material.color).toBe(0xC98A3D)
    expect(refs.rugInner.position).toMatchObject({ x: 9.7, y: .025, z: 7.4 })
  })

  it('coffee table: basis kayu + top kaca transparan + 4 kaki', async () => {
    const { refs } = await build()
    expect(refs.coffeeBase.geometry.args).toEqual([1.0, .06, .6])
    expect(refs.coffeeBase.material.color).toBe(0x6D4C41)
    expect(refs.coffeeBase.position).toMatchObject({ x: 9.55, y: .36, z: 6.4 })
    expect(refs.coffeeTop.material.color).toBe(0xB0BEC5)
    expect(refs.coffeeTop.material.opacity).toBe(.55)
    const legs = refs.lounge.children.filter(o =>
      o.geometry?.args?.[0] === .05 && o.geometry?.args?.[1] === .34)
    expect(legs).toHaveLength(4)
    expect(legs[0].position).toMatchObject({ x: 9.55 - .42, y: .17, z: 6.4 - .22 })
  })

  it('majalah (oranye, rotasi .4) + cangkir di atas coffee table', async () => {
    const { refs } = await build()
    expect(refs.magazine.geometry.args).toEqual([.24, .012, .3])
    expect(refs.magazine.material.color).toBe(0xF4511E)
    expect(refs.magazine.rotation.y).toBe(.4)
    expect(refs.magazine.position).toMatchObject({ x: 9.4, y: .45, z: 6.35 })
    expect(refs.mug.geometry.args[0]).toBe(.04)
    expect(refs.mug.material.color).toBe(0xFAFAFA)
    expect(refs.mug.position).toMatchObject({ x: 9.75, y: .475, z: 6.5 })
  })

  it('2 kursi santai: 4 kaki per kursi, castShadow utk semua mesh Lambert, rotasi khas', async () => {
    const { refs } = await build()
    const [c1, c2] = refs.chairs
    expect(c1.position).toMatchObject({ x: 8.7, y: 0, z: 7.7 })
    expect(c1.rotation.y).toBe(Math.PI * .5)
    expect(c2.position).toMatchObject({ x: 9.6, y: 0, z: 8.6 })
    expect(c2.rotation.y).toBe(Math.PI)
    // per kursi: seat + cush + back + 4 kaki = 7 anak
    expect(c1.children).toHaveLength(7)
    expect(c1.children[0].geometry.args).toEqual([.6, .3, .6])
    expect(c1.children[0].material.color).toBe(0x00695C)
    expect(c1.children[1].material.color).toBe(0x26A69A)
    let shadows = 0
    c1.traverse(o => { if (o.castShadow) shadows++ })
    expect(shadows).toBe(7) // semua non-basic material di-set castShadow
  })

  it('lampu berdiri: pole + shade DoubleSide hangat + PointLight 0xFFC97A di sudut lounge', async () => {
    const { refs } = await build()
    expect(refs.lampPole.geometry.args).toEqual([.025, .03, 1.5, 8])
    expect(refs.lampPole.material.color).toBe(0x37474F)
    expect(refs.lampPole.position).toMatchObject({ x: 11.2, y: .75, z: 8.6 })
    expect(refs.lampShade.geometry.args).toEqual([.18, .24, .28, 10, 1, true])
    expect(refs.lampShade.material.side).toBe(2) // DoubleSide
    expect(refs.lampShade.material.color).toBe(0xFFE0B2)
    expect(refs.lampBulb.color).toBe(0xFFC97A)
    expect(refs.lampBulb.intensity).toBe(.5)
    expect(refs.lampBulb.position).toMatchObject({ x: 11.2, y: 1.5, z: 8.6 })
  })

  it('meja majalah + 3 majalah berwarna + frame TV', async () => {
    const { refs } = await build()
    expect(refs.magRack.geometry.args).toEqual([.5, .45, .35])
    expect(refs.magRack.material.color).toBe(0x5D4037)
    expect(refs.magRack.position).toMatchObject({ x: 11.9, y: .225, z: 7.0 })
    expect(refs.mags.map(m => m.material.color)).toEqual([0xF4511E, 0x1E88E5, 0x43A047])
    expect(refs.mags[0].position).toMatchObject({ x: 11.72, y: .36, z: 7.0 })
    expect(refs.tvFrame.geometry.args).toEqual([.06, .75, 1.3])
    expect(refs.tvFrame.material.color).toBe(0x101418)
    expect(refs.tvFrame.position).toMatchObject({ x: 12.35, y: 2.0, z: 6.4 })
  })

  it('TV: kanvas 256×144 digambar dgn dashboard (window.__tvData), plane 1.2×.68 rot -π/2', async () => {
    const { refs } = await build()
    expect(refs.tvCanvas.width).toBe(256)
    expect(refs.tvCanvas.height).toBe(144)
    expect(refs.tvCanvas.getContext().fillStyle).toBe('tv:WFS PROJECT') // drawTvDashboard dipanggil dgn __tvData
    expect(refs.tvTex.needsUpdate).toBe(false) // belum ada refresh pasca-initial draw
    expect(refs.tvScreen.geometry.args).toEqual([1.2, .68])
    expect(refs.tvScreen.rotation.y).toBe(-Math.PI / 2)
    expect(refs.tvScreen.position).toMatchObject({ x: 12.31, y: 2.0, z: 6.4 })
  })

  it('tvPull: fetch /wfs-project, update __tvData + needsUpdate, dan interval 60 dtk', async () => {
    const { refs } = await build()
    await vi.runOnlyPendingTimersAsync()
    expect(fetch).toHaveBeenCalledWith('/wfs-project')
    expect(window.__tvData.project).toBe('WFS PROJECT')
    expect(window.__tvData.at).toBeGreaterThan(0)
    // interval berikutnya memicu fetch lagi
    const calls = fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetch.mock.calls.length).toBeGreaterThan(calls)
    // hidden tab: tidak fetch
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const c2 = fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetch.mock.calls.length).toBe(c2)
    // cleanup eksplisit
    clearInterval(refs.tvIv)
    document.removeEventListener('visibilitychange', refs.tvOnVis)
  })

  it('dua pemanggilan tidak berbagi state TV/kursi', async () => {
    const a = await build()
    const b = await build()
    expect(a.refs.chairs[0]).not.toBe(b.refs.chairs[0])
    expect(a.refs.tvCanvas).not.toBe(b.refs.tvCanvas)
    expect(a.refs.lounge).not.toBe(b.refs.lounge)
  })
})
