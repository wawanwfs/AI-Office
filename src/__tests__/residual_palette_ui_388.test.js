import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_STATUS_COLORS } from '../lib/task_status_colors.js'

const root = join(import.meta.dirname, '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

const files = [
  'components/AgentInspector.jsx',
  'components/CsWidget.jsx',
  'components/FloorNavigator.jsx',
  'components/ConfirmModal.jsx',
  'components/SettingsModal.jsx',
]

describe('siklus 388 — sisa literal palet status UI delegasi TASK_STATUS_COLORS', () => {
  it('tidak ada lagi literal warna status di keenam file', () => {
    for (const f of files) {
      const src = read(f)
      expect(src, f).not.toMatch(/#10E5A0/i)
      expect(src, f).not.toMatch(/#448AFF/i)
      expect(src, f).not.toMatch(/#F59E0B/i)
      expect(src, f).not.toMatch(/#ef4444/i)
    }
  })

  it('semua file mengimpor dan memakai delegasi', () => {
    for (const f of files) {
      const src = read(f)
      expect(src).toMatch(/import \{[^}]*TASK_STATUS_COLORS[^}]*\} from '\.\.\/lib\/task_status_colors\.js'/)
      expect(src).toMatch(/TASK_STATUS_COLORS\.(running|done|review|failed)/)
    }
    // ProjectPanel gradient tak lagi literal
    expect(read('components/ProjectPanel.jsx')).not.toMatch(/#448AFF/i)
  })

  it('palet kanonik frozen tetap', () => {
    expect(TASK_STATUS_COLORS).toEqual({
      done: '#10E5A0', running: '#F59E0B', review: '#60A5FA',
      failed: '#EF4444', pending: '#9AA7B8',
    })
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
  })
})
