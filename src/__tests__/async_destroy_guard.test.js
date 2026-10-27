// @vitest-environment jsdom
// Unit test guard async tvPull/pull (siklus 125): fetch in-flight saat destroy()
// TIDAK boleh menulis window/__tvData/menggambar canvas scene mati SETELAH destroy.
// Pola bug yang sama dengan pollStatus (siklus 124) — di sini di parts/lounge.js
// (tvPull) dan parts/projectboard.js (pull): await fetch selesai setelah purge
// destroy → window.__tvData / __lastTvDrawAt / tracker koneksi "bangkit" +
// drawTv()/draw() menggambar canvas scene mati.
// node_modules TANPA paket `canvas` → createElement('canvas') di-stub dgn ctx 2D
// palsu (fillText mencatat); THREE di-stub minimal; fetch di-stub manual (deferred).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function makeCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {},
    closePath() {}, fill() {}, stroke() {},
    fillText(t) { texts.push(String(t)) },
    measureText(s) { return { width: String(s).length * 10 } },
    arc() {}, createLinearGradient: () => ({ addColorStop() {} }),
  }
}
const texts = []
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

// THREE stub minimal (pola lounge_runtime/projectboard_runtime)
class Tex { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1 }, o) } }
class Obj {
  constructor() { this.children = []; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.visible = true; this.userData = {} }
  add(o) { this.children.push(o) }
  traverse(fn) { const walk = (o) => { fn(o); o.children?.forEach(walk) }; walk(this) }
}
const THREE = {
  CanvasTexture: Tex, BoxGeometry: Geom, PlaneGeometry: Geom, CylinderGeometry: Geom,
  MeshBasicMaterial: Mat, MeshLambertMaterial: Mat, DoubleSide: 2,
  Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true } },
  Group: Obj, Sprite: class extends Obj { constructor(m) { super(); this.material = m } },
  PointLight: class extends Obj { constructor(c, i) { super(); this.color = c; this.intensity = i } },
}

// Deferred fetch manual — fetch yang bisa kita selesaikan belakangan
// (simulasi fetch in-flight saat destroy).
let deferred = []
const SNAP = {
  tasks: { total: 3, done: 1, pending: 1, running: 1, failed: 0, review: 0, recent: [{ id: 21, title: 'task jalan A', status: 'running' }] },
  saas: { online: true, stats: { tenants: 1, conversations: 2, messages: 3 }, tenants: [{ name: 'Toko A' }] },
  agents: [],
}
function stubDeferredFetch(payload = SNAP) {
  deferred = []
  const f = vi.fn(() => new Promise((resolve, reject) => {
    deferred.push({
      resolve: () => resolve({ ok: true, json: async () => payload }),
      reject,
    })
  }))
  vi.stubGlobal('fetch', f)
  return f
}
const resolveAll = () => { const d = [...deferred]; deferred = []; d.forEach(p => p.resolve()) }
const rejectAll = () => { const d = [...deferred]; deferred = []; d.forEach(p => p.reject(new TypeError('network down'))) }

let origCreate
beforeEach(() => {
  vi.useFakeTimers()
  texts.length = 0
  canvases = []
  origCreate = stubCreateElement()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  delete window.__tvData
  delete window.__tvPullErr
  delete window.__lastTvDrawAt
  window.__tvData = { project: 'WFS PROJECT', done: 23, total: 30 } // pull awal sudah sukses (state sebelum uji)
})
afterEach(() => {
  vi.useRealTimers()
  document.createElement = origCreate
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete window.__tvData
  delete window.__tvPullErr
  delete window.__lastTvDrawAt
})

async function buildLounge() {
  const { createLounge } = await import('../scene/parts/lounge.js')
  const office = new Obj()
  const refs = createLounge({ THREE, office, M: () => new Mat({}), MB: () => new Mat({}), drawTvDashboard: () => {} })
  return refs
}
async function buildBoard() {
  const { createProjectBoard } = await import('../scene/parts/projectboard.js')
  const office = { add: () => {} }
  return createProjectBoard(office, THREE)
}

