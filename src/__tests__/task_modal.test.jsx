// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import TaskModal from '../components/TaskModal.jsx'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))

const h = React.createElement

afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('components/TaskModal', () => {
  const base = { show: true, onClose: vi.fn(), onDone: vi.fn() }

  it('show=false → tidak me-render apa pun', () => {
    const r = render(h(TaskModal, { show: false, onClose: vi.fn(), onDone: vi.fn() }))
    expect(r.container.firstChild).toBeNull()
  })

  it('render dialog + field form + role select lengkap', () => {
    render(h(TaskModal, base))
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByLabelText('Judul')).toBeTruthy()
    expect(screen.getByLabelText('Role / agent')).toBeTruthy()
    expect(screen.getByLabelText('Brief (opsional)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Simpan & Jalankan' })).toBeTruthy()
    const roles = Array.from(screen.getByLabelText('Role / agent').options).map(o => o.textContent)
    expect(roles).toEqual(['backend', 'frontend', 'mobile', 'design', 'devops', 'qa', 'marketing', 'pm'])
  })

  it('submit tanpa judul → error, api tidak dipanggil', async () => {
    render(h(TaskModal, base))
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Judul task wajib diisi'))
    expect(api).not.toHaveBeenCalled()
  })

  it('submit valid → api POST tasks + onDone + onClose + input dibersihkan', async () => {
    api.mockResolvedValue({ task_id: 77 })
    render(h(TaskModal, base))
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Buat endpoint /api/invoice' } })
    fireEvent.change(screen.getByLabelText('Brief (opsional)'), { target: { value: 'pakai JSON' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenCalledWith('tasks', {
      method: 'POST',
      body: { title: 'Buat endpoint /api/invoice', role: 'backend', prompt: 'pakai JSON' },
    })
    expect(base.onDone).toHaveBeenCalledWith('Task #77 dibuat (pending)')
    expect(base.onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByLabelText('Judul').value).toBe(''))
  })

  it('Simpan & Jalankan → POST tasks + run + onDone "dibuat & dijalankan"', async () => {
    api.mockResolvedValueOnce({ task_id: 9 }).mockResolvedValueOnce({ ok: true })
    render(h(TaskModal, base))
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Tes e2e' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & Jalankan' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(api).toHaveBeenNthCalledWith(1, 'tasks', {
      method: 'POST',
      body: { title: 'Tes e2e', role: 'backend', prompt: '' },
    })
    expect(api).toHaveBeenNthCalledWith(2, 'tasks/9/run', { method: 'POST' })
    expect(base.onDone).toHaveBeenCalledWith('Task #9 dibuat & dijalankan')
  })

  it('API gagal → pesan error ditampilkan, modal tidak tertutup', async () => {
    api.mockRejectedValue(new Error('HTTP 500'))
    render(h(TaskModal, base))
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 500'))
    expect(base.onClose).not.toHaveBeenCalled()
  })

  it('Escape menutup modal melalui useDialogA11y', () => {
    render(h(TaskModal, base))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(base.onClose).toHaveBeenCalledTimes(1)
  })

  it('klik tombol X menutup modal', () => {
    render(h(TaskModal, base))
    fireEvent.click(screen.getByRole('button', { name: 'Tutup form task' }))
    expect(base.onClose).toHaveBeenCalledTimes(1)
  })

  it('klik scrim (luar modal) menutup modal', () => {
    const { container } = render(h(TaskModal, base))
    fireEvent.click(container.querySelector('.modal-scrim'))
    expect(base.onClose).toHaveBeenCalledTimes(1)
  })
})
