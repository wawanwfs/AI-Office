// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import ShConsole from '../components/ShConsole'

const OV = {
  projects: 2, tasks: 3, task_by_status: { done: 1, running: 1, pending: 1 },
  agents: 12, agent_by_status: { idle: 12 }, running_subtasks: 0, total_logs: 4,
  recent_logs: [{ level: 'INFO', message: 'onboarding', source: 'backend' }],
}
const PROJ_RESP = {
  projects: [{ id: '1', name: 'Demo', description: 'demo', status: 'running', preview_url: '/preview/demo/' }],
}
const TASKS_RESP = {
  tasks: [{ id: 1, title: 'Buat Login', role: 'frontend', status: 'pending', agent_id: null }],
}
const AGENTS_RESP = [{ id: 'a1', name: 'Budi', role: 'backend', floor: 1, status: 'idle', model: 'gpt-4o-mini' }]

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

function clickTab(label) {
  fireEvent.click(screen.getByRole('button', { name: 'Tab ' + label }))
}

beforeEach(() => { cleanup(); vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('ShConsole — konsol software house', () => {
  it('tab Overview menampilkan statistik nyata dari API', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('2')).toBeTruthy() // projects
    expect(screen.getByText('Agent total')).toBeTruthy()
    expect(screen.getByText('Task per status')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
  })

  it('tab Projects menampilkan daftar + tombol preview', async () => {
    stubFetch({ '/wfs-api/projects': PROJ_RESP })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Projects')
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
    clickTab('Project Baru')
    fireEvent.change(screen.getByLabelText('Nama project'), { target: { value: 'Aplikasi Baru' } })
    fireEvent.change(screen.getByLabelText('Brief'), { target: { value: 'build web app' } })
    fireEvent.click(screen.getByText('Buat project & jalankan container'))
    expect(await screen.findByText('Demo')).toBeTruthy() // pindah ke daftar
    expect(calls).toContain('POST')
  })

  it('tab Tasks menampilkan daftar + bisa menjalankan task', async () => {
    const runCalls = []
    const fetchFn = stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/tasks': (url, opts) => {
        if ((opts?.method || 'GET') === 'POST') return { ok: true, task_id: 9 }
        return TASKS_RESP
      },
      '/wfs-api/tasks/1/run': () => { runCalls.push('run'); return { ok: true } },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Tasks')
    await waitFor(() => expect(fetchFn.mock.calls.some((c) => c[0] === '/wfs-api/tasks')).toBe(true))
    expect(await screen.findByText(/#1 Buat Login/)).toBeTruthy()
    fireEvent.click(screen.getByText('Jalankan'))
    await waitFor(() => expect(runCalls).toContain('run'))
  })

  it('tab Agents menampilkan daftar agent + lantai', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV, '/wfs-api/agents': AGENTS_RESP })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Agents')
    expect(await screen.findByText('Budi')).toBeTruthy()
    expect(screen.getByText(/Lantai 1/)).toBeTruthy()
  })
})
