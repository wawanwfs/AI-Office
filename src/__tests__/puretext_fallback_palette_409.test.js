import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { PURE_TEXT, UNKNOWN_STROKE } from '../lib/ui_palette.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'components')

describe('siklus 409 — komponen React bebas literal warna putih/fallback', () => {
  it('konstanta palette tersedia dengan nilai kanonik', () => {
    expect(PURE_TEXT).toBe('#ffffff')
    expect(UNKNOWN_STROKE).toBe('#888888')
  })

  it('tidak ada komponen React lagi memakai hex literal #fff / #888', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsx'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src.includes("'#fff'") || src.includes('"#fff"'), `${f} masih memakai #fff literal`).toBe(false)
      expect(src.includes("'#888'") || src.includes('"#888"'), `${f} masih memakai #888 literal`).toBe(false)
    }
  })

  it('setiap konstanta dipakai minimal satu kali di komponen', () => {
    const all = readdirSync(dir).filter((x) => x.endsWith('.jsx')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
    expect(all).toContain('PURE_TEXT')
    expect(all).toContain('UNKNOWN_STROKE')
  })
})
