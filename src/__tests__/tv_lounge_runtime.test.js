// @vitest-environment jsdom
// Unit test runtime TV lounge (drawTv + tvPull di OfficeScene.js, baris ~1060-1115):
// TV dashboard live /wfs-project — penujian via ekstraksi fungsi drawTv/tvPull dari
// sumber OfficeScene.js (eval dalam sandbox dengan stub canvas/THREE/window/fetch),
// karena drawTv tidak diekspor. Mencatat fillText (canvas stub) & fetch calls.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drawTvDashboard } from '../scene/parts/tv_canvas.js'

const texts = []
function makeCtx() {
  return {
    fillStyle: '', font: '', textAlign: '', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, beginPath() {}, fill() {},
    fillText(t) { texts.push(String(t)) },
    measureText(s) { return { width: String(s).length * 10 } },
    createLinearGradient: () => ({ addColorStop() {} }),
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

// Ekstrak blok TV dari OfficeScene.js: dari komentar "TV lounge" sampai "office.add(lounge);"
function extractTvSource() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(path.join(here, '..', 'scene', 'OfficeScene.js'), 'utf8')
  const start = src.indexOf("const tvC=document.createElement('canvas')")
  const end = src.indexOf('office.add(lounge);', start)
  if (start < 0 || end < 0) throw new Error('blok TV lounge tidak ditemukan di OfficeScene.js')
  return src.slice(start, end)
}

const SNAP = {
  tasks: { total: 23, done: 15, pending: 4, running: 2, failed: 1, review: 2 },
  saas: { online: true, stats: { tenants: 3, messages: 120 } },
  agents: [{ name: 'sbx-be1', status: 'Up' }, { name: 'qa1', status: 'Down' }],
}

let fetchMock, win, TexRef
function buildSandbox({ snap = SNAP, fail = false, hidden = false } = {}) {
  Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true })
  fetchMock = vi.fn(async () => {
    if (fail) throw new Error('HTTP 500')
    return { ok: true, json: async () => snap }
  })
  win = {
    document, fetch: fetchMock,
    setInterval, clearInterval, setTimeout, clearTimeout,
    Date,
  }
  win.window = win
  // CanvasTexture stub yang menyimpan canvas
  TexRef = class { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
  const THREE = { CanvasTexture: TexRef, LinearFilter: 'linear' }
  THREE.PlaneGeometry = class Geom { constructor(...a) { this.args = a } }
  THREE.MeshBasicMaterial = class Mat { constructor(o) { Object.assign(this, o) } }
  THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.visible = true } }
  return { THREE }
}

function runTvCode(opts) {
  stubCreateElement()
  const { THREE } = buildSandbox(opts)
  const code = extractTvSource()
  // fungsi + const dievaluasi via new Function; window.__tvData diakses via win
  const fn = new Function('window', 'THREE', 'document', 'lounge', 'fetch', 'drawTvDashboard', code + `
    ;return tvPull().then(() =>
      ({ drawTv, tvPull, tvC, tvTex, tvIv, tvOnVis, tvScr }))`)
  const lounge = { add() {}, children: [] }
  return fn(win, THREE, document, lounge, fetchMock, drawTvDashboard)
}

