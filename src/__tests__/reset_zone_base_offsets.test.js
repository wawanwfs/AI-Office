// Unit test resetZoneBaseOffsets (label_overlap.js) — pengganti 3 salinan inline
// di OfficeScene.js (teamAction('work') & toggleNames). Fungsi murni tanpa THREE.
import { describe, it, expect } from 'vitest'
import { resetZoneBaseOffsets } from '../scene/parts/label_overlap.js'

function mk(over = {}) {
  return {
    ref: { position: { y: 999, x: -888 }, userData: { antiY: 55, antiX: 33 }, visible: true, ...over.ref },
    base: { y: 2.5, x: -4 },
    ...over,
  }
}

describe('resetZoneBaseOffsets', () => {
  it('nol-kan antiY/antiX dan kembalikan posisi ke base', () => {
    const z = mk()
    expect(resetZoneBaseOffsets([z])).toBe(1)
    expect(z.ref.userData.antiY).toBe(0)
    expect(z.ref.userData.antiX).toBe(0)
    expect(z.ref.position.y).toBe(2.5)
    expect(z.ref.position.x).toBe(-4)
  })

  it('tanpa base: offset di-nol-kan, posisi tidak disentuh', () => {
    const z = mk({ base: undefined })
    resetZoneBaseOffsets([z])
    expect(z.ref.userData.antiY).toBe(0)
    expect(z.ref.position.y).toBe(999)
    expect(z.ref.position.x).toBe(-888)
  })

  it('visible diteruskan ke ref (toggleNames off→ visible false)', () => {
    const z = mk()
    resetZoneBaseOffsets([z], )
    const z2 = mk({ visible: false })
    resetZoneBaseOffsets([{ ...z2, ref: z2.ref }])
    expect(z2.ref.visible).toBe(false)
    expect(z.ref.visible).toBe(true) // tanpa field visible → tidak diubah
  })

  it('null / array kosong / entri tanpa ref aman', () => {
    expect(resetZoneBaseOffsets(null)).toBe(0)
    expect(resetZoneBaseOffsets([])).toBe(0)
    expect(resetZoneBaseOffsets([null, { base: { y: 1, x: 1 } }])).toBe(0)
  })

  it('banyak zona: return jumlah ter-reset', () => {
    const zs = [mk(), mk(), mk()]
    expect(resetZoneBaseOffsets(zs)).toBe(3)
    zs.forEach(z => { expect(z.ref.userData.antiY).toBe(0); expect(z.ref.position.y).toBe(2.5) })
  })
})
