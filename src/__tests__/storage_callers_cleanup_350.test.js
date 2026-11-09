// Siklus 350: panggilan loader/saver sound_spec & kanban_spec kini pakai
// default param (storage=null) — bukan ekspresi 'typeof localStorage'
// redundan. Loader/saver sudah tahan storage rusak di dalam spec.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadAudioVolume, loadAmbienceEnabled, saveAmbienceVolume, loadAmbienceVolume } from '../scene/parts/sound_spec.js'
import { resolve } from 'node:path'

const read = (p) => readFileSync(resolve(__dirname, '../..', p), 'utf8')
const STR = "typeof localStorage"

describe('siklus 350: pemanggil spec bersih dari guard redundant', () => {
  const files = [
    'src/App.jsx',
    'src/components/SettingsModal.jsx',
    'src/components/TaskBoard.jsx',
    'src/scene/OfficeScene.js',
  ]
  it('tidak ada ekspresi typeof localStorage tersisa di pemanggil', () => {
    for (const f of files) expect(read(f)).not.toContain(STR)
  })

  it('loadAudioVolume(null) → default 1.0, tidak lempar', () => {
    expect(loadAudioVolume(null)).toBe(1.0)
  })
  it('loadAmbienceEnabled(null) → default false', () => {
    expect(loadAmbienceEnabled(null)).toBe(false)
  })
  it('saveAmbienceVolume(null, 0.9) → false tanpa lempar; load balik default', () => {
    expect(saveAmbienceVolume(null, 0.9)).toBe(false)
    expect(loadAmbienceVolume(null)).toBe(0.35)
  })
})
