import { describe, it, expect } from 'vitest'
import { clockFromDate } from '../lib/format_time.js'
import { formatTaskDate } from '../lib/kanban_date.js'
import { snapshotFilename } from '../scene/parts/snapshot_spec.js'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(join(d, e.name)) : (/\.(jsx?|js)$/.test(e.name) && !e.name.includes('test') ? [join(d, e.name)] : []))

describe('siklus 357 — jam HH:MM satu sumber (clockFromDate)', () => {
  it('salinan padStart getHours dihapus dari src non-tes (kecuali format_time.js)', () => {
    const offenders = walk(SRC).filter(f => !f.endsWith('format_time.js'))
      .filter(f => /String\(\s*\w+\.getHours\(\)\)\.padStart/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('paritas: clockFromDate = HH:MM nol-awalan', () => {
    const d = new Date(2026, 10, 10, 7, 5)
    expect(clockFromDate(d)).toBe('07:05')
    expect(clockFromDate(new Date(2026, 10, 10, 23, 59))).toBe('23:59')
  })

  it('anti-poisoning: Date rusak / non-Date → null', () => {
    expect(clockFromDate(new Date('bogus'))).toBeNull()
    expect(clockFromDate(null)).toBeNull()
    expect(clockFromDate(12345)).toBeNull()
  })

  it('formatTaskDate tetap HH:MM untuk hari ini & kemarin; Date rusak → fallback —', () => {
    const now = new Date(2026, 10, 10, 12, 0)
    expect(formatTaskDate({ created_at: new Date(2026, 10, 10, 9, 3).getTime() }, { now })).toBe('Hari ini, 09:03')
    expect(formatTaskDate({ created_at: new Date(2026, 10, 9, 23, 45).getTime() }, { now })).toBe('Kemarin, 23:45')
  })

  it('snapshotFilename tetap kantor-wfs-YYYY-MM-DD_HHMM.png; Date rusak → kantor-wfs.png', () => {
    expect(snapshotFilename(new Date(2026, 10, 10, 7, 5))).toBe('kantor-wfs-2026-11-10_0705.png')
    expect(snapshotFilename(new Date('x'))).toBe('kantor-wfs.png')
    expect(snapshotFilename(null)).toBe('kantor-wfs.png')
  })
})
