// src/lib/chunk_strategy.js
// Strategi pemisahan chunk (code splitting / vendor chunking) Vite & Rollup.
// Memastikan dependensi berat (Three.js ~700KB, React ecosystem ~190KB) dipisahkan
// dari bundle aplikasi (OfficeScene & index) agar browser & Service Worker PWA
// dapat melakukan precache dan HTTP caching berumur panjang secara optimal.

/**
 * Memetakan module ID ke nama chunk manual.
 * @param {string} id - Path absolut module yang di-bundle
 * @returns {string|undefined} Nama chunk atau undefined untuk default Rollup
 */
export function configureManualChunks(id) {
  if (!id || typeof id !== 'string') return undefined
  const normId = id.replace(/\\/g, '/')
  if (normId.includes('node_modules/three')) {
    return 'vendor-three'
  }
  if (
    normId.includes('node_modules/react') ||
    normId.includes('node_modules/react-dom') ||
    normId.includes('node_modules/scheduler')
  ) {
    return 'vendor-react'
  }
  return undefined
}
