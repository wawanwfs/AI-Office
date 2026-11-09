import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pctDone, computeColumnDistribution, computeSprintMetrics } from '../scene/parts/kanban_spec.js'

const root = process.cwd()
const spec = readFileSync(join(root, 'src/scene/parts/kanban_spec.js'), 'utf8')
const panel = readFileSync(join(root, 'src/components/ProjectPanel.jsx'), 'utf8')

describe('Siklus 360: persen penyelesaian satu sumber pctDone', () => {
  it('salinan rumus Math.round((x/y)*100) dihapus dari src non-tes', () => {
    const specNoPctDone = spec.replace(/export function pctDone[\s\S]*?\n\}\n/, '')
    expect(specNoPctDone).not.toMatch(/Math\.round\(\s*\(?\s*\w[\w.]*\s*\/\s*\w[\w.]*\s*\)?\s*\*\s*100\s*\)/)
    expect(panel).not.toMatch(/Math\.round\(\s*\(?\s*T\.done\s*\/\s*T\.total\s*\)?\s*\*\s*100\s*\)/)
  })

  it('ProjectPanel import pctDone', () => {
    expect(panel).toMatch(/import\s*\{\s*pctDone\s*\}\s*from\s*'[^']*kanban_spec\.js'/)
  })

  it('paritas: rumus klasik & pembulatan', () => {
    expect(pctDone(1, 3)).toBe(33)
    expect(pctDone(2, 3)).toBe(67)
    expect(pctDone(7, 8)).toBe(88)
    expect(pctDone(0, 10)).toBe(0)
    expect(pctDone(10, 10)).toBe(100)
  })

  it('anti-poisoning: total 0, NaN, string, negatif, over-100', () => {
    expect(pctDone(5, 0)).toBe(0)
    expect(pctDone(5, null)).toBe(0)
    expect(pctDone(NaN, 10)).toBe(0)
    expect(pctDone('3', '4')).toBe(75)
    expect(pctDone(-5, 10)).toBe(0)
    expect(pctDone(150, 100)).toBe(100)
    expect(pctDone(undefined, undefined)).toBe(0)
  })

  it('pemakai satu sumber: computeColumnDistribution & computeSprintMetrics konsisten', () => {
    expect(computeColumnDistribution(3, 7).pct).toBe(pctDone(3, 7))
    expect(computeSprintMetrics([{ status: 'done' }, { status: 'done' }, { status: 'pending' }]).pct).toBe(67)
    expect(computeSprintMetrics([]).pct).toBe(0)
    expect(computeColumnDistribution(0, 0).pct).toBe(0)
  })
})
