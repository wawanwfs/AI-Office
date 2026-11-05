// Unit test parts/ring_canvas.js — painter kanvas cincin seleksi & hover
// (diekstrak dari ensureSelRing/ensureHoverRing OfficeScene). Recorder ctx:
// semua panggilan direkam lalu dicek urutan & parameternya.
import { describe, it, expect, vi } from 'vitest'
import { paintRing } from '../scene/parts/ring_canvas'
import { SEL_RING, HOVER_RING } from '../scene/parts/ring_spec'

function recorderCtx() {
  const ops = []
  const grad = { stops: [], addColorStop: (o, c) => grad.stops.push([o, c]) }
  const ctx = {
    createRadialGradient: vi.fn((...a) => { ops.push(['grad', ...a]); return grad }),
    fillRect: vi.fn((...a) => ops.push(['rect', ...a])),
    set fillStyle(v) { ops.push(['fillStyle', v]) },
    get fillStyle() { return ops.at(-1)[1] },
  }
  return { ctx, ops, grad }
}

describe('paintRing — seleksi (SEL_RING, opacity 0.95)', () => {
  it('gradient radial di pusat 64,64 dgn INNER/OUTER dari spec', () => {
    const { ctx, ops } = recorderCtx()
    paintRing(ctx, SEL_RING, 0.95)
    expect(ops[0]).toEqual(['grad', 64, 64, SEL_RING.INNER, 64, 64, SEL_RING.OUTER])
  })
  it('tepat 3 colorStop: transparan → RGB 0.95 di MID → transparan', () => {
    const { ctx, grad } = recorderCtx()
    paintRing(ctx, SEL_RING, 0.95)
    expect(grad.stops).toEqual([
      [0, 'rgba(255,255,255,0)'],
      [SEL_RING.MID, `rgba(${SEL_RING.RGB},0.95)`],
      [1, `rgba(${SEL_RING.RGB},0)`],
    ])
  })
  it('fillRect penuh SIZE×SIZE setelah fillStyle di-set', () => {
    const { ctx, ops } = recorderCtx()
    paintRing(ctx, SEL_RING, 0.95)
    expect(ops).toEqual([
      ['grad', 64, 64, SEL_RING.INNER, 64, 64, SEL_RING.OUTER],
      ['fillStyle', expect.anything()],
      ['rect', 0, 0, SEL_RING.SIZE, SEL_RING.SIZE],
    ])
  })
})

describe('paintRing — hover (HOVER_RING, opacity 0.9)', () => {
  it('memakai INNER/MID/OUTER & RGB hover', () => {
    const { ctx, ops, grad } = recorderCtx()
    paintRing(ctx, HOVER_RING, 0.9)
    expect(ops[0]).toEqual(['grad', 64, 64, HOVER_RING.INNER, 64, 64, HOVER_RING.OUTER])
    expect(grad.stops[1]).toEqual([HOVER_RING.MID, `rgba(${HOVER_RING.RGB},0.9)`])
  })
  it('opacity tengah bisa beda per pemanggil (0.95 vs 0.9)', () => {
    const a = recorderCtx(), b = recorderCtx()
    paintRing(a.ctx, SEL_RING, 0.95)
    paintRing(b.ctx, HOVER_RING, 0.9)
    expect(a.grad.stops[1][1]).toContain('0.95')
    expect(b.grad.stops[1][1]).toContain('0.9')
  })
})

