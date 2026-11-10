import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { AMBER_ACCENT, CYAN_NEON, VIOLET_STATS } from '../lib/ui_palette.js'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const read = (p) => fs.readFileSync(new URL(p.replace(/^src\//, '../'), import.meta.url), 'utf8')

describe('Siklus 400 — cyan neon & violet statistik satu sumber', () => {
  it('nilai kanonik cocok & amber konsisten dengan siklus 399', () => {
    expect(CYAN_NEON).toBe('#00F0FF')
    expect(VIOLET_STATS).toBe('#A78BFA')
    expect(AMBER_ACCENT).toBe('#F59E0B')
    expect(TASK_STATUS_COLORS.done).toBe('#10E5A0')
  })

  it('literal drift hilang di komponen UI (FloorNavigator, QuickToolbar, Ticker)', () => {
    for (const f of ['components/FloorNavigator.jsx', 'components/QuickToolbar.jsx', 'components/Ticker.jsx']) {
      const src = read(`src/${f}`)
      expect(src).not.toMatch(/#00F0FF/i)
      expect(src).not.toMatch(/#A78BFA/i)
    }
    expect(read('src/components/FloorNavigator.jsx')).toMatch(/CYAN_NEON/)
    expect(read('src/components/QuickToolbar.jsx')).toMatch(/CYAN_NEON/)
    expect(read('src/components/Ticker.jsx')).toMatch(/VIOLET_STATS/)
  })

  it('plakat LEVEL 01/02 terraces delegasi palet; LED neon iya juga', () => {
    const src = read('src/scene/parts/terraces.js')
    expect(src).toMatch(/'LEVEL 01', AMBER_ACCENT/)
    expect(src).toMatch(/'LEVEL 02', CYAN_NEON/)
    expect(src).toMatch(/import .*ui_palette\.js/)
    expect(src).not.toMatch(/'#F59E0B'|'#00F0FF'/)
  })
})
