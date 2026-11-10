import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCENT_BLUE, ACCENT_BLUE_RGB, accentAlpha } from '../lib/ui_palette.js'
import { STATUS_HEX } from '../scene/parts/agent_status.js'

const root = new URL('..', import.meta.url).pathname
const read = (f) => readFileSync(join(root, 'components', f), 'utf8')

describe('siklus 393 — aksen biru kantor satu sumber (ui_palette.js)', () => {
  it('tidak ada lagi literal #4D9FFF / rgba(77,159,255 di komponen UI', () => {
    const files = ['AgentInspector.jsx', 'Dashboard.jsx', 'SettingsModal.jsx', 'ProjectPanel.jsx']
    for (const f of files) {
      const src = read(f)
      expect(src.includes('#4D9FFF'), `${f} masih memuat #4D9FFF`).toBe(false)
      expect(src.includes('rgba(77,159,255'), `${f} masih memuat rgba(77,159,255…)`).toBe(false)
    }
  })

  it('empat file mengimpor dan memakai ui_palette', () => {
    for (const f of ['AgentInspector.jsx', 'Dashboard.jsx', 'SettingsModal.jsx', 'ProjectPanel.jsx']) {
      const src = read(f)
      expect(src).toContain("from '../lib/ui_palette.js'")
      expect(src).toMatch(/ACCENT_BLUE|accentAlpha\(/)
    }
  })

  it('modul palet: nilai kanonik, helper alpha benar, anti-poisoning null', () => {
    expect(ACCENT_BLUE).toBe('#4D9FFF')
    expect(ACCENT_BLUE_RGB).toBe('77,159,255')
    expect(accentAlpha(0.3)).toBe('rgba(77,159,255,0.3)')
    expect(accentAlpha(0)).toBe('rgba(77,159,255,0)')
    expect(accentAlpha(1)).toBe('rgba(77,159,255,1)')
    expect(accentAlpha(-0.1)).toBeNull()
    expect(accentAlpha(1.5)).toBeNull()
    expect(accentAlpha('x')).toBeNull()
    expect(accentAlpha(NaN)).toBeNull()
  })

  it('STATUS_HEX.walk scene identik dengan ACCENT_BLUE', () => {
    expect(STATUS_HEX.walk).toBe(ACCENT_BLUE)
  })
})