describe('siklus 125 — tvPull (lounge.js): fetch in-flight saat destroy tidak menulis window/canvas mati', () => {
  it('resolve SETELAH tvDestroy → window.__tvData/__lastTvDrawAt tidak bangkit, needsUpdate tidak disentuh', async () => {
    stubDeferredFetch()
    const refs = await buildLounge()
    await vi.advanceTimersByTimeAsync(1) // tvPull awal → fetch menggantung
    expect(deferred.length).toBe(1)
    refs.tvDestroy() // destroy scene
    expect(window.__tvData.project).toBe('WFS PROJECT') // purge di luar scope — nilai awal masih ada
    resolveAll() // fetch in-flight selesai SETELAH destroy
    await vi.advanceTimersByTimeAsync(1)
    // KUNCI: await selesai setelah tvStopped → tidak menulis apa pun
    expect(window.__tvData).toBeUndefined() // belum ditimpa data fetch (belum pernah sukses)
    expect(window.__lastTvDrawAt).toBeUndefined() // drawTv tidak dijalankan
    expect(window.__tvPullErr).toBeUndefined()
  })

  it('resolve SETELAH tvDestroy (pernah sukses sebelumnya) → __tvData lama TIDAK ditimpa data baru', async () => {
    stubDeferredFetch({ ...SNAP, tasks: { ...SNAP.tasks, total: 999 } })
    const refs = await buildLounge()
    await vi.advanceTimersByTimeAsync(1)
    refs.tvDestroy()
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(window.__tvData?.total).toBe(30) // nilai awal (fetch baru tidak ditulis)
    expect(window.__lastTvDrawAt).toBeUndefined()
  })

  it('reject SETELAH tvDestroy → catch tidak menulis __tvPullErr / tidak menggambar badge offline', async () => {
    stubDeferredFetch()
    const refs = await buildLounge()
    await vi.advanceTimersByTimeAsync(1)
    refs.tvDestroy()
    rejectAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(window.__tvPullErr).toBeUndefined()
    expect(window.__lastTvDrawAt).toBeUndefined()
  })

  it('resolve SEBELUM tvDestroy → perilaku lama tetap: __tvData diperbarui + needsUpdate', async () => {
    stubDeferredFetch({ ...SNAP, tasks: { ...SNAP.tasks, total: 42 } })
    const refs = await buildLounge()
    await vi.advanceTimersByTimeAsync(1)
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(window.__tvData.total).toBe(42)
    expect(window.__tvData.at).toBeGreaterThan(0)
    expect(window.__lastTvDrawAt).toBeGreaterThan(0)
    expect(refs.tvTex.needsUpdate).toBe(true)
    refs.tvDestroy() // kebersihan antar test
  })

  it('tvPull SETELAH tvDestroy → tidak memulai fetch baru', async () => {
    const f = stubDeferredFetch()
    const refs = await buildLounge()
    await vi.advanceTimersByTimeAsync(1)
    refs.tvDestroy()
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    const calls = f.mock.calls.length
    refs.tvPull() // panggilan manual setelah destroy
    await vi.advanceTimersByTimeAsync(1)
    expect(f.mock.calls.length).toBe(calls) // guard awal: tidak ada fetch baru
  })
})

describe('siklus 125 — pull (projectboard.js): fetch in-flight saat destroy tidak menggambar canvas mati', () => {
  it('resolve SETELAH destroy → tex.needsUpdate tidak pernah diset (canvas papan tidak digambar)', async () => {
    stubDeferredFetch()
    const board = await buildBoard()
    await vi.advanceTimersByTimeAsync(1) // pull awal menggantung
    expect(deferred.length).toBe(1)
    board.destroy()
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(board.mesh.material.map.needsUpdate).toBe(false) // draw() tidak dijalankan
  })

  it('reject SETELAH destroy → tracker koneksi tidak di-update (draw badge offline tidak jalan)', async () => {
    stubDeferredFetch()
    const board = await buildBoard()
    await vi.advanceTimersByTimeAsync(1)
    board.destroy()
    rejectAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(board.mesh.material.map.needsUpdate).toBe(false)
  })

  it('resolve SEBELUM destroy → perilaku lama tetap: papan menggambar data + needsUpdate', async () => {
    stubDeferredFetch()
    const board = await buildBoard()
    await vi.advanceTimersByTimeAsync(1)
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    expect(board.mesh.material.map.needsUpdate).toBe(true)
    board.destroy() // kebersihan antar test
  })

  it('pull SETELAH destroy (onVis) → tidak memulai fetch baru', async () => {
    const f = stubDeferredFetch()
    const board = await buildBoard()
    await vi.advanceTimersByTimeAsync(1)
    board.destroy()
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    const calls = f.mock.calls.length
    document.dispatchEvent(new Event('visibilitychange')) // onVis → pull()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.mock.calls.length).toBe(calls)
  })
})
