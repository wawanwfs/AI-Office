import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MONTH_NAMES_ID, formatSimpleDate, formatCustomDateRange, formatTaskDate } from '../../src/lib/kanban_date.js'

const lib = readFileSync(resolve(__dirname, '../../src/lib/kanban_date.js'), 'utf8')

describe('bulan satu sumber (siklus 342)', () => {
  it('MONTH_NAMES_ID diekspor, 12 entri, dan tak ada lagi literal bulan duplikat di lib', () => {
    expect(MONTH_NAMES_ID).toHaveLength(12)
    expect(MONTH_NAMES_ID[0]).toBe('Jan')
    expect(MONTH_NAMES_ID[11]).toBe('Des')
    // salinan array literal terakhir (deklarasi `const months = [...]`) harus hilang
    expect(lib.match(/const months\s*=\s*\['Jan'/g) ?? []).toHaveLength(0)
  })

  it('formatSimpleDate memakai nama bulan satu sumber (anti-poisoning tetap: input racun → string kosong)', () => {
    expect(formatSimpleDate(new Date(2026, 9, 20).getTime())).toBe('20 Okt 2026')
    expect(formatSimpleDate(null)).toBe('')
    expect(formatSimpleDate(0)).toBe('')
  })

  it('formatCustomDateRange memakai satu sumber (rentang satu hari & lintas bulan)', () => {
    const s = new Date(2026, 9, 20).getTime()
    const e = new Date(2026, 9, 26).getTime()
    expect(formatCustomDateRange({ start: s, end: e })).toContain('Okt')
    const e2 = new Date(2026, 10, 2).getTime()
    expect(formatCustomDateRange({ start: s, end: e2 })).toContain('Nov')
  })

  it('formatTaskDate tetap berformat "Hari ini, HH:MM" (regresi bulan)', () => {
    const now = new Date(2026, 10, 9, 12, 0, 0)
    const ts = { created_at: new Date(2026, 10, 9, 8, 5, 0).getTime() }
    expect(formatTaskDate(ts, { now: now.getTime() })).toBe('Hari ini, 08:05')
  })
})
