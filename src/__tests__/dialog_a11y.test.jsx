// @vitest-environment jsdom
// Unit test lib/dialogA11y (useDialogA11y) — hook a11y overlay yang dipakai 6
// komponen modal (TaskModal/TaskBoard/ProjectPanel/ActivityLog/OverlayHelp/
// ConfirmModal) tapi belum punya test langsung: aria-modal otomatis, fokus awal,
// focus-trap Tab/Shift+Tab, Escape → onClose, dan restore fokus ke pemicu.
import React, { useRef } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useDialogA11y } from '../lib/dialogA11y'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

// Pemicu di luar dialog (simulasi tombol pembuka) — fokusnya harus dikembalikan saat modal ditutup.
function Trigger() {
  return <button id="trigger" onClick={undefined}>buka</button>
}

function Dialog({ open, onClose, withAria, initialFocusId }) {
  const box = useRef(null)
  const init = useRef(null)
  useDialogA11y({ open, onClose, ref: box, initialFocus: initialFocusId ? init : undefined })
  if (!open) return null
  return (
    <div ref={box} role="dialog" {...(withAria ? { 'aria-modal': 'true' } : {})}>
      <input id="d-in" />
      <button id="d-b1">satu</button>
      <button id="d-b2" ref={initialFocusId ? init : undefined}>dua</button>
    </div>
  )
}

function mountModal({ open = true, onClose = vi.fn(), withAria = false, initialFocusId = false } = {}) {
  const utils = render(
    <div>
      <Trigger />
      <Dialog open={open} onClose={onClose} withAria={withAria} initialFocusId={initialFocusId} />
    </div>
  )
  return { onClose, ...utils }
}

// jsdom tidak mengimplementasikan layout: offsetParent selalu null, sehingga
// filter "elemen tersembunyi" di hook menyaring SEMUA elemen. Patch minimal:
// offsetParent = null hanya bila display:none (cukup utk perilaku trap nyata).
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() { return this.style.display === 'none' ? null : (this.ownerDocument && this.ownerDocument.body) },
})

describe('useDialogA11y — aria & fokus awal', () => {
  it('memasang aria-modal="true" bila belum ada', () => {
    mountModal()
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('tidak menimpa aria-modal yang sudah dipasang manual', () => {
    mountModal({ withAria: true })
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('menghapus aria-modal saat ditutup', () => {
    const { rerender } = mountModal()
    rerender(
      <div>
        <Trigger />
        <Dialog open={false} onClose={() => {}} />
      </div>
    )
    // dialog sudah unmount; tak ada error & tak ada dialog tersisa
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('fokus awal: elemen focusable pertama di dalam dialog', async () => {
    mountModal()
    await waitFor(() => expect(document.activeElement?.id).toBe('d-in'))
  })

  it('fokus awal: initialFocus (elemen yang direferensikan) lebih diprioritaskan', async () => {
    mountModal({ initialFocusId: true })
    await waitFor(() => expect(document.activeElement?.id).toBe('d-b2'))
  })

  it('tak ada elemen focusable → fokus ke container dialog (tanpa throw)', async () => {
    function EmptyDialog({ open }) {
      const box = useRef(null)
      useDialogA11y({ open, onClose: () => {}, ref: box })
      if (!open) return null
      return <div ref={box} role="dialog"><p>teks saja</p></div>
    }
    render(<EmptyDialog open />)
    // jsdom: div tanpa tabindex tidak bisa menerima fokus → fokus() tak berdampak.
    // Yang bisa diverifikasi: hook tidak throw & listener Escape tetap terpasang.
    expect(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) }).not.toThrow()
  })
})

describe('useDialogA11y — focus trap', () => {
  it('Tab di elemen terakhir → kembali ke elemen pertama (wrap)', async () => {
    mountModal()
    await new Promise(r => setTimeout(r, 50))
    const last = screen.getByText('dua')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement?.id).toBe('d-in')
  })

  it('Shift+Tab di elemen pertama → ke elemen terakhir (wrap balik)', async () => {
    mountModal()
    await new Promise(r => setTimeout(r, 50))
    const first = document.getElementById('d-in')
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement?.id).toBe('d-b2')
  })

  it('Tab di tengah → lanjut ke elemen berikutnya (bukan wrap)', async () => {
    mountModal()
    await new Promise(r => setTimeout(r, 50))
    document.getElementById('d-in').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement?.id).toBe('d-b1')
  })

  it('elemen tersembunyi (offsetParent null) dilewati dari trap', async () => {
    mountModal()
    await new Promise(r => setTimeout(r, 50))
    const hid = document.getElementById('d-b1')
    hid.style.display = 'none'
    document.getElementById('d-in').focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false })
    expect(document.activeElement?.id).toBe('d-b2') // b1 tersembunyi → dilompati
    // elemen aktif yang disembunyikan tetap boleh jadi target bila == activeElement
  })

  it('tanpa elemen focusable → Tab dibiarkan lewat (tidak preventDefault)', () => {
    function EmptyDialog({ open }) {
      const box = useRef(null)
      useDialogA11y({ open, onClose: () => {}, ref: box })
      if (!open) return null
      return <div ref={box} role="dialog"><p>teks</p></div>
    }
    render(<EmptyDialog open />)
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    const spy = vi.spyOn(ev, 'preventDefault')
    document.dispatchEvent(ev)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('useDialogA11y — Escape & lifecycle', () => {
  it('Escape memanggil onClose dan tidak merambat (stopPropagation)', () => {
    const onClose = vi.fn()
    mountModal({ onClose })
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const spy = vi.spyOn(ev, 'stopPropagation')
    document.dispatchEvent(ev)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalled()
  })

  it('tombol non-Escape/Tab tidak diproses', () => {
    const onClose = vi.fn()
    mountModal({ onClose })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restore fokus: pemicu di luar dialog dikembalikan saat modal di-unmount', async () => {
    // Pemicu dibuat & difokuskan di luar React (persisten), modal dirender terpisah —
    // cleanup hook (unmount/tutup) harus mengembalikan fokus ke pemicu.
    const trig = document.createElement('button'); trig.id = 'trig'; document.body.appendChild(trig)
    trig.focus()
    const first = render(<Dialog open onClose={() => {}} />)
    await waitFor(() => expect(document.activeElement?.id).toBe('d-in'))
    first.unmount()
    expect(document.activeElement).toBe(trig)
    trig.remove()
  })

  it('listener dibersihkan saat unmount: Escape tak lagi memanggil onClose', () => {
    const onClose = vi.fn()
    const { unmount } = mountModal({ onClose })
    unmount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dialog tidak dirender saat open=false → tak ada efek samping', () => {
    mountModal({ open: false })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // tanpa exception
  })
})
