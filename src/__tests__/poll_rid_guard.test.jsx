// @vitest-environment jsdom
// Guard out-of-order poll (rid) — pola TaskBoard siklus 131 diperluas ke komponen
// poll tersisa (siklus 136): ProjectPanel (fetch langsung), TeamStats, Dashboard,
// SysMeter, Ticker (via lib/api). Skenario inti: interval TIDAK membatalkan poll
// in-flight sebelumnya → poll #2 menyusul, respons #2 (BARU) tiba lebih dulu, lalu
// respons #1 (LAMA) tiba belakangan — kode tanpa guard menimpa data BARU /
// menaikkan banner error basi.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import ProjectPanel from '../components/ProjectPanel'
import TeamStats from '../components/TeamStats'
import Dashboard from '../components/Dashboard'
import SysMeter from '../components/SysMeter'
import Ticker from '../components/Ticker'

vi.mock('../lib/api', () => ({ api: vi.fn() }))
import { api } from '../lib/api'

// consume-once deferred: settle ulang slot yang sama = error (mencegah test palsu
// yang me-resolve promise sudah-settle). Resolve dibungkus act() agar update state
// di dalam promise tidak memicu act-warning.
function makeDeferred() {
  const pending = new Map()
  const wait = (key) => new Promise((resolve, reject) => { pending.set(key, { resolve, reject }) })
  return {
    wait,
    async settle(key, value) {
      const res = pending.get(key)
      if (!res) throw new Error('slot ' + String(key) + ' tidak ditemukan / sudah dipakai')
      pending.delete(key)
      await act(async () => {
        if (value instanceof Error) res.reject(value) // reject sungguhan → jalur catch komponen
        else res.resolve(value)
      })
    },
  }
}

// Harness komponen berbasis api(): path tertentu di-defer, sisanya instan.
function deferredApi(deferredPath, instantByPath) {
  const d = makeDeferred()
  let seq = 0
  api.mockImplementation((path) => {
    if (path === deferredPath) { seq++; return d.wait(seq) }
    const v = instantByPath[path]
    if (v instanceof Error) return Promise.reject(v)
    return Promise.resolve(v)
  })
  return { d, count: () => seq }
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals() })

// —— ProjectPanel (fetch global /wfs-project, interval 15 dtk) ——————————————————
describe('ProjectPanel — guard poll out-of-order', () => {
  const DATA = (mark) => ({
    tasks: { total: 2, done: 1, running: 0, review: 0, failed: 0, pending: 1, recent: [{ id: 1, title: 'task-' + mark, status: 'pending' }] },
    saas: { online: true, stats: { tenants: 1, messages: 10 }, tenants: [] },
    agents: [],
  })

  function stubDeferred() {
    const d = makeDeferred()
    let seq = 0
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url) === '/wfs-project') { seq++; return d.wait(seq) }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }))
    return { d, count: () => seq }
  }

  const open = () => fireEvent.click(screen.getByRole('button', { name: /proyek/i }))
  const RESP = (data) => ({ ok: true, status: 200, json: async () => data }) // ProjectPanel pakai fetch langsung

  it('poll #2 (interval) sukses → respons poll #1 LAMA tiba belakangan tak menimpa data BARU', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stubDeferred()
    render(<ProjectPanel />)
    open()
    await waitFor(() => expect(t.count()).toBe(1)) // poll mount tertahan
    await act(async () => { vi.advanceTimersByTime(15000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, RESP(DATA('BARU')))
    expect(screen.getByText(/task-BARU/)).toBeTruthy()
    await t.d.settle(1, RESP(DATA('LAMA'))) // respons LAMA tiba belakangan
    expect(screen.queryByText(/task-LAMA/)).toBeNull() // kode lama: daftar mundur
    expect(screen.getByText(/task-BARU/)).toBeTruthy()
  })

  it('poll LAMA GAGAL tiba setelah poll BARU sukses → banner "Gagal memuat" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stubDeferred()
    render(<ProjectPanel />)
    open()
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(15000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, RESP(DATA('BARU')))
    expect(screen.getByText(/task-BARU/)).toBeTruthy()
    await t.d.settle(1, { ok: false, status: 503, json: async () => ({}) }) // poll LAMA gagal belakangan
    expect(screen.queryByText(/Gagal memuat data proyek/)).toBeNull() // kode lama: banner basi
    expect(screen.getByText(/task-BARU/)).toBeTruthy()
  })

  it('unmount saat poll menggantung → respons telat tidak menulis state (0 act-error)', async () => {
    const t = stubDeferred()
    const { unmount } = render(<ProjectPanel />)
    open()
    await waitFor(() => expect(t.count()).toBe(1))
    unmount() // respons #1 masih menggantung
    await t.d.settle(1, DATA('HANTU')) // tidak boleh throw act-error
  })
})

// —— TeamStats (api tasks + resources, interval 15 dtk) ————————————————————————
describe('TeamStats — guard poll out-of-order', () => {
  const RES = { containers: [{ name: 'sbx-be1', cpu: '1%', mem: '10MB', status: 'Up', load: 0.1, ram: 10 }] }
  const NEW = { tasks: [{ id: 2, title: 'Task BARU', agent_id: 'be1', status: 'done', files: "['a.js']" }] }
  const OLD = { tasks: [{ id: 1, title: 'Task LAMA', agent_id: 'be1', status: 'pending', files: "['b.js']" }] }

  function stub() { return deferredApi('tasks', { 'system/resources': RES }) }

  it('poll #2 sukses → respons poll #1 LAMA tiba belakangan tak menimpa data BARU', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(15000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, NEW)
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
    await t.d.settle(1, OLD)
    expect(screen.queryByText(/Task LAMA/)).toBeNull() // kode lama: daftar mundur
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
  })

  it('poll LAMA GAGAL setelah poll BARU sukses → banner "Gateway offline" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(15000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, NEW)
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
    await t.d.settle(1, new Error('HTTP 503'))
    expect(screen.queryByText(/Gateway offline/)).toBeNull() // kode lama: banner basi
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
  })
})

