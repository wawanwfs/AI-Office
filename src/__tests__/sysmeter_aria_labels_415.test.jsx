// @vitest-environment jsdom
// Siklus 415: guard a11y SysMeter — setiap chip sm-item wajib punya aria-label
// deskriptif (dulu hanya title tooltip yang tidak dibaca screen reader).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import SysMeter from '../components/SysMeter'

vi.mock('../lib/api', () => ({ api: vi.fn() }))
import { api } from '../lib/api'

describe('SysMeter a11y aria-label (siklus 415)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.mockResolvedValue({ ok: true, agents: 15, disk_used_gb: 28.5, disk_total_gb: 49.1, uptime_s: 107526 })
    api.mockResolvedValueOnce({ ok: true, agents: 15, disk_used_gb: 28.5, disk_total_gb: 49.1, uptime_s: 107526 })
    api.mockResolvedValueOnce({ load: '4.71', ram_mb: '3833/7623' })
  })
  afterEach(() => cleanup())

  it('setiap chip host live memiliki aria-label (bukan hanya title)', async () => {
    render(<SysMeter />)
    await waitFor(() => expect(screen.getByText('host live')).toBeTruthy())
    const items = document.querySelectorAll('.sysmeter .sm-item')
    expect(items.length).toBeGreaterThanOrEqual(6)
    items.forEach(el => {
      expect(el.getAttribute('aria-label')).toBeTruthy()
      expect(el.getAttribute('aria-label')).not.toBe('')
    })
  })

  it('aria-label memuat nilai data, bukan teks generik', async () => {
    render(<SysMeter />)
    await waitFor(() => expect(screen.getByText('⚡ 4.71')).toBeTruthy())
    const load = [...document.querySelectorAll('.sm-item')].find(el => el.textContent.includes('4.71'))
    expect(load.getAttribute('aria-label')).toContain('4.71')
    const ram = [...document.querySelectorAll('.sm-item')].find(el => el.textContent.includes('3833'))
    expect(ram.getAttribute('aria-label')).toContain('3833')
  })

  it('guard sumber: tidak ada sm-item tanpa aria-label di SysMeter.jsx', () => {
    const src = readFileSync('src/components/SysMeter.jsx', 'utf8')
    const lines = src.split('\n').filter(l => l.includes('sm-item') && !l.includes('aria-label'))
    // dua-satunya pengecualian: badge "data usang" (role="alert" sudah
    // diumumkan) dan fallback loading "Gateway offline/Memuat host…".
    lines.forEach(l => expect(l.includes('data usang') || l.includes('Gateway offline')).toBe(true))
  })
})
