// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
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

describe('TaskModal — guard rid submit (siklus 132): respons submit LAMA telat tak menulis state generasi BARU', () => {
  // Consume-once deferred api (pola siklus 131 — settle ulang slot yang sama =
  // error; mencegah test palsu yang me-resolve promise sudah-settle / no-op).
  // PENTING: file ini me-mock '../lib/api' dgn vi.fn() — defer mock API-nya
  // sendiri (bukan global fetch, yang tak pernah dipakai komponen di sini).
  function stubDeferredApi() {
    const pending = new Map()
    const urls = []
    let seq = 0
    api.mockImplementation((url) => {
      const s = ++seq
      urls.push(String(url))
      return new Promise((resolve, reject) => { pending.set(s, { resolve, reject }) })
    })
    return {
      count: () => seq,
      urls,
      async settle(s, body, opts = {}) {
        const p = pending.get(s)
        if (!p) throw new Error('api ke-' + s + ' tidak ditemukan / sudah dipakai')
        pending.delete(s)
        await act(async () => {
          if (opts.fail) p.reject(new Error('HTTP ' + (opts.status || 503)))
          else p.resolve(body)
        })
      },
    }
  }
  const fill = (title) => {
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: title } })
    fireEvent.change(screen.getByLabelText('Brief (opsional)'), { target: { value: 'brief' } })
  }

  it('submit #1 tertahan → modal ditutup (input tetap terisi) → dibuka ulang, submit #2 sukses → respons LAMA telat TIDAK menutup modal BARU, TIDAK menghapus input, onDone basi TIDAK jalan', async () => {
    const t = stubDeferredApi()
    const props = { show: true, onClose: vi.fn(), onDone: vi.fn() }
    const { rerender } = render(h(TaskModal, props))
    fill('Task LAMA')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(1)) // POST /tasks tertahan
    // user menutup modal saat submit menggantung
    await act(async () => { rerender(h(TaskModal, { ...props, show: false })) })
    expect(props.onClose).not.toHaveBeenCalled()
    // modal dibuka ulang, user mengetik task BARU
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) })
    fill('Task BARU')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, { task_id: 8 }) // submit BARU sukses lebih dulu
    expect(props.onDone).toHaveBeenCalledWith('Task #8 dibuat (pending)')
    expect(props.onClose).toHaveBeenCalledTimes(1) // modal BARU tertutup oleh submit BARU
    // modal dibuka lagi (simulasi user lanjut membuat task berikutnya)
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) })
    fill('Task KEDUA')
    // respons submit #1 (LAMA) tiba belakangan → semua efeknya basi:
    await t.settle(1, { task_id: 7 })
    expect(screen.getByLabelText('Judul').value).toBe('Task KEDUA') // tak terhapus oleh setTitle('') basi
    expect(props.onDone).toHaveBeenCalledTimes(1) // onDone basi tak jalan ulang
    expect(props.onClose).toHaveBeenCalledTimes(1) // modal BARU tak tertutup
    // modal masih fungsional: submit lagi → normal
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(3))
    await t.settle(3, { task_id: 9 })
    expect(props.onDone).toHaveBeenLastCalledWith('Task #9 dibuat (pending)')
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('submit LAMA GAGAL telat setelah modal dibuka ulang → alert "HTTP 503" basi TIDAK muncul di form BARU', async () => {
    const t = stubDeferredApi()
    const props = { show: true, onClose: vi.fn(), onDone: vi.fn() }
    const { rerender } = render(h(TaskModal, props))
    fill('Task GAGAL')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { rerender(h(TaskModal, { ...props, show: false })) })
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) }) // dibuka ulang → rid naik
    fill('Task BARU')
    // respons LAMA (sebelum dibuka ulang) GAGAL telat:
    await t.settle(1, {}, { fail: true, status: 503 })
    expect(screen.queryByRole('alert')).toBeNull() // kode lama: alert 503 palsu muncul di form baru
    // form BARU masih fungsional (tak terkunci busy basi):
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, { task_id: 11 })
    expect(props.onDone).toHaveBeenCalledWith('Task #11 dibuat (pending)')
  })

  it('submit BARU sukses duluan, submit LAMA telat sukses → tak ada task kedua palsu (onDone sekali, tak ada run task lama)', async () => {
    const t = stubDeferredApi()
    const props = { show: true, onClose: vi.fn(), onDone: vi.fn() }
    const { rerender } = render(h(TaskModal, props))
    fill('Task SATU')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & Jalankan' }))
    await waitFor(() => expect(t.count()).toBe(1)) // POST /tasks tertahan
    await act(async () => { rerender(h(TaskModal, { ...props, show: false })) })
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) })
    fill('Task DUA')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, { task_id: 21 })
    expect(props.onDone).toHaveBeenCalledWith('Task #21 dibuat (pending)')
    await act(async () => { rerender(h(TaskModal, { ...props, show: false })) })
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) }) // buka ulang (rid naik)
    fill('Task TIGA')
    await t.settle(1, { task_id: 20 }) // submit & run LAMA telat sukses — run tak pernah dipanggil utk task lama
    expect(props.onDone).toHaveBeenCalledTimes(1)
    // hanya 2 api yang pernah dibuat: /tasks (#1, tertahan basi) dan /tasks (#2) — tidak ada /tasks/20/run basi
    expect(t.urls.filter(u => u.includes('/run')).length).toBe(0)
  })

  it('busy tombol: submit menggantung → tombol disabled; modal dibuka ulang → form langsung siap (busy basi di-reset)', async () => {
    const t = stubDeferredApi()
    const props = { show: true, onClose: vi.fn(), onDone: vi.fn() }
    const { rerender } = render(h(TaskModal, props))
    fill('Task X')
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(t.count()).toBe(1))
    expect(screen.getByRole('button', { name: 'Simpan' }).disabled).toBe(true) // busy saat in-flight
    await act(async () => { rerender(h(TaskModal, { ...props, show: false })) })
    await act(async () => { rerender(h(TaskModal, { ...props, show: true })) })
    expect(screen.getByRole('button', { name: 'Simpan' }).disabled).toBe(false) // generasi baru siap
  })
})
