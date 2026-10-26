// Unit test scene/parts/flooring.js (fitZoneLabel) — auto-shrink font label zona.
// Murni: ctx kanvas di-inject palsu (hanya measureText + font), tanpa THREE/DOM.
import { describe, it, expect } from 'vitest'
import {
  fitZoneLabel,
  ZONE_LABEL_BASE_PX,
  ZONE_LABEL_MIN_PX,
  ZONE_LABEL_MAX_W,
  ZONE_LABEL_STEP,
} from '../scene/parts/flooring.js'

// ctx tiruan: font disimpan, measureText mengembalikan lebar = fontSize * scale
// (scale konstan → lebar turun proporsional saat font diperkecil).
function mkCtx({ scale = 10, fixedWidth = null } = {}) {
  const state = { fontSize: null, fonts: [] }
  const ctx = {
    get font() { return String(state.fontSize) },
    set font(v) {
      state.fontSize = Number(v.match(/(\d+)px/)[1]) // '800 44px' → 44
      state.fonts.push(v)
    },
    measureText() {
      const w = fixedWidth != null ? fixedWidth : state.fontSize * scale
      return { width: w }
    },
  }
  return { ctx, state }
}

// ekstrak ukuran px dari string font ('800 44px "…"' → 44)
const sizeOf = (f) => Number(f.match(/(\d+)px/)[1])

describe('fitZoneLabel — konstanta', () => {
  it('basis 44px, minimum 20px, lebar maks 460px, langkah 2px', () => {
    expect(ZONE_LABEL_BASE_PX).toBe(44)
    expect(ZONE_LABEL_MIN_PX).toBe(20)
    expect(ZONE_LABEL_MAX_W).toBe(460)
    expect(ZONE_LABEL_STEP).toBe(2)
  })
})

describe('fitZoneLabel — muat di ukuran basis', () => {
  it('teks pendek (lebar ≤ 460) → font basis 44px, satu set font', () => {
    const { ctx, state } = mkCtx({ scale: 8 }) // 44*8 = 352 ≤ 460
    expect(fitZoneLabel(ctx, 'Ruang Kerja')).toBe(44)
    expect(state.fonts).toHaveLength(1)
    expect(state.fonts[0]).toBe('800 44px "Segoe UI",Arial,sans-serif')
  })

  it('teks tepat di batas 460px → tidak menyusut (bukan > 460)', () => {
    const { ctx } = mkCtx({ fixedWidth: 460 })
    expect(fitZoneLabel(ctx, 'teks pas batas')).toBe(44)
  })
})

describe('fitZoneLabel — menyusut bertahap', () => {
  it('lebar awal 528 (44*12) → susut 2px/langkah sampai ≤ 460 → 38', () => {
    const { ctx, state } = mkCtx({ scale: 12 })
    // 44→528>460, 42→504>460, 40→480>460, 38→456≤460 → berhenti di 38
    expect(fitZoneLabel(ctx, 'Label Zona Agak Panjang')).toBe(38)
    expect(state.fonts.map(sizeOf)).toEqual([44, 42, 40, 38])
  })

  it('setiap langkah berkurang tepat 2px', () => {
    const { ctx, state } = mkCtx({ scale: 12 })
    fitZoneLabel(ctx, 'Label Zona Agak Panjang')
    const sizes = state.fonts.map(sizeOf)
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBe(sizes[i - 1] - 2)
    }
  })
})

describe('fitZoneLabel — batas bawah', () => {
  it('masih terlalu lebar di minimum → berhenti di 20px', () => {
    const { ctx, state } = mkCtx({ scale: 50 })
    // 20*50 = 1000 > 460 → while berhenti karena fs ≤ MIN
    expect(fitZoneLabel(ctx, 'Label Sangat Panjang Sekali')).toBe(20)
    expect(state.fonts.at(-1)).toBe('800 20px "Segoe UI",Arial,sans-serif')
  })

  it('tidak pernah turun di bawah 20px', () => {
    const { ctx, state } = mkCtx({ scale: 50 })
    fitZoneLabel(ctx, 'Label Sangat Panjang Sekali')
    const sizes = state.fonts.map(sizeOf)
    expect(Math.min(...sizes)).toBe(20)
  })
})
