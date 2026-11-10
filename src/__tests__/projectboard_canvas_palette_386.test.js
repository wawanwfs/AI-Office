import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const src = readFileSync(join(process.cwd(), 'src/scene/parts/projectboard.js'), 'utf8')

describe('siklus 386 — palet status kanvas projectboard satu sumber', () => {
  it('tidak ada literal warna status tersisa di kanvas papan', () => {
    for (const lit of ['#10E5A0', '#448AFF', '#F59E0B', '#f59e0b', '#ef4444', '#EF4444']) {
      expect(src.includes(lit), `literal ${lit} masih ada`).toBe(false)
    }
  })
  it('delegasi ke TASK_STATUS_COLORS', () => {
    expect(src).toMatch(/import \{ TASK_STATUS_COLORS \} from '\.\.\/\.\.\/lib\/task_status_colors\.js'/)
    expect((src.match(/C\.done|C\.running|C\.review|C\.failed/g) || []).length).toBeGreaterThanOrEqual(6)
  })
  it('palet kanonik frozen', () => {
    expect(TASK_STATUS_COLORS).toEqual({ done: '#10E5A0', running: '#F59E0B', review: '#60A5FA', failed: '#EF4444', pending: '#9AA7B8' })
    expect(() => { TASK_STATUS_COLORS.done = '#000' }).toThrow()
  })
})
