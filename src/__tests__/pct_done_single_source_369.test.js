import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pctDone } from '../lib/math_util.js'
import { tvPct } from '../scene/parts/tv_canvas.js'
import { computePct } from '../scene/parts/projectboard_data.js'
import { calcSearchStats } from '../lib/kanban_search.js'

const r = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('siklus 369 — persen selesai satu sumber pctDone', () => {
  it('salinan pola Math.round(x/y*100) hilang dari 3 file', () => {
    for (const f of ['src/scene/parts/tv_canvas.js', 'src/scene/parts/projectboard_data.js', 'src/lib/kanban_search.js']) {
      expect(r(f)).not.toMatch(/Math\.round\([^)]*\/[^)]*\* ?100/)
    }
  })

  it('3 file memakai pctDone', () => {
    expect(r('src/scene/parts/tv_canvas.js')).toMatch(/pctDone/)
    expect(r('src/scene/parts/projectboard_data.js')).toMatch(/pctDone/)
    expect(r('src/lib/kanban_search.js')).toMatch(/pctDone/)
  })

  it('paritas: 10 kasus hasil identik dgn pola lama', () => {
    const legacy = (d, t) => (!t || !Number.isFinite(t) || !Number.isFinite(d)) ? 0
      : Math.min(100, Math.max(0, Math.round((d / t) * 100)))
    const cases = [[15, 23], [0, 3], [4, 4], [1, 3], [2, 3], [7, 8], [0, 0], [5, 12], [3, 7], [99, 100]]
    for (const [d, t] of cases) {
      expect(pctDone(d, t)).toBe(legacy(d, t))
      expect(tvPct({ done: d, total: t })).toBe(legacy(d, t))
      expect(computePct({ done: d, total: t })).toBe(legacy(d, t))
    }
  })

  it('anti-poisoning: non-finite → 0 di ketiga wrapper', () => {
    for (const [d, t] of [[NaN, 10], [Infinity, 10], [5, 0], [5, NaN], [5, Infinity], [undefined, 5], [null, 5], [undefined, undefined], [-3, 5]]) {
      expect(tvPct({ done: d, total: t })).toBe(0)
      expect(computePct({ done: d, total: t })).toBe(0)
    }
    // string numerik dinormalisasi oleh pctDone
    expect(tvPct({ done: '2', total: '8' })).toBe(25)
    expect(computePct({ done: '2', total: '8' })).toBe(25)
    // done > total di-clamp 100
    expect(tvPct({ done: 12, total: 5 })).toBe(100)
    expect(computePct({ done: 12, total: 5 })).toBe(100)
  })

  it('konsistensi antar-saluran: calcSearchStats.pct == pctDone(matched, total)', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({ id: i, title: `Task ${i}`, status: 'todo', division: 'dev', tags: [] }))
    const s = calcSearchStats(tasks, 'Task', { division: 'all', tag: 'all' })
    expect(s.pct).toBe(pctDone(s.matched, s.total))
    expect(s.pct).toBe(100)
    const s2 = calcSearchStats(tasks, 'Task 1', { division: 'all', tag: 'all' })
    expect(s2.pct).toBe(pctDone(1, 7))
    expect(s2.pct).toBe(14)
  })
})
