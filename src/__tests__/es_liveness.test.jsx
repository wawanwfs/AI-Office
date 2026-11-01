// @vitest-environment jsdom
// Siklus 204 — liveness SSE jujur (EventSource ShConsole): sebelum siklus ini
// EventSource dibuat TANPA onopen/onerror. Saat stream mati (proxy :9503 atau
// gateway :8787 down, handshake gagal, koneksi putus):
//   - badge "● N log diterima realtime" + label "(realtime)" tetap tampil
//     selamanya dengan log STALE (klaim realtime palsu — kelas sama dgn badge
//     live palsu projectboard siklus 203);
//   - tidak ada umpan balik apa pun bahwa stream putus.
// Sekarang: state esState connecting|open|error mengikat badge + label jujur.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import ShConsole from '../components/ShConsole'

const OV = {
  projects: 2, tasks: 3, task_by_status: { done: 1, running: 1, pending: 1 },
  agents: 12, agent_by_status: { idle: 12 }, running_subtasks: 0, total_logs: 4,
  recent_logs: [{ level: 'INFO', message: 'log-historis', source: 'backend' }],
}

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
    ok: true, status: 200, json: async () => (String(url).includes('sh/overview') ? OV : {}),
  })))
}

// EventSource palsu dengan hook lifecycle lengkap + kontrol error/putus.
function makeES() {
  const instances = []
  class FakeES {
    constructor(url) {
      this.url = url
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      instances.push(this)
    }
    close() { this.closed = true }
  }
  vi.stubGlobal('EventSource', FakeES)
  return instances
}

beforeEach(() => { cleanup(); vi.restoreAllMocks(); stubFetch() })
afterEach(() => { vi.unstubAllGlobals() })

describe('ShConsole SSE liveness (siklus 204) — state koneksi stream jujur', () => {
  it('onopen → badge live + label "(realtime)"; frame log tampil', async () => {
    const instances = makeES()
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    expect(instances[0].onopen).toEqual(expect.any(Function))
    await act(async () => { instances[0].onopen() })
    instances[0].onmessage({ data: JSON.stringify({ type: 'log', data: { level: 'INFO', message: 'ok-204', source: 't' } }) })
    await waitFor(() => expect(screen.getByTestId('live-log-badge')).toBeTruthy())
    expect(screen.getByText(/1 log diterima realtime/)).toBeTruthy()
    expect(screen.getByText(/\(realtime\)/)).toBeTruthy()
    // TIDAK ada peringatan stale saat stream sehat
    expect(screen.queryByTestId('live-log-stale')).toBeNull()
  })

  it('sebelum onopen → TIDAK ada klaim realtime (label "menyambungkan…", badge absen)', async () => {
    makeES()
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    expect(screen.queryByTestId('live-log-badge')).toBeNull()
    expect(screen.getByText(/\(menyambungkan…\)/)).toBeTruthy()
    expect(screen.queryByTestId('live-log-stale')).toBeNull()
  })

  it('onerror → peringatan stale eksplisit + label "(terputus…)", badge live HILANG, log historis tetap', async () => {
    const instances = makeES()
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    await act(async () => { instances[0].onopen() })
    instances[0].onmessage({ data: JSON.stringify({ type: 'log', data: { level: 'INFO', message: 'frame-terakhir', source: 't' } }) })
    await waitFor(() => expect(screen.getByTestId('live-log-badge')).toBeTruthy())
    await act(async () => { instances[0].onerror() })
    // badge palsu hilang, peringatan stale muncul
    expect(screen.queryByTestId('live-log-badge')).toBeNull()
    expect(screen.getByTestId('live-log-stale')).toBeTruthy()
    expect(screen.getByText(/terputus — menampilkan log terakhir/)).toBeTruthy()
    // log stale (frame terakhir) + label jujur tetap tampil; baris historis
    // sudah tertimpa frame live (liveLogs menang) — cukup frame-terakhir
    expect(screen.getByText(/frame-terakhir/)).toBeTruthy()
  })

  it('reconnect sukses (onerror lalu onopen) → pemulihan ke badge live tanpa peringatan stale', async () => {
    const instances = makeES()
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    await act(async () => { instances[0].onerror() })
    expect(screen.getByTestId('live-log-stale')).toBeTruthy()
    await act(async () => { instances[0].onopen() })
    instances[0].onmessage({ data: JSON.stringify({ type: 'log', data: { level: 'INFO', message: 'pulih-204', source: 't' } }) })
    await waitFor(() => expect(screen.getByTestId('live-log-badge')).toBeTruthy())
    expect(screen.queryByTestId('live-log-stale')).toBeNull()
    expect(screen.getByText(/1 log diterima realtime/)).toBeTruthy()
  })

  it('cleanup drawer → ES ditutup; pesan telat setelah cleanup tak menulis badge/state (esAlive)', async () => {
    const made = []
    class FakeES2 {
      constructor() { this.onopen = null; this.onmessage = null; this.onerror = null; this.closed = false; made.push(this) }
      close() { this.closed = true }
    }
    vi.unstubAllGlobals()
    vi.stubGlobal('EventSource', FakeES2)
    stubFetch() // unstub di atas menghapus stub fetch dari beforeEach — pasang ulang
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ShConsole show onClose={() => {}} />)
    await screen.findByText('Task total')
    expect(made[0].onopen).toBeTruthy() // siklus 204: onopen terpasang
    rerender(<ShConsole show={false} onClose={() => {}} />)
    expect(made[0].closed).toBe(true)
    await act(async () => { made[0].onopen?.() }) // telat setelah cleanup
    rerender(<ShConsole show onClose={() => {}} />)
    // onopen telat (esAlive=false) tak boleh menghidupkan klaim realtime palsu
    expect(screen.queryByTestId('live-log-badge')).toBeNull()
    errSpy.mockRestore()
  })

  it('tanpa EventSource global (browser tua) → state error jujur, bukan klaim realtime', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('EventSource', undefined)
    stubFetch() // pasang ulang setelah unstub
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    expect(screen.getByText(/terputus — menampilkan log terakhir/)).toBeTruthy()
    expect(screen.queryByTestId('live-log-badge')).toBeNull()
  })
})
