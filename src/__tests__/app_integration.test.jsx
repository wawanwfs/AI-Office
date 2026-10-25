// @vitest-environment jsdom
// Test integrasi App.jsx (file utama, sebelumnya tanpa test):
// status gateway nyata, toast perubahan status task, shortcut keyboard,
// dan offline awareness. Scene 3D di-mock (jsdom tanpa WebGL).
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

vi.mock('../scene/OfficeScene', () => ({
  createOfficeScene: vi.fn(() => ({
    isAudioMuted: () => false,
    setAudioMuted: vi.fn(),
    isCyberpunk: () => false,
    toggleCyberpunk: vi.fn(),
    setTime: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setView: vi.fn(),
    destroy: vi.fn(),
  })),
}))

import App from '../App'

const TASKS = [
  { id: 1, title: 'API invoice', agent_id: 'be1', status: 'pending' },
  { id: 2, title: 'Fix UI', agent_id: 'fe1', status: 'running' },
]

function stubFetch(tasks, paused = false) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url)
    if (u.includes('tasks/paused')) return { ok: true, json: async () => ({ paused }) }
    if (u.includes('/tasks') || u.endsWith('/tasks')) return { ok: true, json: async () => ({ tasks }) }
    return { ok: true, json: async () => ({}) }
  }))
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    store: {},
    getItem(k) { return this.store[k] ?? null },
    setItem(k, v) { this.store[k] = v },
    removeItem(k) { delete this.store[k] },
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('App — integrasi UI', () => {
  it('gateway OK → status "1 jalan · 1 antri" di HUD, scene loading selesai', async () => {
    stubFetch(TASKS)
    render(<App />)
    expect(screen.getByText('Memuat ruangan…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('1 jalan · 1 antri')).toBeTruthy())
  })

  it('gateway offline → status "Gateway offline" kind=off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Gateway offline')).toBeTruthy())
  })

  it('perubahan status task antar poll → toast "Task #2 selesai"', async () => {
    let flip = false
    // Ticker juga fetch /tasks (3 call ekstra) — flip di-set oleh listener 'online'
    // yang terpasang SEBELUM render, jadi hanya poll App setelah event yang berubah.
    window.addEventListener('online', () => { flip = true })
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url)
      const tasks = flip
        ? [{ id: 1, title: 'API invoice', agent_id: 'be1', status: 'pending' },
           { id: 2, title: 'Fix UI', agent_id: 'fe1', status: 'done' }]
        : TASKS
      if (u.includes('tasks/paused')) return { ok: true, json: async () => ({ paused: false }) }
      return { ok: true, json: async () => ({ tasks }) }
    }))
    render(<App />)
    await waitFor(() => expect(screen.getByText('1 jalan · 1 antri')).toBeTruthy(), { timeout: 3000 })
    // poll ulang via event 'online' yang memicu tick() (lebih cepat daripada interval 15 dtk)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.getByText(/Task #2 selesai: Fix UI/)).toBeTruthy(), { timeout: 3000 })
  })

  it('shortcut "l" membuka Log Aktivitas, Escape menutup', () => {
    stubFetch([])
    render(<App />)
    expect(screen.queryByRole('dialog', { name: 'Log aktivitas' })).toBeNull()
    fireEvent.keyDown(window, { key: 'l' })
    expect(screen.getByRole('dialog', { name: 'Log aktivitas' })).toBeTruthy()
    fireEvent.click(screen.getByText('Tutup'))
    expect(screen.queryByRole('dialog', { name: 'Log aktivitas' })).toBeNull()
  })

  it('shortcut "h" membuka panduan (OverlayHelp)', () => {
    stubFetch([])
    render(<App />)
    expect(screen.queryByText(/Panduan/i)).toBeNull()
    fireEvent.keyDown(window, { key: 'h' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shortcut "m" toggle mute → tombol dock berubah jadi "Suara Mati"', () => {
    stubFetch([])
    render(<App />)
    expect(screen.getByRole('button', { name: 'Bisukan suara' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'm' })
    expect(screen.getByRole('button', { name: 'Nyalakan suara' })).toBeTruthy()
  })

  it('judul tab dinamis mengikuti status gateway', async () => {
    stubFetch([])
    render(<App />)
    await waitFor(() => expect(document.title).toBe('0 jalan · 0 antri — WFS Project HQ'))
  })

  it('log aktivitas: clear → localStorage "wfs_activity" dihapus', async () => {
    localStorage.store.wfs_activity = JSON.stringify([{ t: '10:00', id: 1, status: 'done', label: 'selesai', title: 'x' }])
    stubFetch([])
    render(<App />)
    fireEvent.keyDown(window, { key: 'l' })
    await waitFor(() => expect(screen.getByText(/#1/)).toBeTruthy())
    fireEvent.click(screen.getByText('Bersihkan'))
    expect(localStorage.store.wfs_activity).toBeUndefined()
  })

  it('mode neon persist di localStorage: tombol dock Neon langsung aktif (aria-pressed=true & class on)', () => {
    localStorage.store.wfs_neon = '1'
    stubFetch([])
    render(<App />)
    const btn = screen.getByLabelText('Lampu neon')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.className).toContain('on')
  })

  it('shortcut "n" toggle mode neon dan memanggil scene.toggleCyberpunk', async () => {
    let mockNeon = false
    const sceneMod = await import('../scene/OfficeScene')
    sceneMod.createOfficeScene.mockImplementationOnce(() => ({
      isAudioMuted: () => false,
      setAudioMuted: vi.fn(),
      isCyberpunk: () => mockNeon,
      toggleCyberpunk: () => { mockNeon = !mockNeon },
      setTime: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setView: vi.fn(),
      destroy: vi.fn(),
    }))
    stubFetch([])
    render(<App />)
    const btn = screen.getByLabelText('Lampu neon')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(screen.queryByText('Memuat ruangan…')).toBeNull())
    fireEvent.keyDown(window, { key: 'n' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.className).toContain('on')
  })
})
