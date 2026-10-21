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
