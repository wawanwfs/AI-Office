// @vitest-environment jsdom
// Siklus 166 — TRIM (crown molding/sill putih #F4F6FA) & PILAR (#8E9BB0) dinding
// ikut siang↔malam. Dulu keduanya warna solid MeshBasicMaterial STATIS: jam malam
// panel dinding sudah gelap (palet WALL_NIGHT, siklus 165) tapi lis putih & pilar
// abu terang tetap menyala — kelas bug sama dgn jendela (164) & panel (165).
// Mekanisme: material dicatat (trimPaints), MESH ter-tag (userData.__trim — referensi
// mesh selamat dari KLON wall-fade yang menukar material), paintTrimNight men-set
// warna material AKTIF per mesh. createLighting memicunya dgn ambang sama (d ≤ 0.55).
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { TRIM_DAY, TRIM_NIGHT, PIER_DAY, PIER_NIGHT } from '../scene/parts/wall_canvas.js'
import { createLighting } from '../scene/parts/daycycle.js'

// ── palet terpusat di wall_canvas: nilai & arah kecerahan ──
describe('palet trim & pilar siang↔malam (siklus 166)', () => {
  it('TRIM_NIGHT abu-biru pucat — jauh lebih redup dari putih #F4F6FA', () => {
    expect(TRIM_DAY).toBe(0xF4F6FA)
    expect(TRIM_NIGHT).toBe(0x8FA0BC)
    expect(TRIM_NIGHT).not.toBe(TRIM_DAY)
    // kanal biru naik (biru arsitektural), kanal merah turun kuat (redup)
    expect((TRIM_NIGHT & 0xff)).toBeGreaterThan((TRIM_NIGHT >> 16) & 0xff)
  })
  it('PIER_NIGHT menyatu dgn panel dinding malam — bukan abu terang siang', () => {
    expect(PIER_DAY).toBe(0x8E9BB0)
    expect(PIER_NIGHT).toBe(0x3E4A61)
    expect(PIER_NIGHT).not.toBe(PIER_DAY)
    expect(((PIER_NIGHT >> 16) & 0xff)).toBeLessThan(((PIER_DAY >> 16) & 0xff))
  })
})

// ── stub THREE minimal (pola walls_runtime.test.js; color = objek dgn set()) ──
class Color { constructor(v = 0) { this.v = v } set(x) { this.v = x; return this } }
class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) {
    Object.assign(this, { opacity: 1, transparent: false, depthWrite: true }, o)
    this.color = new Color(o.color ?? 0)
  }
  clone() { return new Mat({ ...this, color: this.color.v }) }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.rotation = { x: 0, y: 0, z: 0 }
    this.visible = true; this.userData = {}
  }
  add(o) { this.children.push(o) }
  traverse(fn) {
    fn(this)
    this.children.forEach((c) => { if (typeof c.traverse === 'function') c.traverse(fn); else fn(c) })
  }
}
class Mesh extends Obj {
  constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true }
}
class PointLight extends Obj { constructor() { super(); this.isPointLight = true } }
const THREE = {
  Mesh, Group: Obj, BoxGeometry: Geom, PlaneGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, PointLight,
  CanvasTexture: class { constructor(src) { this.src = src; this.repeat = { set() {} } } },
  RepeatWrapping: 1000,
}

const fakeCtx = () => new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 10 })
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} })
    if (k === 'canvas') return {}
    return () => {}
  },
  set: () => true,
})

function installCanvasStub() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') {
      const c = { width: 300, height: 150, style: {} }
      c.getContext = (kind) => (kind === '2d' ? fakeCtx() : null)
      return c
    }
    return orig(tag, ...rest)
  }
}

let createWalls
beforeAll(async () => {
  installCanvasStub()
  ;({ createWalls } = await import('../scene/parts/walls.js'))
})

function makeCtx() {
  const office = new Obj()
  return {
    THREE, office,
    M: (c) => new Mat({ color: c }),
    fl: new Mesh(new Geom(26, .15, 20), new Mat()),
    ceil: new Mesh(new Geom(26, .1, 20), new Mat()),
    skyWinMats: [],
    skyTex: new THREE.CanvasTexture('sky'),
    glassSheen: new THREE.CanvasTexture('sheen'),
  }
}

