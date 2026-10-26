// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ConfirmModal from '../components/ConfirmModal.jsx'

const h = React.createElement

afterEach(cleanup)

describe('components/ConfirmModal', () => {
  it('show=false → tidak me-render apa pun', () => {
    const { container } = render(
      h(ConfirmModal, { show: false, title: 't', onConfirm: vi.fn(), onCancel: vi.fn() })
    )
    expect(container.firstChild).toBeNull()
  })

  it('render alertdialog dengan title & text', () => {
    render(
      h(ConfirmModal, { show: true, title: 'Hapus task?', text: 'Yakin ingin menghapus?', onConfirm: vi.fn(), onCancel: vi.fn() })
    )
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('Hapus task?')).toBeTruthy()
    expect(screen.getByText('Yakin ingin menghapus?')).toBeTruthy()
  })

  it('onConfirm dipanggil saat tombol konfirmasi diklik; busy nonaktifkan tombol', () => {
    const onConfirm = vi.fn()
    const { rerender } = render(
      h(ConfirmModal, { show: true, title: 't', confirmLabel: 'Ya, lanjut', onConfirm, onCancel: vi.fn() })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ya, lanjut' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    rerender(
      h(ConfirmModal, { show: true, title: 't', busy: true, confirmLabel: 'Ya, lanjut', onConfirm, onCancel: vi.fn() })
    )
    expect(screen.getByRole('button', { name: 'Memproses…' }).disabled).toBe(true)
  })

  it('onCancel dipanggil lewat tombol Batal', () => {
    const onCancel = vi.fn()
    render(h(ConfirmModal, { show: true, title: 't', onConfirm: vi.fn(), onCancel }))
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('onCancel dipanggil saat klik scrim (luar dialog)', () => {
    const onCancel = vi.fn()
    const { container } = render(
      h(ConfirmModal, { show: true, title: 't', onConfirm: vi.fn(), onCancel })
    )
    const scrim = container.querySelector('.modal-scrim')
    expect(scrim).toBeTruthy()
    fireEvent.click(scrim)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape menutup dialog melalui useDialogA11y', () => {
    const onCancel = vi.fn()
    render(h(ConfirmModal, { show: true, title: 't', onConfirm: vi.fn(), onCancel }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
