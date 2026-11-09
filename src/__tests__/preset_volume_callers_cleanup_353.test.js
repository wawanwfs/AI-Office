// Siklus 353: pemanggil spec preset kanban & audio volume bersih —
// try/catch redundan dihapus (TaskBoard.jsx 6, OfficeScene.js 2).
// kanban_spec.load/saveCustom* & sound_spec.load/saveAudioVolume sudah punya
// try/catch + default internal (pelajaran 333) — pembungkus pemanggil drift.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadCustomPresets, saveCustomPresets,
} from '../scene/parts/kanban_spec.js'
import { loadAudioVolume, saveAudioVolume, clampVolume, DEFAULT_VOLUME } from '../scene/parts/sound_spec.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tb = readFileSync(join(root, 'src', 'components', 'TaskBoard.jsx'), 'utf8')
const os = readFileSync(join(root, 'src', 'scene', 'OfficeScene.js'), 'utf8')

describe('pemanggil spec preset/volume tanpa try/catch redundan (353)', () => {
  it('salinan try/catch pembungkus hilang di TaskBoard.jsx & OfficeScene.js', () => {
    expect(tb).not.toMatch(/try\s*\{\s*\n?\s*(return\s+)?loadCustom(Div)?Presets/)
    expect(tb).not.toMatch(/try\s*\{\s*\n?\s*saveCustom(Div)?Presets/)
    expect(tb).not.toMatch(/try\s*\{\s*saveAudioVolume/)
    expect(os).not.toMatch(/try\s*\{.*saveAudioVolume/)
    // pemanggil tetap ada
    expect(tb).toMatch(/loadCustomPresets\(null\)/)
    expect(tb).toMatch(/loadCustomDivPresets\(null\)/)
    expect(tb).toMatch(/saveCustomPresets\(null,/)
    expect(tb).toMatch(/saveCustomDivPresets\(null,/)
    expect(os).toMatch(/loadAudioVolume\(null\)/)
    expect(os).toMatch(/saveAudioVolume\(null,/)
  })

  it('loader preset tahan storage rusak & return []', () => {
    const poison = { getItem: () => { throw new Error('blocked') } }
    expect(loadCustomPresets(poison)).toEqual([])
    expect(loadCustomPresets(null)).toEqual([])
    const badJson = { getItem: () => 'not-json{', setItem: () => {} }
    expect(loadCustomPresets(badJson)).toEqual([])
    const nonArray = { getItem: () => '{"a":1}', setItem: () => {} }
    expect(loadCustomPresets(nonArray)).toEqual([])
  })

  it('saver preset return false & tidak lempar saat storage rusak', () => {
    const poison = { getItem: () => null, setItem: () => { throw new Error('blocked') } }
    expect(saveCustomPresets(poison, [])).toBe(false)
    expect(saveCustomPresets(null, [])).toBe(false)
  })

  it('load/saveAudioVolume paritas: rusak→default, saver false, clamp', () => {
    const poison = { getItem: () => { throw new Error('x') } }
    expect(loadAudioVolume(poison)).toBe(DEFAULT_VOLUME)
    expect(loadAudioVolume(null)).toBe(DEFAULT_VOLUME)
    expect(loadAudioVolume({ getItem: () => '2.5' })).toBe(1)
    const noSet = { getItem: () => null, setItem: () => { throw new Error('x') } }
    expect(saveAudioVolume(noSet, 0.5)).toBe(false)
    expect(saveAudioVolume(null, 0.5)).toBe(false)
    expect(clampVolume(NaN)).toBe(DEFAULT_VOLUME)
    expect(clampVolume(0.12345)).toBe(0.12)
  })
})
