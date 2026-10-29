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

describe('HUD Chip Sinkronisasi Gateway', () => {
  const base = { time: '08:00', timeValue: 480, status: '1 jalan', onTimeChange: () => {} }

  it('tanpa prop conn → chip tidak dirender (backward-compatibility)', () => {
    render(<HUD {...base} />)
    expect(screen.queryByText('Sinkron')).toBeNull()
    expect(document.querySelector('.conn-chip')).toBeNull()
  })

  it('live → chip hijau label Sinkron dengan tooltip detail', () => {
    render(<HUD {...base} conn={{ state: 'live', label: 'Sinkron', detail: 'Gateway tersinkron', tone: 'ok' }} />)
    const chip = document.querySelector('.conn-chip.live')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('Sinkron')
    expect(chip.getAttribute('title')).toBe('Gateway tersinkron')
    expect(chip.getAttribute('aria-label')).toContain('sinkronisasi')
  })

  it('stale → chip amber berdetak dengan umur data pada label', () => {
    render(<HUD {...base} conn={{ state: 'stale', label: 'Sinkron 45 dtk lalu', detail: 'Polling gagal', tone: 'warn' }} />)
    const chip = document.querySelector('.conn-chip.stale')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('45 dtk lalu')
  })

  it('down → chip merah label Terputus', () => {
    render(<HUD {...base} conn={{ state: 'down', label: 'Terputus', detail: 'Gateway tak terjangkau', tone: 'err' }} />)
    const chip = document.querySelector('.conn-chip.down')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('Terputus')
  })
})

describe('HUD Chip Kualitas Render GPU (siklus 147)', () => {
  const base = { time: '08:00', timeValue: 480, status: '1 jalan', onTimeChange: () => {} }

  it('tanpa prop perf → chip tidak dirender (scene belum mengukur / UI-only)', () => {
    render(<HUD {...base} />)
    expect(document.querySelector('.perf-chip')).toBeNull()
  })

  it('ideal → chip hijau label GPU FPS dgn tooltip detail', () => {
    render(<HUD {...base} perf={{ state: 'ideal', label: 'GPU 60 FPS', detail: 'Render mulus: FPS 60 · x1.5' }} />)
    const chip = document.querySelector('.perf-chip.ideal')
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('GPU 60 FPS')
    expect(chip.getAttribute('title')).toBe('Render mulus: FPS 60 · x1.5')
    expect(chip.getAttribute('aria-label')).toContain('Kualitas render')
  })

  it('stale → chip amber saat tangga degradasi aktif', () => {
    render(<HUD {...base} perf={{ state: 'stale', label: 'GPU 15 FPS', detail: 'Kualitas otomatis: pixelRatio x1' }} />)
    expect(document.querySelector('.perf-chip.stale')).toBeTruthy()
  })

  it('recover → chip biru berdetak saat pemulihan berjalan', () => {
    render(<HUD {...base} perf={{ state: 'recover', label: 'GPU 30 FPS', detail: 'Kualitas pulih' }} />)
    expect(document.querySelector('.perf-chip.recover')).toBeTruthy()
  })

  it('down → chip merah saat bayangan dimatikan', () => {
    render(<HUD {...base} perf={{ state: 'down', label: 'GPU 4 FPS', detail: 'Kualitas otomatis: bayangan dimatikan' }} />)
    expect(document.querySelector('.perf-chip.down')).toBeTruthy()
  })
})
