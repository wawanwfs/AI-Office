// Spesifikasi kesehatan koneksi gateway (murni, tanpa fetch/React) — dipakai
// App.jsx untuk polling adaptif dan HUD untuk chip status sinkronisasi.
//
// Masalah yang diselesaikan (backlog siklus 105):
//  - Polling lama fixed 15s apa pun hasilnya: saat gateway mati, browser tetap
//    menghantam endpoint tiap 15s; saat idle sehat, interval terlalu kaku.
//  - HUD hanya menampilkan teks status task — tidak ada indikator kapan data
//    terakhir berhasil disinkronkan, sehingga pengguna tidak bisa membedakan
//    "gateway sehat tapi kosong" vs "data basi / koneksi putus".

// Interval polling (ms) per keadaan koneksi:
//  - sehat   : 15s (perilaku lama dipertahankan)
//  - gagal   : backoff eksponensial 5s → 10s → 20s → 40s → 80s (cap 80s)
//  - pulih   : langsung kembali 15s
export const POLL_HEALTHY_MS = 15000
export const POLL_BASE_MS = 5000
export const POLL_MAX_MS = 80000
export const STALE_AFTER_MS = 30000 // >30s tanpa sukses = data dianggap basi

// Terapkan satu hasil poll ke state tracker (di-mutasi & dikembalikan).
// result: { ok: true } | { ok: false, error?: string }
// now: timestamp ms (injeksi waktu agar testable).
export function applyPollResult(tr, result, now = Date.now()) {
  const t = tr || {}
  const safeNow = Number.isFinite(now) ? now : Date.now()
  if (result && result.ok) {
    t.failStreak = 0
    t.lastError = null
    t.lastOkAt = safeNow
    t.everConnected = true
    t.state = 'live'
    t.nextDelayMs = POLL_HEALTHY_MS
  } else {
    t.failStreak = (t.failStreak || 0) + 1
    t.lastError = (result && result.error) || 'unknown'
    t.lastFailAt = safeNow
    // state: gagal pertama saat masih punya data sukses = 'stale' (data basi
    // tapi tampilan masih layak), tanpa pernah sukses = 'down' langsung.
    t.state = t.everConnected ? 'stale' : 'down'
    const exp = POLL_BASE_MS * Math.pow(2, Math.min(t.failStreak - 1, 5))
    t.nextDelayMs = Math.min(exp, POLL_MAX_MS)
  }
  t.updatedAt = safeNow
  return t
}

import { durLabel } from './duration_label.js'
export { durLabel } // satu sumber "X dtk/mnt lalu" (siklus 374)

// Ringkasan chip HUD dari tracker + jam sekarang. Selalu ada label yang aman
// digambar (tidak pernah undefined) dan teks Indonesia konsisten dgn UI lain.
export function connectionBadge(tr, now = Date.now()) {
  const t = tr || {}
  const safeNow = Number.isFinite(now) ? now : Date.now()
  const age = Number.isFinite(t.lastOkAt) ? Math.max(0, safeNow - t.lastOkAt) : null
  if (t.state === 'live') {
    return { state: 'live', label: 'Sinkron', detail: 'Gateway tersinkron', tone: 'ok' }
  }
  if (t.state === 'stale') {
    const ago = durLabel(Math.floor(age / 1000)) ?? '0 dtk lalu'
    return { state: 'stale', label: `Sinkron ${ago}`, detail: `Polling gagal — data terakhir ${ago}`, tone: 'warn' }
  }
  // 'down' atau tracker kosong sebelum sukses pertama
  return { state: 'down', label: 'Terputus', detail: t.lastError ? `Gateway tak terjangkau (${t.lastError})` : 'Gateway tak terjangkau', tone: 'err' }
}

// Delay poll berikutnya (ms). healthyMs: cadence sehat kustom per-pemanggil —
// App memakai default POLL_HEALTHY_MS, sedangkan papan 3D & TV lounge tetap
// 60 dtk saat sehat (perilaku lama dipertahankan). Tracker yang sedang gagal
// selalu mengembalikan delay backoff eksponensialnya, apa pun cadence sehat.
export function nextPollDelay(tr, healthyMs = POLL_HEALTHY_MS) {
  if (!tr) return healthyMs
  if (tr.state !== 'live' && tr.nextDelayMs != null) return tr.nextDelayMs
  return healthyMs
}
