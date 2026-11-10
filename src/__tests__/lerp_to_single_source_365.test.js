// Siklus 365: satu sumber lerpTo — salinan pola `cur + (target-cur)*k`
// di OfficeScene (damping label antiY/antiX + oklusi occO, agen & zona) dihapus.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lerpTo } from '../lib/math_util.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sceneSrc = readFileSync(join(root, 'scene', 'OfficeScene.js'), 'utf8')
const partsDir = join(root, 'scene', 'parts')

describe('siklus 365 — lerpTo satu sumber', () => {
  it('tidak ada lagi salinan pola literal di OfficeScene & scene/parts', () => {
    expect(sceneSrc).not.toMatch(/\w+\s*\+\s*\(\w+\s*-\s*\w+\)\s*\*\s*LBL_SMOOTH/)
    expect(sceneSrc).not.toMatch(/antiY\s*\+\s*\(cdy/)
    const leftovers = readdirSync(partsDir).filter((f) => f.endsWith('.js') &&
      readFileSync(join(partsDir, f), 'utf8').match(/\+\s*\(\w+\s*-\s*\w+\s*\)\s*\*\s*\w+SMOOTH/))
    expect(leftovers).toEqual([])
  })

  it('OfficeScene memakai lerpTo (6 situs) + clamp utk cdy/cdx', () => {
    expect((sceneSrc.match(/lerpTo\(/g) || []).length).toBe(6)
    expect(sceneSrc).toMatch(/import \{[^}]*lerpTo[^}]*\} from '\.\.\/lib\/math_util\.js'/)
    expect(sceneSrc).not.toMatch(/Math\.max\(-1\.2,\s*Math\.min\(1\.6/)
    expect(sceneSrc).not.toMatch(/Math\.max\(-1\.5,\s*Math\.min\(1\.5/)
  })

  it('paritas: lerpTo === pola lama utk nilai finite', () => {
    const cases = [
      [0, 1, 0.25], [1.5, -0.4, 0.1], [-1.2, 1.6, 0.9],
      [0.5, 0.5, 0.3], [2, 0, 1], [0, 0, 0],
      [-3.2, 7.7, 0.0333],
    ]
    for (const [c, t, k] of cases) {
      expect(lerpTo(c, t, k)).toBeCloseTo(c + (t - c) * k, 12)
    }
  })

  it('paritas: undefined cur → target (frame pertama, damping dilewati)', () => {
    expect(lerpTo(undefined, 1.3, 0.2)).toBe(1.3)
    expect(lerpTo(undefined, -0.7, 0.9)).toBe(-0.7)
    expect(lerpTo(undefined, NaN, 0.5)).toBe(0)
  })

  it('anti-poisoning: k non-finite/out-of-range → 0 (no-op); target invalid → cur', () => {
    expect(lerpTo(2, 10, NaN)).toBe(2)
    expect(lerpTo(2, 10, Infinity)).toBe(2)
    expect(lerpTo(2, 10, -0.5)).toBe(2)
    expect(lerpTo(2, 10, 1.5)).toBe(10) // k>1 di-clamp ke 1 → snap ke target
    expect(lerpTo(2, 10, 'x')).toBe(2)
    expect(lerpTo(2, NaN, 0.4)).toBe(2)
    expect(lerpTo(2, Infinity, 0.4)).toBe(2)
    expect(Number.isFinite(lerpTo(NaN, NaN, 0.5))).toBe(true)
  })
})
