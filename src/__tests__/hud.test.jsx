// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import HUD from '../components/HUD'

afterEach(() => cleanup())

const baseProps = {
  time: '08:30',
  timeValue: 510,
  status: 'Online',
  statusKind: 'ok',
  onTimeChange: vi.fn(),
}

describe('components/HUD', () => {
  it('memuat group a11y, jam, slider waktu, dan status', () => {
    render(<HUD {...baseProps} />)
    const group = screen.getByRole('group', { name: 'Waktu simulasi dan status' })
    expect(group).toBeTruthy()
    expect(within(group).getByText('08:30')).toBeTruthy()

    const slider = within(group).getByRole('slider', { name: 'Waktu simulasi' })
    expect(slider.value).toBe('510')
    expect(slider.getAttribute('aria-valuetext')).toBe('08:30')
    expect(slider.getAttribute('min')).toBe('0')
    expect(slider.getAttribute('max')).toBe('1440')

    expect(within(group).getByText('Online')).toBeTruthy()
  })

  it('slider memicu onTimeChange dengan nilai parseInt', () => {
    const onTimeChange = vi.fn()
    render(<HUD {...baseProps} onTimeChange={onTimeChange} />)
    const slider = screen.getByRole('slider', { name: 'Waktu simulasi' })
    fireEvent.change(slider, { target: { value: '720' } })
    expect(onTimeChange).toHaveBeenCalledWith(720)
  })

  it('merender chip koneksi dengan aria-label status sinkronisasi bila prop conn ada', () => {
    render(<HUD {...baseProps} conn={{ state: 'ok', label: 'Sinkron', detail: 'semua OK' }} />)
    const chip = screen.getByRole('status', { name: 'Status sinkronisasi: semua OK' })
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('Sinkron')
    expect(chip.className).toContain('conn-chip')
  })

  it('tombol ambience: klik = toggle, Shift+klik = cycle volume, contextmenu = buka settings', () => {
    const onToggleAmbience = vi.fn()
    const onCycleAmbienceVolume = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <HUD
        {...baseProps}
        onToggleAmbience={onToggleAmbience}
        onCycleAmbienceVolume={onCycleAmbienceVolume}
        onOpenSettings={onOpenSettings}
      />
    )
    const btn = screen.getByRole('button', { name: /Ambience hum kantor/ })
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(onToggleAmbience).toHaveBeenCalledTimes(1)

    fireEvent.click(btn, { shiftKey: true })
    expect(onCycleAmbienceVolume).toHaveBeenCalledTimes(1)

    fireEvent.contextMenu(btn)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('tidak merender tombol ambience bila onToggleAmbience tidak diberikan', () => {
    render(<HUD {...baseProps} />)
    expect(screen.queryByRole('button', { name: /Ambience hum kantor/ })).toBeNull()
  })

  // Siklus 314: chip jam nyata host — muncul dengan format HH.MM id-ID, punya
  // title penjelas, dan terpisah dari jam simulasi (teks '08:30' tetap jam sim).
  it('merender chip jam nyata host terpisah dari jam simulasi', () => {
    vi.setSystemTime(new Date(2026, 10, 9, 3, 42))
    try {
      render(<HUD {...baseProps} />)
      const chip = screen.getByTitle('Jam nyata host (bukan waktu simulasi)')
      expect(chip.textContent).toBe('03.42')
      expect(chip.getAttribute('title')).toContain('bukan waktu simulasi')
      expect(chip.textContent).not.toContain(':')
      // jam simulasi tetap utuh, tak tertimpa
      expect(screen.getByText('08:30')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  // Siklus 315: tab kembali visible → chip membaca segera (bukan menunggu
  // sisa interval 10 dtk), sehingga tak menampilkan jam usang.
  it('memperbarui chip jam nyata segera saat visibilitychange → visible', () => {
    vi.setSystemTime(new Date(2026, 10, 9, 3, 42))
    try {
      vi.useFakeTimers()
      render(<HUD {...baseProps} />)
      const chip = screen.getByTitle('Jam nyata host (bukan waktu simulasi)')
      expect(chip.textContent).toBe('03.42')
      // tab disembunyikan, waktu berjalan → read() dilewati (gerbang visible)
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      vi.setSystemTime(new Date(2026, 10, 9, 9, 5))
      vi.advanceTimersByTime(30000)
      expect(chip.textContent).toBe('03.42')
      // kembali visible → update segera tanpa nunggu interval berikutnya
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      fireEvent(document, new Event('visibilitychange'))
      expect(chip.textContent).toBe('09.05')
    } finally {
      vi.useRealTimers()
    }
  })
})
