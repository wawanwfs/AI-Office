// @vitest-environment jsdom
// Siklus 154 — SSE /wfs-api/events: kontrak payload yang dikonsumsi ShConsole.
//
// liveness.test.jsx (siklus 140) membuktikan EventSource TERBUKA ke /wfs-api/events
// (URL & lifecycle). Test ini menambah kontrak Payload: pesan es.onmessage
// harus mengubah liveLogs persis seperti frontend memproses frame server
// (`j.type==='log' && j.data` → prepended, maks 30) — replay murni dari pesan
// server nyata (frame tersimpan dari stream produksi, tanpa EventSource global).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import ShConsole from '../components/ShConsole'

// Frame SSE tercatat dari gateway produksi (probe raw siklus 154):
// data: {"type":"log","data":{"id":31,"message":"Task #31 'Uji SSE manual 154'
// -> pending","level":"info","source":"sse154",...}}\n\n
const FRAME_LOG = {
  type: 'log',
  data: {
    id: 31,
    message: "Task #31 'Uji SSE manual 154' -> pending",
    level: 'info',
    source: 'sse154',
    project_id: 'proj-demo',
    created_at: 1793270807.1887844,
  },
}
const FRAME_CONNECTED = { type: 'connected', software_house: 'WFS PROJECT', derived: true }

const OV = {
  projects: 2, tasks: 3, task_by_status: { done: 1, running: 1, pending: 1 },
  agents: 12, agent_by_status: { idle: 12 }, running_subtasks: 0, total_logs: 4,
  recent_logs: [{ level: 'INFO', message: 'onboarding', source: 'backend' }],
}

function stubFetch(handlers) {
  const fn = vi.fn(async (url, opts) => {
    const h = handlers[url]
    if (!h) throw new Error('no stub for ' + url)
    const data = typeof h === 'function' ? await h(url, opts) : h
    return { ok: true, status: 200, json: async () => data }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function makeES() {
  // EventSource palsu: buka, tapi pesan disuntik manual — TIDAK memicu
  // onopen/onerror global lain; pesan = fungsi pemicu dgn akses ke instance.
  const instances = []
  class FakeES {
    constructor(url) {
      this.url = url
      this.onmessage = null
      this.onerror = null
      instances.push(this)
    }
    close() { this.closed = true }
  }
  vi.stubGlobal('EventSource', FakeES)
  return instances
}

beforeEach(() => { cleanup(); vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('SSE events — kontrak payload → liveLogs ShConsole', () => {
  it('payload log nyata → baris muncul di log realtime + badge live "1 log diterima realtime"', async () => {
    const instances = makeES()
    stubFetch({ '/wfs-api/sh/overview': OV })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy() // tab Overview default
    // frontend membuka stream saat tab Overview terbuka
    expect(instances.length).toBeGreaterThan(0)
    // kirim frame log (persis seperti es.onmessage menerima data server)
    instances[0].onmessage({ data: JSON.stringify(FRAME_LOG) })
    await waitFor(() => {
      expect(screen.getByText(/Task #31 'Uji SSE manual 154' -> pending/)).toBeTruthy()
    })
    // badge bukti stream hidup (frontend baru siklus 154)
    expect(screen.getByTestId('live-log-badge')).toBeTruthy()
    expect(screen.getByText(/1 log diterima realtime/)).toBeTruthy()
  })

  it('connected TIDAK menghasilkan baris log (bukan log palsu); log historis tetap tampil saat stream diam', async () => {
    const instances = makeES()
    stubFetch({ '/wfs-api/sh/overview': OV })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    instances[0].onmessage({ data: JSON.stringify(FRAME_CONNECTED) })
    // frame connected bukan log — baris historis tetap, tak ada baris live
    expect(screen.getByText(/onboarding/)).toBeTruthy()
    expect(screen.queryByText(/log diterima realtime/)).toBeNull()
    expect(screen.queryByText(/software_house/)).toBeNull()
  })

  it('30 frame → list terpotong 30 terbaru (guard slice), badge = baris live terpotong', async () => {
    const instances = makeES()
    stubFetch({ '/wfs-api/sh/overview': OV })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Task total')).toBeTruthy()
    for (let i = 1; i <= 32; i++) {
      instances[0].onmessage({ data: JSON.stringify({
        type: 'log',
        data: { id: 100 + i, message: `Task #${100 + i} 'gen' -> running`, level: 'info', source: 'be1' },
      }) })
    }
    await waitFor(() => {
      // badge = jumlah baris live yang DIPEGANG state (terpotong 30), bukan
      // total frame diterima — pola slice(0,30) frontend yang diuji barisnya
      expect(screen.getByText(/30 log diterima realtime/)).toBeTruthy()
    })
    const rows = screen.getAllByText(/'gen' -> running/)
    expect(rows.length).toBe(30) // state terpotong 30 (pola slice(0,30) frontend)
    // terbaru dulu: id 132 di baris pertama, id 103 (32-30+1) baris terakhir
    expect(rows[0].textContent).toContain('#132')
    expect(rows[29].textContent).toContain('#103')
  })
})
