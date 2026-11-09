// Siklus 346: preferensi scene satu sumber — lib/storage_prefs.js
// Keys: wfs_names (default true), wfs_autorot (default false).
// Sebelumnya 4 salinan try/catch localStorage.getItem tersebar di ActionMenu,
// SettingsModal, OfficeScene (+2 salinan set di OfficeScene) — rawan drift
// nilai default/parsing antar komponen (pelajaran 333).

export const PREF_NAMES_KEY = 'wfs_names'
export const PREF_AUTOROT_KEY = 'wfs_autorot'

const safeGet = (key) => {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch { return null }
}

const safeSet = (key, value) => {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch { /* private storage / abaikan */ }
}

// Label nama agent & zona: default ON kecuali tersimpan eksplisit '0'.
export const namesPrefOn = () => safeGet(PREF_NAMES_KEY) !== '0'

export const setNamesPref = (on) => safeSet(PREF_NAMES_KEY, on ? '1' : '0')

// Auto-rotate kamera: default OFF kecuali tersimpan eksplisit '1'.
// (Catatan: keputusan prefers-reduced-motion tetap di pemanggil scene.)
export const autoRotatePrefOn = () => safeGet(PREF_AUTOROT_KEY) === '1'

export const setAutoRotatePref = (on) => safeSet(PREF_AUTOROT_KEY, on ? '1' : '0')

// Preferensi tersimpan eksplisit oleh user? (null = belum pernah set)
export const hasStoredPref = (key) => {
  const v = safeGet(key)
  return v === '0' || v === '1'
}
