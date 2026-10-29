// @vitest-environment jsdom
// Siklus 167 — WHITEBOARD sprint ikut meredup malam. Papan putih #fbfbfa =
// MeshBasicMaterial unlit (sengaja, agar terbaca) tapi jam malam menyala seperti
// panel lampu — kelas bug sama dgn jendela (164), panel dinding (165), trim/pilar
// (166). Mekanisme: TINT warna material (pola skyWins mode neon daycycle), BUKAN
// repaint kanvas — redraw live papan (setInterval 60 dtk + visibilitychange,
// data task nyata window.__tvData) hanya map.needsUpdate → tint warna material
// tak terhapus oleh redraw. Guard state+ready terpisah di createLighting,
// idempoten, ambang SAMA dgn jendela/dinding/trim (daylight <= 0.55).
import { describe, it, expect, vi } from 'vitest'
import { createLighting } from '../scene/parts/daycycle.js'
import { drawSprintBoard, WB_BG } from '../scene/parts/whiteboard_canvas.js'

// ── palet: papan siang = putih penuh (kontras tinta); malam = abu-biru gelap ──
const WB_TINT_NIGHT = 0x2A3446

describe('whiteboard — latar siang terang (kontrak painter tak berubah)', () => {
  it('latar #fbfbfa tetap sebagai oper pertama drawSprintBoard', () => {
    const ops = []
    const ctx = new Proxy({}, {
      get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
        : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} })
        : () => {}),
      set: (t, k, v) => { ops.push(['set:' + k, v]); return true },
    })
    drawSprintBoard(ctx, undefined)
    expect(ops[0]).toEqual(['set:fillStyle', WB_BG])
  })
  it('konstanta tint malam: abu-biru gelap, jauh lebih redup dari putih', () => {
    expect(WB_TINT_NIGHT).toBe(0x2A3446)
    expect((WB_TINT_NIGHT >> 16) & 0xff).toBeLessThan(0x80) // kanal R < 128 — bukan putih
    expect(WB_TINT_NIGHT).not.toBe(0xffffff)
  })
})

// ── integrasi createLighting: pemicu boardPainter (pola trimPainter) ──
function makeHarness(extra = {}) {
  const boardCalls = []
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    boardPainter: { paintBoardNight: (night) => { boardCalls.push(night); return 1 } },
    ...extra,
  }
  return { ctx, boardCalls }
}

describe('createLighting — pemicu whiteboard sesuai waktu (siklus 167)', () => {
  it('malam (60): paintBoardNight(true) terpanggil, boardNight=true', () => {
    const { ctx, boardCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    expect(boardCalls).toEqual([true])
    expect(L.boardNight).toBe(true)
  })
  it('siang (720) setelah malam: balik siang — false terpanggil', () => {
    const { ctx, boardCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    L.apply(720)
    expect(boardCalls).toEqual([true, false])
    expect(L.boardNight).toBe(false)
  })
  it('load langsung siang: 0 panggilan (material init = tint siang)', () => {
    const { ctx, boardCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(720); L.apply(721)
    expect(boardCalls).toEqual([])
    expect(L.boardNight).toBe(false)
  })
  it('idempoten: malam terus = 1 panggilan saja (0 biaya per tick)', () => {
    const { ctx, boardCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60); L.apply(61); L.apply(90)
    expect(boardCalls).toEqual([true])
  })
  it('senja (1100, daylight ≈ 0.44 < 0.55): ikut malam — ambang sama dgn dinding/trim', () => {
    const { ctx, boardCalls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(1100)
    expect(boardCalls).toEqual([true])
    expect(L.boardNight).toBe(true)
  })
  it('tanpa boardPainter (harness lama): apply aman, boardNight tetap false', () => {
    const { ctx } = makeHarness()
    delete ctx.boardPainter
    const L = createLighting(ctx)
    expect(() => L.apply(60)).not.toThrow()
    expect(L.boardNight).toBe(false)
  })
})

// ── Siklus 168: pemicu titlePainter (JUDUL dinding WFS PROJECT) — pola boardPainter ──
function makeTitleHarness(extra = {}) {
  const titleCalls = []
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    titlePainter: { paintTitleNight: (night) => { titleCalls.push(night); return 1 } },
    ...extra,
  }
  return { ctx, titleCalls }
}

describe('createLighting — pemicu judul dinding sesuai waktu (siklus 168)', () => {
  it('malam (60): paintTitleNight(true) terpanggil, titleNight=true', () => {
    const { ctx, titleCalls } = makeTitleHarness()
    const L = createLighting(ctx)
    L.apply(60)
    expect(titleCalls).toEqual([true])
    expect(L.titleNight).toBe(true)
  })
  it('siang (720) setelah malam: balik siang — false terpanggil', () => {
    const { ctx, titleCalls } = makeTitleHarness()
    const L = createLighting(ctx)
    L.apply(60)
    L.apply(720)
    expect(titleCalls).toEqual([true, false])
    expect(L.titleNight).toBe(false)
  })
  it('load langsung siang: 0 panggilan (kanvas init = palet siang)', () => {
    const { ctx, titleCalls } = makeTitleHarness()
    const L = createLighting(ctx)
    L.apply(720); L.apply(721)
    expect(titleCalls).toEqual([])
    expect(L.titleNight).toBe(false)
  })
  it('idempoten: malam terus = 1 panggilan saja (0 biaya per tick)', () => {
    const { ctx, titleCalls } = makeTitleHarness()
    const L = createLighting(ctx)
    L.apply(60); L.apply(61); L.apply(90)
    expect(titleCalls).toEqual([true])
  })
  it('senja (1100): ikut malam — ambang sama dgn jendela/dinding/trim/board', () => {
    const { ctx, titleCalls } = makeTitleHarness()
    const L = createLighting(ctx)
    L.apply(1100)
    expect(titleCalls).toEqual([true])
    expect(L.titleNight).toBe(true)
  })
  it('tanpa titlePainter (harness lama): apply aman, titleNight tetap false', () => {
    const { ctx } = makeTitleHarness()
    delete ctx.titlePainter
    const L = createLighting(ctx)
    expect(() => L.apply(60)).not.toThrow()
    expect(L.titleNight).toBe(false)
  })
  it('sinkron: board & title sama-sama true di malam 60 dan sama-sama false di siang (satu ambang)', () => {
    const titleCalls = []
    const L = createLighting({
      ambient: { intensity: 1 },
      sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 },
      scene: { background: null, fog: { color: null } },
      agentData: [{ dGlow: { intensity: 1 } }],
      THREE: { Color: class {} },
      boardPainter: { paintBoardNight: () => 1 },
      titlePainter: { paintTitleNight: (n) => { titleCalls.push(n); return 1 } },
    })
    L.apply(60)
    expect(L.boardNight).toBe(true)
    expect(L.titleNight).toBe(true)
    L.apply(720)
    expect(L.boardNight).toBe(false)
    expect(L.titleNight).toBe(false)
    expect(titleCalls).toEqual([true, false])
  })
})
