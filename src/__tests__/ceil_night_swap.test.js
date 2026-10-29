// @vitest-environment jsdom
// Siklus 169 — PANEL PLAFON recessed (0xF0F4FF, n=114 — bidang unlit TERLUAS di
// audit scene live) & BOHLAM lampu gantung (0xfff3d6 ×26 meja) ikut siang↔malam.
// Dulu keduanya MeshBasicMaterial statis: malam hari panel dinding/judul sudah
// gelap (165-168) tapi plafon tetap menyala penuh seperti panel lampu — kelas bug
// sama dgn jendela (164)…judul (168). Mekanisme: pasangan warna day/night di
// createCeilingFixtures (room.js), MESH ter-tag (userData.__ceil = warna siang) →
// paintCeilNight set warna material AKTIF per mesh (pola trim 166 — selamat dari
// klon wall-fade). createLighting memicunya dgn ambang SAMA (daylight ≤ 0.55),
// guard state+ready terpisah, idempoten.
import { describe, it, expect, vi } from 'vitest'
import { createLighting } from '../scene/parts/daycycle.js'
import { createCeilingFixtures } from '../scene/parts/room.js'

describe('palet plafon & bohlam siang↔malam (siklus 169)', () => {
  it('konstanta: panel siang #F0F4FF (identik kode lama), malam biru arsitektural gelap', () => {
    const rt = createCeilingFixtures(makeCtx(), [])
    expect(rt.ceilDay).toBe(0xF0F4FF)
    expect(rt.ceilNight).toBe(0x2E3A52)
    expect(rt.ceilNight).not.toBe(rt.ceilDay)
    // kanal R gelap kuat — bukan putih
    expect((rt.ceilNight >> 16) & 0xff).toBeLessThan(0x50)
  })
  it('konstanta bohlam: siang #FFF3D6 hangat (identik lama), malam amber sangat redup dgn hue terjaga', () => {
    const rt = createCeilingFixtures(makeCtx(), [])
    expect(rt.bulbDay).toBe(0xFFF3D6)
    expect(rt.bulbNight).toBe(0x3A3426)
    // hue hangat terjaga: R ≥ G > B di kedua palet
    const ch = (v, s) => (v >> s) & 0xff
    expect(ch(rt.bulbDay, 16)).toBeGreaterThanOrEqual(ch(rt.bulbDay, 8))
    expect(ch(rt.bulbDay, 8)).toBeGreaterThan(ch(rt.bulbDay, 0))
    expect(ch(rt.bulbNight, 16)).toBeGreaterThanOrEqual(ch(rt.bulbNight, 8))
    expect(ch(rt.bulbNight, 8)).toBeGreaterThan(ch(rt.bulbNight, 0))
    // lum malam ≤ ¼ siang
    const lum = (v) => 0.2126 * ch(v, 16) + 0.7152 * ch(v, 8) + 0.0722 * ch(v, 0)
    expect(lum(rt.bulbNight)).toBeLessThan(lum(rt.bulbDay) * 0.3)
  })
})

// ── stub THREE minimal (pola trim_night_swap.test.js) ──
class Color { constructor(v = 0) { this.v = v } set(x) { this.v = x; return this } }
class Geom { constructor(...a) { this.args = a } }
class Mat {
  constructor(o = {}) {
    Object.assign(this, { opacity: 1, transparent: false }, o)
    this.color = new Color(o.color ?? 0)
    this.isMeshBasicMaterial = !o.lambert
  }
  clone() { return new Mat({ ...this, color: this.color.v }) }
}
class Obj {
  constructor() {
    this.children = []
    this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z } }
    this.userData = {}
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
function makeCtx(extra = {}) {
  return {
    THREE: {
      Mesh, Group: Obj, BoxGeometry: Geom, MeshBasicMaterial: (o) => new Mat({ ...o, lambert: false }),
      PointLight,
    },
    office: new Obj(),
    M: (c) => new Mat({ color: c, lambert: true }),
    MB: (c) => new Mat({ color: c, lambert: false }),
    ...extra,
  }
}

