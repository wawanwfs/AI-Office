import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clockNowId, fmtTime } from '../lib/format_time.js'

const root = resolve(__dirname, '..')
const sysMeter = readFileSync(resolve(root, 'components/SysMeter.jsx'), 'utf8')
const hud = readFileSync(resolve(root, 'components/HUD.jsx'), 'utf8')

describe('siklus 343: jam id-ID satu sumber (clockNowId)', () => {
  it('clockNowId ada di lib/format_time dan mengembalikan pola jam id-ID', () => {
    const plain = clockNowId()
    expect(plain).toMatch(/^\d{2}[.,:]\d{2}$/)
    const withSec = clockNowId(true)
    expect(withSec).toMatch(/^\d{2}[.,:]\d{2}[.,:]\d{2}$/)
  })

  it('clockNowId anti-poisoning: input invalid -> null', () => {
    expect(clockNowId.call({}, false) === null || typeof clockNowId() === 'string').toBe(true)
    // simulasi Date rusak lewat bentuk argumen: fungsi menerima flag saja,
    // jadi validasi internal hanya bisa dipicu bila constructor Date dipatch
    const RealDate = globalThis.Date
    globalThis.Date = class extends RealDate {
      constructor(...a) { super(...a); if (a.length === 0) this.setTime(NaN) }
    }
    try {
      expect(clockNowId()).toBeNull()
    } finally {
      globalThis.Date = RealDate
    }
  })

  it('salinan toLocaleTimeString("id-ID", ...) di SysMeter & HUD dihapus', () => {
    expect(sysMeter).not.toContain("toLocaleTimeString('id-ID'")
    expect(hud).not.toContain("toLocaleTimeString('id-ID'")
    expect(sysMeter).toContain('clockNowId(true)')
    expect(hud).toContain('clockNowId()')
  })

  it('regresi fmtTime: stempel valid & tidak valid (paritas siklus 270)', () => {
    expect(fmtTime(new Date('2026-11-09T08:05:00').getTime())).toMatch(/^\d{2}[.,:]\d{2}$/)
    expect(fmtTime(null)).toBe('')
    expect(fmtTime(0)).toBe('')
    expect(fmtTime('invalid')).toBe('')
  })
})
