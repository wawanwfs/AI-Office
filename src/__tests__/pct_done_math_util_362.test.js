import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pctDone, computeColumnDistribution, computeSprintMetrics } from '../scene/parts/kanban_spec.js'
import { pctDone as pctFromUtil } from '../lib/math_util.js'
import { computeTeamStats } from '../scene/parts/team_spec.js'
import { sprintLiveRows } from '../scene/parts/whiteboard_canvas.js'
import { getWhiteboardTooltipText } from '../scene/parts/whiteboard_spec.js'

const root = process.cwd()
const read = (p) => readFileSync(join(root, p), 'utf8')
const kanban = read('src/scene/parts/kanban_spec.js')
const team = read('src/scene/parts/team_spec.js')
const wbCanvas = read('src/scene/parts/whiteboard_canvas.js')
const wbSpec = read('src/scene/parts/whiteboard_spec.js')
const panel = read('src/components/ProjectPanel.jsx')

const FORMULA = /Math\.round\(\s*\(?\s*[\w.]+\s*\/\s*\+?[\w.]+\s*\)?\s*\*\s*100\s*\)/

describe('Siklus 362: satu sumber pctDone pindah ke lib/math_util', () => {
  it('salinan rumus Math.round((x/y)*100) hilang dari 5 pemakai', () => {
    expect(kanban).not.toMatch(FORMULA)
    expect(team).not.toMatch(FORMULA)
    expect(wbCanvas).not.toMatch(FORMULA)
    expect(wbSpec).not.toMatch(FORMULA)
    expect(panel).not.toMatch(FORMULA)
  })

  it('kanban_spec re-export dari lib/math_util (satu sumber)', () => {
    expect(kanban).toMatch(/import\s*\{\s*pctDone\s*\}\s*from\s*'[^']*math_util\.js'/)
    expect(pctDone).toBe(pctFromUtil)
  })

  it('paritas pembulatan klasik', () => {
    expect(pctDone(1, 3)).toBe(33)
    expect(pctDone(2, 3)).toBe(67)
    expect(pctDone(7, 8)).toBe(88)
    expect(pctDone(0, 10)).toBe(0)
    expect(pctDone(10, 10)).toBe(100)
  })

  it('anti-poisoning: NaN/null/string/negatif/over-100', () => {
    expect(pctDone(5, 0)).toBe(0)
    expect(pctDone(5, null)).toBe(0)
    expect(pctDone(NaN, 10)).toBe(0)
    expect(pctDone('3', '4')).toBe(75)
    expect(pctDone(-5, 10)).toBe(0)
    expect(pctDone(150, 100)).toBe(100)
    expect(pctDone(undefined, undefined)).toBe(0)
    expect(pctDone(Infinity, 10)).toBe(0)
  })

  it('pemakai konsisten: team_spec, whiteboard, kanban, tooltip', () => {
    const stats = computeTeamStats([
      { team: 'core-be', status: 'done' },
      { team: 'core-be', status: 'done' },
      { team: 'core-be', status: 'pending' },
    ])
    const be = stats.find((s) => s.key === 'core-be')
    expect(be.pct).toBe(pctDone(be.done, be.total))
    expect(be.pct).toBe(67)
    expect(sprintLiveRows({ total: 4, done: 3 })[0][1]).toBe('3/4 (75%)')
    expect(getWhiteboardTooltipText({ total: 4, done: 3 })).toContain('(75%)')
    expect(computeColumnDistribution(3, 7).pct).toBe(pctDone(3, 7))
    expect(computeSprintMetrics([{ status: 'done' }, { status: 'pending' }]).pct).toBe(50)
  })
})
