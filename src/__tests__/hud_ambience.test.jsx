// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import HUD from '../components/HUD'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('HUD Ambience Audio Widget', () => {
  it('berjalan tanpa tombol ambience jika onToggleAmbience tidak diberikan (backward-compatibility)', () => {
    const onTimeChange = vi.fn()
    render(
      <HUD
        time="14:00"
        timeValue={840}
        status="2 jalan"
        statusKind="run"
        onTimeChange={onTimeChange}
      />
    )
    expect(screen.getByText('14:00')).toBeTruthy()
    expect(screen.getByText('2 jalan')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ambience/i })).toBeNull()
  })

  it('merender tombol Hum Off saat ambience tidak aktif', () => {
    const onToggle = vi.fn()
    render(
      <HUD
        time="09:15"
        timeValue={555}
        status="siap"
        onTimeChange={() => {}}
        ambienceEnabled={false}
        ambienceVolume={0.35}
        muted={false}
        onToggleAmbience={onToggle}
      />
    )
    const btn = screen.getByRole('button', { name: 'Ambience hum kantor nonaktif' })
    expect(btn).toBeTruthy()
    expect(btn.classList.contains('active')).toBe(false)
    expect(btn.classList.contains('muted')).toBe(false)
    expect(screen.getByText('Hum Off')).toBeTruthy()
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('merender tombol Hum Aktif dengan persentase volume dan animasi gelombang', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <HUD
        time="11:30"
        timeValue={690}
        status="optimal"
        onTimeChange={() => {}}
        ambienceEnabled={true}
        ambienceVolume={0.7}
        muted={false}
        onToggleAmbience={onToggle}
      />
    )
    const btn = screen.getByRole('button', { name: 'Ambience hum kantor aktif 70%' })
    expect(btn).toBeTruthy()
    expect(btn.classList.contains('active')).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Hum 70%')).toBeTruthy()

    // 3 bar gelombang suara
    const bars = container.querySelectorAll('.hud-amb-bar')
    expect(bars.length).toBe(3)
  })

  it('merender status Mute saat master audio dibisukan', () => {
    const onToggle = vi.fn()
    render(
      <HUD
        time="15:45"
        timeValue={945}
        status="senyap"
        onTimeChange={() => {}}
        ambienceEnabled={true}
        ambienceVolume={0.5}
        muted={true}
        onToggleAmbience={onToggle}
      />
    )
    const btn = screen.getByRole('button', { name: /terbungkam/i })
    expect(btn).toBeTruthy()
    expect(btn.classList.contains('muted')).toBe(true)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Mute')).toBeTruthy()
  })

  it('Shift+Click memanggil onCycleAmbienceVolume untuk siklus level volume', () => {
    const onToggle = vi.fn()
    const onCycle = vi.fn()
    render(
      <HUD
        time="12:00"
        timeValue={720}
        status="jalan"
        onTimeChange={() => {}}
        ambienceEnabled={true}
        ambienceVolume={0.4}
        muted={false}
        onToggleAmbience={onToggle}
        onCycleAmbienceVolume={onCycle}
      />
    )
    const btn = screen.getByRole('button', { name: /Ambience hum kantor aktif/i })
    fireEvent.click(btn, { shiftKey: true })
    expect(onCycle).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('klik kanan (context menu) memanggil onOpenSettings', () => {
    const onToggle = vi.fn()
    const onSettings = vi.fn()
    render(
      <HUD
        time="16:00"
        timeValue={960}
        status="jalan"
        onTimeChange={() => {}}
        ambienceEnabled={true}
        ambienceVolume={0.35}
        muted={false}
        onToggleAmbience={onToggle}
        onOpenSettings={onSettings}
      />
    )
    const btn = screen.getByRole('button', { name: /Ambience hum/i })
    fireEvent.contextMenu(btn)
    expect(onSettings).toHaveBeenCalledTimes(1)
  })
})
