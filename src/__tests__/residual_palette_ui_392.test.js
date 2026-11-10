import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const root = new URL('..', import.meta.url).pathname
const read = (f) => readFileSync(join(root, 'components', f), 'utf8')

describe('siklus 392 — Ticker & ActivityLog delegasi palet status', () => {
  it('tidak ada lagi literal drift di kedua file', () => {
    for (const f of ['Ticker.jsx', 'ActivityLog.jsx']) {
      const src = read(f)
      for (const bad of ['#FB7185', '#8b93a3', '#4D9FFF']) {
        expect(src.includes(bad), `${f} masih memuat ${bad}`).toBe(false)
      }
    }
  })

  it('kedua file mengimpor dan memakai TASK_STATUS_COLORS', () => {
    for (const f of ['Ticker.jsx', 'ActivityLog.jsx']) {
      const src = read(f)
      expect(src).toContain("from '../lib/task_status_colors.js'")
      expect(src).toContain('TASK_STATUS_COLORS.')
    }
  })

  it('palet kanonik tetap frozen dan sesuai nilai yang didelegasikan', () => {
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
    expect(TASK_STATUS_COLORS.failed).toBe('#EF4444')
    expect(TASK_STATUS_COLORS.pending).toBe('#9AA7B8')
    expect(TASK_STATUS_COLORS.review).toBe('#60A5FA')
  })
})
