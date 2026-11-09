// Siklus 361: satu sumber clamp01 (src/lib/math_util.js).
// 8 salinan `Math.max(0, Math.min(1, x))` di bubble_canvas, wall_fade,
// ring_spec (2), sound_spec (3) & sound_engine kini satu sumber.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clamp01 } from '../lib/math_util.js'

const read = (p) => readFileSync(resolve(__dirname, '../', p), 'utf8')

describe('siklus 361: clamp01 satu sumber', () => {
  it('salinan Math.max(0, Math.min(1, ...)) hilang dari 5 file pemakai', () => {
    const files = [
      'scene/parts/bubble_canvas.js',
      'scene/parts/wall_fade.js',
      'scene/parts/ring_spec.js',
      'scene/parts/sound_spec.js',
      'scene/parts/sound_engine.js',
    ]
    for (const f of files) {
      expect(read(`../src/${f}`).includes('Math.max(0, Math.min(1'), f).toBe(false)
    }
  })

  it('semua pemakai mengimpor clamp01', () => {
    for (const f of [
      'scene/parts/bubble_canvas.js',
      'scene/parts/wall_fade.js',
      'scene/parts/ring_spec.js',
      'scene/parts/sound_spec.js',
      'scene/parts/sound_engine.js',
    ]) {
      expect(read(`../src/${f}`).includes('clamp01'), f).toBe(true)
    }
  })

  it('paritas: nilai dalam rentang clamp, di luar dipotong ke 0/1', () => {
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(0)).toBe(0)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(-0.7)).toBe(0)
    expect(clamp01(1.7)).toBe(1)
    expect(clamp01(2)).toBe(1)
    expect(clamp01(-5)).toBe(0)
  })

  it('anti-poisoning: NaN/null/undefined/Infinity/string → hasil valid', () => {
    expect(clamp01(NaN)).toBe(0)
    expect(clamp01(null)).toBe(0)
    expect(clamp01(undefined)).toBe(0)
    expect(clamp01(Infinity)).toBe(0)
    expect(clamp01(-Infinity)).toBe(0)
    expect(clamp01('0.25')).toBe(0.25)
    expect(clamp01('abc')).toBe(0)
    expect(clamp01({})).toBe(0)
  })

  it('konsistensi pemakai: bubbleOpacity, wallFadeOf, ringDampFactor, clampVolume', async () => {
    const { bubbleOpacity } = await import('../scene/parts/bubble_canvas.js')
    const { wallFadeOf } = await import('../scene/parts/wall_fade.js')
    const { ringDampFactor, stepRingPosition } = await import('../scene/parts/ring_spec.js')
    const { clampVolume, clampAmbienceVolume, calcCardSweepFreq } = await import('../scene/parts/sound_spec.js')
    expect(bubbleOpacity(0.1, 1)).toBeGreaterThan(0)
    expect(bubbleOpacity(0.1, 0)).toBe(0)
    expect(wallFadeOf(-10)).toBe(1)
    expect(wallFadeOf(10)).toBe(0)
    expect(wallFadeOf(NaN)).toBe(1)
    expect(ringDampFactor(35.87, 0.016)).toBeGreaterThan(0)
    expect(ringDampFactor(35.87, -1)).toBe(0)
    const pos = { x: 0, y: 0, z: 0 }
    expect(stepRingPosition(pos, { x: 10, y: 0, z: 0 }, NaN)).toBe(false)
    expect(clampVolume(1.5)).toBe(1)
    expect(clampVolume(-2)).toBe(0)
    expect(clampVolume('x')).toBe(1)
    expect(clampAmbienceVolume(0.35)).toBe(0.35)
    expect(calcCardSweepFreq(420, 210, 2)).toBe(210)
  })
})
