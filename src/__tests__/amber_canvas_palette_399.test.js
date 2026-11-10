import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AMBER_ACCENT } from '../lib/ui_palette.js'

const tv = readFileSync('src/scene/parts/tv_canvas.js', 'utf8')
const zl = readFileSync('src/scene/parts/zone_label_canvas.js', 'utf8')
const wb = readFileSync('src/scene/parts/whiteboard_canvas.js', 'utf8')
const pal = readFileSync('src/lib/ui_palette.js', 'utf8')

describe('siklus 399 — amber aksen kanvas satu sumber', () => {
  it('literal #F59E0B/#f59e0b hilang dari painter kanvas (komentar diabaikan)', () => {
    const strip = (s) => s.replace(/\/\/[^\n]*/g, '')
    for (const [name, src] of [['tv_canvas', tv], ['zone_label_canvas', zl], ['whiteboard_canvas', wb]]) {
      expect(strip(src).match(/#[Ff]59[Ee]0[Bb]/g), name).toBeNull()
    }
  })

  it('AMBER_ACCENT terdefinisi di ui_palette dan bernilai kanonik', () => {
    expect(AMBER_ACCENT).toBe('#F59E0B')
    expect(pal).toContain("export const AMBER_ACCENT")
  })

  it('delegasi benar: ketiga painter memakai AMBER_ACCENT (bukan salinan)', () => {
    expect(tv).toMatch(/TV_ACCENT = AMBER_ACCENT/)
    expect(tv).toMatch(/color:AMBER_ACCENT/)
    expect(zl).toMatch(/ZL_BORDER = AMBER_ACCENT/)
    expect(wb).toMatch(/color: AMBER_ACCENT/)
  })
})
