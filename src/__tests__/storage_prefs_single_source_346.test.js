// Siklus 346: preferensi scene satu sumber — lib/storage_prefs.js
import {
  namesPrefOn, autoRotatePrefOn, setNamesPref, setAutoRotatePref,
  hasStoredPref, PREF_NAMES_KEY, PREF_AUTOROT_KEY,
} from '../lib/storage_prefs.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

// Vite hanya menulis-ulang new URL() dengan literal statis — jadi path literal.
const SRC = {
  actionMenu: readFileSync(new URL('../components/ActionMenu.jsx', import.meta.url), 'utf8'),
  settings: readFileSync(new URL('../components/SettingsModal.jsx', import.meta.url), 'utf8'),
  scene: readFileSync(new URL('../scene/OfficeScene.js', import.meta.url), 'utf8'),
}

// jsdom-lite: stub globalThis.localStorage dgn Map (vitest node env tidak punya localStorage)
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}

describe('siklus 346 — preferensi scene satu sumber', () => {
  it('helper pref ada di lib dan salinan inline localStorage hilang', () => {
    for (const src of [SRC.actionMenu, SRC.settings, SRC.scene]) {
      expect(src).not.toMatch(/localStorage\.getItem\('wfs_names'\)/)
      expect(src).not.toMatch(/localStorage\.getItem\('wfs_autorot'\)/)
    }
    expect(SRC.scene).not.toMatch(/localStorage\.setItem\('wfs_names'/)
    expect(SRC.scene).not.toMatch(/localStorage\.setItem\('wfs_autorot'/)
  })

  it('paritas: namesPrefOn default true, kecuali tersimpan 0', () => {
    localStorage.removeItem(PREF_NAMES_KEY)
    expect(namesPrefOn()).toBe(true)
    localStorage.setItem(PREF_NAMES_KEY, '0')
    expect(namesPrefOn()).toBe(false)
    localStorage.setItem(PREF_NAMES_KEY, '1')
    expect(namesPrefOn()).toBe(true)
  })

  it('paritas: autoRotatePrefOn default false, kecuali tersimpan 1', () => {
    localStorage.removeItem(PREF_AUTOROT_KEY)
    expect(autoRotatePrefOn()).toBe(false)
    localStorage.setItem(PREF_AUTOROT_KEY, '1')
    expect(autoRotatePrefOn()).toBe(true)
    localStorage.setItem(PREF_AUTOROT_KEY, '0')
    expect(autoRotatePrefOn()).toBe(false)
    expect(hasStoredPref(PREF_AUTOROT_KEY)).toBe(true)
    localStorage.removeItem(PREF_AUTOROT_KEY)
    expect(hasStoredPref(PREF_AUTOROT_KEY)).toBe(false)
  })

  it('setNamesPref / setAutoRotatePref menulis nilai benar & tahan localStorage rusak', () => {
    setNamesPref(false)
    expect(localStorage.getItem(PREF_NAMES_KEY)).toBe('0')
    setAutoRotatePref(true)
    expect(localStorage.getItem(PREF_AUTOROT_KEY)).toBe('1')
    const orig = globalThis.localStorage.setItem
    globalThis.localStorage.setItem = () => { throw new Error('quota') }
    expect(() => setNamesPref(true)).not.toThrow()
    globalThis.localStorage.setItem = orig
  })
})
