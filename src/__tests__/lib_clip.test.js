// Unit test lib/clip.js (clip) — pemangkas teks di batas kata terakhir + '…'.
// Murni: tanpa DOM/fetch — bisa jalan di environment node.
import { describe, it, expect } from 'vitest'
import { clip } from '../lib/clip.js'

describe('clip — input kosong/null', () => {
  it('kosong → ""', () => {
    expect(clip('', 10)).toBe('')
  })
  it.each([[null], [undefined]])('input %p → ""', (v) => {
    expect(clip(v, 10)).toBe('')
  })
})

describe('clip — teks pendek (≤ n)', () => {
  it('persis n → utuh tanpa ellipsis', () => {
    expect(clip('abcd', 4)).toBe('abcd')
  })
  it('lebih pendek dari n → utuh', () => {
    expect(clip('abc', 10)).toBe('abc')
  })
})

describe('clip — pemangkasan', () => {
  it('tanpa spasi dalam potongan → potong mentah + …', () => {
    expect(clip('abcdef', 5)).toBe('abcde…')
  })
  it('potongan ada spasi cukup jauh → potong di batas kata terakhir', () => {
    expect(clip('hello world foo', 8)).toBe('hello…')
  })
  it('batas kata jatuh terlalu awal → potong mentah + …', () => {
    // sp=6, n*0.6=7.2 → sp tidak > ambang → potong mentah
    expect(clip('a very long sentence', 10)).toBe('a very lon…')
  })
  it('spasi terakhir tidak melewati ambang (n*0.6) → potong mentah', () => {
    // cut='one two three' (13), sp=7, ambang=7.8 → sp tidak > ambang → mentah
    expect(clip('one two three four', 13)).toBe('one two three…')
  })
  it('spasi ekor di-trim sebelum ellipsis', () => {
    expect(clip('hello world  ', 12)).toBe('hello world…')
  })
})

describe('clip — konsistensi antar-modul', () => {
  it('projectboard_data memakai ulang clip yang sama (regresi papan proyek)', async () => {
    const { clip: pb } = await import('../scene/parts/projectboard_data.js')
    expect(pb).toBe(clip)
    expect(pb('mengerjakan fitur upload gambar produk', 24)).toBe(clip('mengerjakan fitur upload gambar produk', 24))
  })
})
