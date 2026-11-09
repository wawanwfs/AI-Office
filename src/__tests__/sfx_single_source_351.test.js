// Tes siklus 351: SFX scene satu sumber — lib/sfx.js menggantikan 28 salinan
// guard inline `typeof window !== 'undefined' && window.__officeSound` di
// TaskBoard.jsx (pelajaran 333: salinan inline drift & rawan beda perilaku).
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sfx, playDropFor } from '../lib/sfx.js'

const root = resolve(import.meta.dirname, '../..')
const board = () => readFileSync(resolve(root, 'src/components/TaskBoard.jsx'), 'utf8')

afterEach(() => { delete window.__officeSound })

describe('sfx satu sumber (351)', () => {
  it('guard inline __officeSound hilang dari TaskBoard.jsx', () => {
    expect(board().includes('window.__officeSound')).toBe(false)
  })

  it('memanggil method engine saat tersedia', () => {
    const eng = { playSelect: vi.fn(), playCardPickup: vi.fn(), playTaskUrgent: vi.fn() }
    window.__officeSound = eng
    expect(sfx.playSelect()).toBe(true)
    expect(sfx.playCardPickup()).toBe(true)
    expect(sfx.playTaskUrgent()).toBe(true)
    expect(eng.playSelect).toHaveBeenCalledTimes(1)
  })

  it('anti-poisoning: tanpa engine / tanpa method / engine lempar → no-op false', () => {
    expect(sfx.playSelect()).toBe(false) // engine tidak ada
    window.__officeSound = {}
    expect(sfx.playSelect()).toBe(false) // method tak ada
    window.__officeSound = { playSelect: () => { throw new Error('dead engine') } }
    expect(sfx.playSelect()).toBe(false) // engine rusak tak crash panel
  })

  it('playDropFor: rantai prioritas done > urgent > drop > select', () => {
    const eng = {
      playTaskDone: vi.fn(), playTaskUrgent: vi.fn(),
      playCardDrop: vi.fn(), playSelect: vi.fn(),
    }
    window.__officeSound = eng
    playDropFor({ status: 'done', priority: 'urgent' })
    expect(eng.playTaskDone).toHaveBeenCalledTimes(1)
    playDropFor({ status: 'review', priority: 'urgent' })
    expect(eng.playTaskUrgent).toHaveBeenCalledTimes(1)
    playDropFor({ status: 'review', priority: 'low' })
    expect(eng.playCardDrop).toHaveBeenCalledTimes(1)
    delete eng.playCardDrop // tanpa playCardDrop → fallback select
    playDropFor({ status: 'review', priority: 'low' })
    expect(eng.playSelect).toHaveBeenCalledTimes(1)
  })
})
