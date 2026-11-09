// Siklus 354: satu sumber penghitung status task — computeStatusCounts.
// Pengganti salinan forEach byStatus di TeamStats.jsx & Dashboard.jsx dan
// loop hitung internal computeSprintMetrics (pelajaran 333: salinan drift).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeStatusCounts, computeSprintMetrics } from '../scene/parts/kanban_spec.js'

const R = p => resolve(__dirname, '../..', p)
const read = p => readFileSync(R(p), 'utf8')

describe('computeStatusCounts satu sumber (354)', () => {
  it('salinan forEach byStatus hilang di TeamStats & Dashboard, keduanya memanggil computeStatusCounts', () => {
    for (const f of ['src/components/TeamStats.jsx', 'src/components/Dashboard.jsx']) {
      const src = read(f)
      expect(src.includes('computeStatusCounts('), f).toBe(true)
      expect(/byStatus\[t\.status\]/.test(src), f).toBe(false)
      expect(src.includes('let totalFiles'), f).toBe(false)
    }
  })

  it('loop hitung manual di computeSprintMetrics diganti panggilan computeStatusCounts', () => {
    const src = read('src/scene/parts/kanban_spec.js')
    expect(src.includes('function computeStatusCounts')).toBe(true)
    expect(src.includes('computeStatusCounts(filtered)')).toBe(true)
    expect(/let done = 0, running = 0/.test(src)).toBe(false)
  })

  it('anti-poisoning: bukan array → nol; entri null/status jelek → pending', () => {
    const zero = { total: 0, done: 0, running: 0, pending: 0, review: 0, failed: 0 }
    expect(computeStatusCounts(null)).toEqual(zero)
    expect(computeStatusCounts(undefined)).toEqual(zero)
    expect(computeStatusCounts('x')).toEqual(zero)
    expect(computeStatusCounts([null, {}, { status: 'weird' }, 'junk'])).toEqual({ ...zero, total: 3, pending: 3 })
  })

  it('paritas alias & metrik sprint: completed/in_progress/qa dipetakan, pct benar', () => {
    const tasks = [
      { status: 'done' }, { status: 'completed' }, { status: 'running' },
      { status: 'in_progress' }, { status: 'review' }, { status: 'qa' },
      { status: 'failed' }, { status: 'pending' }, null,
    ]
    const c = computeStatusCounts(tasks)
    expect(c).toEqual({ total: 8, done: 2, running: 2, review: 2, failed: 1, pending: 1 })
    const m = computeSprintMetrics(tasks)
    expect(m).toEqual({ ...c, pct: Math.round((2 / 8) * 100) })
    expect(computeSprintMetrics([]).pct).toBe(0)
  })
})
