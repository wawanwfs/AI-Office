// @vitest-environment jsdom
// Siklus 192: guard perilaku registrasi SW + alur pembaruan PWA (mode prompt).
// Dua jebakan klasik yang WAJIB tetap tertutup:
//  1. updatefound terlewat bila SW sudah waiting saat listener terpasang
//     (kunjungan kedua) → path reg.waiting && reg.active.
//  2. controllerchange menyala juga di kunjungan PERTAMA (null → SW pertama)
//     → reload mengagetkan; digerbangi wasControlled.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupServiceWorkerUpdates } from '../lib/sw_update'

function makeFakeSW({ controller = false, withWaiting = false } = {}) {
  const installing = { state: 'installing', addEventListener: vi.fn(), removeEventListener: vi.fn() }
  const reg = {
    installing: withWaiting ? null : installing,
    waiting: withWaiting ? { postMessage: vi.fn() } : null,
    active: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const sw = {
    controller: controller ? {} : null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    register: vi.fn(() => Promise.resolve(reg)),
  }
  return { sw, reg, installing }
}

function stubNavigator(sw) {
  vi.stubGlobal('navigator', { serviceWorker: sw })
}

beforeEach(() => { vi.stubGlobal('location', { reload: vi.fn() }) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('sw_update — registrasi & alur pembaruan PWA', () => {
  it('tanpa serviceWorker di navigator → stub aman (tanpa error, applyUpdate false)', async () => {
    vi.stubGlobal('navigator', {})
    const api = setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    await expect(api.applyUpdate()).resolves.toBe(false)
    expect(() => api.dispose()).not.toThrow()
  })

  it('kunjungan PERTAMA: SW baru ter-install TANPA controller → banner TIDAK naik', async () => {
    const { sw, reg, installing } = makeFakeSW({ controller: false })
    stubNavigator(sw)
    const onReady = vi.fn()
    setupServiceWorkerUpdates({ onUpdateReady: onReady })
    await vi.waitFor(() => expect(sw.register).toHaveBeenCalledWith('/sw.js', { scope: '/' }))
    // simulasi updatefound → statechange 'installed' pada kunjungan pertama
    const ufCb = reg.addEventListener.mock.calls.find(([t]) => t === 'updatefound')?.[1]
    ufCb?.()
    const scCb = installing.addEventListener.mock.calls.find(([t]) => t === 'statechange')?.[1]
    installing.state = 'installed'
    scCb?.()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('SW sudah WAITING saat mount (kunjungan kedua) → banner naik tanpa updatefound', async () => {
    const { sw } = makeFakeSW({ controller: true, withWaiting: true })
    stubNavigator(sw)
    const onReady = vi.fn()
    setupServiceWorkerUpdates({ onUpdateReady: onReady })
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
  })

  it('controllerchange: halaman TERKONTROL → reload; kunjungan pertama → tanpa reload', async () => {
    const { sw } = makeFakeSW({ controller: true })
    stubNavigator(sw)
    setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    const ccCb = sw.addEventListener.mock.calls.find(([t]) => t === 'controllerchange')?.[1]
    ccCb?.()
    expect(location.reload).toHaveBeenCalledTimes(1)

    const sw2 = makeFakeSW({ controller: false }).sw
    stubNavigator(sw2)
    setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    const cc2 = sw2.addEventListener.mock.calls.find(([t]) => t === 'controllerchange')?.[1]
    cc2?.()
    expect(location.reload).toHaveBeenCalledTimes(1) // tetap 1 — tidak naik
  })

  it('applyUpdate: kirim SKIP_WAITING ke worker yang menunggu; tanpa waiting → false', async () => {
    const { sw, reg } = makeFakeSW({ controller: true, withWaiting: true })
    stubNavigator(sw)
    const api = setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    await vi.waitFor(() => expect(reg.waiting).toBeTruthy())
    await expect(api.applyUpdate()).resolves.toBe(true)
    expect(reg.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })

    const bare = makeFakeSW({ controller: true }).reg
    const sw2 = { ...makeFakeSW({ controller: true }).sw, register: vi.fn(() => Promise.resolve(bare)) }
    stubNavigator(sw2)
    const api2 = setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    await vi.waitFor(() => expect(sw2.register).toHaveBeenCalled())
    await expect(api2.applyUpdate()).resolves.toBe(false)
  })

  it('dispose: listener controllerchange dilepas — reload tidak lagi terpanggil', async () => {
    const { sw } = makeFakeSW({ controller: true })
    stubNavigator(sw)
    const api = setupServiceWorkerUpdates({ onUpdateReady: () => {} })
    const ccCb = sw.addEventListener.mock.calls.find(([t]) => t === 'controllerchange')?.[1]
    api.dispose()
    ccCb?.()
    expect(location.reload).not.toHaveBeenCalled()
  })
})
