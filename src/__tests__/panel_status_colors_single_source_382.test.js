// Siklus 382 — chip status koneksi UI (ProjectPanel) delegasi TASK_STATUS_COLORS.
// Latar: siklus 373–381 menyatukan palet status scene (TV, strip papan, kanban,
// whiteboard). Situs UI React di ProjectPanel masih literal '#10E5A0'/'#ef4444'.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const pp = readFileSync(join(root, 'components', 'ProjectPanel.jsx'), 'utf8')

describe('siklus 382: warna status koneksi ProjectPanel satu sumber', () => {
  it('literal drift hilang dari ProjectPanel', () => {
    expect(pp.includes("'#10E5A0'")).toBe(false)
    expect(pp.includes('"#10E5A0"')).toBe(false)
    expect(pp.includes("'#ef4444'")).toBe(false)
    expect(pp.includes('linear-gradient(90deg,#10E5A0')).toBe(false)
  })

  it('mengimpor dan memakai palet kanonik', () => {
    expect(pp).toContain("import { taskStatusColor, taskStatusLabel, TASK_STATUS_COLORS }")
    expect(pp).toContain('TASK_STATUS_COLORS.done')
    expect(pp).toContain('TASK_STATUS_COLORS.failed')
    expect(pp).toContain("taskStatusColor('done')")
  })

  it('palet kanonik tidak berubah (frozen)', () => {
    const src = readFileSync(join(root, 'lib', 'task_status_colors.js'), 'utf8')
    expect(src).toContain("done: '#10E5A0'")
    expect(src).toContain("failed: '#EF4444'")
    expect(src).toContain('Object.freeze')
  })
})
