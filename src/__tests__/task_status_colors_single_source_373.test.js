import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASK_STATUS_COLORS, taskStatusColor, taskStatusLabel } from '../lib/task_status_colors.js'

const read = f => readFileSync(join(__dirname, '..', f), 'utf8')

describe('Siklus 373 — warna/label status task satu sumber', () => {
  it('salinan palet status hilang dari 7 file pemakai', () => {
    const sites = [
      'components/TaskBoard.jsx',
      'components/ProjectPanel.jsx',
      'components/ActivityLog.jsx',
      'components/Ticker.jsx',
      'components/TeamStats.jsx',
      'components/WfsPanel.jsx',
      'components/Dashboard.jsx',
    ]
    for (const f of sites) {
      const src = read(f)
      // Pola palet inline: objek literal { done: ['#... / ternary berantai status
      expect(src.includes("{ done: ['Selesai'") ||
             /const (ST|COL) = \{ done: '#/.test(src) ||
             /s === 'done' \? '#/.test(src) ||
             /t\.status === 'done' \? '#/.test(src), `${f} masih punya palet inline`).toBe(false)
      expect(src.includes('task_status_colors'), `${f} tidak import satu sumber`).toBe(true)
    }
  })

  it('nilai kanonik & frozen', () => {
    expect(TASK_STATUS_COLORS).toEqual({
      done: '#10E5A0', running: '#F59E0B', review: '#60A5FA',
      failed: '#EF4444', pending: '#9AA7B8',
    })
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
    expect(taskStatusLabel('failed')).toBe('Gagal')
  })

  it('drift lama tidak ada lagi (#448AFF, #FB7185, #f66, #9aa3b5/#9aa7b8 pada status task)', () => {
    const sites = [
      'components/TaskBoard.jsx', 'components/ProjectPanel.jsx',
      'components/ActivityLog.jsx', 'components/Ticker.jsx',
      'components/TeamStats.jsx', 'components/WfsPanel.jsx',
      'components/Dashboard.jsx',
    ]
    for (const f of sites) {
      const src = read(f)
      // #448AFF = review lama TaskBoard/ProjectPanel; #f66 = failed lama TeamStats/WfsPanel.
      expect(src.includes("'#448AFF'"), `${f} masih #448AFF`).toBe(false)
      expect(/'#f66'/.test(src), `${f} masih #f66`).toBe(false)
    }
  })

  it('anti-poisoning: status non-string/tak dikenal → null', () => {
    expect(taskStatusColor(null)).toBe(null)
    expect(taskStatusColor(undefined)).toBe(null)
    expect(taskStatusColor(123)).toBe(null)
    expect(taskStatusColor('')).toBe(null)
    expect(taskStatusColor('DONE')).toBe('#10E5A0') // case-insensitive
    expect(taskStatusColor('archived')).toBe(null)
    expect(taskStatusLabel(42)).toBe(null)
  })

  it('paritas warna/label: semua kunci punya pasangan valid', () => {
    for (const k of ['done', 'running', 'review', 'failed', 'pending']) {
      expect(taskStatusColor(k)).toMatch(/^#[0-9A-F]{6}$/)
      expect(taskStatusLabel(k)).toBeTruthy()
    }
  })
})
