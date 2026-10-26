// @vitest-environment jsdom
// Unit test komponen Ticker — marquee live dari gateway (api: tasks/agents/status).
// Cakupan: fallback gateway offline, ringkasan statistik task, baris task
// terbaru, baris host RAM, dan region aria-live untuk screen reader.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import Ticker from '../components/Ticker'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.clearAllMocks() })

const tasks = [
  { agent_id: 'a1', title: 'Rapikan kode backend server.py yang panjang banget', status: 'running' },
  { agent_id: 'a2', title: 'Tambah unit test module murni', status: 'done' },
  { agent_id: 'a3', title: 'Perbaiki warna label yang bentrok', status: 'failed' },
  { agent_id: null, title: 'Tanpa agen yang jelas', status: 'pending' },
]
const agents = [{ id: 'a1', name: 'BUDI' }, { id: 'a2', name: 'DEWI' }, { id: 'a3', name: 'TONI' }]
const status = { mem_total_mb: 8000, mem_available_mb: 4200, disk_total_gb: 200, disk_used_gb: 120 }

const liveRegionText = () => {
  const r = document.querySelector('#ticker-live')
  return r ? r.textContent : ''
}

describe('Ticker', () => {
  beforeEach(() => {
    api.mockReset()
  })

  it('menampilkan fallback saat gateway offline (api menolak)', async () => {
    api.mockRejectedValue(new Error('offline'))
    render(<Ticker />)
    await waitFor(() => expect(liveRegionText()).toContain('Gateway offline'))
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('menampilkan ringkasan statistik task, baris task terbaru & host RAM', async () => {
    api.mockImplementation(async (p) => {
      if (p === 'tasks') return { tasks }
      if (p === 'agents') return { agents }
      if (p === 'status') return status
      return null
    })
    render(<Ticker />)
    await waitFor(() => expect(liveRegionText()).toContain('4 task'))
    // ringkasan: 4 task · 1 done · 1 running · 1 pending · 1 failed
    expect(liveRegionText()).toContain('1 done')
    expect(liveRegionText()).toContain('1 running')
    expect(liveRegionText()).toContain('1 pending')
    expect(liveRegionText()).toContain('1 failed')
    // nama agen ter-resolve + status
    expect(liveRegionText()).toContain('BUDI')
    expect(liveRegionText()).toContain('[running]')
    // baris host RAM
    expect(liveRegionText()).toContain('4200/8000 MB')
    expect(liveRegionText()).toContain('120/200 GB')
    // track visual marquee hadir & disembunyikan dari pembaca layar
    const ticker = document.querySelector('.ticker')
    expect(ticker).toBeTruthy()
    expect(ticker.getAttribute('aria-hidden')).toBe('true')
    expect(ticker.textContent).toContain('BUDI')
  })

  it('menampilkan nama agen asli bila id tidak dikenal, dan "Tanpa agen"', async () => {
    api.mockImplementation(async (p) => {
      if (p === 'tasks') return { tasks: [{ agent_id: 'unknown-9', title: 'Agen anonim', status: 'done' }, { agent_id: null, title: 'Tanpa agen yang jelas', status: 'pending' }] }
      if (p === 'agents') return { agents }
      if (p === 'status') return null
      return null
    })
    render(<Ticker />)
    await waitFor(() => expect(liveRegionText()).toContain('unknown-9'))
    expect(liveRegionText()).toContain('Tanpa agen')
  })
})
