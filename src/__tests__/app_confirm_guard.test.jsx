// @vitest-environment jsdom
// Guard rid doConfirm (pause/resume ALL) — siklus 137, pola siklus 132/135:
// respons POST pause/resume LAMA yang telat (dialog ditutup / dibuka ulang)
// TIDAK boleh (a) menutup dialog BARU via setConfirm(null), (b) menaikkan toast
// basi, (c) menghapus busy generasi baru (dialog BARU harus langsung siap).
// Stub: poll `tasks/paused` + `/tasks` instan (paused dari state.verbose);
// POST pause_all/resume_all di-DEFER consume-once (settle ulang slot = error —
// mencegah test palsu yang me-resolve promise sudah-settle).
// Catatan: toolbar hanya menampilkan SATU tombol (resume saat paused, pause
// saat tidak) — mode dialog per-test ditentukan lewat state.paused awal.
// Tombol konfirmasi dialog berganti label "Memproses…" saat busy → helper
// confirmBtn() mencocokkan kedua label.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'

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

function stubDeferredConfirm({ paused = false } = {}) {
  const state = { paused }
  const pending = new Map() // 'pause_all' | 'resume_all' → [resolve, …] FIFO (POST overlap diperbolehkan)
  const calls = []
  const hold = (kind, resolve) => {
    if (!pending.has(kind)) pending.set(kind, [])
    pending.get(kind).push(resolve)
  }
  vi.stubGlobal('fetch', vi.fn((url, opts = {}) => {
    const u = String(url)
    const m = (opts.method || 'GET').toUpperCase()
    if (m === 'POST' && u.includes('pause_all')) {
      calls.push('POST pause_all')
      return new Promise((resolve) => hold('pause_all', resolve))
    }
    if (m === 'POST' && u.includes('resume_all')) {
      calls.push('POST resume_all')
      return new Promise((resolve) => hold('resume_all', resolve))
    }
    // poll App + widget lain: instan
    if (u.includes('tasks/paused')) return Promise.resolve({ ok: true, json: async () => ({ paused: state.paused }) })
    if (u.includes('/tasks')) return Promise.resolve({ ok: true, json: async () => ({ tasks: [] }) })
    return Promise.resolve({ ok: true, json: async () => ({}) })
  }))
  return {
    calls, state,
    async settle(kind, body, opts = {}) {
      const q = pending.get(kind)
      if (!q || !q.length) throw new Error('POST ' + kind + ' tidak ditemukan / sudah dipakai (consume-once)')
      const res = q.shift() // slot tertua dulu
      await act(async () => {
        res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => body })
      })
    },
  }
}

const confirmBtn = () => screen.getByRole('button', { name: /Memproses…|Ya, (jeda|jalankan)/ })
const cancelBtn = () => screen.getByRole('button', { name: 'Batal' })

