// Unit test fitZoneLabel (flooring.js) — logika auto-shrink font label zona
// diekstrak murni dari createZones. ctx recorder: font dicatat, measureText
// lebar proporsional (dapat dikontrol via widthFactor).
import { describe, it, expect } from 'vitest'
import { fitZoneLabel, ZONE_LABEL_BASE_PX, ZONE_LABEL_MIN_PX, ZONE_LABEL_MAX_W, ZONE_LABEL_STEP } from '../scene/parts/flooring.js'

function makeCtx(widthPerChar = 10, proportional = false) {
  const fonts = []
  const curPx = () => { const m = (fonts[fonts.length - 1] || '').match(/(\d+)px/); return m ? +m[1] : ZONE_LABEL_BASE_PX }
  return {
    fonts,
    get font() { return fonts[fonts.length - 1] ?? '' },
    set font(v) { fonts.push(v) },
    measureText(s) {
      return { width: String(s).length * (proportional ? curPx() : widthPerChar) }
    },
  }
}

const FONT_RE = /^800 (\d+)px "Segoe UI",Arial,sans-serif$/

describe('fitZoneLabel — auto-shrink font label zona lantai', () => {
  it('teks pendek: font tetap base 44px, font diset tepat 1×', () => {
    const c = makeCtx(10)
    const fs = fitZoneLabel(c, 'MEETING') // 7×10=70 ≤ 460
    expect(fs).toBe(44)
    expect(c.fonts).toEqual(['800 44px "Segoe UI",Arial,sans-serif'])
  })

  it('label zona lengkap memakai weight 800 & keluarga font benar', () => {
    const c = makeCtx(10)
    fitZoneLabel(c, 'SERVER ROOM')
    expect(FONT_RE.test(c.fonts[0])).toBe(true)
    expect(c.fonts[0]).toContain('Segoe UI')
  })

  it('teks >460px yang tak mungkin muat: berhenti di batas bawah 20px', () => {
    const c = makeCtx(10)
    const fs = fitZoneLabel(c, 'X'.repeat(60)) // 60×20=1200 masih > 460
    expect(fs).toBe(ZONE_LABEL_MIN_PX)
    expect(c.fonts[c.fonts.length - 1]).toBe('800 20px "Segoe UI",Arial,sans-serif')
  })

  it('teks panjang yang bisa muat (font proporsional): menyusut sampai muat', () => {
    const c = makeCtx(1, true) // lebar = n × fontSize → butuh fontSize ≤ 23 utk 20 huruf
    const fs = fitZoneLabel(c, 'X'.repeat(20)) // 20×44=880>460 → ... → 20×23=460 muat
    expect(fs).toBe(22) // langkah 2: 24→480 masih >460, 22→440 ≤ 460
    expect(c.fonts[c.fonts.length - 1]).toBe('800 22px "Segoe UI",Arial,sans-serif')
  })

  it('menyusut bertahap: tidak ada lompatan > STEP per langkah', () => {
    const c = makeCtx(10)
    fitZoneLabel(c, 'X'.repeat(60))
    const pxs = c.fonts.map(f => +f.match(FONT_RE)[1])
    for (let i = 1; i < pxs.length; i++) expect(pxs[i - 1] - pxs[i]).toBe(ZONE_LABEL_STEP)
  })

  it('berhenti di batas bawah 20px walau teks tetap tak muat', () => {
    const c = makeCtx(100) // lebar ekstrem
    const fs = fitZoneLabel(c, 'SUPER LONG ZONE LABEL') // 22×100=2200 selalu > 460
    expect(fs).toBe(ZONE_LABEL_MIN_PX)
    expect(c.fonts[c.fonts.length - 1]).toBe('800 20px "Segoe UI",Arial,sans-serif')
  })

  it('batas tepat 460px dianggap muat (tidak menyusut)', () => {
    const c = makeCtx(10)
    const fs = fitZoneLabel(c, 'X'.repeat(46)) // 46×10=460
    expect(fs).toBe(ZONE_LABEL_BASE_PX)
    expect(c.fonts).toHaveLength(1)
  })

  it('konstanta publik konsisten dengan semantik shrink', () => {
    expect(ZONE_LABEL_BASE_PX).toBe(44)
    expect(ZONE_LABEL_MIN_PX).toBe(20)
    expect(ZONE_LABEL_STEP).toBe(2)
    expect(ZONE_LABEL_MAX_W).toBe(460)
  })

  it('melewatkan string kosong tanpa menyusut', () => {
    const c = makeCtx(10)
    expect(fitZoneLabel(c, '')).toBe(44)
    expect(c.fonts).toHaveLength(1)
  })
})
