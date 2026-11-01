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

export function fetchTimeoutSignal(ms = DEFAULT) {
  return AbortSignal.timeout(ms)
}

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
export async function fetchWithTimeout(path, options = {}) {
  const { timeoutMs = DEFAULT, signal, ...rest } = options
  if (typeof AbortSignal === 'undefined' || !AbortSignal.timeout) return fetch(path, { ...rest, signal }) // browser tua: degrade tanpa deadline
  const t = fetchTimeoutSignal(timeoutMs)
  const signal2 = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, t]) : signal) // tanpa AbortSignal.any: deadline dikorbankan, abort pemanggil tetap hidup
    : t
  try {
    return await fetch(path, { ...rest, signal: signal2 })
  } catch (e) {
    if (isTimeoutError(e) && e.name === 'AbortError' && signal?.aborted) throw e // abort pemanggil, bukan deadline
    if (isTimeoutError(e)) {
      const err = new Error(timeoutErrorDetail(e) || 'fetch timeout')
      err.name = 'TimeoutError'
      err.isFetchTimeout = true
      throw err
    }
    throw e
  }
}
