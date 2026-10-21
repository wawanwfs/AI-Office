import { describe, it, expect } from 'vitest'
import { clip } from '../lib/clip.js'

describe('clip (batas kata)', () => {
  it('teks pendek utuh tanpa ellipsis', () => {
    expect(clip('halo', 10)).toBe('halo')
    expect(clip('', 10)).toBe('')
    expect(clip(null, 10)).toBe('')
  })
  it('memotong di spasi terakhir bila ≥60% batas', () => {
    const s = 'mengerjakan fitur upload gambar produk'
    const out = clip(s, 24)
    expect(out.endsWith('…')).toBe(true)
    expect(out.slice(0, -1).split(' ').every(w => s.includes(w))).toBe(true)
  })
  it('fallback potong apa adanya untuk kata panjang tanpa spasi', () => {
    const out = clip('a'.repeat(40), 20)
    expect(out).toBe('a'.repeat(20) + '…')
  })
  it('dipakai ulang: sama dengan clip lama papan proyek', async () => {
    const { clip: pb } = await import('../scene/parts/projectboard_data.js')
    expect(pb).toBe(clip)
    expect(pb('mengerjakan fitur upload gambar produk', 24)).toBe(clip('mengerjakan fitur upload gambar produk', 24))
  })
})