describe('App doConfirm — guard rid pause/resume (siklus 137): respons POST LAMA telat tak menulis generasi BARU', () => {
  it('pause menggantung → dialog ditutup (Batal) → dibuka ulang → respons LAMA telat sukses TIDAK menutup dialog BARU, toast basi TIDAK muncul', async () => {
    const t = stubDeferredConfirm()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jeda semua task' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' }))
    fireEvent.click(confirmBtn()) // POST #1 in-flight
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all']))
    expect(confirmBtn().disabled).toBe(true) // label kini "Memproses…"

    // user membatalkan dialog menggantung (Batal sengaja tidak disabled saat busy)
    fireEvent.click(cancelBtn())
    expect(screen.queryByRole('alertdialog')).toBeNull()

    // dialog BARU (generasi 2) dibuka
    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' }))
    const dlg = screen.getByRole('alertdialog')
    expect(confirmBtn().disabled).toBe(false) // busy basi di-reset saat buka

    // respons POST #1 LAMA tiba: sukses → TIDAK boleh menutup dialog BARU / toast basi
    await t.settle('pause_all', { cancelled: 2, reset: 5 })
    expect(screen.getByRole('alertdialog')).toBe(dlg) // dialog BARU masih terbuka
    expect(screen.queryByText(/Dijeda — 2 proses/)).toBeNull() // toast basi tidak muncul

    // dialog BARU tetap fungsional: submit generasi 2 jalan normal
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all', 'POST pause_all']))
    await t.settle('pause_all', { cancelled: 1, reset: 3 })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByText('Dijeda — 1 proses dihentikan, 3 task kembali pending')).toBeTruthy()
  })

  it('pause LAMA GAGAL telat (HTTP 503) setelah dialog dibuka ulang → toast 503 basi TIDAK muncul, dialog BARU tidak tertutup', async () => {
    const t = stubDeferredConfirm()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jeda semua task' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' }))
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all']))

    fireEvent.click(cancelBtn())
    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' })) // generasi baru
    const dlg = screen.getByRole('alertdialog')

    await t.settle('pause_all', {}, { fail: true, status: 503 })
    expect(screen.getByRole('alertdialog')).toBe(dlg) // dialog BARU tidak tertutup
    expect(screen.queryByText('HTTP 503')).toBeNull() // toast basi tidak muncul

    // generasi BARU submit sukses normal
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all', 'POST pause_all']))
    await t.settle('pause_all', { cancelled: 0, reset: 1 })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByText('Dijeda — 0 proses dihentikan, 1 task kembali pending')).toBeTruthy()
  })

  it('resume (paused) menggantung → tutup → buka ulang → POST resume LAMA telat sukses: dialog BARU utuh, toast "Dilanjutkan" basi TIDAK muncul', async () => {
    const t = stubDeferredConfirm({ paused: true })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lanjutkan semua task' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan semua task' }))
    fireEvent.click(confirmBtn()) // POST resume #1 in-flight
    await waitFor(() => expect(t.calls).toEqual(['POST resume_all']))

    fireEvent.click(cancelBtn())
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan semua task' }))
    const dlg = screen.getByRole('alertdialog')
    expect(confirmBtn().disabled).toBe(false)

    await t.settle('resume_all', { started: [9] })
    expect(screen.getByRole('alertdialog')).toBe(dlg)
    expect(screen.queryByText(/Dilanjutkan — 1 task/)).toBeNull() // toast basi

    // resume generasi BARU sukses normal
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST resume_all', 'POST resume_all']))
    await t.settle('resume_all', { started: [1, 2] })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByText('Dilanjutkan — 2 task dijalankan')).toBeTruthy()
  })

  it('submit menggantung → tutup tanpa resolve → buka ulang → tombol konfirmasi langsung aktif (busy basi di-reset saat buka)', async () => {
    const t = stubDeferredConfirm()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jeda semua task' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' }))
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all']))
    expect(confirmBtn().disabled).toBe(true)

    fireEvent.click(cancelBtn()) // tutup saat masih in-flight (respons #1 tak pernah settle)
    fireEvent.click(screen.getByRole('button', { name: 'Jeda semua task' }))
    expect(confirmBtn().disabled).toBe(false) // openConfirm mereset busy
    expect(confirmBtn().textContent).toBe('Ya, jeda') // label siap, bukan "Memproses…"

    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST pause_all', 'POST pause_all']))

    // (a) settle slot FIFO tertua = POST #1 LAMA, sukses → TIDAK menutup dialog BARU, toast basi TIDAK muncul
    await t.settle('pause_all', { cancelled: 9, reset: 9 })
    expect(screen.queryByRole('alertdialog')).toBeTruthy()
    expect(screen.queryByText(/Dijeda — 9 proses/)).toBeNull()

    // (b) settle slot POST #2 (BARU) sukses → dialog tertutup + toast milik generasi BARU
    await t.settle('pause_all', { cancelled: 3, reset: 1 })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(screen.queryByText(/Dijeda — 3 proses dihentikan, 1 task kembali pending/)).toBeTruthy())
  })

  it('alur normal tanpa gangguan tidak berubah: konfirmasi resume sukses → dialog tertutup + toast + POST 1x', async () => {
    const t = stubDeferredConfirm({ paused: true })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lanjutkan semua task' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan semua task' }))
    fireEvent.click(confirmBtn())
    await waitFor(() => expect(t.calls).toEqual(['POST resume_all']))
    t.state.paused = false // setelah resume sukses poll berikutnya melaporkan tak paused
    await t.settle('resume_all', { started: [4] })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(await screen.findByText('Dilanjutkan — 1 task dijalankan')).toBeTruthy()
    expect(t.calls).toEqual(['POST resume_all']) // tidak ada POST ganda
  })
})
