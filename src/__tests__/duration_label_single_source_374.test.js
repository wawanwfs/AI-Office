import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { durLabel } from '../lib/duration_label.js'
import { connectionBadge } from '../lib/connection_spec.js'
import { tvConnBadge } from '../scene/parts/tv_canvas.js'

const read = f => readFileSync(join(__dirname, '..', f), 'utf8')

describe('Siklus 374 — label durasi "X dtk/mnt lalu" satu sumber', () => {
  it('salinan pola ternary hilang dari 2 file pemakai', () => {
    const conn = read('lib/connection_spec.js')
    expect(/s < 60 \? `\$\{s\} dtk lalu`/.test(conn),
      'connection_spec masih punya ternary inline').toBe(false)
    expect(conn.includes('duration_label'), 'connection_spec tidak import satu sumber').toBe(true)

    const tv = read('scene/parts/tv_canvas.js')
    expect(/const s=Math\.max\(0,ageSec\|\|0\)/.test(tv),
      'tv_canvas masih punya pola inline').toBe(false)
    expect(tv.includes('duration_label'), 'tv_canvas tidak import satu sumber').toBe(true)
  })

  it('paritas: format dtk/mnt + kata "lalu"', () => {
    expect(durLabel(0)).toBe('0 dtk lalu')
    expect(durLabel(59)).toBe('59 dtk lalu')
    expect(durLabel(60)).toBe('1 mnt lalu')
    expect(durLabel(125)).toBe('2 mnt lalu')
    expect(durLabel(3661)).toBe('61 mnt lalu')
    expect(durLabel(59.9)).toBe('59 dtk lalu') // floor, bukan round
  })

  it('anti-poisoning: non-finite/bukan angka → null; negatif clamp; string numerik dinormalisasi', () => {
    expect(durLabel(null)).toBe(null)
    expect(durLabel(undefined)).toBe(null)
    expect(durLabel('')).toBe(null)
    expect(durLabel(NaN)).toBe(null)
    expect(durLabel(Infinity)).toBe(null)
    expect(durLabel(-5)).toBe('0 dtk lalu')
    expect(durLabel('90')).toBe('1 mnt lalu')
    expect(durLabel('abc')).toBe(null)
  })

  it('connectionBadge stale pakai durLabel', () => {
    const b = connectionBadge({ state: 'stale', lastOkAt: 0 }, 125_000)
    expect(b.label).toBe('Sinkron 2 mnt lalu')
    expect(b.tone).toBe('warn')
  })

  it('tvConnBadge stale: gaya KAPITAL tanpa "lalu", nilai sama dgn durLabel', () => {
    expect(tvConnBadge('stale', 125).label).toBe('SINKRON 2 MNT LALU')
    expect(tvConnBadge('stale', 7).label).toBe('SINKRON 7 DTK LALU')
    expect(tvConnBadge('live', 999).label).toBe('LIVE')
    expect(tvConnBadge('down', null).label).toBe('TERPUTUS')
  })
})
