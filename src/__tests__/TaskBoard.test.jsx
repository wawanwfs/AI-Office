// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import TaskBoard from '../components/TaskBoard'

const tasks = [
  { id: 1, title: 'Buat login', agent_id: 'be1', status: 'done', role: 'be' },
  { id: 2, title: 'Halaman admin', agent_id: 'fe1', status: 'pending', role: 'fe' },
]

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('TaskBoard', () => {
  it('menampilkan & memfilter task', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))
    expect(screen.getByText(/Halaman admin/)).toBeTruthy()
    fireEvent.click(screen.getByText(/^Selesai 1/))
    expect(screen.queryByText(/Halaman admin/)).toBeNull()
  })

  it('tombol jalankan meminta konfirmasi (tidak langsung run)', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) }))
    vi.stubGlobal('fetch', f)
    const onAsk = vi.fn()
    render(<TaskBoard onFlash={() => {}} onAsk={onAsk} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Jalankan task/))
    expect(onAsk).toHaveBeenCalled()
    expect(f.mock.calls.every(c => !String(c[0]).includes('/run'))).toBe(true)
  })

  it('modernisasi SVG: tombol tutup memiliki IconClose & title, tombol aksi detail memiliki IconPlay / IconRotate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    const closeBtn = await screen.findByRole('button', { name: 'Tutup papan task' })
    expect(closeBtn.getAttribute('title')).toBe('Tutup papan task (Esc)')
    expect(closeBtn.querySelector('svg')).toBeTruthy()

    // Buka task pending (#2) → tombol Jalankan task memiliki IconPlay
    await waitFor(() => screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Halaman admin/))
    const runBtn = screen.getByText(/Jalankan task/).closest('button')
    expect(runBtn.querySelector('svg')).toBeTruthy()

    // Kembali lalu buka task done (#1) → tombol Jalankan ulang memiliki IconRotate
    fireEvent.click(screen.getByRole('button', { name: /Kembali/ }))
    await waitFor(() => screen.getByText(/Buat login/))
    fireEvent.click(screen.getByText(/Buat login/))
    const rerunBtn = screen.getByText(/Jalankan ulang/).closest('button')
    expect(rerunBtn.querySelector('svg')).toBeTruthy()
  })

  it('mendukung beralih ke tampilan Kanban dengan 4 kolom status & metrik sprint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))

    // Subtitle metrik sprint
    expect(screen.getByText(/2 task · 1\/2 \(50%\) selesai/)).toBeTruthy()

    // Klik tombol switch ke mode Kanban
    const kanbanBtn = screen.getByRole('button', { name: 'Tampilan Papan Kolom' })
    expect(kanbanBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(kanbanBtn)
    expect(kanbanBtn.getAttribute('aria-pressed')).toBe('true')

    // Region papan kanban & 4 kolom
    const boardRegion = screen.getByRole('region', { name: 'Papan kanban sprint' })
    expect(boardRegion).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Antri' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Sedang Jalan' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Review / Isu' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Selesai' })).toBeTruthy()

    // Klik kartu di kanban membuka detail task
    const card = screen.getByRole('button', { name: /Task #2: Halaman admin/ })
    fireEvent.click(card)
    expect(screen.getByText(/Agent: fe1 · Role: fe/)).toBeTruthy()
  })

  it('terbuka secara otomatis saat menerima event kustom wfs-open-task-board', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)

    // Sebelum event: board tertutup
    expect(screen.queryByRole('dialog', { name: 'Papan task' })).toBeNull()

    // Dispatch event dari 3D scene / whiteboard
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy()
      expect(screen.getByRole('region', { name: 'Papan kanban sprint' })).toBeTruthy()
    })
  })
})
