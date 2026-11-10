import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FAINT_META } from '../lib/ui_palette'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('FAINT_META palette (siklus 404)', () => {
  it('nilai kanonik', () => {
    expect(FAINT_META).toBe('#5f6f90')
  })
  it('tidak ada drift literal di ShConsole', () => {
    const src = read('../components/ShConsole.jsx')
    expect(src.includes('#5f6f90')).toBe(false)
    expect(src.includes('FAINT_META')).toBe(true)
  })
  it('satu sumber ada di ui_palette', () => {
    const pal = read('../lib/ui_palette.js')
    expect(pal.includes("FAINT_META = '#5f6f90'")).toBe(true)
  })
})
