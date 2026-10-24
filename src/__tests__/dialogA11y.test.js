// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDialogA11y } from '../lib/dialogA11y.js'

function mountOverlay({ open = true, initialFocus = null } = {}) {
  const ref = { current: null }
  const el = document.createElement('div')
  el.setAttribute('role', 'dialog')
  el.innerHTML = `
    <button id="first">Satu</button>
    <button id="second" disabled>Nonaktif</button>
    <button id="third">Dua</button>`
  // jsdom tidak punya layout: offsetParent selalu null → set manual agar
  // filter visibilitas di hook (offsetParent !== null) berperilaku seperti browser.
  for (const b of el.querySelectorAll('button')) Object.defineProperty(b, 'offsetParent', { value: el })
  document.body.appendChild(el)
  ref.current = el
  const onClose = vi.fn()
  const utils = renderHook(() => useDialogA11y({ open, onClose, ref, initialFocus }))
  return { el, onClose, ...utils, cleanup: () => el.remove() }
}

describe('lib/dialogA11y.js — hook a11y overlay', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

  it('open=false: aria-modal tidak diset & tidak memasang keydown listener', () => {
    const { el, onClose } = mountOverlay({ open: false })
    expect(el.hasAttribute('aria-modal')).toBe(false)
    const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    act(() => { document.dispatchEvent(ev) })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('role=dialog tanpa aria-modal → aria-modal=true ditambahkan', () => {
    const { el } = mountOverlay()
    expect(el.getAttribute('aria-modal')).toBe('true')
  })

  it('elemen role bukan dialog → aria-modal tidak diset', () => {
    const el = document.createElement('div') // tanpa role
    document.body.appendChild(el)
    const ref = { current: el }
    renderHook(() => useDialogA11y({ open: true, onClose: vi.fn(), ref }))
    expect(el.hasAttribute('aria-modal')).toBe(false)
  })

  it('fokus awal ke elemen focusable pertama (button nonaktif dilewati)', async () => {
    const { el } = mountOverlay()
    act(() => { vi.advanceTimersByTime(40) })
    expect(document.activeElement).toBe(el.querySelector('#first'))
  })

  it('initialFocus menang atas elemen pertama', () => {
    const el = document.createElement('div'); el.setAttribute('role', 'dialog')
    el.innerHTML = '<button id="a">A</button><button id="b">B</button>'
    document.body.appendChild(el)
    const init = { current: el.querySelector('#b') }
    renderHook(() => useDialogA11y({ open: true, onClose: vi.fn(), ref: { current: el }, initialFocus: init }))
    act(() => { vi.advanceTimersByTime(40) })
    expect(document.activeElement).toBe(el.querySelector('#b'))
  })

  it('Escape memanggil onClose dan stopPropagation', () => {
    const { onClose } = mountOverlay()
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const spy = vi.spyOn(ev, 'stopPropagation')
    act(() => { document.dispatchEvent(ev) })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalled()
  })

  it('Tab wrap maju: dari item pertama mundur (shift) → item terakhir', () => {
    const { el } = mountOverlay()
    const first = el.querySelector('#first')
    first.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    act(() => { document.dispatchEvent(ev) })
    expect(document.activeElement).toBe(el.querySelector('#third'))
  })

  it('Tab wrap maju dari item terakhir → item pertama', () => {
    const { el } = mountOverlay()
    const third = el.querySelector('#third')
    third.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    act(() => { document.dispatchEvent(ev) })
    expect(document.activeElement).toBe(el.querySelector('#first'))
  })

  it('Tab biasa bergerak ke item berikutnya; default di-preventDefault', () => {
    const { el } = mountOverlay()
    const first = el.querySelector('#first')
    first.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    act(() => { document.dispatchEvent(ev) })
    expect(document.activeElement).toBe(el.querySelector('#third'))
    expect(ev.defaultPrevented).toBe(true)
  })

  it('cleanup: aria-modal dilepas, listener ditangkat, fokus kembali ke pemicu', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { el, unmount } = mountOverlay()
    act(() => { vi.advanceTimersByTime(40) })
    expect(document.activeElement).toBe(el.querySelector('#first'))
    unmount()
    expect(el.hasAttribute('aria-modal')).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })
})
