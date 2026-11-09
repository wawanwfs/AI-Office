// Siklus 352: pemanggil ambience spec bersih — try/catch redundan dihapus
// loader/saver ambience sudah punya try/catch + default internal di sound_spec.js,
// jadi pemanggil tidak perlu membungkus lagi (pelajaran 333: salinan drift).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  loadAmbienceEnabled, saveAmbienceEnabled,
  loadAmbienceVolume, saveAmbienceVolume,
  DEFAULT_AMBIENCE_ENABLED, DEFAULT_AMBIENCE_VOLUME,
} from '../scene/parts/sound_spec.js'

const root = resolve(__dirname, '..')
const app = readFileSync(resolve(root, 'App.jsx'), 'utf8')
const scene = readFileSync(resolve(root, 'scene/OfficeScene.js'), 'utf8')

describe('pemanggil ambience spec bersih (352)', () => {
  it('tidak ada try/catch pembungkus loader/saver ambience di App.jsx & OfficeScene.js', () => {
    expect(app).not.toMatch(/try\s*\{\s*(return\s+)?(load|save)Ambience/)
    expect(scene).not.toMatch(/try\s*\{\s*(return\s+)?(load|save)Ambience/)
    // pemanggil tetap ada (regresi import)
    expect(app).toMatch(/loadAmbienceEnabled\(null\)/)
    expect(app).toMatch(/saveAmbienceVolume\(null, nextVol\)/)
    expect(scene).toMatch(/loadAmbienceEnabled\(null\)/)
    expect(scene).toMatch(/saveAmbienceVolume\(null, ambienceVolume\)/)
  })

  it('loader tahan storage rusak tanpa pemanggil try/catch', () => {
    const bad = { getItem() { throw new Error('rusak') } }
    expect(loadAmbienceEnabled(bad)).toBe(DEFAULT_AMBIENCE_ENABLED)
    expect(loadAmbienceVolume(bad)).toBe(DEFAULT_AMBIENCE_VOLUME)
    expect(loadAmbienceEnabled(null)).toBe(DEFAULT_AMBIENCE_ENABLED)
  })

  it('saver tahan storage rusak, return false tanpa lempar', () => {
    const bad = { setItem() { throw new Error('rusak') } }
    expect(saveAmbienceEnabled(bad, true)).toBe(false)
    expect(saveAmbienceVolume(bad, 0.5)).toBe(false)
    expect(saveAmbienceVolume(null, 0.5)).toBe(false)
  })

  it('paritas nilai: simpan lalu muat via storage Map palsu', () => {
    const m = new Map()
    const st = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
    saveAmbienceEnabled(st, true)
    saveAmbienceVolume(st, 0.4)
    expect(loadAmbienceEnabled(st)).toBe(true)
    expect(loadAmbienceVolume(st)).toBe(0.4)
    // nilai asing → clamp/default
    saveAmbienceVolume(st, 7)
    expect(loadAmbienceVolume(st)).toBe(1)
    saveAmbienceVolume(st, NaN)
    expect(loadAmbienceVolume(st)).toBe(DEFAULT_AMBIENCE_VOLUME)
  })
})
