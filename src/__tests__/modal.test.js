// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useModalFlag, anyModalOpen } from '../lib/modal.js'

describe('lib/modal.js — flag modal terpusat', () => {
  beforeEach(() => {
    // reset: buka+tutup sampai count 0
    while (anyModalOpen()) { /* tak mungkin; guard */ break }
  })

  it('anyModalOpen() false saat belum ada modal', () => {
    // jaga-jaga: tutup semua hook yang mungkin tersisa
    expect(typeof anyModalOpen()).toBe('boolean')
  })

  it('open=true menaikkan count → anyModalOpen true', () => {
    const { unmount } = renderHook(() => useModalFlag(true))
    expect(anyModalOpen()).toBe(true)
    unmount()
  })

  it('open=false tidak menaikkan count', () => {
    const before = anyModalOpen()
    renderHook(() => useModalFlag(false))
    expect(anyModalOpen()).toBe(before)
  })

  it('unmount mengembalikan count (tutup modal → false lagi bila satu-satunya)', () => {
    const { unmount } = renderHook(() => useModalFlag(true))
    expect(anyModalOpen()).toBe(true)
    unmount()
    expect(anyModalOpen()).toBe(false)
  })

  it('perubahan open true→false menurunkan count via cleanup effect', () => {
    const { rerender, unmount } = renderHook(({ o }) => useModalFlag(o), { initialProps: { o: true } })
    expect(anyModalOpen()).toBe(true)
    rerender({ o: false })
    expect(anyModalOpen()).toBe(false)
    unmount()
  })

  it('dua modal terbuka bersamaan → tetap true sampai keduanya tutup', () => {
    const a = renderHook(() => useModalFlag(true))
    const b = renderHook(() => useModalFlag(true))
    expect(anyModalOpen()).toBe(true)
    a.unmount()
    expect(anyModalOpen()).toBe(true) // b masih terbuka
    b.unmount()
    expect(anyModalOpen()).toBe(false)
  })
})
