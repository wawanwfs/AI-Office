// @vitest-environment jsdom
// Unit test komponen ActivityLog — log aktivitas (dialog) yang dipakai App.
// Cakupan: render null saat tertutup, role=ialog + aria-label/aria-modal,
// daftar item, state kosong, tombol Tutup/Bersihkan → callback.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ActivityLog from '../components/ActivityLog'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

// jsdom tanpa layout: patch offsetParent agar focus-trap di useDialogA11y
// (mengandalkan offsetParent) tidak menyaring semua elemen fokus.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() { return this.style.display === 'none' ? null : (this.ownerDocument && this.ownerDocument.body) },
})

const items = [
  { t: '10:21', status: 'running', label: 'Jalan', id: 17, title: 'Perbaiki label overlap' },
  { t: '10:19', status: 'done', label: 'Selesai', id: 16, title: 'Tambah smoke test Ticker' },
]

describe('ActivityLog', () => {
  it('tidak merender apa pun saat show=false', () => {
    const { container } = render(<ActivityLog show={false} items={items} onClose={vi.fn()} onClear={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('merender dialog dengan aria-label & aria-modal saat terbuka', () => {
    render(<ActivityLog show items={items} onClose={vi.fn()} onClear={vi.fn()} />)
    const dlg = screen.getByRole('dialog', { name: 'Log aktivitas' })
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Log Aktivitas')).toBeTruthy()
  })

  it('menampilkan item log (waktu, label, id, judul)', () => {
    render(<ActivityLog show items={items} onClose={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText('10:21')).toBeTruthy()
    expect(screen.getByText('Jalan')).toBeTruthy()
    expect(screen.getByText(/Perbaiki label overlap/)).toBeTruthy()
    expect(screen.getByText('10:19')).toBeTruthy()
    expect(screen.getByText('Selesai')).toBeTruthy()
  })

  it('menampilkan pesan kosong saat tidak ada item', () => {
    render(<ActivityLog show items={[]} onClose={vi.fn()} onClear={vi.fn()} />)
    expect(screen.getByText(/Belum ada perubahan status task/)).toBeTruthy()
    expect(screen.queryByText('Bersihkan')).toBeNull()
  })

  it('tombol Tutup (× dan footer) memanggil onClose; Bersihkan memanggil onClear', () => {
    const onClose = vi.fn()
    const onClear = vi.fn()
    render(<ActivityLog show items={items} onClose={onClose} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup log aktivitas' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Bersihkan' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
