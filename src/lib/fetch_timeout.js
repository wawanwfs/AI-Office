// Deadline fetch frontend — satu sumber untuk semua poll/aksi HTTP klien (siklus 203).
//
// Masalah (census siklus 203, kelas defek yang sama dengan hardening transport
// backend 197-202 tapi di sisi klien): `fetch()` tanpa `AbortController.signal`
// TIDAK punya deadline apa pun di browser. Saat gateway/proxy menggantung
// (koneksi hidup, tak ada byte, tak ada FIN):
//   - poll papan 3D (projectboard.pull) menunggu selamanya → `schedulePoll`
//     tak pernah lanjut → papan BEKU dengan badge koneksi terakhir ("live"
//     palsu), backoff `nextPollDelay` tak pernah dijalankan.
//   - poll TV lounge (tvPull) & badge status agen (pollStatus OfficeScene)
//     sama: interval tick berikutnya tak pernah tiba (pull belum selesai).
//   - tombol di UI (ShConsole/App via api()) menggantung tanpa umpan balik.
// Timeout bawaan browser (300+ dtk) jauh melebihi cadence poll 15-60 dtk —
// dengan deadline 12 dtk poll berikutnya tetap jalan dan badge berubah jujur
// ke "offline" via jalur catch yang SUDAH ada (applyPollResult ok:false).
//
// Deadline per kategori (pareto latensi nyata; POLL_LONG melindungi sh/exec):
//   POLL       12 dtk  — poll reguler 15-60 dtk: deadline wajib < cadence
//   POLL_LONG  60 dtk  — endpoint komputasi (sh/exec, git)
//   POST       30 dtk  — aksi UI tulis (decide/commit/pause_all/dst.)
//   GET        20 dtk  — panel/drawer on-demand (ProjectPanel dkk.)
export const FETCH_TIMEOUT = {
  POLL: 12000,
  POLL_LONG: 60000,
  POST: 30000,
  GET: 20000,
}

const DEFAULT = FETCH_TIMEOUT.POLL

// SIKLUS 252: deadline dibangun dari AbortController + setTimeout BISA-DIBATALKAN.
// Dulu AbortSignal.timeout(ms) — tidak bisa di-clear: sekali hangus sejak
// call-start, pembacaan body (r.json()) ikut dibunuh deadline basi saat main
// thread tersangkut longtask (SwiftShader/scene init) meski body sudah utuh
// di buffer jaringan → status koneksi PALSU (chip "Terputus", ticker
// "Gateway offline") di renderer lambat. Guard browser tua tetap menyetop
// deadline penuh (AbortSignal.timeout dipakai sbg proxy kemampuan modern).

// Kabar lengkap bila deadline kena: bukan generic Error, supaya pembeda
// "server gagal" vs "transport menggantung" tetap terbaca di log/console.
export function isTimeoutError(e) {
  return !!e && (e.name === 'TimeoutError' || e.name === 'AbortError')
}

export function timeoutErrorDetail(e) {
  if (!isTimeoutError(e)) return null
  return e.name === 'TimeoutError'
    ? 'fetch deadline (' + DEFAULT + 'ms) — gateway menggantung?'
    : 'fetch dibatalkan'
}

