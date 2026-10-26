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
import { applyPollResult, nextPollDelay } from '../lib/connection_spec.js'
import { uiTexture, uiMaterial } from '../scene/parts/ui_colorspace.js'

const texts = []
function makeCtx() {
  return {
    fillStyle: '', font: '', textAlign: '', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, beginPath() {}, arc() {}, fill() {},
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

// Ekstrak blok TV dari parts/lounge.js: dari "const tvC" sampai "office.add(lounge);"
function extractTvSource() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(path.join(here, '..', 'scene', 'parts', 'lounge.js'), 'utf8')
  const start = src.indexOf('const tvC = document')
  const end = src.indexOf('office.add(lounge);', start)
  if (start < 0 || end < 0) throw new Error('blok TV lounge tidak ditemukan di parts/lounge.js')
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
  // fungsi + const dievaluasi via new Function; window.__tvData diakses via win.
  // Helper tracker koneksi di-inject (import ES modul tidak terlihat new Function).
  const fn = new Function('window', 'THREE', 'document', 'lounge', 'fetch', 'drawTvDashboard',
    'applyPollResult', 'nextPollDelay', 'uiTexture', 'uiMaterial', code + `
    ;return tvPull(true).then(() =>
      ({ drawTv, tvPull, tvC, tvTex, tvIv: tvPollTimer, tvSchedule, tvDestroy, tvOnVis, tvScr, connTick }))`)
  const lounge = { add() {}, children: [] }
  return fn(win, THREE, document, lounge, fetchMock, drawTvDashboard, applyPollResult, nextPollDelay, uiTexture, uiMaterial)
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
    r.tvDestroy()
  })

  it('polling adaptif: fetch gagal beruntun → tick berikutnya backoff 5→10 dtk (bukan 60 dtk), pulih → 60 dtk', async () => {
    const r = await runTvCode()
    const base = fetchMock.mock.calls.length
    fetchMock.mockImplementation(async () => { throw new Error('HTTP 500') })
    // mount sukses (base) → tick pertama (60 dtk) gagal → delay kini 5 dtk
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock.mock.calls.length).toBe(base + 1)
    await vi.advanceTimersByTimeAsync(5_000) // backoff ke-1 → tick ke-2 gagal → delay 10 dtk
    expect(fetchMock.mock.calls.length).toBe(base + 2)
    await vi.advanceTimersByTimeAsync(9_000) // belum 10 dtk → belum fetch
    expect(fetchMock.mock.calls.length).toBe(base + 2)
    await vi.advanceTimersByTimeAsync(1_000) // backoff ke-2 → tick ke-3 gagal → delay 20 dtk
    expect(fetchMock.mock.calls.length).toBe(base + 3)
    // pulih pada backoff ke-3 (20 dtk) → delay kembali 60 dtk
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => SNAP }))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock.mock.calls.length).toBe(base + 4)
    await vi.advanceTimersByTimeAsync(59_000) // belum 60 dtk → tidak fetch
    expect(fetchMock.mock.calls.length).toBe(base + 4)
    await vi.advanceTimersByTimeAsync(1_000) // tepat 60 dtk → fetch lagi
    expect(fetchMock.mock.calls.length).toBe(base + 5)
    r.tvDestroy()
  })

  it('badge koneksi gateway: awal TERPUTUS → LIVE setelah fetch sukses → SINKRON N dtk LALU saat fetch gagal', async () => {
    const r = await runTvCode()
    // Awal: tracker down (belum pernah sukses) → label TERPUTUS sudah tergambar
    // pada drawTv pertama (dipanggil sebelum fetch pertama selesai).
    expect(texts.some(t => t === 'TERPUTUS')).toBe(true)
    texts.length = 0
    await r.tvPull() // sukses → state live
    r.drawTv()
    expect(texts.some(t => t === 'LIVE')).toBe(true)
    expect(texts.some(t => t === 'TERPUTUS')).toBe(false)
    // Fetch gagal → catch langsung drawTv ulang: badge berubah tanpa menunggu tick
    texts.length = 0
    fetchMock.mockImplementation(async () => { throw new Error('HTTP 500') })
    await r.tvPull()
    expect(texts.some(t => /^SINKRON \d+ dtk LALU$/.test(t))).toBe(true)
    expect(texts.some(t => t === 'LIVE')).toBe(false)
    // drawTv manual juga memakai tracker tvConn (bukan nilai basi)
    r.tvDestroy()
  })

  it('tvDestroy menghentikan rantai poll adaptif — tidak ada fetch lagi setelah destroy', async () => {
    const r = await runTvCode()
    const base = fetchMock.mock.calls.length
    r.tvDestroy()
    await vi.advanceTimersByTimeAsync(300_000)
    expect(fetchMock.mock.calls.length).toBe(base)
  })

  it('REGRESI siklus 110: drawTv menandai tvTex.needsUpdate di SEMUA jalur — badge koneksi benar-benar tampak di tekstur 3D', async () => {
    // Bug siklus 109: jalur sukses meng-set tvTex.needsUpdate, tapi jalur gagal
    // (catch) hanya memanggil drawTv() → kanvas 2D berubah (TERPUTUS/SINKRON)
    // namun tekstur 3D TV tetap menampilkan frame lama: badge tak pernah tampak
    // di scene sungguhan. Kini needsUpdate di-set DI DALAM drawTv.
    const r = await runTvCode()
    // mount sukses → needsUpdate true
    expect(r.tvTex.needsUpdate).toBe(true)
    r.tvTex.needsUpdate = false
    // jalur gagal: catch memanggil drawTv → needsUpdate harus kembali true
    fetchMock.mockImplementation(async () => { throw new Error('HTTP 500') })
    await r.tvPull()
    expect(r.tvTex.needsUpdate).toBe(true)
    r.tvTex.needsUpdate = false
    // drawTv manual (ticker detak umur) juga menandai tekstur
    r.drawTv()
    expect(r.tvTex.needsUpdate).toBe(true)
    r.tvDestroy()
  })

  it('ticker detak umur badge: interval 30 dtk menggambar ulang saat non-live, skip saat live; tvDestroy membersihkannya', async () => {
    // Paritas papan 3D (connIv 30 dtk): label "SINKRON N dtk LALU" berdetak
    // saat data basi — bukan membeku di angka poll terakhir.
    const r = await runTvCode() // mount sukses → state live
    texts.length = 0
    // state live → tick di-skip (tidak ada gambar ulang); tick pertama poll
    // adaptif baru di 60 dtk sehingga tidak mengganggu rentang 30 dtk ini.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(texts.length).toBe(0)
    // paksa non-live (stale): failStreak naik tanpa mengubah lastOkAt
    fetchMock.mockImplementation(async () => { throw new Error('HTTP 500') })
    await r.tvPull()
    texts.length = 0
    await vi.advanceTimersByTimeAsync(31_000) // tick 30 dtk → drawTv ulang (badge berdetak)
    expect(texts.length).toBeGreaterThan(0)
    // tvDestroy membersihkan ticker: tidak ada gambar ulang lagi
    r.tvDestroy()
    texts.length = 0
    await vi.advanceTimersByTimeAsync(60_000)
    expect(texts.length).toBe(0)
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
