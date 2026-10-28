// @vitest-environment jsdom
// Guard jalur async React di App.jsx (siklus 126): poll adaptif status gateway.
// Pola bug sama dgn scene (siklus 124–125: pollStatus/tvPull/pull):
//  1. fetch overlap — schedule() jalan segera setelah tick() MULAI, jadi poll
//     berikutnya bisa menyusul sebelum respons sebelumnya tiba; respons poll
//     LAMA yang tiba belakangan menimpa state (chip koneksi mundur, toast palsu).
//  2. respons in-flight saat unmount menulis state/log aktivitas komponen gugur.
// Diskriminasi stub: poll App SELALU berpasangan `tasks/paused` lalu `/tasks`
// segera sesudahnya — pemanggil `/tasks` lain (Ticker dll.) dibalas instan.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'

const mockSceneInstance = {
  isAudioMuted: vi.fn(() => false),
  setAudioMuted: vi.fn(),
  playTaskDone: vi.fn(),
  playTaskFail: vi.fn(),
  isCyberpunk: () => false,
  toggleCyberpunk: vi.fn(),
  setTime: vi.fn(),
  destroy: vi.fn(),
}

vi.mock('../scene/OfficeScene', () => ({
  createOfficeScene: vi.fn(() => mockSceneInstance),
}))

import App from '../App'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    store: {},
    getItem(k) { return this.store[k] ?? null },
    setItem(k, v) { this.store[k] = v },
    removeItem(k) { delete this.store[k] },
  })
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const RUNNING1 = [{ id: 1, title: 'API invoice', agent_id: 'be1', status: 'running' }]
const DONE1 = [{ id: 1, title: 'API invoice', agent_id: 'be1', status: 'done' }]

function stubDeferredTasks() {
  const pending = new Map() // seq → resolve
  let seq = 0
  let armed = false // true tepat setelah `tasks/paused` poll App → `/tasks` berikutnya milik poll App
  vi.stubGlobal('fetch', vi.fn((url) => {
    const u = String(url)
    if (u.includes('tasks/paused')) {
      armed = true
      return Promise.resolve({ ok: true, json: async () => ({ paused: false }) })
    }
    if (u.includes('/tasks')) {
      if (armed) {
        armed = false
        const s = ++seq
        return new Promise((resolve) => { pending.set(s, resolve) })
      }
      // Ticker & lain-lain: instan (tidak didefer, tidak dihitung)
      return Promise.resolve({ ok: true, json: async () => ({ tasks: RUNNING1 }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  }))
  return {
    count: () => seq,
    async settle(s, tasks, opts = {}) {
      const res = pending.get(s)
      if (!res) throw new Error('poll ke-' + s + ' tidak ditemukan')
      pending.delete(s)
      await act(async () => {
        res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => ({ tasks }) })
      })
    },
  }
}

describe('App poll — guard rid (out-of-order & unmount)', () => {
  it('respons poll LAMA tiba belakangan → tidak menimpa status/toast poll BARU', async () => {
    const t = stubDeferredTasks()
    render(<App />)
    // poll #1 (mount) tertahan — poll #2 disulut via event 'online' SEBELUM #1 tiba
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, DONE1)    // respons poll BARU duluan → 0 jalan · 0 antri
    await waitFor(() => expect(screen.getByText('0 jalan · 0 antri')).toBeTruthy())
    await t.settle(1, RUNNING1) // respons poll LAMA menyusul → wajib diabaikan guard rid
    expect(screen.getByText('0 jalan · 0 antri')).toBeTruthy()
    expect(screen.queryByText(/Task #1 berjalan/)).toBeNull()
  })

  it('poll LAMA GAGAL tiba setelah poll BARU sukses → chip tak mundur ke offline/stale', async () => {
    const t = stubDeferredTasks()
    render(<App />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, DONE1)            // poll baru sukses → live, 0 jalan
    await waitFor(() => expect(screen.getByText('0 jalan · 0 antri')).toBeTruthy())
    await t.settle(1, [], { fail: true }) // poll lama gagal menyusul → wajib diabaikan
    expect(screen.getByText('0 jalan · 0 antri')).toBeTruthy()
    expect(screen.queryByText('Gateway offline')).toBeNull()
    const badge = document.querySelector('.ticker-conn')
    expect(badge?.className).not.toContain('ticker-conn-err')
  })

  it('unmount saat poll in-flight → respons telat tak menulis state/log aktivitas', async () => {
    let hangTasks = false
    let resolveHang = null
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.includes('tasks/paused')) return Promise.resolve({ ok: true, json: async () => ({ paused: false }) })
      if (u.includes('/tasks')) {
        if (hangTasks) return new Promise((resolve) => { resolveHang = resolve })
        return Promise.resolve({ ok: true, json: async () => ({ tasks: [{ id: 3, title: 'Build API', agent_id: 'be1', status: 'running' }] }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<App />)
    await waitFor(() => expect(screen.getByText('1 jalan · 0 antri')).toBeTruthy())
    // poll #2 menggantung (tasks defer) → unmount → respons telat resolve
    hangTasks = true
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(resolveHang).toBeTruthy()
    unmount()
    await act(async () => {
      resolveHang({ ok: true, json: async () => ({ tasks: [{ id: 3, title: 'Build API', agent_id: 'be1', status: 'done' }] }) })
    })
    const errs = errSpy.mock.calls.map((a) => String(a[0])).filter((s) => /act\(|unmounted|Can't perform/i.test(s))
    expect(errs).toHaveLength(0)
    const log = JSON.parse(localStorage.getItem('wfs_activity') || '[]')
    expect(log.filter((e) => e.id === 3 && e.status === 'done')).toHaveLength(0)
    errSpy.mockRestore()
  })
})
