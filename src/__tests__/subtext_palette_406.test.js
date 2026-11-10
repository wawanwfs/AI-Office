import { describe, expect, it } from 'vitest'
import { SUB_TEXT, TAB_BG, BTN_BG, INPUT_BG } from '../lib/ui_palette'
import * as fs from 'fs'
import * as path from 'path'

// Siklus 406 — delegasi warna ShConsole ke ui_palette (satu sumber).
describe('palette siklus 406', () => {
  it('nilai kanonik', () => {
    expect(SUB_TEXT).toBe('#9fb0d0')
    expect(TAB_BG).toBe('#18233c')
    expect(BTN_BG).toBe('#23324f')
    expect(INPUT_BG).toBe('#0d1526')
  })

  it('ShConsole tidak lagi memuat literal warna tersebut', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/ShConsole.jsx'), 'utf8')
    for (const hex of ['#9fb0d0', '#18233c', '#23324f', '#0d1526']) {
      expect(src.includes(hex)).toBe(false)
    }
  })

  it('ShConsole mengimpor konstanta dari ui_palette', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/ShConsole.jsx'), 'utf8')
    for (const name of ['SUB_TEXT', 'TAB_BG', 'BTN_BG', 'INPUT_BG']) {
      expect(src).toContain(name)
    }
  })
})
