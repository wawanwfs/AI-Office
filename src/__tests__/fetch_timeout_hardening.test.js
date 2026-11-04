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
  // Bug nyata terbukti probe CDP + A/B di Chrome asli (chrome-headless-shell,
  // scene idle, deadline 50ms hangus di tengah blokir thread 2s):
  //   LAMA  AbortSignal.timeout(50): [block-done@2001, RESOLVED@4843,
  //         jsonErr "TimeoutError: signal timed out", abortedAfter=false]
  //   BARU  clearTimeout saat resolve + guard fase: jsonOk=true
  // Fetch promise resolve SETELAH deadline hangus (urutan resolusi task vs
  // callback timer tidak terjamin saat antrean penuh longtask) → callback
  // abort basi ikut membunuh pembacaan body yang utuh di buffer → chip
  // "Terputus" + ticker "Gateway offline" PALSU ~54 dtk tiap load (backlog
  // 251, akar: longtask init scene SwiftShader 9.7+9.0+3.1 s > deadline 12 dtk).
  // Kini timer bisa-dibatalkan (clearTimeout saat headers tiba) + guard fase:
  // callback fase transport yang jalan terlambat tidak boleh menyentuh body.
  const origFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = origFetch })

  // Mock Response yang jujur: pembacaan body selesai di TASK terpisah (paritas
  // browser nyata — body read bukan microtask instans), dan gagal bila signal
  // sudah aborted saat body selesai dibaca.
  const resp = (signal, body = { good: 1 }) => ({
    ok: true, status: 200,
    json: async () => {
      await new Promise((r2) => setTimeout(r2, 1)) // body read = task berikutnya
      if (signal?.aborted) throw new DOMException('signal timed out', 'TimeoutError')
      return body
    },
  })

  it('kontrak inti fix: respons cepat (< deadline) → body utuh terbaca + timer internal mati', async () => {
    // Jalur bahagia yang dulu rusak produksi: respons tiba < deadline, tapi
    // thread diblokir saat resolve masuk — callback timer TIDAK boleh
    // membunuh body. Replika: resolve cepat (10ms), pembacaan body setelahnya.
    globalThis.fetch = (path, opts = {}) => new Promise((res) => {
      setTimeout(() => res(resp(opts.signal)), 10)
    })
    const r = await fetchWithTimeout('/ok-fast', { timeoutMs: 5000 })
    expect(await r.json()).toEqual({ good: 1 }) // kode lama BISA lolos di sini
    expect(r.status).toBe(200)                  // — kunci baris di bawah yang membedakan
  }, 10000)

  it('replika bug 252 (A/B Chrome terukur): deadline menembak SETELAH resolve → body tetap utuh (timer dibatalkan di resolve)', async () => {
    // PERINGATAN PORTABILITAS (terbukti 2x siklus ini): replika berbasis timing
    // (resolve vs callback timer) TIDAK portable — Node murni melempar
    // TimeoutError dgn kode lama, worker vitest justru lolos (urutan antrean
    // timer beda antar runtime). Mekanisme bug 252 dikunci lewat: (a) A/B
    // Chrome asli terukur (komentar describe); (b) test sumber di bawah yang
    // MERAH eksak saat AbortSignal.timeout kembali; (c) uji ini menjaga jalur
    // bahagia lintas-deadline: body dibaca SETELAH jatuh tempo, kode baru tetap
    // utuh (timer di-clear saat resolve), kode lama merah di Node murni.
    globalThis.fetch = (path, opts = {}) => new Promise((res) => {
      setTimeout(() => res(resp(opts.signal)), 5) // headers tiba < deadline
    })
    const r = await fetchWithTimeout('/deadline-after-resolve', { timeoutMs: 20 })
    await new Promise((r2) => setTimeout(r2, 60)) // lewati jatuh tempo (20ms) jauh
    expect(await r.json()).toEqual({ good: 1 }) // Node murni + kode lama: MERAH
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