// Siklus 260: kontrak rotasi waktu-nyata cincin (bug kelas 251/259 ketiga)
describe('ring_spec — rotasi & damping waktu-nyata (Siklus 260)', () => {
  it('SEL_RING_ROT_RATE = 0.72 rad/detik (== 0.012 rad × 60 FPS lama)', async () => {
    const m = await import('../scene/parts/ring_spec')
    expect(m.SEL_RING_ROT_RATE).toBe(0.72)
  })
  it('stepRingRotation: 60 langkah 1/60 dtk == 1 langkah 1 dtk (independen-FPS)', async () => {
    const { stepRingRotation } = await import('../scene/parts/ring_spec')
    let a = 0
    for (let i = 0; i < 60; i++) a = stepRingRotation(a, 1 / 60)
    const b = stepRingRotation(0, 1.0)
    expect(Math.abs(a - b)).toBeLessThan(1e-9)
    expect(a).toBeCloseTo(0.72, 6)
  })
  it('stepRingRotation: default dt eksplisit 0.016 → +0.01152 (mirip tempo visual lama per frame @60)', async () => {
    const { stepRingRotation } = await import('../scene/parts/ring_spec')
    expect(stepRingRotation(0, 0.016)).toBeCloseTo(0.01152, 9)
  })
  it('stepRingRotation: anti-poisoning dt non-finite/string/≤0/undefined → rotZ utuh (nol tambahan)', async () => {
    const { stepRingRotation } = await import('../scene/parts/ring_spec')
    for (const bad of [0, -0.016, NaN, Infinity, -Infinity, 'x', null, undefined]) {
      expect(stepRingRotation(1.5, bad)).toBe(1.5)
    }
  })
  it('stepRingRotation: rotZ korup (NaN) → dianggap 0 lalu naik wajar', async () => {
    const { stepRingRotation } = await import('../scene/parts/ring_spec')
    const r = stepRingRotation(NaN, 1)
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBeCloseTo(0.72, 6)
  })
  it('ringDampFactor: kontrak laju SEL 17.26 & HOVER 35.87 → ≈0.25/0.45 @ dt=1/60', async () => {
    const { ringDampFactor, SEL_RING_DAMP_RATE, HOVER_RING_DAMP_RATE } = await import('../scene/parts/ring_spec')
    expect(SEL_RING_DAMP_RATE).toBeCloseTo(17.26, 2)
    expect(HOVER_RING_DAMP_RATE).toBeCloseTo(35.87, 2)
    expect(ringDampFactor(SEL_RING_DAMP_RATE, 1 / 60)).toBeCloseTo(0.25, 3)
    expect(ringDampFactor(HOVER_RING_DAMP_RATE, 1 / 60)).toBeCloseTo(0.45, 3)
  })
  it('ringDampFactor: independen-FPS (60×1/60 == 1×1) & anti-poisoning', async () => {
    const { ringDampFactor, SEL_RING_DAMP_RATE } = await import('../scene/parts/ring_spec')
    let a = 0
    for (let i = 0; i < 60; i++) a = 1 - (1 - a) * (1 - ringDampFactor(SEL_RING_DAMP_RATE, 1 / 60))
    const b = ringDampFactor(SEL_RING_DAMP_RATE, 1.0)
    expect(Math.abs(a - b)).toBeLessThan(1e-9)
    for (const bad of [0, -1, NaN, Infinity, 'x', null, undefined]) {
      expect(ringDampFactor(bad, 1)).toBe(0)
      expect(ringDampFactor(SEL_RING_DAMP_RATE, bad)).toBe(0)
    }
  })
  it('stepRingPosition: lerp penuh f=1 → tepat di target; f=0 → diam; target NaN → tak menulari', async () => {
    const { stepRingPosition } = await import('../scene/parts/ring_spec')
    const pos = { x: 0, y: 0, z: 0 }
    expect(stepRingPosition(pos, { x: 10, y: -4, z: 2.5 }, 1)).toBe(true)
    expect(pos).toEqual({ x: 10, y: -4, z: 2.5 })
    const q = { x: 1, y: 1, z: 1 }
    expect(stepRingPosition(q, { x: 9, y: 9, z: 9 }, 0)).toBe(false)
    expect(q).toEqual({ x: 1, y: 1, z: 1 })
    const r = { x: 1, y: 1, z: 1 }
    stepRingPosition(r, { x: NaN, y: Infinity, z: 2 }, 1)
    expect(r.x).toBe(1); expect(Number.isFinite(r.y)).toBe(true)
  })
  it('stepRingPosition: pos/target null → false tanpa throw', async () => {
    const { stepRingPosition } = await import('../scene/parts/ring_spec')
    expect(stepRingPosition(null, { x: 1, y: 1, z: 1 }, 1)).toBe(false)
    expect(stepRingPosition({ x: 0, y: 0, z: 0 }, null, 1)).toBe(false)
  })
})
