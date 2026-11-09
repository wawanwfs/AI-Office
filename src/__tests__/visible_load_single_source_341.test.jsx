// Siklus 341 — muat awal tergerbang visibility satu sumber: useVisibleLoad.
// Sisa pola 322 di WfsPanel (dua effect berpasangan: gerbang visibilityState +
// setTimeout 0, PLUS listener visibilitychange manual) digabung ke lib.
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, act } from '@testing-library/react'
import React, { useState, useCallback } from 'react'
import { useVisibleLoad } from '../lib/dialogA11y'

const root = join(__dirname, '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

describe('siklus 341: useVisibleLoad satu sumber', () => {
  it('hook ada di lib dengan pola gerbang + listener + cleanup', () => {
    const src = read('src/lib/dialogA11y.js')
    expect(src).toContain('export function useVisibleLoad(')
    expect(src).toContain("document.addEventListener('visibilitychange'")
    expect(src).toContain("document.removeEventListener('visibilitychange'")
    expect(src).toContain('clearTimeout(t0)')
  })

  it('salinan inline dua-effect di WfsPanel hilang, pemakaian hook terverifikasi', () => {
    const wfs = read('src/components/WfsPanel.jsx')
    expect(wfs).toContain('useVisibleLoad(loadAgents')
    expect(wfs).not.toMatch(/visibilityState !== 'visible'/)
    expect(wfs.match(/visibilitychange/g) || []).toHaveLength(0)
  })

  it('tick awal jalan saat visible (via setTimeout 0), tak jalan saat hidden', () => {
    let calls = 0
    let visState = 'visible'
    Object.defineProperty(document, 'visibilityState', { get: () => visState, configurable: true })
    function C() { useVisibleLoad(() => { calls++ }); return <div>x</div> }
    vi.useFakeTimers()
    visState = 'visible'
    render(<C />)
    act(() => { vi.runAllTimers() })
    expect(calls).toBe(1)
    visState = 'hidden'
    render(<C />)
    act(() => { vi.runAllTimers() })
    // komponen kedua mount saat hidden → tick awal dilewati
    expect(calls).toBe(1)
    vi.useRealTimers()
  })

  it('saat visibilitychange ke visible → reload SEGERA', () => {
    let calls = 0
    let visState = 'visible'
    Object.defineProperty(document, 'visibilityState', { get: () => visState, configurable: true })
    function C() { useVisibleLoad(() => { calls++ }); return <div>x</div> }
    visState = 'hidden'
    render(<C />)
    expect(calls).toBe(0)
    visState = 'visible'
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(calls).toBe(1)
  })

  it('hook lain di lib tak diregresikan', () => {
    const src = read('src/lib/dialogA11y.js')
    for (const h of ['useEscapeClose(', 'useOutsideClose(', 'useWindowEvent(', 'useVisibilityPoll(', 'useTween(', 'useDialogA11y(']) {
      expect(src).toContain('export function ' + h)
    }
  })
})
