// @vitest-environment jsdom
// Unit test runtime createProjectBoard (projectboard.js): papan proyek 3D nyata di dinding.
// node_modules TANPA paket `canvas` → getContext('2d') jsdom mengembalikan null, jadi
// document.createElement('canvas') di-stub dengan context 2D palsu yang MENCATAT fillText
// (state turunan divalidasi via teks yang digambar), THREE di-stub minimal, fetch di-stub.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const texts = []
const pathMoves = []
function makeCtx() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: 'alphabetic',
    fillRect() {}, strokeRect() {}, beginPath() {}, moveTo(x, y) { pathMoves.push([x, y]) }, lineTo() {}, arcTo() {},
    closePath() {}, fill() {}, stroke() {},
    fillText(t) { texts.push(String(t)) },
    measureText(s) { return { width: String(s).length * 10 } },
    arc() {},
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

// THREE stub minimal sesuai pemakaian createProjectBoard
class Tex { constructor(cv) { this.canvas = cv; this.needsUpdate = false } }
class Geom { constructor(...a) { this.args = a } }
class Mat { constructor(o) { Object.assign(this, { opacity: 1 }, o) } }
const THREE = { CanvasTexture: Tex, PlaneGeometry: Geom, BoxGeometry: Geom, MeshBasicMaterial: Mat, MeshLambertMaterial: Mat }
THREE.Mesh = class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z } }; this.rotation = {}; this.renderOrder = 0; this.userData = {}; this.visible = true } }
function makeMeshCaptor() {
  const added = []
  return { added, office: { add(o) { added.push(o) } } }
}

// snapshot /wfs-project contoh
const SNAP = {
  tasks: {
    total: 23, done: 15, pending: 4, running: 2, failed: 1, review: 2,
    recent: [
      { id: 21, title: 'task jalan A', status: 'running' },
      { id: 22, title: 'task antri B', status: 'pending' },
      { id: 23, title: 'task selesai C', status: 'done' },
      { id: 7, title: 'task gagal', status: 'failed' },
      { id: 9, title: 'task review', status: 'review' },
    ],
  },
  saas: { online: true, stats: { tenants: 3, conversations: 40, messages: 120 }, tenants: [{ name: 'Toko A' }] },
  agents: [{ name: 'sbx-be1', status: 'Up' }],
}

let fetchMock
beforeEach(() => {
  vi.useFakeTimers()
  texts.length = 0
  pathMoves.length = 0
  canvases = []
  stubCreateElement()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => SNAP }))
  vi.stubGlobal('fetch', fetchMock)
})
const mountedBoards = []
afterEach(() => {
  mountedBoards.splice(0).forEach(b => b.destroy())
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount(snap = SNAP) {
  const { createProjectBoard } = await import('../scene/parts/projectboard.js')
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => snap }))
  vi.stubGlobal('fetch', fetchMock)
    const capt = makeMeshCaptor()
  const b = createProjectBoard(capt.office, THREE)
  mountedBoards.push(b)
  await vi.advanceTimersByTimeAsync(1) // flush microtask fetch pertama
  return { board: b, added: capt.added }
}

