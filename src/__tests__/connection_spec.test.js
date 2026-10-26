// Unit test lib/connection_spec.js — tracker kesehatan koneksi gateway:
// backoff eksponensial, transisi live/stale/down, badge HUD, delay adaptif.
import { describe, it, expect } from 'vitest'
import {
  applyPollResult,
  connectionBadge,
  nextPollDelay,
  POLL_HEALTHY_MS,
  POLL_BASE_MS,
  POLL_MAX_MS,
  STALE_AFTER_MS,
} from '../lib/connection_spec.js'

describe('connection_spec — applyPollResult', () => {
  it('sukses pertama → live, delay 15s, everConnected', () => {
    const t = applyPollResult(null, { ok: true }, 1000)
    expect(t.state).toBe('live')
    expect(t.failStreak).toBe(0)
    expect(t.lastOkAt).toBe(1000)
    expect(t.everConnected).toBe(true)
    expect(t.nextDelayMs).toBe(POLL_HEALTHY_MS)
  })

  it('gagal tanpa pernah sukses → down langsung', () => {
    const t = applyPollResult(null, { ok: false, error: 'offline' }, 1000)
    expect(t.state).toBe('down')
    expect(t.failStreak).toBe(1)
    expect(t.everConnected).toBeUndefined()
  })

  it('gagal setelah sukses → stale (data basi tapi tampilan masih layak)', () => {
    let t = applyPollResult(null, { ok: true }, 1000)
    t = applyPollResult(t, { ok: false, error: 'offline' }, 2000)
    expect(t.state).toBe('stale')
    expect(t.failStreak).toBe(1)
    expect(t.lastOkAt).toBe(1000)
  })

  it('backoff eksponensial 5→10→20→40→80 lalu cap 80', () => {
    let t = null
    const delays = []
    for (let i = 0; i < 7; i++) {
      t = applyPollResult(t, { ok: false, error: 'x' }, 1000 + i)
      delays.push(t.nextDelayMs)
    }
    expect(delays).toEqual([
      POLL_BASE_MS, POLL_BASE_MS * 2, POLL_BASE_MS * 4,
      POLL_BASE_MS * 8, POLL_BASE_MS * 16, POLL_MAX_MS, POLL_MAX_MS,
    ])
    expect(POLL_MAX_MS).toBeLessThanOrEqual(80000)
  })

  it('pulih kembali live dengan delay sehat', () => {
    let t = null
    for (let i = 0; i < 4; i++) t = applyPollResult(t, { ok: false }, i * 1000)
    t = applyPollResult(t, { ok: true }, 9999)
    expect(t.state).toBe('live')
    expect(t.failStreak).toBe(0)
    expect(t.nextDelayMs).toBe(POLL_HEALTHY_MS)
    expect(t.lastError).toBeNull()
  })
})

describe('connection_spec — connectionBadge & nextPollDelay', () => {
  it('live → label Sinkron tone ok', () => {
    const t = applyPollResult(null, { ok: true }, 5000)
    const b = connectionBadge(t, 6000)
    expect(b.state).toBe('live')
    expect(b.label).toBe('Sinkron')
    expect(b.tone).toBe('ok')
  })

  it('stale → label memuat umur data (detik & menit)', () => {
    let t = applyPollResult(null, { ok: true }, 0)
    t = applyPollResult(t, { ok: false, error: 'offline' }, 1000)
    const s = connectionBadge(t, 31000) // 31 dtk sejak sukses
    expect(s.state).toBe('stale')
    expect(s.label).toBe('Sinkron 31 dtk lalu')
    const m = connectionBadge(t, 125000) // 2 mnt
    expect(m.label).toBe('Sinkron 2 mnt lalu')
    expect(m.tone).toBe('warn')
  })

  it('down → label Terputus tone err', () => {
    const t = applyPollResult(null, { ok: false, error: 'offline' }, 1000)
    const b = connectionBadge(t, 2000)
    expect(b.state).toBe('down')
    expect(b.label).toBe('Terputus')
    expect(b.tone).toBe('err')
    expect(b.detail).toContain('offline')
  })

  it('badge selalu punya label & tone aman (tracker kosong)', () => {
    const b = connectionBadge(null)
    expect(b.label).toBeTruthy()
    expect(b.tone).toBe('err')
  })

  it('nextPollDelay: fallback sehat bila tracker kosong', () => {
    expect(nextPollDelay(null)).toBe(POLL_HEALTHY_MS)
    const t = applyPollResult(null, { ok: false }, 0)
    expect(nextPollDelay(t)).toBe(POLL_BASE_MS)
    expect(STALE_AFTER_MS).toBeGreaterThan(POLL_HEALTHY_MS)
  })

  it('nextPollDelay(tr, healthyMs): cadence sehat kustom (papan 3D & TV lounge 60 dtk), gagal tetap backoff', () => {
    const H = 60000
    expect(nextPollDelay(null, H)).toBe(H) // tracker kosong → cadence sehat pemanggil
    const live = applyPollResult(null, { ok: true }, 0)
    expect(nextPollDelay(live, H)).toBe(H) // sehat → cadence pemanggil (bukan 15s)
    let t = applyPollResult(null, { ok: true }, 0)
    t = applyPollResult(t, { ok: false }, 1000)
    expect(nextPollDelay(t, H)).toBe(POLL_BASE_MS) // gagal → backoff menang atas cadence sehat
    t = applyPollResult(t, { ok: false }, 2000)
    expect(nextPollDelay(t, H)).toBe(POLL_BASE_MS * 2)
  })
})
