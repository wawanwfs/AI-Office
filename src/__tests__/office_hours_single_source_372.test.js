// Siklus 372: satu sumber jam kegiatan kantor — office_hours.js
// Dulu jam stand-up (600), makan siang (720) & sprint review (840) tersalin di
// 3 modul yang saling asing: daycycle.SCHEDULE (label HUD), meeting.MEETING_WINDOWS
// (peserta rapat scene), shift_spec.SHIFT.LUNCH_START/END (trip makan siang).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MEETING_WINDOWS, LUNCH_START, LUNCH_END, LUNCH_LABEL, BASE_PHASES,
  officeStatusAt, scheduleTable, inWindow,
} from '../scene/parts/office_hours.js'
import { SCHEDULE, statusAt } from '../scene/parts/daycycle.js'
import { SHIFT, lunchWindowOpen } from '../scene/parts/shift_spec.js'
import { isMeetingTime, meetingWindowIndex } from '../scene/parts/meeting.js'

const root = resolve(__dirname, '../..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('office_hours — satu sumber jam kegiatan (372)', () => {
  it('tabel jam manual di daycycle SCHEDULE hilang — SCHEDULE = scheduleTable() turunan', () => {
    const src = read('src/scene/parts/daycycle.js')
    expect(src).not.toMatch(/\[600,\s*['"]/)   // entri manual stand-up dihapus
    expect(src).not.toMatch(/\[720,\s*['"]/)   // entri manual lunch dihapus
    expect(src).not.toMatch(/\[840,\s*['"]/)   // entri manual sprint dihapus
    expect(src).toMatch(/officeStatusAt/)
  })

  it('LUNCH_START/END manual di shift_spec hilang — delegasi getter ke office_hours', () => {
    const src = read('src/scene/parts/shift_spec.js')
    expect(src).not.toMatch(/LUNCH_START:\s*\d+/)
    expect(src).toMatch(/import\s*{\s*LUNCH_START,\s*LUNCH_END\s*}\s*from\s*'\.\/office_hours\.js'/)
    expect(SHIFT.LUNCH_START).toBe(LUNCH_START)
    expect(SHIFT.LUNCH_END).toBe(LUNCH_END)
  })

  it('pasangan [[600,630]] di meeting.js hilang — re-export dari office_hours', () => {
    const src = read('src/scene/parts/meeting.js')
    expect(src).not.toMatch(/\[\[600,\s*630\]\]/)
    expect(src).toMatch(/export\s*{\s*MEETING_WINDOWS/)
  })

  it('paritas label: 12 fase daycycle lama identik lewat satu sumber', () => {
    const expected = {
      0: 'Shift malam · WFS online', 359: 'Shift malam · WFS online',
      360: 'Persiapan pagi', 479: 'Persiapan pagi',
      480: 'Tim mulai berdatangan', 539: 'Tim mulai berdatangan',
      540: 'Fokus pagi', 599: 'Fokus pagi',
      600: 'Stand-up pagi',
      630: 'Stand-up pagi', // batas: jendela rapat inklusif ≤630 — kini konsisten dgn isMeetingTime (dulu SCHEDULE bilang 'Deep work' tapi scene masih rapat → chip salah 1 menit)
      631: 'Deep work · semua online',
      719: 'Deep work · semua online', 720: 'Istirahat makan siang',
      779: 'Istirahat makan siang', 780: 'Fokus siang',
      839: 'Fokus siang', 840: 'Sprint review',
      870: 'Sprint review', // batas inklusif ≤870 (konsisten isMeetingTime)
      871: 'Fokus sore', 1019: 'Fokus sore',
      1020: 'Tim bersiap pulang', 1139: 'Tim bersiap pulang',
      1140: 'Shift malam · WFS online', 1439: 'Shift malam · WFS online',
    }
    for (const [m, label] of Object.entries(expected)) {
      expect(statusAt(Number(m))).toBe(label)
      expect(officeStatusAt(Number(m))).toBe(label)
    }
  })

  it('konsistensi lintas modul: rapat ↔ label fase ↔ jendela shift senada', () => {
    // Selama jendela rapat: chip fase = label jendela DAN scene sedang rapat.
    for (const w of MEETING_WINDOWS) {
      expect(isMeetingTime(w.start)).toBe(true)
      expect(statusAt(w.start)).toBe(w.label)
      expect(meetingWindowIndex(w.start)).toBeGreaterThanOrEqual(0)
    }
    // Lunch: label fase = label lunch DAN jendela shift terbuka di batas sama.
    expect(statusAt(LUNCH_START)).toBe(LUNCH_LABEL)
    expect(lunchWindowOpen(LUNCH_START)).toBe(true)
    expect(lunchWindowOpen(LUNCH_END)).toBe(false)
    // Lintas sumber: label jendela rapat ada di antara tone HUD (office_phase via SCHEDULE).
    for (const [, label] of SCHEDULE) expect(typeof label).toBe('string')
    // SCHEDULE berurut naik & siklus 24 jam tertutup.
    for (let i = 1; i < SCHEDULE.length; i++) expect(SCHEDULE[i][0]).toBeGreaterThan(SCHEDULE[i - 1][0])
    expect(SCHEDULE[0][1]).toBe(SCHEDULE[SCHEDULE.length - 1][1])
  })

  it('anti-poisoning: menit non-finite → statusAt fallback fase dasar, officeStatusAt null, inWindow false', () => {
    expect(officeStatusAt(NaN)).toBeNull()
    expect(officeStatusAt(Infinity)).toBeNull()
    expect(officeStatusAt(undefined)).toBeNull()
    expect(statusAt(NaN)).toBe('Shift malam · WFS online') // paritas loop-lama tak cocok
    expect(inWindow(NaN, MEETING_WINDOWS[0])).toBe(false)
    expect(inWindow(600, null)).toBe(false)
    expect(inWindow(600, { start: Infinity, end: 1 })).toBe(false)
    // start>end ditukar (jendela tak terdefinisi tak membuka rapat palsu).
    expect(inWindow(610, { start: 630, end: 600 })).toBe(true)
  })

  it('BASE_PHASES + jendela menutup 1440 menit tanpa celah label kosong', () => {
    for (let m = 0; m < 1440; m++) {
      const l = officeStatusAt(m)
      expect(typeof l).toBe('string')
      expect(l.length).toBeGreaterThan(0)
    }
  })
})
