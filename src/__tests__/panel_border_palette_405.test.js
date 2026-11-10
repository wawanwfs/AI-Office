import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PANEL_BORDER } from '../lib/ui_palette'

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('Siklus 405 — PANEL_BORDER satu sumber', () => {
  it('nilai kanonik #1e2a44', () => {
    expect(PANEL_BORDER).toBe('#1e2a44')
  })

  it('ShConsole tidak lagi punya literal #1e2a44', () => {
    const src = read('components/ShConsole.jsx')
    expect(src).not.toMatch(/['"]#1e2a44['"]/i)
    expect(src).toMatch(/PANEL_BORDER/)
  })

  it('ui_palette mengekspor PANEL_BORDER', () => {
    const src = read('lib/ui_palette.js')
    expect(src).toMatch(/export const PANEL_BORDER = '#1e2a44'/)
  })
})
