// Wake Lock API (Screen Wake Lock) — layar kantor/kiosk yang menampilkan scene 3D
// tidak boleh sleep hanya karena tidak ada interaksi. Manager kecil yang bisa
// di-unit-test: navigator nyata disuntikkan, status terbaca via .state,
// reacquire otomatis saat visibilitychange → visible (wake lock browser
// dilepas otomatis saat tab hidden — itu perilaku spesifikasi, bukan bug).
//
// Tanpa dukungan browser → state 'unsupported', tanpa error.

export function createWakeLockManager(nav, { onState } = {}) {
  if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
    const st = 'unsupported'
    if (onState) onState(st)
    return { state: () => st, release: async () => {}, acquire: async () => st }
  }
  let lock = null
  const emit = () => { if (onState) onState(state()) }
  const state = () => (lock && !lock.released ? 'held' : 'released')

  async function acquire() {
    if (state() === 'held') return state()
    try {
      lock = await nav.wakeLock.request('screen')
      // Browser bisa melepas wakeLock sendiri (document hidden) → sentinel lama
      // tidak boleh dipakai ulang; buang referensi agar reacquire minta sentinel baru.
      lock.addEventListener?.('release', () => { lock = null; emit() })
      emit()
    } catch { /* NotAllowedError dsb — biarkan tanpa wake lock */ }
    return state()
  }

  async function release() {
    try { await lock?.release() } catch { /* sudah lepas */ }
    lock = null
    emit()
  }

  return { state, acquire, release }
}
