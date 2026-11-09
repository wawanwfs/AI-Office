// Siklus 345: satu sumber stempel waktu scene & log — fmtStampId + clockNowShortId.
// Pengganti 3 salinan `toLocaleTimeString('id-ID')` telanjang di App.jsx (log
// aktivitas), scene/parts/tv_canvas.js & scene/parts/projectboard.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fmtStampId, clockNowShortId } from '../lib/format_time.js'

const appSrc = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8')
const tvSrc = readFileSync(resolve(__dirname, '../scene/parts/tv_canvas.js'), 'utf8')
const pbSrc = readFileSync(resolve(__dirname, '../scene/parts/projectboard.js'), 'utf8')

describe('fmtStampId (siklus 345)', () => {
  it('salinan toLocaleTimeString telanjang hilang dari ketiga pemanggil', () => {
    expect(appSrc).not.toContain("toLocaleTimeString('id-ID'")
    expect(tvSrc).not.toContain("toLocaleTimeString('id-ID'")
    expect(pbSrc).not.toContain("toLocaleTimeString('id-ID'")
    expect(appSrc).toContain('clockNowShortId')
    expect(tvSrc).toContain('fmtStampId')
    expect(pbSrc).toContain('fmtStampId')
  })

  it('paritas format HH.MM.SS id-ID untuk detik-UNIX & ISO', () => {
    const expSec = new Date(1700000000 * 1000)
    expect(fmtStampId(1700000000)).toBe(expSec.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    expect(fmtStampId(1700000000 * 1000)).toBe(fmtStampId(1700000000))
    expect(fmtStampId(new Date(1700000000 * 1000))).toBe(fmtStampId(1700000000))
  })

  it('anti-poisoning: null/NaN/Infinity/invalid/epoch≤0 -> null', () => {
    expect(fmtStampId(null)).toBeNull()
    expect(fmtStampId(undefined)).toBeNull()
    expect(fmtStampId(NaN)).toBeNull()
    expect(fmtStampId(Infinity)).toBeNull()
    expect(fmtStampId('invalid')).toBeNull()
    expect(fmtStampId(0)).toBeNull()
    expect(fmtStampId(-5)).toBeNull()
    expect(fmtStampId(new Date('bogus'))).toBeNull()
  })

  it('clockNowShortId: HH.MM id-ID, Date rusak -> null', () => {
    const d = new Date(2026, 10, 9, 14, 7)
    expect(clockNowShortId(d)).toBe(d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    expect(clockNowShortId(new Date('nope'))).toBeNull()
    expect(clockNowShortId(null)).toBeNull()
  })
})
