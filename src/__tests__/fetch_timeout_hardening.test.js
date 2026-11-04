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

describe('fetch_timeout_hardening siklus 252 — deadline dua-fase (transport vs body)', () => {
  // Bug nyata terbukti probe CDP (backlog 251, chip "Terputus" palsu ~54 dtk):
  // AbortSignal.timeout TIDAK bisa dibatalkan — di renderer lambat (main thread
  // diblokir longtask init scene 9.7+9.0+3.1 s) promise fetch resolve di t≈18.9 s,
  // deadline 12 dtk sudah hangus, callback abort BASI ikut membunuh pembacaan
  // body yang datanya utuh di buffer → r.json() "signal timed out" meski
  // respons 200 lengkap → status koneksi PALSU. Kini timer bisa-dibatalkan +
  // guard fase: callback fase transport yang jalan terlambat tidak boleh
  // menyentuh body. Sumber kebenaran = perilaku nyata wrapper.
  const origFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = origFetch })

  // Mock Response yang jujur: pembacaan body selesai di TASK terpisah (paritas
  // browser nyata — body read bukan microtask instan; di Chrome task body-read
  // jalan SETELAH callback timer deadline yang basi), dan gagal bila signal
  // sudah aborted saat body selesai dibaca.
  const resp = (signal, body = { good: 1 }) => ({
    ok: true, status: 200,
    json: async () => {
      await new Promise((r2) => setTimeout(r2, 1)) // body read = macrotask berikutnya
      if (signal?.aborted) throw new DOMException('signal timed out', 'TimeoutError')
      return body
    },
  })

  it('replika bug 252: main thread DIBLOKIR melewati deadline → respons 200 yang sudah di-buffer tetap terbaca utuh', async () => {
    // Replika urutan Chrome nyata (dibuktikan probe CDP siklus 252): task
    // resolve jaringan mengantre di t=10ms (respons server 200 <0.1 s), timer
    // deadline di t=30ms, thread diblokir 100ms (longtask init scene) → saat
    // bebas urutannya: await-fetch lanjut, THEN callback timer basi, THEN task
    // body-read. Kode lama (AbortSignal.timeout): callback basi meng-abort
    // signal → json() lempar "signal timed out" → chip "Terputus" + ticker
    // "Gateway offline" PALSU ~54 dtk. Kode baru: timer di-clear saat headers
    // tiba + guard fase → body utuh terbaca.
    globalThis.fetch = (path, opts = {}) => new Promise((res) => {
      setTimeout(() => res(resp(opts.signal)), 10)
    })
    const p = fetchWithTimeout('/blocked-thread', { timeoutMs: 30 })
    const t0 = Date.now()
    while (Date.now() - t0 < 100) { /* blokir main thread — replika longtask scene init */ }
    const r = await p
    expect(await r.json()).toEqual({ good: 1 }) // kode lama: MERAH di sini (TimeoutError)
  }, 10000)

  it('kontrol urutan makrotask (mekanisme bug): timer basi menembak SEBELUM body-read', async () => {
    // Guard sumber-kebenaran fix 252: tanpa clearTimeout, callback abort jatuh
    // SESUDAH await-fetch-lanjut tapi SEBELUM body-read → body terbunuh.
    // Test ini mengunci model urutan yang dipakai test di atas (bukan tebak).
    const order = []
    const ac = new AbortController()
    setTimeout(() => { order.push('deadline'); ac.abort(new Error('x')) }, 30)
    const fetched = new Promise((res) => setTimeout(() => res('RESP'), 10))
    const consumer = (async () => {
      await fetched
      order.push('after-await')
      await new Promise((r2) => setTimeout(r2, 1)) // body read = task berikutnya
      order.push('body-read aborted=' + ac.signal.aborted)
    })()
    const t0 = Date.now()
    while (Date.now() - t0 < 100) { /* blokir */ }
    await consumer
    expect(order).toEqual(['after-await', 'deadline', 'body-read aborted=true'])
  }, 10000)

  it('sumber deadline = timer bisa-dibatalkan + guard fase (bukan AbortSignal.timeout)', () => {
    const src = read('src/lib/fetch_timeout.js')
    expect(src).toMatch(/deadlineSignal\s*\(/)
    expect(src).toContain('clearTimeout')
    expect(src).toContain('AbortSignal.timeout(T) TIDAK BISA dibatalkan')
    expect(src).not.toMatch(/fetchTimeoutSignal\(/) // helper lama sekali-hangus dihapus
    expect(src).toContain("phase !== 'transport') return") // guard fase: abort basi tak menyentuh body
    expect(src).toContain('d.toBody()') // anggaran body baru saat headers tiba
  })

  it('deadline tetap terpasang sbg signal fase transport (AbortSignal instance)', async () => {
    const seen = []
    globalThis.fetch = async (path, opts) => {
      seen.push(opts.signal)
      return resp(opts.signal, {})
    }
    await fetchWithTimeout('/ok', { timeoutMs: 5000 })
    expect(seen[0]).toBeInstanceOf(AbortSignal)
  })

  it('hang sungguhan (body tak pernah tiba) → tetap TimeoutError (kontrak 203 utuh)', async () => {
    globalThis.fetch = (path, opts = {}) => new Promise((_, rej) => {
      opts.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    })
    await expect(fetchWithTimeout('/hang', { timeoutMs: 40 })).rejects.toMatchObject({ name: 'TimeoutError' })
  }, 10000)
})