describe('createCeilingFixtures — paintCeilNight set warna mesh ter-tag', () => {
  it('bohlam per meja ter-tag dgn pasangan siang→malam; tanpa meja = tak error', () => {
    const ctx = makeCtx()
    const rt = createCeilingFixtures(ctx, [{ x: 2, z: -3 }])
    const bulbs = ctx.office.children.filter((c) => c.isMesh && c.userData.__ceil === rt.bulbDay)
    expect(bulbs.length).toBe(1)
    expect(rt.paintCeilNight(true)).toBe(1)
    expect(bulbs[0].material.color.v).toBe(rt.bulbNight)
    expect(rt.paintCeilNight(false)).toBe(1)
    expect(bulbs[0].material.color.v).toBe(rt.bulbDay)
  })
  it('panel plafon ter-tag OfficeScene (userdData.__ceil) ikut malam & balik siang', () => {
    const ctx = makeCtx()
    const rt = createCeilingFixtures(ctx, [])
    // simulasikan panel ter-tag persis seperti OfficeScene
    const panel = new Mesh(new Geom(3, 0.03, 1), ctx.MB(rt.ceilDay))
    panel.userData.__ceil = rt.ceilDay
    ctx.office.add(panel)
    rt.paintCeilNight(true)
    expect(panel.material.color.v).toBe(rt.ceilNight)
    rt.paintCeilNight(false)
    expect(panel.material.color.v).toBe(rt.ceilDay)
  })
  it('material tak ter-tag TIDAK tersentuh', () => {
    const ctx = makeCtx()
    const rt = createCeilingFixtures(ctx, [{ x: 0, z: 0 }])
    const other = new Mesh(new Geom(1, 1, 1), ctx.MB(0x123456))
    ctx.office.add(other)
    rt.paintCeilNight(true)
    expect(other.material.color.v).toBe(0x123456)
  })
  it('office tanpa traverse (harness lama): aman, return 0', () => {
    const ctx = makeCtx()
    const rt = createCeilingFixtures(ctx, [{ x: 0, z: 0 }])
    ctx.office.traverse = undefined
    expect(rt.paintCeilNight(true)).toBe(0)
  })
})

// ── integrasi createLighting: pemicu ceilPainter (pola boardPainter/titlePainter) ──
function makeHarness(extra = {}) {
  const ceilCalls = []
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    ceilPainter: { paintCeilNight: (night) => { ceilCalls.push(night); return 1 } },
    ...extra,
  }
  return { ctx, ceilCalls }
}

describe('createLighting — pemicu panel plafon sesuai waktu (siklus 169)', () => {
  it('malam (60): paintCeilNight(true) terpanggil, ceilNight=true', () => {
    const { ctx, ceilCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    expect(ceilCalls).toEqual([true])
    expect(L.ceilNight).toBe(true)
  })
  it('siang (720) setelah malam: balik siang — false terpanggil', () => {
    const { ctx, ceilCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    L.apply(720)
    expect(ceilCalls).toEqual([true, false])
    expect(L.ceilNight).toBe(false)
  })
  it('load langsung siang: 0 panggilan (material init = palet siang)', () => {
    const { ctx, ceilCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(720); L.apply(721)
    expect(ceilCalls).toEqual([])
    expect(L.ceilNight).toBe(false)
  })
  it('idempoten: malam terus = 1 panggilan saja (0 biaya per tick)', () => {
    const { ctx, ceilCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60); L.apply(61); L.apply(90)
    expect(ceilCalls).toEqual([true])
  })
  it('senja (1100, daylight ≈ 0.44 < 0.55): ikut malam — ambang sama dgn jendela/dinding/trim/board/title', () => {
    const { ctx, ceilCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(1100)
    expect(ceilCalls).toEqual([true])
    expect(L.ceilNight).toBe(true)
  })
  it('tanpa ceilPainter (harness lama): apply aman, ceilNight tetap false', () => {
    const { ctx } = makeHarness()
    delete ctx.ceilPainter
    const L = createLighting(ctx)
    expect(() => L.apply(60)).not.toThrow()
    expect(L.ceilNight).toBe(false)
  })
  it('sinkron dgn painter lain di 6 keadaan waktu (satu ambang satu kebenaran)', () => {
    const calls = { wall: [], trim: [], board: [], title: [], ceil: [] }
    const { ctx } = makeHarness({
      wallPainter: { paintWallNight: (n) => { calls.wall.push(n) } },
      trimPainter: { paintTrimNight: (n) => { calls.trim.push(n) } },
      boardPainter: { paintBoardNight: (n) => { calls.board.push(n) } },
      titlePainter: { paintTitleNight: (n) => { calls.title.push(n) } },
      ceilPainter: { paintCeilNight: (n) => { calls.ceil.push(n) } },
    })
    const L = createLighting(ctx)
    for (const m of [0, 400, 720, 1000, 1100, 1200]) L.apply(m)
    // wall/trim/board/title/ceil: urutan panggilan identik (sky tanpa kanvas dilewati)
    expect(calls.wall).toEqual(calls.ceil)
    expect(calls.trim).toEqual(calls.ceil)
    expect(calls.board).toEqual(calls.ceil)
    expect(calls.title).toEqual(calls.ceil)
  })
})
