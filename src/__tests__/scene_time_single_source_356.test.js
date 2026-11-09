import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dayMinutesNow } from '../lib/format_time.js'

const sceneSrc = readFileSync(resolve(__dirname, '../scene/OfficeScene.js'), 'utf8')

describe('siklus 356: init timeOfDay OfficeScene satu sumber', () => {
  it('salinan inline getHours()*60 di scene hilang, panggil dayMinutesNow', () => {
    expect(sceneSrc).not.toMatch(/getHours\(\)\s*\*\s*60/)
    expect(sceneSrc).toMatch(/dayMinutesNow\(/)
    expect(sceneSrc).toMatch(/import \{ dayMinutesNow \} from '\.\.\/lib\/format_time\.js'/)
  })

  it('dayMinutesNow paritas rumus & tahan Date rusak', () => {
    const d = new Date(2026, 0, 1, 9, 7)
    expect(dayMinutesNow(d)).toBe(9 * 60 + 7)
    expect(dayMinutesNow(new Date(NaN))).toBe(0)
    expect(dayMinutesNow(null)).toBe(0)
  })
})
