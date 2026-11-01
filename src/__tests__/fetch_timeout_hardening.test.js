import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { fetchWithTimeout, FETCH_TIMEOUT, timeoutErrorDetail } from '../lib/fetch_timeout.js'

// Siklus 203: HARDENING TRANSPORT FETCH FRONTEND — paritas sisi klien dari
// hardening backend 197-202. Census siklus: 6 file produksi memakai fetch;
// 4 call-site TANPA deadline (OfficeScene ×2, projectboard, lounge) + ProjectPanel
// sinyal mati (ac tak pernah di-abort) + api() tanpa timeout default. fetch tanpa
// AbortSignal tidak punya timeout di browser (300+ dtk) → poll menggantung selamanya,
// schedulePoll berhenti, badge koneksi "live" palsu, tombol UI tanpa umpan balik.
// Kini semua lewat fetchWithTimeout (satu sumber deadline, src/lib/fetch_timeout.js).
// Sumber kebenaran = perilaku nyata modul (fetch di-stub) + teks 6 file.

const here = fileURLToPath(new URL('.', import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf-8')
const FILES = [
  'src/scene/OfficeScene.js',
  'src/scene/parts/projectboard.js',
  'src/scene/parts/lounge.js',
  'src/components/ProjectPanel.jsx',
  'src/lib/api.js',
  'src/App.jsx',
]
// Deteksi pemakaian fetch (langsung atau via wrapper) seimbang-kurung
const FILE1 = (src) =>
  (src.match(/fetch(?:WithTimeout)?\s*\(/g) || []).filter((m) => {
    const i = src.indexOf(m)
    return !/\/\/\s*$/.test(src.slice(0, i))
  }).length

describe('fetch_timeout_hardening siklus 203 — perilaku nyata wrapper', () => {
  const origFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = origFetch })

  it('meneruskan Response dari fetch & options lain utuh', async () => {
    const seen = []
    globalThis.fetch = async (path, opts) => { seen.push([path, opts]); return 'RESP' }
    const r = await fetchWithTimeout('/wfs-project', { method: 'POST', headers: { a: 'b' }, body: 'x' })
    expect(r).toBe('RESP')
    expect(seen[0][0]).toBe('/wfs-project')
    expect(seen[0][1].method).toBe('POST')
    expect(seen[0][1].headers).toEqual({ a: 'b' })
    expect(seen[0][1].signal).toBeInstanceOf(AbortSignal) // deadline terpasang
    expect(seen[0][1].timeoutMs).toBeUndefined() // opsi internal tidak bocor ke fetch
  })

  it('fetch menggantung selamanya → TimeoutError saat deadline (bukan hang)', async () => {
    globalThis.fetch = (path, opts = {}) => new Promise((_, rej) => {
      if (opts.signal?.aborted) return rej(new DOMException('aborted', 'AbortError'))
      opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })
    await expect(fetchWithTimeout('/hang', { timeoutMs: 60 })).rejects.toMatchObject({ name: 'TimeoutError' })
  }, 10000)

  it('abort PEMANGGIL menang atas deadline (dilempar apa adanya, bukan TimeoutError)', async () => {
    globalThis.fetch = (path, opts = {}) => new Promise((_, rej) => {
      if (opts.signal?.aborted) return rej(new DOMException('aborted', 'AbortError'))
      opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })
    const ac = new AbortController(); ac.abort() // sudah aborted sebelum call
    await expect(fetchWithTimeout('/x', { timeoutMs: 5000, signal: ac.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  }, 10000)

  it('browser tanpa AbortSignal.timeout → degrade tanpa deadline, TETAP fetch', async () => {
    const seen = []
    globalThis.fetch = async (path, opts) => { seen.push([path, opts]); return 'RESP' }
    const desc = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
    delete AbortSignal.timeout // simulasi browser tua
    try {
      const r = await fetchWithTimeout('/x', { timeoutMs: 12000 })
      expect(r).toBe('RESP')
      expect(seen[0][1].signal).toBeUndefined() // tanpa deadline, tanpa signal
    } finally {
      if (desc) Object.defineProperty(AbortSignal, 'timeout', desc)
    }
  })

  it('tanpa AbortSignal.any → abort pemanggil tetap hidup (deadline dikorbankan, terdokumentasi)', async () => {
    globalThis.fetch = (path, opts = {}) => new Promise((_, rej) => {
      if (opts.signal?.aborted) return rej(new DOMException('aborted', 'AbortError'))
      opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })
    const anyDesc = Object.getOwnPropertyDescriptor(AbortSignal, 'any')
    delete AbortSignal.any
    try {
      const ac = new AbortController(); ac.abort()
      await expect(fetchWithTimeout('/x', { timeoutMs: 5000, signal: ac.signal }))
        .rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      if (anyDesc) Object.defineProperty(AbortSignal, 'any', anyDesc)
    }
  }, 10000)

  it('detail timeout bermakna (deadline vs dibatalkan) + kategori deadline terkunci', () => {
    const e = new Error('x'); e.name = 'TimeoutError'
    expect(timeoutErrorDetail(e)).toContain('deadline')
    const a = new Error('x'); a.name = 'AbortError'
    expect(timeoutErrorDetail(a)).toContain('dibatalkan')
    expect(timeoutErrorDetail(new Error('plain'))).toBeNull()
    expect(FETCH_TIMEOUT).toEqual({ POLL: 12000, POLL_LONG: 60000, POST: 30000, GET: 20000 })
  })
})

describe('fetch_timeout_hardening siklus 203 — census transport frontend (6 file)', () => {
  it('census: 5 file produksi memakai fetch + App.jsx konsumen api()', () => {
    expect(FILES.filter((f) => FILE1(read(f)) > 0)).toEqual(FILES.filter((f) => f !== 'src/App.jsx'))
    expect(read('src/App.jsx')).toContain("from './lib/api'")
  })

  it.each(FILES)('%s — tidak ada fetch polos di luar wrapper', (f) => {
    const src = read(f)
    if (f === 'src/lib/fetch_timeout.js') return // wrapper boleh memanggil fetch
    const plain = src.match(/(?<!With)fetch\s*\(\s*['"`/]/g) || []
    // api.js memanggil fetchWithTimeout — kemunculan `fetch(` langsung dilarang
    expect(plain).toEqual([])
    if (f !== 'src/App.jsx') expect(src).toContain('fetchWithTimeout')
  })

  it('wrapper internal: fetch polos HANYA di dalam fetchWithTimeout + guard fallback browser tua', () => {
    const src = read('src/lib/fetch_timeout.js')
    expect(src).toContain('!AbortSignal.timeout') // degrade browser tua terdokumentasi
    expect(src).toContain('AbortSignal.any') // gabungan signal pemanggil + deadline
    expect(src).toMatch(/signal\?\.aborted/) // abort pemanggil dilempar apa adanya
    expect(src).toMatch(/isFetchTimeout/)
  })

  it('api.js: deadline default (POLL_LONG sh-exec/git, POST lainnya) + signal pemanggil diteruskan', () => {
    const src = read('src/lib/api.js')
    expect(src).toContain('sh\\/exec')
    expect(src).toContain('FETCH_TIMEOUT.POLL_LONG')
    expect(src).toContain('timeoutMs: t')
    expect(src).toMatch(/signal,/) // passthrough signal komponen
  })

  it('ProjectPanel: deadline eksplisit 20000 (dulu sinyal mati — ac tak pernah di-abort)', () => {
    const src = read('src/components/ProjectPanel.jsx')
    expect(src).toContain("fetchWithTimeout('/wfs-project', { signal, timeoutMs: 20000 })")
  })
})

describe('fetch_timeout_hardening siklus 203 — guard regresi siklus 125 tak ter-regresi', () => {
  it('pollStopped/tvStopped guard destroy tetap di ketiga poller scene', () => {
    const board = read('src/scene/parts/projectboard.js')
    const lounge = read('src/scene/parts/lounge.js')
    expect(board.match(/pollStopped\) return/g)?.length).toBeGreaterThanOrEqual(4)
    expect(lounge.match(/tvStopped\) return/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('rid guard ProjectPanel (poll basi diabaikan) tetap utuh', () => {
    const src = read('src/components/ProjectPanel.jsx')
    expect(src).toContain('rid !== loadRid.current')
    expect(src).toContain("e.name !== 'AbortError'")
  })
})
