// Unit test coolerBubbles (siklus 490): gelembung air water cooler naik
// dari dasar jug ke permukaan, fade di permukaan, stagger fase per gelembung.
import { describe, it, expect } from 'vitest'
import { coolerBubbles } from '../scene/parts/effects.js'

function mkBubble(phase) {
  return {
    position: { y: 0 },
    material: { opacity: 1 },
    userData: { phase },
  }
}

describe('coolerBubbles — gelembung air water cooler', () => {
  it('guard: elapsed non-finite / bukan array → 0 dan tanpa mutasi', () => {
    const b = mkBubble(0)
    expect(coolerBubbles(NaN, [b])).toBe(0)
    expect(coolerBubbles(Infinity, [b])).toBe(0)
    expect(coolerBubbles(1, null)).toBe(0)
    expect(coolerBubbles(1, 'x')).toBe(0)
    expect(b.position.y).toBe(0)
  })

  it('gelembung naik dari bottom ke top sepanjang siklus', () => {
    const b = mkBubble(0)
    coolerBubbles(0, [b], 1.42, 1.14, 1.8)
    expect(b.position.y).toBeCloseTo(1.14)
    coolerBubbles(0.9, [b], 1.42, 1.14, 1.8) // t=0.5
    expect(b.position.y).toBeCloseTo((1.14 + 1.42) / 2)
    coolerBubbles(1.79, [b], 1.42, 1.14, 1.8) // t≈0.994
    expect(b.position.y).toBeGreaterThan(1.41)
  })

  it('fade: muncul cepat (min(1,t*6)), memudar linier ke 0 di permukaan', () => {
    const b = mkBubble(0)
    coolerBubbles(0.05, [b], 1.42, 1.14, 1.8) // t≈0.028 → opacity≈0.7*0.97*0.167
    expect(b.material.opacity).toBeGreaterThan(0)
    expect(b.material.opacity).toBeLessThan(0.15)
    coolerBubbles(0.45, [b], 1.42, 1.14, 1.8) // t=0.25 → opacity 0.7*0.75
    expect(b.material.opacity).toBeCloseTo(0.7 * 0.75, 2)
    coolerBubbles(1.8, [b], 1.42, 1.14, 1.8) // t=0 (seam siklus) → opacity 0
    expect(b.material.opacity).toBeCloseTo(0)
    coolerBubbles(1.7, [b], 1.42, 1.14, 1.8) // t≈0.944 → opacity≈0.039
    expect(b.material.opacity).toBeLessThan(0.1)
  })

  it('stagger: fase per gelembung (i*CYCLE/3) memberi posisi berbeda di t sama', () => {
    const bs = [mkBubble(0), mkBubble(0.6), mkBubble(1.2)]
    coolerBubbles(0.3, bs, 1.42, 1.14, 1.8)
    const ys = bs.map((b) => b.position.y)
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBe(3)
  })

  it('deterministik: elapsed sama → hasil sama (fungsi murni elapsed)', () => {
    const a = [mkBubble(0.4), mkBubble(1.0)]
    const c = [mkBubble(0.4), mkBubble(1.0)]
    coolerBubbles(3.7, a, 1.42, 1.14, 1.8)
    coolerBubbles(3.7, c, 1.42, 1.14, 1.8)
    a.forEach((b, i) => {
      expect(b.position.y).toBeCloseTo(c[i].position.y)
      expect(b.material.opacity).toBeCloseTo(c[i].material.opacity)
    })
  })

  it('elemen rusak / tanpa material dilewati tanpa error; default param dipakai', () => {
    expect(coolerBubbles(1, [null, {}, { position: { y: 0 } }])).toBe(0)
    const b = mkBubble(0)
    // default: top 1.42, bottom 1.14, cycle 1.8 — sama dgn eksplisit
    const b2 = mkBubble(0)
    coolerBubbles(0.9, [b])
    coolerBubbles(0.9, [b2], 1.42, 1.14, 1.8)
    expect(b.position.y).toBeCloseTo(b2.position.y)
  })
})
