import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const root = resolve(__dirname, '..')
const qt = readFileSync(resolve(root, 'components/QuickToolbar.jsx'), 'utf8')
const dash = readFileSync(resolve(root, 'components/Dashboard.jsx'), 'utf8')

describe('siklus 391 — residual palette UI delegasi', () => {
  it('literal drift hilang dari QuickToolbar & Dashboard', () => {
    expect(qt).not.toMatch(/#F59E0B/)
    expect(dash).not.toMatch(/#60A5FA/)
  })

  it('delegasi TASK_STATUS_COLORS', () => {
    expect(qt).toMatch(/import \{ TASK_STATUS_COLORS \} from '\.\.\/lib\/task_status_colors'/)
    expect(qt).toMatch(/TASK_STATUS_COLORS\.running/)
    expect(dash.match(/TASK_STATUS_COLORS\.(review|done)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('palet kanonik frozen', () => {
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
    expect(TASK_STATUS_COLORS.running).toBe('#F59E0B')
    expect(TASK_STATUS_COLORS.review).toBe('#60A5FA')
  })
})