// ── integrasi createWalls: material tercatat, mesh ter-tag, paint via mesh ──
describe('createWalls — trim & pilar ikut malam (siklus 166)', () => {
  it('material trim/pilar dicatat: trimCount ≥ 40 (crown+sill×13, pilar×34) & inventaris lengkap', () => {
    const refs = createWalls(makeCtx())
    expect(refs.trimCount).toBeGreaterThanOrEqual(40)
    expect(refs.trimPaints.length).toBe(refs.trimCount)
    // semuanya punya pasangan day/night BERBEDA
    for (const { day, night } of refs.trimPaints) {
      expect(night).not.toBe(day)
      expect([TRIM_DAY, PIER_DAY]).toContain(day)
      expect([TRIM_NIGHT, PIER_NIGHT]).toContain(night)
    }
  })
  it('mesh pemakai material trim/pilar ter-tag (userData.__trim dgn pasangan warna)', () => {
    const ctx = makeCtx()
    const refs = createWalls(ctx)
    const inv = new Map(refs.trimPaints.map(({ mat, day, night }) => [mat, { day, night }]))
    let tagged = 0
    ctx.office.traverse((o) => {
      if (o.isMesh && inv.has(o.material)) {
        expect(o.userData.__trim).toBeTruthy()
        expect(o.userData.__trim.night).toBe(inv.get(o.material).night)
        tagged++
      }
    })
    expect(tagged).toBe(refs.trimCount)
  })
  it('paintTrimNight(true): SEMUA mesh ter-tag jadi warna malam; (false) balik siang', () => {
    const ctx = makeCtx()
    const refs = createWalls(ctx)
    expect(refs.paintTrimNight(true)).toBe(refs.trimCount)
    ctx.office.traverse((o) => {
      if (o.isMesh && o.userData.__trim) expect(o.material.color.v).toBe(o.userData.__trim.night)
    })
    expect(refs.paintTrimNight(false)).toBe(refs.trimCount)
    ctx.office.traverse((o) => {
      if (o.isMesh && o.userData.__trim) expect(o.material.color.v).toBe(o.userData.__trim.day)
    })
  })
  it('KLON wall-fade ikut: mesh dgn material diklon tetap di-set (akar bug by-reference)', () => {
    const ctx = makeCtx()
    const refs = createWalls(ctx)
    // simulasikan collect(): klon material mesh depan (crown molding = trim pertama FM)
    const crown = ctx.office.children.find((o) => o.isMesh && o.material && o.material.color && o.material.color.v === TRIM_DAY && o.userData.__trim)
    expect(crown).toBeTruthy()
    crown.material = crown.material.clone()
    refs.paintTrimNight(true)
    expect(crown.material.color.v).toBe(TRIM_NIGHT) // klon ikut — BUG KLAS by-reference TERTUTUP
  })
})

// ── integrasi createLighting: ambang SAMA dgn jendela & dinding, guard terpisah ──
function makeHarness() {
  const wallCalls = []
  const trimCalls = []
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    wallPainter: { paintWallNight: (night) => { wallCalls.push(night); return 8 } },
    trimPainter: { paintTrimNight: (night) => { trimCalls.push(night); return 47 } },
  }
  return { ctx, wallCalls, trimCalls }
}

describe('createLighting — pemicu trim sesuai waktu (siklus 166)', () => {
  it('malam (60): paintTrimNight(true) terpanggil, trimNight=true — sinkron dgn dinding', () => {
    const { ctx, wallCalls, trimCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    expect(trimCalls).toEqual([true])
    expect(wallCalls).toEqual([true]) // ambang & keadaan identik
    expect(L.trimNight).toBe(true)
  })
  it('siang (720): balik siang setelah malam — false terpanggil', () => {
    const { ctx, trimCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    L.apply(720)
    expect(trimCalls).toEqual([true, false])
    expect(L.trimNight).toBe(false)
  })
  it('load langsung siang: 0 set (material init sudah palet siang)', () => {
    const { ctx, trimCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(720); L.apply(721)
    expect(trimCalls).toEqual([])
    expect(L.trimNight).toBe(false)
  })
  it('idempoten: malam terus = 1 set saja (0 biaya per tick)', () => {
    const { ctx, trimCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(0); L.apply(30); L.apply(90)
    expect(trimCalls).toEqual([true])
  })
  it('senja 1100 (daylight ≈ 0.44 < 0.55) → sudah malam; ambang sama dgn jendela+dinding', () => {
    const { ctx, wallCalls, trimCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(1100)
    expect(trimCalls).toEqual([true])
    expect(wallCalls).toEqual([true])
  })
  it('tanpa trimPainter (harness lama): apply aman — trimNight false, jalur lain tetap jalan', () => {
    const L = createLighting({
      ambient: { intensity: 1 }, sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 }, scene: { background: null, fog: { color: null } },
      agentData: [], THREE: { Color: class {} },
    })
    expect(() => L.apply(60)).not.toThrow()
    expect(L.trimNight).toBe(false)
  })
})
