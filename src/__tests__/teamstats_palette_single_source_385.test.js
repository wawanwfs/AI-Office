/**
 * Siklus 385 — TeamStats.jsx satu sumber warna status.
 *
 * Sebelumnya TeamStats punya literal drift:
 *   chip "jalan"  #F59E0B        → kini TASK_STATUS_COLORS.running
 *   gradient bar  #448AFF        → kini TASK_STATUS_COLORS.review (kanonik #60A5FA)
 *   teks 100%     #10E5A0        → kini TASK_STATUS_COLORS.done
 *   titik hadir   #10E5A0        → kini TASK_STATUS_COLORS.done
 *   header HOST   #10E5A0        → kini TASK_STATUS_COLORS.done
 * Gradient bar bisa beda warna dari chip review kanban bila palet digeser.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors'

const src = readFileSync(join(__dirname, '..', 'components', 'TeamStats.jsx'), 'utf8')

describe('TeamStats palet status satu sumber (siklus 385)', () => {
  it('tidak ada literal warna status tersisa di TeamStats.jsx', () => {
    expect(src).not.toMatch(/'#448AFF'/)
    expect(src).not.toMatch(/'#10E5A0'/)
    expect(src).not.toMatch(/'#F59E0B'/)
    expect(src).not.toMatch(/'#ef4444'/i)
  })

  it('delegasi ke TASK_STATUS_COLORS (import + pemakaian)', () => {
    expect(src).toMatch(/import \{ TASK_STATUS_COLORS/)
    expect(src).toMatch(/TASK_STATUS_COLORS\.running/)
    expect(src).toMatch(/TASK_STATUS_COLORS\.review/)
    expect(src).toMatch(/TASK_STATUS_COLORS\.done/)
  })

  it('nilai delegasi == palet kanonik frozen', () => {
    expect(TASK_STATUS_COLORS).toEqual({
      done: '#10E5A0', running: '#F59E0B', review: '#60A5FA',
      failed: '#EF4444', pending: '#9AA7B8',
    })
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
  })
})
