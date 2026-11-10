import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const src = readFileSync(new URL('../components/Dashboard.jsx', import.meta.url), 'utf8')

describe('siklus 387: palet status Dashboard satu sumber', () => {
  it('tidak ada lagi literal drift warna status task', () => {
    for (const lit of ['#10E5A0', '#448AFF', '#ef4444']) {
      expect(src).not.toContain(lit)
    }
  })

  it('mendelegasikan TASK_STATUS_COLORS untuk card/status/kehadiran', () => {
    expect(src).toContain("import { taskStatusColor, TASK_STATUS_COLORS } from '../lib/task_status_colors.js'")
    expect((src.match(/TASK_STATUS_COLORS\.running/g) || []).length).toBe(2)
    expect((src.match(/TASK_STATUS_COLORS\.done/g) || []).length).toBe(3)
  })

  it('palet kanonik frozen dan nilainya benar', () => {
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
    expect(TASK_STATUS_COLORS.done).toBe('#10E5A0')
    expect(TASK_STATUS_COLORS.running).toBe('#F59E0B')
  })
})
