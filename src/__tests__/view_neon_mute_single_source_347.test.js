// Siklus 347: view mode / neon / audio mute satu sumber — lib/storage_prefs.js
// Sebelumnya 6 salinan inline try/catch localStorage tersebar:
// - wfs_view_mode: 2 di App.jsx (read useState + write switchView)
// - wfs_neon: 2 di App.jsx & OfficeScene.js (+removeItem)
// - wfs_audio_muted: 2 di App.jsx & OfficeScene.js
// Default & parsing rawan drift antar komponen (pelajaran 333).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  viewModePref, setViewModePref,
  neonPrefOn, setNeonPref, clearNeonPref,
  audioMutedPref, setAudioMutedPref,
  PREF_VIEW_MODE_KEY, PREF_NEON_KEY, PREF_MUTED_KEY,
} from '../lib/storage_prefs.js'

const root = join(process.cwd(), 'src')
const read = (p) => readFileSync(join(root, p), 'utf8')

// jsdom-lite: stub globalThis.localStorage dgn Map (vitest node env tidak punya localStorage)
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}

describe('siklus 347 — preferensi view/neon/mute satu sumber', () => {
  it('salinan inline localStorage hilang di App.jsx & OfficeScene.js', () => {
    for (const [file, key] of [
      ['App.jsx', 'wfs_view_mode'],
      ['App.jsx', 'wfs_neon'],
      ['App.jsx', 'wfs_audio_muted'],
      ['scene/OfficeScene.js', 'wfs_neon'],
      ['scene/OfficeScene.js', 'wfs_audio_muted'],
    ]) {
      expect(read(file).includes(`'${key}'`), `${file} masih pegang ${key} inline`).toBe(false)
    }
  })

  it('paritas view mode: hanya 3d diakui, nilai lain → 2d', () => {
    localStorage.removeItem(PREF_VIEW_MODE_KEY)
    expect(viewModePref()).toBe('2d')
    localStorage.setItem(PREF_VIEW_MODE_KEY, '3d')
    expect(viewModePref()).toBe('3d')
    localStorage.setItem(PREF_VIEW_MODE_KEY, 'bogus')
    expect(viewModePref()).toBe('2d')
    setViewModePref('3d')
    expect(viewModePref()).toBe('3d')
    setViewModePref('dashboard') // nilai apapun tersimpan apa adanya
    expect(localStorage.getItem(PREF_VIEW_MODE_KEY)).toBe('dashboard')
    expect(viewModePref()).toBe('2d')
  })

  it('paritas neon: default off, set on/off, clear menghapus key', () => {
    localStorage.removeItem(PREF_NEON_KEY)
    expect(neonPrefOn()).toBe(false)
    localStorage.setItem(PREF_NEON_KEY, 'bogus')
    expect(neonPrefOn()).toBe(false)
    setNeonPref(true)
    expect(neonPrefOn()).toBe(true)
    expect(localStorage.getItem(PREF_NEON_KEY)).toBe('1')
    setNeonPref(false)
    expect(localStorage.getItem(PREF_NEON_KEY)).toBe('0')
    clearNeonPref()
    expect(localStorage.getItem(PREF_NEON_KEY)).toBeNull()
  })

  it('paritas audio mute: default unmuted, set persisted sebagai 0/1', () => {
    localStorage.removeItem(PREF_MUTED_KEY)
    expect(audioMutedPref()).toBe(false)
    localStorage.setItem(PREF_MUTED_KEY, 'bogus')
    expect(audioMutedPref()).toBe(false)
    setAudioMutedPref(true)
    expect(audioMutedPref()).toBe(true)
    expect(localStorage.getItem(PREF_MUTED_KEY)).toBe('1')
    setAudioMutedPref(false)
    expect(localStorage.getItem(PREF_MUTED_KEY)).toBe('0')
  })
})
