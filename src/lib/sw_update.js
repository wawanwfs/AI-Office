// Siklus 192 — registrasi Service Worker + alur pembaruan TERKENDALI (prompt).
//
// Masalah yang diperbaiki: sebelumnya registerType 'autoUpdate' mem-bake
// skipWaiting+clientsClaim ke sw.js, dan registrasi via registerSW.js injeksi
// naif (tanpa wiring apa pun) — SW baru mengambil alih TANPA me-reload sesi
// lama. Dikombinasi pemangkasan aset (deploy.py, 158/191), tab lama terus
// memakai bundle hashed basi → import() chunk lazy bisa 404 (cache lama
// dihapus saat activate) tanpa ada pemberitahuan sama sekali.
//
// Kini: registerType 'prompt' (vite.config.js) → SW baru MENUNGGU (waiting);
// lib ini mendeteksi waiting → App menampilkan banner "Versi baru tersedia"
// → klik "Muat ulang" → postMessage SKIP_WAITING → aktivasi → controllerchange
// → reload. Tab lain yang sudah terkontrol ikut me-reload (wasControlled) —
// tidak ada lagi sesi basi lintas-tab.
//
// Pola klasik (workbox-window) dengan dua jebakan yang ditutup:
//  1. updatefound TERLEWAT bila listener terpasang SETELAH SW sudah waiting
//     (kunjungan kedua: register resolve dengan reg.waiting terisi) →
//     dicek eksplisit: `reg.waiting && reg.active` saat mount.
//  2. controllerchange JUGA menyala di kunjungan PERTAMA (null → SW pertama)
//     → reload mengagetkan tanpa alasan → digerbangi `wasControlled`
//     (hanya halaman yang SUDAH dikontrol SW sebelumnya yang di-reload).
//
// Vanilla (tanpa virtual:pwa-register): satu sumber, bisa diuji penuh di
// jsdom tanpa mock virtual module; injectRegister: null mematikan injeksi
// registerSW.js otomatis plugin (tak ada double-registrasi).

export function setupServiceWorkerUpdates({ onUpdateReady } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { applyUpdate: () => Promise.resolve(false), dispose: () => {} }
  }
  const wasControlled = !!navigator.serviceWorker.controller
  let disposed = false
  let reg = null

  const notify = () => { if (!disposed && onUpdateReady) onUpdateReady() }

  const onStateChange = () => {
    const sw = reg && reg.installing
    // Hanya bila halaman SUDAH dikontrol: install pertama (kunjugan baru)
    // tidak boleh menaikkan banner — tidak ada versi lama yang digantikan.
    if (sw && sw.state === 'installed' && navigator.serviceWorker.controller) notify()
  }
  const onUpdateFound = () => {
    if (reg && reg.installing) {
      try { reg.installing.addEventListener('statechange', onStateChange) } catch { /* SW sudah gone */ }
    }
  }

  const onControllerChange = () => {
    // Halaman yang SUDAH terkontrol selalu mengikuti versi baru: klik
    // "Muat ulang" di tab ini, ATAU SW baru aktif dari tab lain — tanpa ini
    // tab pengikut terus memakai chunk basi (import() → 404).
    if (disposed) return // race: dispose saat register promise tertunda
    if (wasControlled) window.location.reload()
  }

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((r) => {
      if (disposed || !r) return
      reg = r
      // Jebakan 1: SW sudah waiting saat kita mendengar (kunjungan kedua dst).
      if (r.waiting && r.active) notify()
      try { r.addEventListener('updatefound', onUpdateFound) } catch { /* no-op */ }
    })
    .catch(() => { /* sw.js tak terjangkau / konteks non-secure — app tetap jalan */ })
  try { navigator.serviceWorker.addEventListener('controllerchange', onControllerChange) } catch { /* no-op */ }

  return {
    // Dipanggil tombol banner: perintahkan SW yang menunggu untuk mengambil
    // alih SEKARANG. Return true bila ada waiting yang diperintah.
    applyUpdate() {
      if (!reg || !reg.waiting) return Promise.resolve(false)
      try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }) } catch { /* SW gone */ }
      return Promise.resolve(true)
    },
    dispose() {
      disposed = true
      reg = null
      try { navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange) } catch { /* no-op */ }
    },
  }
}
