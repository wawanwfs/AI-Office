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
    // a11y: log realtime hidup dalam live region log (diumumkan ke pembaca layar)
    const logRegion = screen.getByRole('log')
    expect(logRegion.getAttribute('aria-live')).toBe('polite')
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

  it('tab Workspace: pilih project → file list → buka file → git commit → restart container', async () => {
    const commits = []
    const acts = []
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'src', type: 'dir' }, { name: 'Dockerfile', type: 'file', size: 120 }] },
      '/wfs-api/projects/1/file?path=Dockerfile': { path: 'Dockerfile', content: 'FROM python:3.12-slim' },
      '/wfs-api/projects/1/logs?lines=100': { logs: ['INFO line'] },
      '/wfs-api/projects/1/git': { repo: false },
      '/wfs-api/projects/1/git/commit': () => { commits.push('commit'); return { ok: true, committed: true } },
      '/wfs-api/projects/1/sandbox/restart': () => { acts.push('restart'); return { ok: true, running: true } },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    expect(await screen.findByLabelText('Pilih project')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    expect(await screen.findByText(/Dockerfile/)).toBeTruthy()
    // a11y: output terminal memakai live region status (diumumkan ke pembaca layar)
    expect(screen.getByRole('status').textContent).toMatch(/belum ada output/)
    fireEvent.click(screen.getByText(/Dockerfile/))
    expect(await screen.findByText(/FROM python:3.12-slim/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pesan commit'), { target: { value: 'init' } })
    fireEvent.click(screen.getByText('Init + Commit'))
    await waitFor(() => expect(commits).toContain('commit'))
    fireEvent.click(screen.getByText(/Restart/))
    await waitFor(() => expect(acts).toContain('restart'))
  })

  it('a11y: konten file & log container terekspos sebagai region berlabel', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'src', type: 'dir' }, { name: 'Dockerfile', type: 'file', size: 120 }] },
      '/wfs-api/projects/1/file?path=Dockerfile': { path: 'Dockerfile', content: 'FROM python:3.12-slim' },
      '/wfs-api/projects/1/logs?lines=100': { logs: ['INFO line'] },
      '/wfs-api/projects/1/git': { repo: false },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    expect(await screen.findByLabelText('Pilih project')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    expect(await screen.findByText(/Dockerfile/)).toBeTruthy()
    // log container: region berlabel (bukan <pre> telanjang)
    expect(screen.getByRole('region', { name: 'Container logs' })).toBeTruthy()
    fireEvent.click(screen.getByText(/Dockerfile/))
    // konten file terbuka: region berlabel nama file (bukan <pre> telanjang)
    const fileRegion = await screen.findByRole('region', { name: 'Isi file Dockerfile' })
    expect(fileRegion.textContent).toMatch(/FROM python:3.12-slim/)
  })

  it('a11y: git status & log commit terekspos sebagai region berlabel saat repo ada', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'Dockerfile', type: 'file', size: 120 }] },
      '/wfs-api/projects/1/file?path=Dockerfile': { path: 'Dockerfile', content: 'FROM python:3.12-slim' },
      '/wfs-api/projects/1/logs?lines=100': { logs: ['INFO line'] },
      '/wfs-api/projects/1/git': { repo: true, branch: 'main', status: 'working tree bersih', log: 'abc123 fix(x): init' },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    expect(await screen.findByLabelText('Pilih project')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    expect(await screen.findByRole('region', { name: 'Status git' })).toBeTruthy()
    const logRegion = screen.getByRole('region', { name: 'Log commit' })
    expect(logRegion.textContent).toContain('abc123')
  })

  it('tab Workspace: entri file dapat diakses keyboard (Enter/Space + peran button)', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'src', type: 'dir' }, { name: 'Dockerfile', type: 'file', size: 120 }] },
      '/wfs-api/projects/1/file?path=Dockerfile': { path: 'Dockerfile', content: 'FROM python:3.12-slim' },
      '/wfs-api/projects/1/logs?lines=100': { logs: ['INFO line'] },
      '/wfs-api/projects/1/git': { repo: false },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    expect(await screen.findByLabelText('Pilih project')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    expect(await screen.findByText(/Dockerfile/)).toBeTruthy()
    // baris file ber-peran tombol & fokusable (a11y keyboard)
    const row = screen.getByRole('button', { name: /Dockerfile/ })
    expect(row.getAttribute('tabindex')).toBe('0')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(await screen.findByText(/FROM python:3.12-slim/)).toBeTruthy()
  })

  it('a11y: entri file mengekspos nama aksesibel eksplisit (Folder/File + nama)', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'src', type: 'dir' }, { name: 'Dockerfile', type: 'file', size: 120 }] },
      '/wfs-api/projects/1/file?path=Dockerfile': { path: 'Dockerfile', content: 'FROM python:3.12-slim' },
      '/wfs-api/projects/1/logs?lines=100': { logs: ['INFO line'] },
      '/wfs-api/projects/1/git': { repo: false },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    expect(await screen.findByLabelText('Pilih project')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    // nama aksesibel eksplisit (bukan cuma teks + emoji) untuk pembaca layar
    expect(await screen.findByRole('button', { name: 'Folder: src' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'File: Dockerfile' })).toBeTruthy()
  })
  it('tab Approvals: list pending + putuskan', async () => {
    const calls = []
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/approvals': (url, opts) => {
        if ((opts?.method || 'GET') === 'POST') { calls.push('create'); return { ok: true } }
        return { approvals: [{ id: 'a1', action_type: 'project_launch', project_id: '2', description: 'Setujui POS', status: 'pending' }] }
      },
      '/wfs-api/approvals/a1/decide': () => { calls.push('decide'); return { ok: true } },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Approvals')
    expect(await screen.findByText(/Setujui POS/)).toBeTruthy()
    fireEvent.click(screen.getByText('Setujui'))
    await waitFor(() => expect(calls).toContain('decide'))
  })

  it('a11y: error API ditampilkan dengan role=alert', async () => {
    stubFetch({ '/wfs-api/sh/overview': () => { throw new Error('gateway down') } })
    render(<ShConsole show onClose={() => {}} />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/gateway down/)
  })

  it('a11y: fokus pindah ke dalam drawer dan Esc menutup', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV })
    const onClose = vi.fn()
    render(<ShConsole show onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: 'Tutup konsol' })
    // fokus dipindahkan ke tombol tutup (elemen focusable pertama drawer)
    await waitFor(() => expect(document.activeElement).toBe(closeBtn))
    // Esc menutup drawer (pola useDialogA11y)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a11y: tab aktif menyatakan state tertekan (aria-pressed)', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV, '/wfs-api/projects': PROJ_RESP })
    render(<ShConsole show onClose={() => {}} />)
    const overviewTab = screen.getByRole('button', { name: 'Tab Overview' })
    const projectsTab = screen.getByRole('button', { name: 'Tab Projects' })
    expect(overviewTab.getAttribute('aria-pressed')).toBe('true')
    expect(projectsTab.getAttribute('aria-pressed')).toBe('false')
    clickTab('Projects')
    expect(projectsTab.getAttribute('aria-pressed')).toBe('true')
    expect(overviewTab.getAttribute('aria-pressed')).toBe('false')
  })

  it('a11y: backdrop scrim dekoratif memakai role=presentation (tersembunyi dari pembaca layar)', async () => {
    stubFetch({ '/wfs-api/sh/overview': OV })
    const { container } = render(<ShConsole show onClose={() => {}} />)
    await screen.findByText('Agent total')
    const scrim = container.querySelector('[role="presentation"]')
    expect(scrim).toBeTruthy()
    // dialog tetap terekspos dengan peran & nama yang benar
    expect(screen.getByRole('dialog', { name: 'Konsol Software House' })).toBeTruthy()
  })

  it('Overview tahan response tanpa recent_logs (guard null-safe)', async () => {
    const partial = { ...OV }
    delete partial.recent_logs
    stubFetch({ '/wfs-api/sh/overview': partial })
    render(<ShConsole show onClose={() => {}} />)
    expect(await screen.findByText('Belum ada log.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('tab Workspace: ganti project mengosongkan draf pesan commit', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': { projects: [
        { id: '1', name: 'Demo', description: 'demo', status: 'running' },
        { id: '2', name: 'Lain', description: 'lain', status: 'idle' },
      ] },
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'Dockerfile', type: 'file', size: 10 }] },
      '/wfs-api/projects/1/logs?lines=100': { logs: [] },
      '/wfs-api/projects/1/git': { repo: true, branch: 'main', status: '(bersih)', log: '' },
      '/wfs-api/projects/2/files': { path: '', entries: [] },
      '/wfs-api/projects/2/logs?lines=100': { logs: [] },
      '/wfs-api/projects/2/git': { repo: true, branch: 'main', status: '(bersih)', log: '' },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    await screen.findByLabelText('Pilih project')
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    await screen.findByText(/Dockerfile/)
    fireEvent.change(screen.getByLabelText('Pesan commit'), { target: { value: 'draf lama' } })
    expect(screen.getByLabelText('Pesan commit').value).toBe('draf lama')
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '2' } })
    // draf commit tidak boleh bocor ke project lain (tunggu git info project baru dimuat)
    await waitFor(() => expect(screen.getByLabelText('Pesan commit').value).toBe(''))
  })

  it('tab Projects: tombol Workspace melompat ke tab workspace dengan project terpilih', async () => {
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'src', type: 'dir' }] },
      '/wfs-api/projects/1/logs?lines=100': { logs: [] },
      '/wfs-api/projects/1/git': { repo: false },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Projects')
    fireEvent.click(await screen.findByRole('button', { name: 'Workspace' }))
    expect(screen.getByRole('button', { name: 'Tab Workspace' }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(screen.getByLabelText('Pilih project').value).toBe('1'))
    expect(await screen.findByText(/src/)).toBeTruthy()
  })

  it('tab Tasks: filter project memicu ?project dan Jalankan Semua Pending memanggil resume_all', async () => {
    const urls = []
    const resumeBodies = []
    const fn = stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/tasks': (u) => { urls.push(u); return { tasks: [{ id: 1, title: 'Buat Login', role: 'frontend', status: 'pending' }] } },
      '/wfs-api/tasks?project=1': (u) => { urls.push(u); return { tasks: [{ id: 2, title: 'Task proyek 1', role: 'backend', status: 'review' }] } },
      '/wfs-api/tasks/resume_all': (u, opts) => { resumeBodies.push(opts?.body); return { ok: true, started: [2] } },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Tasks')
    await waitFor(() => expect(urls.some((x) => x.includes('/wfs-api/tasks'))).toBe(true))
    fireEvent.change(screen.getByLabelText('Filter project'), { target: { value: '1' } })
    await waitFor(() => expect(urls.some((x) => x.includes('project=1'))).toBe(true))
    fireEvent.click(screen.getByText(/Jalankan Semua Pending/))
    await waitFor(() => expect(resumeBodies.some((b) => b && JSON.parse(b).project === '1')).toBe(true))
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('tab Workspace: pintasan Test Python memanggil exec dengan cmd pytest', async () => {
    const cmds = []
    stubFetch({
      '/wfs-api/sh/overview': OV,
      '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] },
      '/wfs-api/projects/1/logs?lines=100': { logs: [] },
      '/wfs-api/projects/1/git': { repo: false },
      '/wfs-api/projects/1/exec': (u, opts) => { cmds.push(JSON.parse(opts.body).cmd); return { exit: 0, stdout: 'OK', stderr: '' } },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    await screen.findByLabelText('Pilih project')
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    await screen.findByText(/Dockerfile/)
    fireEvent.click(screen.getByText(/Test Python/))
    await waitFor(() => expect(cmds.some((c) => c.includes('pytest'))).toBe(true))
  })
})
