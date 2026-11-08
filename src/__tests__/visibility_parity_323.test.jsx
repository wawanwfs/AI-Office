// @vitest-environment jsdom
// Siklus 323 — paritas visible-refresh terakhir: TeamStats & Dashboard poll API
// ter-gate visibilityState tapi TANPA listener 'visibilitychange', jadi setelah
// tab lama disembunyikan lalu kembali visible data API bisa usang hingga satu
// periode interval penuh (TeamStats 15 dtk, Dashboard 10 dtk). Kini: listener
// refresh SEGERA saat kembali visible + cleanup removeEventListener (pola 315-322).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import TeamStats from '../components/TeamStats'
import Dashboard from '../components/Dashboard'

vi.mock('../lib/api', () => ({
  api: vi.fn(async () => []),
}))

afterEach(() => { cleanup(); document.body.innerHTML = '' })

const makeHarness = () => {
  let visState = 'visible'
  let visListeners = []
  const goHidden = () => { visState = 'hidden' }
  const goVisible = () => { visState = 'visible'; visListeners.forEach(f => f()) }
  Object.defineProperty(document, 'visibilityState', { get: () => visState, configurable: true })
  return {
    goHidden, goVisible,
    capture: () => {
      const realAdd = document.addEventListener.bind(document)
      const realRm = document.removeEventListener.bind(document)
      document.addEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners.push(fn); else realAdd(ev, fn) }
      document.removeEventListener = (ev, fn) => { if (ev === 'visibilitychange') visListeners = visListeners.filter(f => f !== fn); else realRm(ev, fn) }
      return () => { document.addEventListener = realAdd; document.removeEventListener = realRm; visListeners = [] }
    },
    listenerCount: () => visListeners.length,
  }
}

const openComp = async (name) => {
  const { render } = await import('@testing-library/react')
  const Comp = (await import(`../components/${name}.jsx`)).default
  const r = render(<Comp />)
  const btn = document.querySelector('button')
  if (btn) { btn.click() }
  return r
}

describe('visible-refresh parity TeamStats & Dashboard API poll (siklus 323)', () => {
  it('TeamStats: hidden→visible memicu load API SEGERA', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const { unmount } = await openComp('TeamStats')
    await Promise.resolve()
    const afterMount = api.mock.calls.length
    h.goHidden()
    h.goVisible()
    await Promise.resolve()
    expect(api.mock.calls.length).toBeGreaterThan(afterMount)
    unmount()
    restore()
  })

  it('TeamStats: transisi ke hidden TIDAK memicu load', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const { unmount } = await openComp('TeamStats')
    await Promise.resolve()
    const before = api.mock.calls.length
    h.goHidden()
    await Promise.resolve()
    expect(api.mock.calls.length).toBe(before)
    unmount()
    restore()
  })

  it('Dashboard: hidden→visible memicu load API SEGERA', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const { unmount } = await openComp('Dashboard')
    await Promise.resolve()
    const afterMount = api.mock.calls.length
    h.goHidden()
    h.goVisible()
    await Promise.resolve()
    expect(api.mock.calls.length).toBeGreaterThan(afterMount)
    unmount()
    restore()
  })

  it('Dashboard: transisi ke hidden TIDAK memicu load', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const { unmount } = await openComp('Dashboard')
    await Promise.resolve()
    const before = api.mock.calls.length
    h.goHidden()
    await Promise.resolve()
    expect(api.mock.calls.length).toBe(before)
    unmount()
    restore()
  })

  it('cleanup: unmount melepas listener visibilitychange (kedua komponen)', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const a = await openComp('TeamStats')
    const withTeam = h.listenerCount()
    expect(withTeam).toBeGreaterThanOrEqual(1)
    a.unmount()
    const mid = h.listenerCount()
    expect(mid).toBeLessThan(withTeam)
    const b = await openComp('Dashboard')
    expect(h.listenerCount()).toBeGreaterThan(mid)
    b.unmount()
    expect(h.listenerCount()).toBe(mid)
    restore()
  })
})
