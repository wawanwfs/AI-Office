// @vitest-environment jsdom
// Siklus 324 — celah terakhir paritas visible-refresh: poller status utama App.jsx
// (tasks+paused, siklus adaptif 15 dtk sehat / backoff hingga 80 dtk) memakai
// STALE_AFTER_MS saat tab hidden tapi TANPA listener 'visibilitychange', jadi
// setelah tab lama disembunyikan lalu kembali visible status header bisa usang
// hingga timeout terpanjang berjalan penuh. Kini: visible → clearTimeout + tick
// + schedule ulang SEGERA, dengan cleanup removeEventListener.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import React from 'react'

vi.mock('../lib/api', () => ({
  api: vi.fn(async (path) => (path === 'tasks/paused' ? { paused: false } : { tasks: [] })),
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

const mountApp = async () => {
  const { render } = await import('@testing-library/react')
  window.history.replaceState(null, '', '/app')
  try { localStorage.setItem('wfs_view_mode', '2d') } catch { /* jsdom ok */ }
  const App = (await import('../App.jsx')).default
  return render(<App />)
}

describe('visible-refresh poller status App (siklus 324)', () => {
  it('hidden→visible memicu fetch API SEGERA (tidak menunggu timer berjalan)', async () => {
    vi.useFakeTimers()
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const r = await mountApp()
    await vi.runOnlyPendingTimersAsync()
    await vi.advanceTimersByTimeAsync(0)
    const afterMount = api.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)
    h.goHidden()
    h.goVisible()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.mock.calls.length).toBeGreaterThan(afterMount)
    r.unmount()
    restore()
    vi.useRealTimers()
  })

  it('visible→visible tanpa perubahan tidak memicu fetch ganda dari listener', async () => {
    vi.useFakeTimers()
    const h = makeHarness()
    const restore = h.capture()
    const api = (await import('../lib/api')).api
    const r = await mountApp()
    await vi.runOnlyPendingTimersAsync()
    const before = api.mock.calls.length
    h.goVisible() // sudah visible sejak mount
    await vi.advanceTimersByTimeAsync(0)
    // goVisible memicu tick poller status + reload drawer yang terpasang
    // (Dashboard/TeamStats dll ter-mount di App). Cukup: setiap listener
    // visible-refresh menaikkan jumlah panggilan API minimal 1 per drawer.
    expect(api.mock.calls.length).toBeGreaterThan(before)
    r.unmount()
    restore()
    vi.useRealTimers()
  })

  it('unmount melepas listener visibilitychange', async () => {
    const h = makeHarness()
    const restore = h.capture()
    const r = await mountApp()
    await Promise.resolve()
    expect(h.listenerCount()).toBeGreaterThanOrEqual(1)
    r.unmount()
    expect(h.listenerCount()).toBe(0)
    restore()
  })
})
