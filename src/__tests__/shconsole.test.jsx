// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ShConsole from '../components/ShConsole'

const OV = {
  projects: 2, tasks: 3, task_by_status: { done: 1, running: 1, pending: 1 },
  agents: 12, agent_by_status: { idle: 12 }, running_subtasks: 0, total_logs: 4,
  recent_logs: [{ level: 'INFO', message: 'onboarding', source: 'backend' }],
}
const PROJ_RESP = {
  projects: [{ id: '1', name: 'Demo', description: 'demo', status: 'running', preview_url: '/preview/demo/' }],
}

function stubFetch(handlers) {
  const fn = vi.fn(async (url, opts) => {
    const method = (opts?.method || 'GET').toUpperCase()
    const h = handlers[url] || handlers[`${method} ${url}`]
    if (!h) { throw new Error('no stub for ' + method + ' ' + url) }
    const data = typeof h === 'function' ? await h(url, opts) : h
    return { ok: true, status: 200, json: async () => data }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => { cleanup(); vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('ShConsole — konsol software house', () => {
  it('tab Overview menampilkan statistik nyata dari API', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('2')).toBeTruthy() // projects
    expect(screen.getAllByText('Agents').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Task per status')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
  })

  it('tab Projects menampilkan daftar + tombol preview', async () => {
    stubFetch({ '/wfs-api/projects': PROJ_RESP })
    render(<ShConsole show onClose={() => {}} />)
    fireEvent.click(screen.getByText('Projects'))
    expect(await screen.findByText('Demo')).toBeTruthy()
    expect(screen.getByText('Buka Preview ↗')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
  })

  it('membuat project via POST lalu pindah ke daftar Projects', async () => {
    const calls = []
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': (url, opts) => {
        calls.push(opts?.method || 'GET')
        return opts?.method === 'POST' ? { ok: true } : PROJ_RESP
      },
    })
    render(<ShConsole show onClose={() => {}} />)
    fireEvent.click(screen.getByText('Project Baru'))
    fireEvent.change(screen.getByLabelText('Nama project'), { target: { value: 'Aplikasi Baru' } })
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'build web app' } })
    fireEvent.click(screen.getByText('Buat project & jalankan container'))
    expect(await screen.findByText('Demo')).toBeTruthy() // pindah ke daftar
    expect(calls).toContain('POST')
  })
})
