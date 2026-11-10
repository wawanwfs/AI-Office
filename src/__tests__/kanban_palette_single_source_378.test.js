// Siklus 378 — kanban 3D & papan proyek ikut palet status satu sumber.
//
// Siklus 373 mengkanonkan warna status task via lib/task_status_colors.js,
// tapi dua situs scene terlewat dan masih memakai palet lama yang DRIFT:
//   - kanban_spec.KANBAN_COLUMNS: review '#448AFF' (bukan #60A5FA)
//   - projectboard_data.cardMeta: salinan manual palet penuh
//     {review:'#448AFF', failed:'#ef4444', pending:'#9aa7b8'} → kartu 3D
//     berwarna berbeda dari chip UI React untuk status yang sama.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { KANBAN_COLUMNS } from '../scene/parts/kanban_spec.js'
import { cardMeta, normalizeTaskStatus } from '../scene/parts/projectboard_data.js'
import { TASK_STATUS_COLORS, taskStatusColor } from '../lib/task_status_colors.js'

const KANBAN = 'src/scene/parts/kanban_spec.js'
const PBD = 'src/scene/parts/projectboard_data.js'

describe('siklus 378 — palet kanban satu sumber', () => {
  it('salinan palet lama hilang dari kedua file scene', () => {
    for (const f of [KANBAN, PBD]) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/GAGAL.*ef4444|REVIEW.*448AFF/i)
    }
    // failed task color di pbd kini delegasi; sisa '#ef4444' di pbd hanya
    // untuk status koneksi strip (offline / agent down), bukan status task
    const psrc = readFileSync(PBD, 'utf8')
    expect(psrc).not.toMatch(/GAGAL.*ef4444/i)
    const ksrc = readFileSync(KANBAN, 'utf8')
    expect(ksrc).not.toMatch(/#448AFF/i)
    expect(ksrc).toContain("import { taskStatusColor } from '../../lib/task_status_colors.js'")
    expect(psrc).toContain("from '../../lib/task_status_colors.js'")
  })

  it('KANBAN_COLUMNS.color delegasi ke TASK_STATUS_COLORS', () => {
    for (const col of KANBAN_COLUMNS) {
      expect(col.color).toBe(taskStatusColor(col.key))
    }
  })

  it('cardMeta.statusColor delegasi + fallback pending untuk status liar', () => {
    expect(cardMeta({ id: 't1', title: 'x', status: 'done' }).statusColor).toBe(TASK_STATUS_COLORS.done)
    expect(cardMeta({ id: 't2', title: 'x', status: 'weird!!' }).statusColor).toBe(TASK_STATUS_COLORS.pending)
    expect(cardMeta(null)).toBeNull()
    // status key memang dinormalisasi lebih dulu (bukan dipakai mentah)
    expect(normalizeTaskStatus('IN_PROGRESS')).toBe('running')
    expect(cardMeta({ id: 't3', title: 'x', status: 'error' }).statusColor).toBe(TASK_STATUS_COLORS.failed)
  })

  it('anti-poisoning: bg kolom review ikut kanonik, palet tetap frozen', () => {
    const review = KANBAN_COLUMNS.find(c => c.key === 'review')
    expect(review.bg).toBe('rgba(96, 165, 250, 0.12)')
    expect(Object.isFrozen(TASK_STATUS_COLORS)).toBe(true)
  })
})
