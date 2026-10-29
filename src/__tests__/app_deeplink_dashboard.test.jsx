// @vitest-environment jsdom
// Siklus 159 — deep-link landing → Dashboard.
// Landing CTA "Lihat Dashboard" menautkan /app/#dashboard (fallback: localStorage
// 'wfs_open_dashboard'). Keduanya HARUS membuka Dashboard via event runtime
// 'wfs-toggle-dashboard' (jalur tunggal, sama dgn shortcut D) — bukan duplikat state.
// Regresi yang dijaga: (1) hash #dashboard membuka panel; (2) fallback localStorage
// membuka panel SEKALI lalu flag dibersihkan (tidak auto-buka tiap kunjungan);
// (3) kunjungan tanpa keduanya TIDAK membuka panel.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

const mockSceneInstance = {
  isAudioMuted: vi.fn(() => false),
  setAudioMuted: vi.fn(),
  playTaskDone: vi.fn(),
  playTaskFail: vi.fn(),
  playSelect: vi.fn(),
  isCyberpunk: () => false,
  toggleCyberpunk: vi.fn(),
  setTime: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  setView: vi.fn(),
  destroy: vi.fn(),
}

vi.mock('../scene/OfficeScene', () => ({
  createOfficeScene: vi.fn(() => mockSceneInstance),
}))

import App from '../App'

function stubFetch(tasks = []) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url)
    if (u.includes('tasks/paused')) return { ok: true, json: async () => ({ paused: false }) }
    if (u.includes('/tasks') || u.endsWith('/tasks')) return { ok: true, json: async () => ({ tasks }) }
    return { ok: true, json: async () => ({}) }
  }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  try { localStorage.clear() } catch { /* noop */ }
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function waitDashboardOpen() {
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Dashboard' })).toBeTruthy(), { timeout: 3000 })
}

describe('App — deep-link dashboard dari landing (siklus 159)', () => {
  it('URL /app/#dashboard → Dashboard terbuka on-mount', async () => {
    window.history.replaceState(null, '', '/app/#dashboard')
    stubFetch()
    render(<App />)
    await waitDashboardOpen()
  })

  it('fallback localStorage wfs_open_dashboard=1 → Dashboard terbuka SEKALI lalu flag dihapus', async () => {
    localStorage.setItem('wfs_open_dashboard', '1')
    stubFetch()
    const { unmount } = render(<App />)
    await waitDashboardOpen()
    unmount()
    cleanup()
    // Kunjungan berikutnya TIDAK boleh auto-buka lagi (flag sudah dikonsumsi).
    stubFetch()
    render(<App />)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dashboard' })).toBeNull(), { timeout: 2000 })
    expect(localStorage.getItem('wfs_open_dashboard')).toBeNull()
  })

  it('tanpa hash & tanpa flag → Dashboard tetap tertutup', async () => {
    stubFetch()
    render(<App />)
    await waitFor(() => expect(screen.getByText(/jalan ·|Gateway offline|Memuat/)).toBeTruthy(), { timeout: 3000 })
    expect(screen.queryByRole('dialog', { name: 'Dashboard' })).toBeNull()
  })
})
