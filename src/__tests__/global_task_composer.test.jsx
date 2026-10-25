// @vitest-environment jsdom
// Unit test GlobalTaskComposer (dialog "GLOBAL TASK COMPOSER") — komponen UI
// tanpa test langsung sebelumnya. Kode komponen TIDAK diubah; fetch di-stub
// penuh lewat vi.stubGlobal.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import GlobalTaskComposer from '../components/GlobalTaskComposer'

const planResponse = () => ({
  task_id: 't1',
  project: { slug: 'demo-proj' },
  subtasks: [
    { title: 'Setup project', role: 'FE' },
    { title: 'Deploy sandbox', role: 'OPS' },
  ],
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GlobalTaskComposer', () => {
  it('open=false → null, tidak ada fetch', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<GlobalTaskComposer open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('open → dialog dengan judul, aria-modal, & tombol tutup memanggil onClose', () => {
    const onClose = vi.fn()
    vi.stubGlobal('fetch', vi.fn())
    render(<GlobalTaskComposer open onClose={onClose} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText(/WFS PROJECT/)).toBeTruthy()
    expect(screen.getByText(/GLOBAL TASK COMPOSER/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tutup dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('instruksi kosong → error & tidak ada POST /api/tasks', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<GlobalTaskComposer open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deploy ke Sandbox' }))
    expect(screen.getByText('Harap masukkan instruksi tugas.')).toBeTruthy()
    expect(f).not.toHaveBeenCalled()
  })

  it('mode direct → susun rencana lalu eksekusi; onProjectCreated & onClose dipanggil', async () => {
    const onClose = vi.fn()
    const onProjectCreated = vi.fn()
    const f = vi.fn(async (url) => {
      if (url === '/api/tasks') return { ok: true, json: async () => planResponse() }
      if (url === '/api/tasks/t1/execute') return { ok: true, json: async () => ({ project: { id: 'p1' } }) }
      throw new Error('unexpected ' + url)
    })
    vi.stubGlobal('fetch', f)
    render(<GlobalTaskComposer open onClose={onClose} onProjectCreated={onProjectCreated} />)
    fireEvent.change(screen.getByLabelText(/Instruksi Proyek/), { target: { value: 'Buat website' } })
    fireEvent.click(screen.getByRole('button', { name: 'Deploy ke Sandbox' }))
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledWith({ id: 'p1' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(f.mock.calls.map(c => c[0])).toEqual(['/api/tasks', '/api/tasks/t1/execute'])
    const body = JSON.parse(f.mock.calls[0][1].body)
    expect(body.instruction).toBe('Buat website')
    expect(body.task_type).toBe('website')
  })

  it('mode plan → hanya menyusun rencana, menampilkan subtask, lalu eksekusi terpisah', async () => {
    const onClose = vi.fn()
    const onProjectCreated = vi.fn()
    const f = vi.fn(async (url) => {
      if (url === '/api/tasks') return { ok: true, json: async () => planResponse() }
      if (url === '/api/tasks/t1/execute') return { ok: true, json: async () => ({ project: { id: 'p1' } }) }
      throw new Error('unexpected ' + url)
    })
    vi.stubGlobal('fetch', f)
    render(<GlobalTaskComposer open onClose={onClose} onProjectCreated={onProjectCreated} />)
    fireEvent.change(screen.getByLabelText(/Instruksi Proyek/), { target: { value: 'Buat API' } })
    fireEvent.click(screen.getByLabelText('Rencana Dulu'))
    fireEvent.click(screen.getByRole('button', { name: 'Susun Rencana' }))
    await waitFor(() => expect(screen.getByText(/RENCANA TUGAS TERSUSUN \(2 SUBTASKS\)/)).toBeTruthy())
    expect(screen.getByText('1. Setup project')).toBeTruthy()
    expect(onProjectCreated).not.toHaveBeenCalled()
    expect(f).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Mulai Eksekusi Sekarang' }))
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledWith({ id: 'p1' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('HTTP error dari rencana → pesan error ditampilkan', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500 }))
    vi.stubGlobal('fetch', f)
    render(<GlobalTaskComposer open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/Instruksi Proyek/), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Deploy ke Sandbox' }))
    await waitFor(() => expect(screen.getByText(/Gagal menyusun rencana/)).toBeTruthy())
  })
})
