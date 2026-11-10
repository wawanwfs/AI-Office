import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const palette = readFileSync(join(root, 'src/lib/ui_palette.js'), 'utf8')
const consoleSrc = readFileSync(join(root, 'src/components/ShConsole.jsx'), 'utf8')

describe('siklus 403 — BRIGHT_TEXT satu sumber', () => {
  it('konstanta kanonik bernilai #eaf1ff', () => {
    expect(palette).toContain("export const BRIGHT_TEXT = '#eaf1ff'")
  })

  it('tidak ada lagi literal #eaf1ff di ShConsole', () => {
    expect(consoleSrc.includes('#eaf1ff')).toBe(false)
    expect(consoleSrc).toContain('BRIGHT_TEXT')
  })

  it('ShConsole mengimpor dari ui_palette', () => {
    expect(consoleSrc).toMatch(/import \{[^}]*BRIGHT_TEXT[^}]*\} from '\.\.\/lib\/ui_palette'/)
  })
})
