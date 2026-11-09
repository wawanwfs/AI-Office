import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fmtMicroUSD } from '../lib/format_time.js'

const panelSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/SecureProjectPanel.jsx'), 'utf8')

describe('fmtMicroUSD satu sumber (siklus 344)', () => {
  it('diekspor di lib/format_time.js dan salinan toLocaleString hilang dari komponen', () => {
    expect(typeof fmtMicroUSD).toBe('function')
    expect(panelSrc.includes(".toLocaleString('id-ID')")).toBe(false)
    expect(panelSrc).toContain('fmtMicroUSD(')
  })

  it('format id-ID identik untuk angka bulat & desimal', () => {
    expect(fmtMicroUSD(1234567)).toBe((1234567).toLocaleString('id-ID'))
    expect(fmtMicroUSD(1500.5)).toBe((1500.5).toLocaleString('id-ID'))
    expect(fmtMicroUSD(0)).toBe('0')
  })

  it('anti-poisoning: null/undefined/NaN/Infinity/string -> null', () => {
    expect(fmtMicroUSD(null)).toBeNull()
    expect(fmtMicroUSD(undefined)).toBeNull()
    expect(fmtMicroUSD(NaN)).toBeNull()
    expect(fmtMicroUSD(Infinity)).toBeNull()
    expect(fmtMicroUSD(-Infinity)).toBeNull()
    expect(fmtMicroUSD('1000')).toBeNull()
  })

  it('fallback pemanggil: nilai buruk tidak melukis NaN di panel', () => {
    const v = budget => `Cap: ${fmtMicroUSD(budget) ?? '—'} µUSD`
    expect(v(500000)).toContain((500000).toLocaleString('id-ID'))
    expect(v(null)).toContain('—')
    expect(v(NaN)).not.toContain('NaN')
  })
})