// —— Dashboard (4 endpoint batch via allSettled, interval 10 dtk) ———————————————
describe('Dashboard — guard poll out-of-order', () => {
  const INSTANT = { tasks: { tasks: [] }, projects: { projects: [] }, 'system/resources': {} }

  function stub() { return deferredApi('dashboard/stats', INSTANT) }

  it('batch #2 sukses → batch #1 LAMA (stats berbeda) tiba belakangan tak menimpa data BARU', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<Dashboard onOpenBoard={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(10000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, { tasks_completed: 7 }) // api() mock: data mentah (bukan wrapper Response)
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy()) // kartu "Selesai"
    await t.d.settle(1, { tasks_completed: 3 })
    await waitFor(() => expect(screen.queryByText('3')).toBeNull()) // kode lama: data mundur ke batch LAMA
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('batch LAMA GAGAL setelah batch BARU sukses → banner "Data belum lengkap" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<Dashboard onOpenBoard={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(10000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, { tasks_completed: 7 })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await t.d.settle(1, new Error('HTTP 503')) // batch LAMA gagal belakangan
    expect(screen.queryByRole('alert')).toBeNull() // kode lama: banner basi muncul
  })
})

// —— SysMeter (2 endpoint via all, interval 12 dtk, widget selalu mounted) ———————
describe('SysMeter — guard poll out-of-order', () => {
  const HOST_NEW = { ok: true, agents: 15, disk_used_gb: 28.5, disk_total_gb: 49.1, uptime_s: 107526 }
  const HOST_OLD = { ok: true, agents: 9, disk_used_gb: 1, disk_total_gb: 2, uptime_s: 60 }
  const RES = { load: '4.71', ram_mb: '3833/7623' }

  function stub() { return deferredApi('status', { 'system/resources': RES }) }

  it('poll #2 sukses → respons poll #1 LAMA tiba belakangan tak menimpa data BARU', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<SysMeter />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(12000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, HOST_NEW)
    expect(screen.getByText('15 agent')).toBeTruthy()
    await t.d.settle(1, HOST_OLD)
    expect(screen.queryByText('9 agent')).toBeNull() // kode lama: data mundur
    expect(screen.getByText('15 agent')).toBeTruthy()
  })

  it('poll LAMA GAGAL setelah poll BARU sukses → "Gateway offline" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<SysMeter />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(12000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, HOST_NEW)
    expect(screen.getByText('15 agent')).toBeTruthy()
    await t.d.settle(1, new Error('offline'))
    expect(screen.queryByText('Gateway offline')).toBeNull() // kode lama: banner basi
    expect(screen.getByText('15 agent')).toBeTruthy()
  })

  it('respons telat pasca-unmount tidak menulis state (0 act-error)', async () => {
    const t = stub()
    const { unmount } = render(<SysMeter />)
    await waitFor(() => expect(t.count()).toBe(1))
    unmount() // stop = true
    await t.d.settle(1, HOST_NEW) // tidak boleh throw act-error
  })
})

// —— Ticker (3 endpoint batch via all, interval 20 dtk) —————————————————————————
describe('Ticker — guard poll out-of-order', () => {
  const AGENTS = [{ id: 'a1', name: 'BUDI' }]
  const STATUS = { mem_total_mb: 8000, mem_available_mb: 4200 }
  const T_NEW = { tasks: [{ agent_id: 'a1', title: 'Task BARU', status: 'done' }] }
  const T_OLD = { tasks: [{ agent_id: 'a1', title: 'Task LAMA', status: 'failed' }] }

  function stub() { return deferredApi('tasks', { agents: AGENTS, status: STATUS }) }

  it('batch #2 sukses → batch #1 LAMA tiba belakangan tak menimpa teks BARU', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<Ticker />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(20000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, T_NEW)
    expect(screen.getAllByText(/Task BARU/).length).toBeGreaterThan(0) // marquee diduplikasi [...msgs, ...msgs]
    await t.d.settle(1, T_OLD)
    expect(screen.queryByText(/Task LAMA/)).toBeNull() // kode lama: marquee mundur
    expect(screen.getAllByText(/Task BARU/).length).toBeGreaterThan(0)
  })

  it('batch LAMA GAGAL setelah batch BARU sukses → "Gateway offline" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stub()
    render(<Ticker />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(20000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.d.settle(2, T_NEW)
    expect(screen.getAllByText(/Task BARU/).length).toBeGreaterThan(0)
    await t.d.settle(1, new Error('offline'))
    expect(screen.queryByText(/Gateway offline — mencoba lagi/)).toBeNull() // kode lama: basi muncul
    expect(screen.getAllByText(/Task BARU/).length).toBeGreaterThan(0)
  })

  it('respons telat pasca-unmount tidak menulis state (0 act-error)', async () => {
    const t = stub()
    const { unmount } = render(<Ticker />)
    await waitFor(() => expect(t.count()).toBe(1))
    unmount() // stop = true
    await t.d.settle(1, T_NEW) // tidak boleh throw act-error
  })
})
