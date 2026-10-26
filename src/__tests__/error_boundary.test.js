// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

const h = React.createElement

afterEach(() => { cleanup(); vi.restoreAllMocks() })

// Flag di-flip DARI test (bukan di dalam render) — komponen hanya MEMBACA-nya,
// sehingga tidak ada side effect saat render (aturan react-hooks).
let throwOnce = true
function Flaky() {
  if (throwOnce) throw new Error('satu kali')
  return h('div', null, 'pulih')
}

function Boom() {
  throw new Error('boom!')
}

describe('components/ErrorBoundary', () => {
  beforeEach(() => {
    throwOnce = true
    // ErrorBoundary.componentDidCatch menulis ke console.error; bungkam saat test
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('tanpa error → me-render children apa adanya', () => {
    render(h(ErrorBoundary, null, h('div', null, 'konten')))
    expect(screen.getByText('konten')).toBeTruthy()
  })

  it('error render → tampil fallback role=alert berisi pesan error', () => {
    render(h(ErrorBoundary, null, h(Boom)))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Terjadi kesalahan tampilan/)).toBeTruthy()
    expect(screen.getByText('boom!')).toBeTruthy()
  })

  it('tombol "Coba lagi" me-reset state & memulihkan UI', () => {
    render(h(ErrorBoundary, null, h(Flaky)))
    expect(screen.getByRole('alert')).toBeTruthy()
    throwOnce = false // simulasikan penyebab error sudah hilang
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
    expect(screen.getByText('pulih')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
