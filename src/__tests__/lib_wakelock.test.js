// Unit test lib/wakelock.js (createWakeLockManager) — navigator nyata disuntikkan.
// Murni terhadap DOM: tanpa document/fetch — bisa jalan di environment node.
import { describe, it, expect, vi } from 'vitest'
import { createWakeLockManager } from '../lib/wakelock.js'

// Sentinel tiruan: .released + addEventListener('release') + async release()/fireRelease().
function mkSentinel() {
  let cb = null
  return {
    released: false,
    addEventListener(ev, fn) { if (ev === 'release') cb = fn },
    async release() { this.fireRelease() },
    fireRelease() { this.released = true; cb && cb() },
  }
}

// Setiap request() mengembalikan sentinel BARU (persis perilaku browser: sentinel
// lama dibuang saat release/auto-release, jadi reacquire minta yang baru).
function mkNav({ failRequest = false } = {}) {
  const sentinels = []
  const request = vi.fn(async () => {
    if (failRequest) throw new Error('NotAllowedError')
    const s = mkSentinel()
    sentinels.push(s)
    return s
  })
  return {
    nav: { wakeLock: { request } },
    sentinels,
    request,
  }
}

describe('unsupported', () => {
  it('nav tanpa wakeLock → state unsupported & onState dipanggil', async () => {
    const seen = []
    const m = createWakeLockManager({}, { onState: s => seen.push(s) })
    expect(m.state()).toBe('unsupported')
    expect(await m.acquire()).toBe('unsupported')
    await expect(m.release()).resolves.toBeUndefined()
    expect(seen).toEqual(['unsupported'])
  })
  it('nav null → state unsupported', () => {
    expect(createWakeLockManager(null).state()).toBe('unsupported')
  })
})

describe('acquire/release', () => {
  it('acquire sukses → held, request("screen")', async () => {
    const { nav, request } = mkNav()
    const m = createWakeLockManager(nav)
    expect(await m.acquire()).toBe('held')
    expect(request).toHaveBeenCalledWith('screen')
    expect(m.state()).toBe('held')
  })

  it('acquire dua kali → request hanya sekali, tetap held', async () => {
    const { nav, request, sentinels } = mkNav()
    const m = createWakeLockManager(nav)
    await m.acquire()
    await m.acquire()
    expect(request).toHaveBeenCalledTimes(1)
    expect(sentinels[0].released).toBe(false)
    expect(m.state()).toBe('held')
  })

  it('release → released & sentinel dilepas', async () => {
    const { nav, sentinels } = mkNav()
    const m = createWakeLockManager(nav)
    await m.acquire()
    await m.release()
    expect(sentinels[0].released).toBe(true)
    expect(m.state()).toBe('released')
  })

  it('browser auto-release (sentinel fire) → released, lalu reacquire minta sentinel baru', async () => {
    const { nav, sentinels, request } = mkNav()
    const m = createWakeLockManager(nav)
    await m.acquire()
    sentinels[0].fireRelease()
    expect(m.state()).toBe('released')
    // reacquire → request kedua → sentinel baru → held lagi
    await m.acquire()
    expect(request).toHaveBeenCalledTimes(2)
    expect(sentinels).toHaveLength(2)
    expect(m.state()).toBe('held')
  })

  it('request gagal → tetap released, tanpa throw', async () => {
    const { nav } = mkNav({ failRequest: true })
    const m = createWakeLockManager(nav)
    await expect(m.acquire()).resolves.toBe('released')
    expect(m.state()).toBe('released')
  })
})

describe('onState', () => {
  it('memancarkan held → released sesuai transisi', async () => {
    const { nav } = mkNav()
    const seen = []
    const m = createWakeLockManager(nav, { onState: s => seen.push(s) })
    await m.acquire()
    expect(seen).toContain('held')
    await m.release()
    expect(seen).toContain('released')
  })
})
