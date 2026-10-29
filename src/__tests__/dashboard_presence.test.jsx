// @vitest-environment jsdom
// Unit test siklus 151: kehadiran LIVE agen kantor di Dashboard.
// Dulu bagian "Agen aktif" hanya membaca task engine — tanpa task berjalan ia
// melaporkan "semua idle" padahal 26 agen kantor bisa sedang rapat L1 / makan
// siang kafe L3 / jalan kampus / pulang (scene 3D jelas hidup). Kini dashboard
// membawa paragraf kehadiran dari window.__agentData via dashboardPresenceSummary
// (SATU sumber agentLiveTone — paritas Ticker 149 & kartu tim 150).
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import Dashboard from '../components/Dashboard'
import { dashboardPresenceSummary } from '../scene/parts/agent_status.js'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

beforeEach(() => { delete window.__agentData })
afterEach(() => { cleanup(); document.body.innerHTML = ''; delete window.__agentData; vi.unstubAllGlobals() })

// Entri agentData bentukan scene (pola team_presence 150)
const seated = (name, z = 2) => ({
  agent: { name },
  state: 'sitting',
  walker: { visible: false, position: { z } },
  sittingChar: { visible: true, position: { z } },
  home: { z },
})
const meeting = (name) => ({
  agent: { name }, state: 'meeting',
  walker: { visible: false, position: { z: -3 } },
  sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 },
})
const lunch = (name) => ({
  agent: { name }, state: 'walking_out', lunch: true,
  walker: { visible: true, position: { z: 5.6 } },
  sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 },
})

// ── dashboardPresenceSummary (murni) ───────────────────────────────────────
describe('dashboardPresenceSummary (murni)', () => {
  it('BUG UTAMA: semua agen rapat → total 26, teks "26 rapat" (BUKAN "semua idle")', () => {
    const data = Array.from({ length: 26 }, (_, i) => meeting('A' + i))
    const s = dashboardPresenceSummary(data)
    expect(s).toEqual({ total: 26, text: '26 rapat' })
  })

  it('campuran: hitungan per tone dgn urutan TICKER_PRESENCE_ORDER & label Indonesia', () => {
    const data = [
      seated('BUDI'), seated('RINA'), seated('TONI'), seated('SARI'),
      meeting('DEWI'), meeting('ANDI'),
      lunch('YOGA'),
      { agent: { name: 'KORUP' }, state: 42 }, // korup → dim (tetap terwakili)
    ]
    expect(dashboardPresenceSummary(data)).toEqual({
      total: 8,
      text: '4 di meja · 2 rapat · 1 makan siang · 1 pulang/offsite',
    })
  })

  it('state non-string → dim, tanpa agent → dilewati (total hanya terwakili)', () => {
    const s = dashboardPresenceSummary([seated('BUDI'), null, { state: 'sitting' }])
    expect(s).toEqual({ total: 1, text: '1 di meja' })
  })

  it('guard anti-poisoning: bukan array → null', () => {
    expect(dashboardPresenceSummary(undefined)).toBeNull()
    expect(dashboardPresenceSummary('korup')).toBeNull()
    expect(dashboardPresenceSummary(null)).toBeNull()
    expect(dashboardPresenceSummary(42)).toBeNull()
  })

  it('array kosong (scene siap, 0 agen) → null — "0 agen" hanya noise', () => {
    expect(dashboardPresenceSummary([])).toBeNull()
  })

  it('paritas label: komponen teks ≡ PRESENCE_LABELS agent_status (satu sumber)', async () => {
    const { PRESENCE_LABELS, TICKER_PRESENCE_ORDER } = await import('../scene/parts/agent_status.js')
    const data = [seated('BUDI'), meeting('DEWI'), lunch('YOGA'),
      { agent: { name: 'TONI' }, state: 'walking_back' },
      { agent: { name: 'SARI' }, state: 'leaving' }]
    const s = dashboardPresenceSummary(data)
    expect(s.text).toBe('1 di meja · 1 rapat · 1 makan siang · 1 berjalan · 1 pulang/offsite')
    // urutan == TICKER_PRESENCE_ORDER penuh (semua tone hadir di fixture)
    expect(s.text.split(' · ').map(p => p.split(' ').slice(1).join(' ')))
      .toEqual(TICKER_PRESENCE_ORDER.map(k => PRESENCE_LABELS[k]))
  })
})

