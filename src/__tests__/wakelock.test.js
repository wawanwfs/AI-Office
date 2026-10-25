// Unit test createWakeLockManager (lib/wakelock.js) — navigator disuntikkan,
// tanpa browser nyata. Mencakup: unsupported, acquire/release, reacquire
// setelah release oleh browser (lock.released / event 'release').
import { describe, it, expect, vi } from 'vitest'
import { createWakeLockManager } from '../lib/wakelock.js'

function fakeLock() {
  const listeners = {}
  return {
    released: false,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn) },
    emitRelease() { this.released = true; (listeners.release || []).forEach(f => f()) },
    release: async function () { this.released = true },
  }
}

function fakeNav(requestImpl) {
  return { wakeLock: { request: requestImpl || vi.fn(async () => fakeLock()) } }
}

describe('createWakeLockManager', () => {
  it('navigator tanpa wakeLock → unsupported, acquire aman', async () => {
    const states = []
    const m = createWakeLockManager({}, { onState: s => states.push(s) })
    expect(m.state()).toBe('unsupported')
    expect(await m.acquire()).toBe('unsupported')
    await expect(m.release()).resolves.toBeUndefined()
    expect(states).toEqual(['unsupported'])
  })

  it('null navigator → unsupported', () => {
    expect(createWakeLockManager(null).state()).toBe('unsupported')
  })

  it('acquire meminta "screen" dan state held; request gagal → tetap released tanpa throw', async () => {
    const req = vi.fn(async () => fakeLock())
    const m = createWakeLockManager(fakeNav(req))
    expect(await m.acquire()).toBe('held')
    expect(req).toHaveBeenCalledWith('screen')
    expect(m.state()).toBe('held')

    const m2 = createWakeLockManager(fakeNav(async () => { throw new Error('NotAllowedError') }))
    await expect(m2.acquire()).resolves.toBe('released')
    expect(m2.state()).toBe('released')
  })

  it('acquire saat sudah held tidak meminta ulang', async () => {
    const req = vi.fn(async () => fakeLock())
    const m = createWakeLockManager(fakeNav(req))
    await m.acquire()
    await m.acquire()
    expect(req).toHaveBeenCalledTimes(1)
  })

  it('release melepas lock dan state kembali released', async () => {
    const lock = fakeLock()
    const m = createWakeLockManager(fakeNav(async () => lock))
    await m.acquire()
    await m.release()
    expect(lock.released).toBe(true)
    expect(m.state()).toBe('released')
  })

  it('lock dilepas browser (event release) → state released; reacquire meminta lock baru', async () => {
    const first = fakeLock()
    const second = fakeLock()
    let calls = 0
    const req = async () => { calls++; return calls === 1 ? first : second }
    const m = createWakeLockManager(fakeNav(req))
    await m.acquire()
    expect(m.state()).toBe('held')
    first.emitRelease() // browser melepas saat tab hidden
    expect(m.state()).toBe('released')
    await m.acquire() // visibilitychange visible → reacquire
    expect(calls).toBe(2)
    expect(m.state()).toBe('held')
  })

  it('onState terpanggil pada transisi (acquire, release, release oleh browser)', async () => {
    const lock = fakeLock()
    const states = []
    const m = createWakeLockManager(fakeNav(async () => lock), { onState: s => states.push(s) })
    await m.acquire()
    await m.release()
    expect(states).toEqual(['held', 'released'])
  })

  it('lock tanpa addEventListener (browser lama) → tidak throw', async () => {
    const lock = { released: false, release: async () => { lock.released = true } }
    const m = createWakeLockManager(fakeNav(async () => lock))
    await expect(m.acquire()).resolves.toBe('held')
  })
})
