// @vitest-environment jsdom
// Unit test dua komponen UI yang belum tercakup: QuickToolbar (popover aksi cepat)
// dan ErrorBoundary (penangkap error render React).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import QuickToolbar from '../components/QuickToolbar'
import ErrorBoundary from '../components/ErrorBoundary'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

// ── QuickToolbar ──
const baseProps = {
  onAddTask: vi.fn(), onPauseAll: vi.fn(), onResumeAll: vi.fn(), onToggleTheme: vi.fn(),
  theme: true, onZoomIn: vi.fn(), onZoomOut: vi.fn(), onSetView: vi.fn(), paused: false,
}

describe('QuickToolbar — aksi langsung', () => {
  it('menampilkan semua tombol dengan aria-label', () => {
    render(<QuickToolbar {...baseProps} />)
    for (const label of ['Tambah task baru', 'Jeda semua task', 'Perkecil', 'Perbesar', 'Kamera iso', 'Kamera front', 'Kamera top', 'Lampu neon']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
  })

  it('klik tiap tombol memanggil callback terkait tepat sekali', () => {
    render(<QuickToolbar {...baseProps} />)
    fireEvent.click(screen.getByLabelText('Tambah task baru'))
    expect(baseProps.onAddTask).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Perkecil'))
    expect(baseProps.onZoomOut).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Perbesar'))
    expect(baseProps.onZoomIn).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Lampu neon'))
    expect(baseProps.onToggleTheme).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByLabelText('Kamera front'))
    expect(baseProps.onSetView).toHaveBeenCalledWith('front')
  })

  it('paused=false → tombol Jeda; klik memicu onPauseAll', () => {
    render(<QuickToolbar {...baseProps} paused={false} />)
    const b = screen.getByLabelText('Jeda semua task')
    expect(b.textContent).toContain('⏸')
    fireEvent.click(b)
    expect(baseProps.onPauseAll).toHaveBeenCalledTimes(1)
    expect(baseProps.onResumeAll).not.toHaveBeenCalled()
  })

  it('paused=true → tombol Lanjut (dengan dot indikator); klik memicu onResumeAll', () => {
    render(<QuickToolbar {...baseProps} paused={true} />)
    const b = screen.getByLabelText('Lanjutkan semua task')
    expect(b.textContent).toContain('▶')
    expect(b.querySelector('.dot')).toBeTruthy()
    fireEvent.click(b)
    expect(baseProps.onResumeAll).toHaveBeenCalledTimes(1)
    expect(baseProps.onPauseAll).not.toHaveBeenCalled()
  })

  it('preset kamera: ketiga view dikirim apa adanya ke onSetView', () => {
    render(<QuickToolbar {...baseProps} />)
    for (const v of ['iso', 'top']) {
      fireEvent.click(screen.getByLabelText('Kamera ' + v))
      expect(baseProps.onSetView).toHaveBeenLastCalledWith(v)
    }
  })

  it('tombol neon memakai aria-pressed sesuai tema (theme=true → !theme)', () => {
    render(<QuickToolbar {...baseProps} theme={true} />)
    expect(screen.getByLabelText('Lampu neon').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('QuickToolbar — popover tidak ada (bukan menu dengan state internal)', () => {
  // QuickToolbar tidak merender popover; Escape/klik-luar harus tidak melempar apa pun
  it('Escape & klik luar aman tanpa elemen popover', () => {
    render(<QuickToolbar {...baseProps} />)
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
    expect(() => fireEvent.pointerDown(document.body)).not.toThrow()
  })
})

// ── ErrorBoundary ──
function Boom({ fatal }) {
  if (fatal) throw new Error('ledakan uji')
  return <p>aman</p>
}

// console.error di-redireksi per-test (vi.spyOn) — error render React memang diharapkan

describe('ErrorBoundary — menangkap error render', () => {
  it('menampilkan UI fallback (bukan blank) saat anak melempar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom fatal /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Terjadi kesalahan tampilan')).toBeTruthy()
    expect(screen.getByText(/ledakan uji/)).toBeTruthy()
    console.error.mockRestore()
  })

  it('anak yang aman tidak diganggu (render passthrough)', () => {
    render(<ErrorBoundary><Boom fatal={false} /></ErrorBoundary>)
    expect(screen.getByText('aman')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('recover: setelah sumber error hilang + klik "Coba lagi" → anak dirender ulang', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ErrorBoundary><Boom fatal /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeTruthy()
    // perbaiki sumber error: fallback MASIH tampil (boundary menahan UI rusak
    // sampai user mereset — perilaku React yang benar)
    rerender(<ErrorBoundary><Boom fatal={false} /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('aman')).toBeNull()
    // reset → anak aman dirender ulang
    fireEvent.click(screen.getByText('Coba lagi'))
    expect(screen.getByText('aman')).toBeTruthy()
    console.error.mockRestore()
  })

  it('tombol "Muat ulang" memanggil location.reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    // stub location.reload (jsdom: reload tak tersedia → assign via Object.defineProperty)
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true })
    render(<ErrorBoundary><Boom fatal /></ErrorBoundary>)
    fireEvent.click(screen.getByText('Muat ulang'))
    expect(reload).toHaveBeenCalledTimes(1)
    console.error.mockRestore()
  })
})
