// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const texts = []
function makeCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {},
    closePath() {}, fill() {}, stroke() {}, fillText(t) { texts.push(String(t)) },
    measureText(s) { return { width: String(s).length * 10 } }, arc() {},
    createLinearGradient: () => ({ addColorStop() {} }),
  }
}
let canvases = []
function stubCreateElement() {
  const orig = document.createElement.bind(document)
  document.createElement = (tag) => {
    if (tag === 'canvas') {
      const cv = { width: 0, height: 0, getContext: () => makeCtx() }
      canvases.push(cv); return cv
    }
    return orig(tag)
  }
  return orig
}
class Tex { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1 }, o) } }
const THREE = {
  CanvasTexture: Tex, PlaneGeometry: Geom, BoxGeometry: Geom, MeshBasicMaterial: Mat, MeshLambertMaterial: Mat,
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set() {} }; this.rotation = {}; this.renderOrder = 0; this.userData = {}; this.visible = true } },
}
const SNAP = { tasks: { total: 3, done: 1, pending: 1, running: 1, failed: 0, review: 0, recent: [] }, saas: { online: true, stats: {}, tenants: [] }, agents: [] }
let deferred = []
function stubDeferredFetch() {
  deferred = []
  return vi.fn((...args) => {
    console.log('FETCH CALL from:', new Error('trace').stack.split('\n').slice(2, 5).join(' | '))
    return new Promise((resolve, reject) => { deferred.push({ resolve: () => resolve({ ok: true, json: async () => SNAP }), reject }) })
  })
}
const resolveAll = () => { const d = [...deferred]; deferred = []; d.forEach(p => p.resolve()) }

let origCreate
beforeEach(() => {
  vi.useFakeTimers()
  canvases = []
  origCreate = stubCreateElement()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
  document.createElement = origCreate
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('debug board', () => {
  it('trace fetch calls', async () => {
    const f = stubDeferredFetch()
    vi.stubGlobal('fetch', f)
    const { createProjectBoard } = await import('../scene/parts/projectboard.js')
    const board = createProjectBoard({ add: () => {} }, THREE)
    await vi.advanceTimersByTimeAsync(1)
    console.log('after mount, calls =', f.mock.calls.length, 'deferred =', deferred.length)
    board.destroy()
    resolveAll()
    await vi.advanceTimersByTimeAsync(1)
    console.log('after resolve, calls =', f.mock.calls.length)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1)
    console.log('after dispatch, calls =', f.mock.calls.length)
    expect(true).toBe(true)
  })
})
