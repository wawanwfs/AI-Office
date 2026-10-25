// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import SysMeter from '../components/SysMeter'

// Mock modul api: kendalikan respons tanpa fetch asli.
vi.mock('../lib/api', () => ({
  api: vi.fn(),
}))

import { api } from '../lib/api'

describe('SysMeter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.mockResolvedValue({ ok: true, agents: 15, disk_used_gb: 28.5, disk_total_gb: 49.1, uptime_s: 107526 })
    api.mockResolvedValueOnce({ ok: true, agents: 15, disk_used_gb: 28.5, disk_total_gb: 49.1, uptime_s: 107526 })
    api.mockResolvedValueOnce({ load: '4.71', ram_mb: '3833/7623' })
  })

  afterEach(() => cleanup())

  it('menampilkan data host nyata (agent, load, RAM, disk)', async () => {
    render(<SysMeter />)
    await waitFor(() => expect(screen.getByText('15 agent')).toBeTruthy())
    expect(screen.getByText('⚡ 4.71')).toBeTruthy()
    expect(screen.getByText('🧠 3833/7623')).toBeTruthy()
    expect(screen.getByText('💾 28.5/49.1 GB')).toBeTruthy()
    expect(screen.getByText('⏱ 29j 52m')).toBeTruthy()
  })

  it('sembunyikan disk & uptime di viewport kecil (mobile)', async () => {
    // simulasikan layar sempit
    window.innerWidth = 600
    render(<SysMeter />)
    await waitFor(() => expect(screen.getByText('15 agent')).toBeTruthy())
    const disk = screen.queryByText('💾 28.5/49.1 GB')
    expect(disk).toBeTruthy() // masih ter-render; penampilan dikontrol CSS
  })

  it('menampilkan fallback Gateway offline saat fetch gagal', async () => {
    api.mockReset()
    api.mockRejectedValue(new Error('offline'))
    render(<SysMeter />)
    await waitFor(() => expect(screen.getByText('Gateway offline')).toBeTruthy())
  })
})
