import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Siklus 348: log aktivitas satu sumber — salinan inline localStorage['wfs_activity']
// di App.jsx dihapus, semua lewat lib/storage_prefs.js.

import { ACTIVITY_LOG_MAX, loadActivityLog, saveActivityLog, clearActivityLog } from '../lib/storage_prefs.js'

const appSrc = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8')
const prefsSrc = readFileSync(resolve(__dirname, '../lib/storage_prefs.js'), 'utf8')

let store = {}
beforeEach(() => {
  store = {}
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
})

const j = (name) => JSON.stringify(name)
const prefFns = ['loadActivityLog', 'saveActivityLog', 'clearActivityLog']

it('salinan inline wfs_activity hilang di App.jsx — 3 titik (read/write/clear)', () => {
  expect(appSrc.includes("localStorage.getItem('wfs_activity')")).toBe(false)
  expect(appSrc.includes("localStorage.setItem('wfs_activity'")).toBe(false)
  expect(appSrc.includes("localStorage.removeItem('wfs_activity')")).toBe(false)
  for (const f of prefFns) expect(appSrc.includes(f)).toBe(true)
  expect(prefsSrc.includes('PREF_ACTIVITY_KEY')).toBe(true)
})

it('load: default [] dan JSON rusak → [] (anti-poisoning)', () => {
  expect(loadActivityLog()).toEqual([])
  store['wfs_activity'] = '{bukan json'
  expect(loadActivityLog()).toEqual([])
  store['wfs_activity'] = '"string bukan array"'
  expect(loadActivityLog()).toEqual([])
  store['wfs_activity'] = '[{"m":"a"},{"m":"b"}]'
  expect(loadActivityLog()).toEqual([{ m: 'a' }, { m: 'b' }])
})

it('save: prepend + potong ke ACTIVITY_LOG_MAX (paritas slice(0,50) lama)', () => {
  expect(ACTIVITY_LOG_MAX).toBe(50)
  const prev = Array.from({ length: 50 }, (_, i) => ({ m: 'old' + i }))
  const n = saveActivityLog([{ m: 'baru' }, ...prev])
  expect(n.length).toBe(50)
  expect(n[0]).toEqual({ m: 'baru' })
  expect(n[49]).toEqual({ m: 'old48' })
  expect(JSON.parse(store['wfs_activity']).length).toBe(50)
})

it('clear: key hilang dari storage', () => {
  saveActivityLog([{ m: 'x' }])
  clearActivityLog()
  expect(store['wfs_activity']).toBeUndefined()
  expect(loadActivityLog()).toEqual([])
})