describe('createProjectBoard — pemasangan', () => {
  it('menambahkan mesh papan + bingkai ke office pada posisi dinding belakang dan mengembalikan referensi keduanya', async () => {
    const { added, board } = await mount()
    expect(added).toHaveLength(2)
    const [mesh, frame] = added
    expect(mesh.geometry.args).toEqual([7.4, 4.04])
    expect(mesh.position.x).toBe(-8.35); expect(mesh.position.y).toBe(2.6); expect(mesh.position.z).toBe(13.3)
    expect(mesh.rotation.y).toBe(Math.PI) // menghadap ke dalam ruangan
    expect(frame.userData.__keep).toBe(1) // tidak ikut wallFade
    expect(frame.geometry.args).toEqual([7.65, 4.25, .05])
    expect(board.mesh).toBe(mesh)
    expect(board.frame).toBe(frame)
  })

  it('fetch /wfs-project dipanggil segera saat mount lalu tiap 60 detik', async () => {
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/wfs-project')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('createProjectBoard — render konten', () => {
  it('menggambar judul, persen, tiga kolom, dan kartu task nyata', async () => {
    await mount()
    expect(texts.some(t => t.includes('WFS PROJECT: SOFTWARE HOUSE'))).toBe(true)
    expect(texts.some(t => t === '65% selesai')).toBe(true)
    expect(texts.some(t => t === 'ANTRI (4)')).toBe(true)
    expect(texts.some(t => t === 'JALAN (2)')).toBe(true)
    expect(texts.some(t => t === 'SELESAI (15)')).toBe(true)
    expect(texts.some(t => t.includes('#21 task jalan A'))).toBe(true)
    expect(texts.some(t => t.includes('✓ selesai'))).toBe(true)
  })

  it('banner GAGAL/REVIEW tampil dengan nama task saat ada task bermasalah', async () => {
    await mount()
    expect(texts.some(t => t.includes('GAGAL 1'))).toBe(true)
    expect(texts.some(t => t.includes('REVIEW 2'))).toBe(true)
    expect(texts.some(t => t.includes('#7 task gagal'))).toBe(true)
  })

  it('kotak latar banner GAGAL/REVIEW memakai lebar numerik (regresi: measureText tanpa .width → NaN)', async () => {
    await mount()
    const nonFinite = pathMoves.filter(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
    expect(nonFinite).toEqual([])
  })

  it('tanpa task bermasalah → banner tidak digambar', async () => {
    const clean = { tasks: { total: 5, done: 5, pending: 0, running: 0, recent: [{ id: 1, title: 'x', status: 'done' }] }, saas: { online: false }, agents: [] }
    await mount(clean)
    expect(texts.some(t => t.includes('GAGAL') || t.includes('REVIEW'))).toBe(false)
    expect(texts.some(t => t === '100% selesai')).toBe(true)
  })

  it('strip bawah: SaaS online + status agent; SaaS offline ditandai merah (teks offline)', async () => {
    await mount()
    expect(texts.some(t => t === 'SaaS')).toBe(true)
    expect(texts.some(t => t === '3 tenant')).toBe(true)
    expect(texts.some(t => t === 'sbx-be1 ●')).toBe(true)
  })

  it('strip bawah menyertakan segmen OMNI saat data omniroute tersedia', async () => {
    const snapWithOmni = {
      ...SNAP,
      omniroute: { online: true, port: 20128 },
    }
    await mount(snapWithOmni)
    expect(texts.some(t => t === 'OMNI')).toBe(true)
    expect(texts.some(t => t === ':20128 ●')).toBe(true)
  })

  it('menggambar kartu kanban 3D dari task server WFS riil berstatus ready dan completed', async () => {
    const wfsSnap = {
      tasks: {
        total: 6, done: 4, pending: 2, running: 0,
        recent: [
          { id: 'task-9da32873', title: 'Develop: E-Commerce API', status: 'ready' },
          { id: 'task-e8e731a4', title: 'Develop: WFS Project 31A4', status: 'completed' },
        ],
      },
      saas: { online: true },
      agents: [],
    }
    await mount(wfsSnap)
    // Task ready tampil dengan ID terformat dan label antri
    expect(texts.some(t => t.includes('#9da32873 Develop: E-Commerce API'))).toBe(true)
    expect(texts.some(t => t === '⏳ antri')).toBe(true)
    // Task completed tampil dengan ID terformat dan label selesai
    expect(texts.some(t => t.includes('#e8e731a4 Develop: WFS Project 31A4'))).toBe(true)
    expect(texts.some(t => t === '✓ selesai')).toBe(true)
  })

  it('payload null / fetch gagal → tidak throw, papan tidak menggambar data', async () => {
    // mount() menimpa stub fetch — injeksikan payload null (sama seperti catch: snap tetap null)
    await mount(null)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(texts.some(t => t.includes('PROYEK'))).toBe(false) // snap tetap null
  })
})

describe('createProjectBoard — badge koneksi gateway di strip bawah', () => {
  it('fetch sukses → badge titik hijau + label Sinkron digambar di awal strip', async () => {
    await mount()
    expect(texts.some(t => t === 'Sinkron')).toBe(true)
  })

  it('fetch gagal setelah pernah sukses → badge stale "Sinkron … lalu" (amber, paritas chip HUD)', async () => {
    await mount()
    const drawsBefore = texts.length
    fetchMock = vi.fn(async () => { throw new TypeError('network down') })
    vi.stubGlobal('fetch', fetchMock)
    await vi.advanceTimersByTimeAsync(60_000) // tick poll berikutnya gagal
    // draw() dipanggil ulang saat catch (strip segar tanpa menunggu tick berikutnya)
    expect(texts.length).toBeGreaterThan(drawsBefore)
    const stale = texts.slice(drawsBefore).find(t => t.startsWith('Sinkron ') && t.includes('lalu'))
    expect(stale).toBeTruthy()
  })

  it('fetch gagal sejak awal → badge down "Terputus" hingga pulih, lalu "Sinkron" + data tampil', async () => {
    // fetch pertama gagal (down), pulih pada tick 60 dtk → badge live & papan tergambar
    fetchMock = vi.fn(async () => { throw new TypeError('network down') })
    vi.stubGlobal('fetch', fetchMock)
    const { createProjectBoard } = await import('../scene/parts/projectboard.js')
    const capt = makeMeshCaptor()
    const b = createProjectBoard(capt.office, THREE)
    mountedBoards.push(b)
    await vi.advanceTimersByTimeAsync(1)
    expect(texts.some(t => t.includes('WFS PROJECT'))).toBe(false) // snap masih null — draw no-op
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => SNAP }))
    vi.stubGlobal('fetch', fetchMock)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(texts.some(t => t === 'Sinkron')).toBe(true)
    expect(texts.some(t => t === '65% selesai')).toBe(true)
  })

  it('destroy menghentikan seluruh interval — tidak ada fetch maupun refresh badge lagi', async () => {
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { board } = { board: mountedBoards[mountedBoards.length - 1] }
    board.destroy()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('polling adaptif: gagal pasca-sukses → tick berikutnya 5 dtk (bukan 60 dtk), pulih → 60 dtk', async () => {
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock = vi.fn(async () => { throw new TypeError('network down') })
    vi.stubGlobal('fetch', fetchMock)
    await vi.advanceTimersByTimeAsync(60_000) // tick pertama (sehat) → gagal → delay 5 dtk
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_000) // backoff ke-1 → tick ke-2 gagal → delay 10 dtk
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(9_000) // belum 10 dtk → belum fetch
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1_000) // backoff ke-2 → tick ke-3
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // pulih → delay kembali 60 dtk
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => SNAP }))
    vi.stubGlobal('fetch', fetchMock)
    await vi.advanceTimersByTimeAsync(20_000) // backoff ke-3 (20 dtk) → tick pulih
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(59_000) // belum 60 dtk → tidak fetch
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000) // tepat 60 dtk → fetch lagi
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('createProjectBoard — visibilitas tab & forceVisible', () => {
  it('tab hidden → tick 60 dtk TIDAK fetch; kembali visible → langsung fetch', async () => {
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // tidak ada fetch sia-sia
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // segarkan segera saat tab kembali
  })

  it('forceVisible: mesh yang di-fade wallFade dikembalikan tampil tiap 500ms', async () => {
    const { added, board } = await mount()
    const mesh = added[0]
    mesh.material.opacity = 0.3; mesh.material.transparent = true; mesh.visible = false
    await vi.advanceTimersByTimeAsync(500)
    expect(mesh.material.opacity).toBe(1)
    expect(mesh.material.transparent).toBe(false)
    expect(mesh.visible).toBe(true)
    board.destroy()
  })
})

describe('createProjectBoard — destroy', () => {
  it('menghentikan interval fetch & forceVisible, melepas listener visibilitychange', async () => {
    const { board, added } = await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    board.destroy()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1) // tidak ada tick lagi
    const mesh = added[0]
    mesh.material.opacity = 0.2
    await vi.advanceTimersByTimeAsync(1000)
    expect(mesh.material.opacity).toBe(0.2) // forceVisible juga mati
  })
})
