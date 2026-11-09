// Siklus 355: satu sumber menit-of-day ↔ 'HH:MM' — lib/format_time.js
// Salinan dulu: (a) init state waktu HUD di App.jsx `d.getHours()*60+d.getMinutes()`,
// (b) formatTime lokal App.jsx (padStart manual, bisa 'NaN:NaN' dari input rusak).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clockFromMinutes, dayMinutesNow } from '../lib/format_time.js'

const appSrc = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8')

describe('siklus 355 — clock HUD satu sumber', () => {
  it('salinan inline di App.jsx sudah hilang', () => {
    expect(appSrc).not.toMatch(/getHours\(\) \* 60 \+ d\.getMinutes\(\)/)
    expect(appSrc).not.toMatch(/Math\.floor\(min \/ 60\)/)
    expect(appSrc).toMatch(/dayMinutesNow\(d\)/)
    expect(appSrc).toMatch(/clockFromMinutes\(min\)/)
  })

  it('dayMinutesNow: paritas rumus + anti-Date-rusak', () => {
    const d = new Date(2026, 0, 1, 7, 45)
    expect(dayMinutesNow(d)).toBe(7 * 60 + 45)
    const bad = new Date(NaN)
    expect(dayMinutesNow(bad)).toBe(0)
    expect(dayMinutesNow({})).toBe(0)
  })

  it('clockFromMinutes: format HH:MM + clamp 0..1439', () => {
    expect(clockFromMinutes(0)).toBe('00:00')
    expect(clockFromMinutes(7 * 60 + 5)).toBe('07:05')
    expect(clockFromMinutes(1440)).toBe('23:59')
    expect(clockFromMinutes(100000)).toBe('23:59')
  })

  it('clockFromMinutes: anti-poisoning (NaN/null/negatif → 00:00, bukan NaN:NaN)', () => {
    expect(clockFromMinutes(NaN)).toBe('00:00')
    expect(clockFromMinutes(null)).toBe('00:00')
    expect(clockFromMinutes(undefined)).toBe('00:00')
    expect(clockFromMinutes(-5)).toBe('00:00')
    expect(clockFromMinutes('90')).toBe('01:30') // string numerik dinormalisasi
  })
})
