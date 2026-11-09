import { describe, it, expect, beforeEach } from 'vitest'
import { PREF_OPEN_DASHBOARD_KEY, takeOpenDashboardFlag } from '../lib/storage_prefs.js'
import { readFileSync } from 'node:fs'

// Siklus 349: fallback landing→app satu sumber. Salinan inline getItem/removeItem
// 'wfs_open_dashboard' di App.jsx dihapus — kini via takeOpenDashboardFlag().

const appSrc = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const prefsSrc = readFileSync(new URL('../lib/storage_prefs.js', import.meta.url), 'utf8')

let store = {}
beforeEach(() => {
  store = {}
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
})

describe('siklus 349 — flag open_dashboard satu sumber', () => {
  it('salinan inline di App.jsx dihapus; pemanggil pakai helper', () => {
    expect(appSrc).not.toMatch(/localStorage\.getItem\(['"]wfs_open_dashboard/)
    expect(appSrc).not.toMatch(/localStorage\.removeItem\(['"]wfs_open_dashboard/)
    expect(appSrc).toContain('takeOpenDashboardFlag()')
  })

  it('helper membaca lalu menghapus flag (konsumsi sekali)', () => {
    localStorage.setItem(PREF_OPEN_DASHBOARD_KEY, '1')
    expect(takeOpenDashboardFlag()).toBe(true)
    expect(localStorage.getItem(PREF_OPEN_DASHBOARD_KEY)).toBeNull()
    expect(takeOpenDashboardFlag()).toBe(false)
  })

  it('nilai lain / flag absen → false', () => {
    expect(takeOpenDashboardFlag()).toBe(false)
    localStorage.setItem(PREF_OPEN_DASHBOARD_KEY, '0')
    expect(takeOpenDashboardFlag()).toBe(false)
  })

  it('helper tahan storage rusak (throw → false) dan key konsisten dgn landing.html', () => {
    const orig = global.localStorage.getItem
    global.localStorage.getItem = () => { throw new Error('blocked') }
    try { expect(takeOpenDashboardFlag()).toBe(false) }
    finally { global.localStorage.getItem = orig }
    expect(prefsSrc).toContain("PREF_OPEN_DASHBOARD_KEY = 'wfs_open_dashboard'")
  })
})
