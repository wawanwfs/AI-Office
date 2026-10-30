// @vitest-environment jsdom
// Siklus 170 — resync painter day/night pasca mode neon OFF + remap registry
// skyWinMats saat klon wall-fade (walls.js). Latar: toggleCyberpunk ditulis ulang
// inline (commit 4e17450) dan melupakan tint jendela & panel plafon —
// createNeonMode jadi kode mati; probe live menunjukkan 13 jendela tetap putih
// menyala di ruangan neon gelap. Selain itu registry skyWinMats memegang material
// ASLI jendela belakang/kiri yang sudah di-CLONE collect() wall-fade → tint
// menyasar objek mati. Fix: (1) remap registry saat klon; (2) toggle inline ikut
// menyetel jendela/panel/pendant; (3) resync() memaksa semua painter 164-169
// repaint sesuai jam NOW pasca neon OFF (guard ready painter tak lagi valid).
import { describe, it, expect, vi } from 'vitest'
import { createLighting } from '../scene/parts/daycycle.js'

// ctx 2D no-op (node_modules tanpa paket `canvas` — pola walls_runtime/board test)
const fakeCtx = () => new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop() {} })
    : () => {}),
  set: () => true,
})

function makeHarness() {
  const calls = { wall: [], trim: [], board: [], title: [], ceil: [] }
  const skyCanvas = { getContext: () => fakeCtx() }
  skyCanvas.__needsUpdate = vi.fn()
  const ctx = {
    ambient: { intensity: 1 },
    sun: { intensity: 1, color: { set: vi.fn() } },
    renderer: { toneMappingExposure: 1 },
    scene: { background: null, fog: { color: null } },
    agentData: [{ dGlow: { intensity: 1 } }],
    THREE: { Color: class {} },
    skyWinCanvas: skyCanvas,
    wallPainter: { paintWallNight: (n) => { calls.wall.push(n); return 1 } },
    trimPainter: { paintTrimNight: (n) => { calls.trim.push(n); return 1 } },
    boardPainter: { paintBoardNight: (n) => { calls.board.push(n); return 1 } },
    titlePainter: { paintTitleNight: (n) => { calls.title.push(n); return 1 } },
    ceilPainter: { paintCeilNight: (n) => { calls.ceil.push(n); return 1 } },
  }
  return { ctx, calls, skyCanvas }
}

const all = (calls, v) => ['wall', 'trim', 'board', 'title', 'ceil'].every((k) => calls[k].at(-1) === v)

describe('createLighting.resync — pulihkan palet painter pasca neon OFF (siklus 170)', () => {
  it('resync saat malam memaksa repaint SEMUA painter true — meski state sudah malam (guard dilingkari)', () => {
    const { ctx, calls, skyCanvas } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)                      // load malam: painter true (ready-guard jalur pertama)
    expect(all(calls, true)).toBe(true)
    // Simulasi neon ON menimpa warna keras (tint jendela dkk.) lalu neon OFF:
    L.resync()
    expect(calls.wall).toEqual([true, true])   // repaint PAKSA kedua kali
    expect(calls.ceil).toEqual([true, true])
    expect(skyCanvas.__needsUpdate).toHaveBeenCalled()
    expect(L.skyNight && L.wallNight && L.trimNight && L.boardNight && L.titleNight && L.ceilNight).toBe(true)
  })

  it('resync saat siang memaksa repaint palet SIANG (ready-guard terlanjur terkonsumsi)', () => {
    const { ctx, calls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(720)                     // load siang: ready-guard menelan paint pertama (calls kosong)
    expect(calls.board).toEqual([])
    L.resync()                       // neon OFF saat jam 720 → repaint paksa palet SIANG
    expect(calls.wall).toEqual([false])
    expect(calls.ceil).toEqual([false])
    expect(L.skyNight || L.wallNight || L.trimNight || L.boardNight || L.titleNight || L.ceilNight).toBe(false)
  })

  it('getter tetap boolean (bukan null/undefined) setelah resync', () => {
    const { ctx } = makeHarness()
    const L = createLighting(ctx)
    L.apply(0)
    L.resync()
    for (const g of ['skyNight', 'wallNight', 'trimNight', 'boardNight', 'titleNight', 'ceilNight']) {
      expect(typeof L[g]).toBe('boolean')
    }
  })

  it('apply() setelah resync = no-op (idempoten, tak ada repaint ganda)', () => {
    const { ctx, calls } = makeHarness()
    const L = createLighting(ctx)
    L.apply(60)
    L.resync()
    const n = calls.wall.length
    L.apply(60)
    expect(calls.wall.length).toBe(n)
  })

  it('resync tanpa painter/skyWinCanvas: aman tanpa error (unit test lama)', () => {
    const L = createLighting({
      ambient: { intensity: 1 },
      sun: { intensity: 1, color: { set: vi.fn() } },
      renderer: { toneMappingExposure: 1 },
      scene: { background: null, fog: { color: null } },
      agentData: [{ dGlow: { intensity: 1 } }],
      THREE: { Color: class {} },
    })
    expect(() => L.resync()).not.toThrow()
  })
})
