// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import OverlayHelp from '../components/OverlayHelp.jsx'

const h = React.createElement

afterEach(() => { cleanup(); document.body.innerHTML = '' })

describe('components/OverlayHelp', () => {
  it('show=false → tidak me-render apa pun', () => {
    const r = render(h(OverlayHelp, { show: false, onClose: vi.fn() }))
    expect(r.container.firstChild).toBeNull()
  })

  it('render dialog langkah pertama dengan counter & navigasi awal', () => {
    render(h(OverlayHelp, { show: true, onClose: vi.fn() }))
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Navigasi 3D')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('(1/6)')
    expect(screen.getByRole('button', { name: '← Sebelumnya' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Berikutnya →' })).toBeTruthy()
  })

  it('navigasi ke langkah berikutnya & kembali', () => {
    render(h(OverlayHelp, { show: true, onClose: vi.fn() }))
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya →' }))
    expect(screen.getByText('Chat & Konfigurasi Agent')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('(2/6)')
    const prev = screen.getByRole('button', { name: '← Sebelumnya' })
    expect(prev.disabled).toBe(false)
    fireEvent.click(prev)
    expect(screen.getByText('Navigasi 3D')).toBeTruthy()
  })

  it('langkah terakhir menampilkan region shortcut keyboard; Selesai menutup & reset step', () => {
    const onClose = vi.fn()
    render(h(OverlayHelp, { show: true, onClose }))
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Berikutnya →' }))
    }
    expect(screen.getByRole('region', { name: 'Daftar shortcut keyboard' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Selesai' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    // step di-reset ke 0: dialog masih terbuka, kembali ke langkah pertama
    expect(screen.getByText('Navigasi 3D')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('(1/6)')
  })

  it('tombol X menutup panduan', () => {
    const onClose = vi.fn()
    render(h(OverlayHelp, { show: true, onClose }))
    fireEvent.click(screen.getByRole('button', { name: 'Tutup panduan' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape menutup panduan melalui useDialogA11y', () => {
    const onClose = vi.fn()
    render(h(OverlayHelp, { show: true, onClose }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('klik scrim (luar modal) menutup panduan', () => {
    const onClose = vi.fn()
    const { container } = render(h(OverlayHelp, { show: true, onClose }))
    fireEvent.click(container.querySelector('.modal-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