// ── integrasi komponen Dashboard ───────────────────────────────────────────
const STATS = { projects_total: 1, tasks_total: 2, tasks_running: 1, tasks_completed: 0, agents_count: 26, logs: [] }
const mockApi = (tasks = [], containers = []) => {
  api.mockImplementation(path => {
    if (path === 'dashboard/stats') return Promise.resolve(STATS)
    if (path === 'tasks') return Promise.resolve({ tasks })
    if (path === 'projects') return Promise.resolve({ projects: [] })
    if (path === 'system/resources') return Promise.resolve({ containers, load: '0.1', ram_mb: 1000 })
    return Promise.reject(new Error('unknown path ' + path))
  })
}
const openDash = async () => {
  render(<Dashboard />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  await waitFor(() => expect(screen.getByText('Task terkini')).toBeTruthy())
}

describe('Dashboard — paragraf kehadiran LIVE (integrasi)', () => {
  it('BUG UTAMA: semua agen rapat → paragraf "26 agen di kantor: 26 rapat" meski tanpa task jalan', async () => {
    window.__agentData = Array.from({ length: 26 }, (_, i) => meeting('A' + i))
    mockApi() // tasks kosong → teks task-engine "semua idle"
    await openDash()
    const p = document.querySelector('.dash-presence')
    expect(p).toBeTruthy()
    expect(p.textContent).toContain('26 agen di kantor:')
    expect(p.textContent).toContain('26 rapat')
    // teks task-engine lama tetap tampil (dua sumber data berdampingan)
    expect(screen.getByText('semua idle')).toBeTruthy()
    // aria: ringkasan dibacakan screen reader
    expect(p.querySelector('.sr-only').textContent).toContain('26 agen di kantor — 26 rapat')
  })

  it('campuran live: "4 di meja · 2 rapat · 1 makan siang" dirender dgn role=status', async () => {
    window.__agentData = [seated('BUDI'), seated('RINA'), seated('TONI'), seated('SARI'),
      meeting('DEWI'), meeting('ANDI'), lunch('YOGA')]
    mockApi()
    await openDash()
    const p = document.querySelector('.dash-presence')
    expect(p.getAttribute('role')).toBe('status')
    expect(p.textContent).toContain('7 agen di kantor:')
    expect(p.textContent).toContain('4 di meja · 2 rapat · 1 makan siang')
  })

  it('polling LIVE: scene berubah rapat → makan siang tanpa remount panel', async () => {
    // Fake HANYA interval (poll scene 4 dtk) — waitFor tetap nyata (pola 149/150)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      window.__agentData = Array.from({ length: 26 }, (_, i) => meeting('A' + i))
      mockApi()
      render(<Dashboard />)
      fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
      await waitFor(() => expect(screen.getByText('Task terkini')).toBeTruthy())
      expect(document.querySelector('.dash-presence').textContent).toContain('26 rapat')
      // scene berubah: semua makan siang — interval 4 dtk membaca ulang
      window.__agentData = Array.from({ length: 26 }, (_, i) => lunch('A' + i))
      act(() => { vi.advanceTimersByTime(4500) })
      expect(document.querySelector('.dash-presence').textContent).toContain('26 makan siang')
    } finally {
      vi.useRealTimers()
    }
  })

  it('scene absen (window.__agentData undefined) → paragraf TIDAK dirender, alur lama utuh', async () => {
    mockApi()
    await openDash()
    expect(document.querySelector('.dash-presence')).toBeNull()
    // kartu agen & kontainer tetap lengkap
    expect(screen.getByText('Agen aktif')).toBeTruthy()
  })

  it('cleanup: unmount panel menghentikan interval scene (clearInterval dipanggil)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const clearSpy = vi.spyOn(window, 'clearInterval')
      window.__agentData = [seated('BUDI')]
      mockApi()
      const { unmount } = render(<Dashboard />)
      fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
      await waitFor(() => expect(screen.getByText('Task terkini')).toBeTruthy())
      unmount()
      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})