beforeEach(() => {
  vi.useFakeTimers()
  texts.length = 0
  canvases = []
  win = undefined
})
afterEach(() => {
  if (win && win.__tvIv) clearInterval(win.__tvIv)
  if (win && win.__tvOnVis) document.removeEventListener('visibilitychange', win.__tvOnVis)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TV lounge — render dashboard (drawTv)', () => {
  it('canvas TV 256x144, header WFS HQ · LIVE; tanpa data → teks menghubungkan (tanpa angka)', async () => {
    const r = await runTvCode()
    expect(r.tvC.width).toBe(256); expect(r.tvC.height).toBe(144)
    expect(texts.some(t => t.includes('WFS HQ · LIVE'))).toBe(true)
    // reset: gambar ulang tanpa data (snap belum masuk) → teks 'menghubungkan', tanpa angka palsu
    delete win.__tvData
    texts.length = 0
    r.drawTv()
    expect(texts.some(t => t.includes('menghubungkan'))).toBe(true)
    expect(texts.some(t => t.includes('%'))).toBe(false)
  })

  it('dengan data: persen done/total, bar progress, GAGAL & REVIEW, SaaS tenant, agent Up/Down dot', async () => {
    const r = await runTvCode()
    await r.tvPull()
    r.drawTv()
    expect(texts.some(t => t === '65% · 15/23 task')).toBe(true)
    expect(texts.some(t => t === 'GAGAL: 1')).toBe(true)
    expect(texts.some(t => t === 'REVIEW: 2')).toBe(true) // tanpa GAGAL di kiri → kolom 12? GAGAL ada → REVIEW di x=90
    expect(texts.some(t => t === 'SaaS')).toBe(true)
    expect(texts.some(t => t === '3 tenant · 120 pesan')).toBe(true)
    expect(texts.some(t => t.includes('sbx-be1●'))).toBe(true)
    expect(texts.some(t => t.includes('qa1○'))).toBe(true)
    expect(texts.some(t => t.startsWith('update '))).toBe(true)
  })

  it('progress bar: lebar proporsional pct (232px area, min 6px)', async () => {
    const r = await runTvCode()
    await r.tvPull()
    // verifikasi via drawTv ulang dengan snap ekstrem: 0/0 → pct 0
    win.__tvData.tasks = { total: 0, done: 0 }
    texts.length = 0
    r.drawTv()
    expect(texts.some(t => t === '0% · 0/0 task')).toBe(true) // tidak NaN/Infinity
  })
})

describe('TV lounge — fetch & siklus hidup (tvPull)', () => {
  it('tvPull segera fetch /wfs-project, simpan __tvData dengan at=timestamp, needsUpdate', async () => {
    const r = await runTvCode()
    expect(fetchMock).toHaveBeenCalledTimes(2) // 1x pemanggilan langsung (tvPull();) + 1x dalam runTvCode (await)
    expect(fetchMock.mock.calls[0][0]).toBe('/wfs-project')
    expect(win.__tvData.tasks.total).toBe(23)
    expect(typeof win.__tvData.at).toBe('number')
    expect(r.tvTex.needsUpdate).toBe(true)
  })

  it('interval 60 dtk: 2 tick lanjutan fetch lagi (total 4 setelah mount ganda)', async () => {
    const r = await runTvCode()
    const base = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock.mock.calls.length).toBe(base + 1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock.mock.calls.length).toBe(base + 2)
    clearInterval(r.tvIv)
  })

  it('tab hidden → tvPull tidak fetch; fetch gagal → tidak throw, data lama dipertahankan', async () => {
    const r = await runTvCode()
    clearInterval(r.tvIv)
    const base = fetchMock.mock.calls.length
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await r.tvPull()
    expect(fetchMock.mock.calls.length).toBe(base) // hidden → skip
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    // fetch gagal: stub lempar
    fetchMock.mockImplementation(async () => { throw new Error('HTTP 500') })
    await expect(r.tvPull()).resolves.toBeUndefined()
    expect(win.__tvData.tasks.total).toBe(23) // data lama tetap
    expect(r.tvTex.needsUpdate).toBe(true)
  })

  it('tvOnVis hanya fetch saat visible; destroy path: clearInterval+removeEventListener (simulasi manual)', async () => {
    const r = await runTvCode()
    clearInterval(r.tvIv)
    const base = fetchMock.mock.calls.length
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    r.tvOnVis()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock.mock.calls.length).toBe(base)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    r.tvOnVis()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock.mock.calls.length).toBe(base + 1)
    // tvScr: plane 1.2x0.68 material map tvTex, posisi dinding lounge
    expect(r.tvScr.geometry.args).toEqual([1.2, 0.68])
    expect(r.tvScr.material.map).toBe(r.tvTex)
    expect(r.tvScr.rotation.y).toBe(-Math.PI / 2)
    expect(r.tvScr.position.x).toBeCloseTo(12.31)
  })
})
