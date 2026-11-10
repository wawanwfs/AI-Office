import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors'

const src = readFileSync(new URL('../components/TaskBoard.jsx', import.meta.url), 'utf8')

describe('siklus 384 — gradient progres sprint TaskBoard satu sumber', () => {
  it('literal drift #448AFF & #10E5A0 di gradient hilang', () => {
    expect(src).not.toMatch(/#448AFF/)
    expect(src).not.toMatch(/#10E5A0/)
  })
  it('gradient delegasi TASK_STATUS_COLORS.review/done', () => {
    expect(src).toMatch(/TASK_STATUS_COLORS\.review/)
    expect(src).toMatch(/TASK_STATUS_COLORS\.done/)
  })
  it('nilai kanonik frozen', () => {
    expect(TASK_STATUS_COLORS.review).toBe('#60A5FA')
    expect(TASK_STATUS_COLORS.done).toBe('#10E5A0')
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
  })
})