// Bungkus fetch dengan deadline; API sama dengan fetch (path, options) dan
// opsi `timeoutMs` tambahan. Pemanggil yang sudah punya signal sendiri
// (mis. panel dengan abort-on-close) tetap didukung via `options.signal`.
//
// SIKLUS 252 — deadline DINDING lama memotong `await r.json()` (bug nyata,
// diprobe CDP): AbortSignal.timeout(T) TIDAK BISA dibatalkan (sekali-hangus
// sejak call-start), padahal di renderer lambat (SwiftShader headless 0.3 FPS,
// tab throttled, kiosk GPU lemah) main thread bisa diblokir longtask init
// scene 9.7+9.0+3.1 s. Respons 200 tercatat Network.responseReceived <0.1 s
// TAPI promise fetch/json baru terproses di t≈18.9 s — callback abort BASI
// (jatuh tempo 12 dtk, sudah mengantre) ikut membunuh pembacaan body yang
// datanya utuh di buffer → r.json() "signal timed out" → chip "Terputus" +
// ticker "Gateway offline" PALSU ~54 dtk tiap load (backlog 251).
//
// Kini deadline DUA FASE dgn timer bisa-dibatalkan + GUARD FASE: timer fase
// transport yang menembak terlambat TIDAK boleh membunuh fase body (yang
// sudah dimulai) — ia memeriksa `phase` saat callback benar-benar berjalan,
// bukan saat dijadwalkan. Body lalu dapat anggaran deadline SENDIRI mulai
// saat headers tiba; body yang benar-benar menggantung tetap TimeoutError
// (kontrak 203 utuh). Abort pemanggil (options.signal) tetap menang.
function deadlineSignal(ms) {
  const ac = new AbortController()
  const err = new Error('fetch deadline (' + ms + 'ms) @252b — gateway menggantung?')
  err.name = 'TimeoutError' // alasan abort = TimeoutError → catch wrapper melipat jadi TimeoutError (paritas AbortSignal.timeout)
  let id = null
  let phase = 'transport' // 'transport' → 'body' → 'done'
  let graced = false       // siklus 252b: tembakan TERLAMBAT (thread diblokir) dapat satu tenggang
  let dueAt = 0
  // Ambang "tembakan terlambat": timer browser/Node menembak tepat waktu bila
  // thread bebas. Selisih eksekusi vs jatuh tempo > 250 ms berarti task lain
  // (longtask init scene SwiftShader 9.7+9+3 dtk, tab throttled) MEMBLOKIR
  // thread — bukan gateway lambat. Deadline yang jatuh tempo di tengah blokir
  // tak boleh menghukum respons yang datanya sudah tiba di buffer.
  const LATE_SLACK_MS = 250
  const arm = () => { dueAt = Date.now() + ms; id = setTimeout(onFire, ms) }
  const onFire = () => {
    // Guard fase (inti fix 252): callback bisa dieksekusi JAUH setelah jatuh
    // tempo (main thread diblokir longtask). Bila fase-nya sudah berganti,
    // abort basi DILARANG menyentuh body yang sudah tiba.
    if (phase !== 'transport') return
    const late = Date.now() - dueAt
    if (late > LATE_SLACK_MS && !graced) {
      // Tembakan terlambat = thread terblokir, bukan gateway diam. Beri SATU
      // tenggang penuh; hang sungguhan tetap gagal ≤ 2× deadline (bounded).
      graced = true
      arm()
      return
    }
    ac.abort(err)
  }
  arm()
  return {
    signal: ac.signal,
    // headers tiba: tutup fase transport, buka anggaran BARU utk body.
    toBody: () => {
      if (phase !== 'transport') return
      if (id) clearTimeout(id)
      phase = 'body'
      arm()
    },
    // seluruh respons selesai dibaca pemanggil: matikan deadline.
    settle: () => { if (id) clearTimeout(id); id = null; phase = 'done' },
    done: () => phase === 'done',
  }
}

export async function fetchWithTimeout(path, options = {}) {
  const { timeoutMs = DEFAULT, signal, ...rest } = options
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return fetch(path, { ...rest, signal }) // browser tua: degrade tanpa deadline
  const d = deadlineSignal(timeoutMs) // SIKLUS 252: timer bisa-dibatalkan + guard fase
  const signal2 = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, d.signal]) : signal) // tanpa AbortSignal.any: deadline dikorbankan, abort pemanggil tetap hidup
    : d.signal
  let headersOk = false
  try {
    const r = await fetch(path, { ...rest, signal: signal2 })
    headersOk = true
    d.toBody() // fase transport selesai — body bebas dari deadline basi (252)
    return r
  } catch (e) {
    if (isTimeoutError(e) && e.name === 'AbortError' && signal?.aborted) throw e // abort pemanggil, bukan deadline
    if (isTimeoutError(e)) {
      const err = new Error(timeoutErrorDetail(e) || 'fetch timeout')
      err.name = 'TimeoutError'
      err.isFetchTimeout = true
      throw err
    }
    throw e
  } finally {
    if (!headersOk) d.settle() // jalur error: buang timer (anti-leak)
    // jalur sukses: timer body tetap berjalan (anggaran penuh timeoutMs, sekali
    // tembak, bounded) — body yang benar-benar menggantung tetap TimeoutError.
  }
}
