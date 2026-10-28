// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
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
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Demo.*#1.*pending.*review.*failed/))
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('bulk execution requires global scope confirmation and prevents duplicate submissions', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    let rejectRun
    const run = vi.fn(() => new Promise((resolve, reject) => { rejectRun = reject }))
    stubFetch({
      '/wfs-api/sh/overview': OV, '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/tasks': TASKS_RESP, '/wfs-api/tasks/resume_all': run,
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Tasks')
    await screen.findByText(/#1 Buat Login/)
    const button = screen.getByText(/Jalankan Semua Pending/)
    fireEvent.click(button)
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/SEMUA PROJECT.*pending.*review.*failed/))
    expect(run).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(run).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(screen.getByLabelText('Filter project').disabled).toBe(true)
    expect(JSON.parse(run.mock.calls[0][1].body)).toEqual({ project: null })
    rejectRun(new Error('bulk failed'))
    expect((await screen.findByRole('alert')).textContent).toContain('bulk failed')
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(screen.getByLabelText('Filter project').disabled).toBe(false)
  })

  it('Node preset keeps failed tests distinct from missing package/runner', async () => {
    const cmds = []
    stubFetch({
      '/wfs-api/sh/overview': OV, '/wfs-api/projects': PROJ_RESP,
      '/wfs-api/projects/1/files': { entries: [] },
      '/wfs-api/projects/1/logs?lines=100': { logs: [] },
      '/wfs-api/projects/1/git': { repo: false },
      '/wfs-api/projects/1/exec': (u, opts) => {
        cmds.push(JSON.parse(opts.body).cmd)
        return { exit: 1, stdout: 'tests failed', stderr: '' }
      },
    })
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    await screen.findByText('Demo')
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    fireEvent.click(screen.getByText(/Test Node/))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Exit status: 1'))
    expect(cmds[0]).not.toMatch(/npm test.*\|\| echo/)
    expect(cmds[0]).toContain('if [ ! -f package.json ]')
    expect(cmds[0]).toContain('command -v npm')
    expect(screen.getByRole('status').textContent).toContain('tests failed')
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
    expect(cmds[0]).not.toContain('|| true')
    expect(screen.getByRole('status').textContent).toContain('Exit status: 0')
  })
})

// Siklus 127 — guard jalur async poll overview (rid) + EventSource (esAlive).
// Diskriminasi: respons poll LAMA yang settle belakangan TIDAK boleh menimpa
// data poll BARU, dan respons/event telat setelah cleanup TIDAK boleh menulis
// state komponen (banner err basi di tab lain / live log komponen mati).
describe('ShConsole — guard poll overview & EventSource (out-of-order, cleanup)', () => {
  afterEach(() => { vi.useRealTimers() })

  function marker(projects) {
    return { ...OV, projects }
  }

  function stubDeferredOverview() {
    const pending = new Map() // seq → resolve
    let seq = 0
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('sh/overview')) {
        const s = ++seq
        return new Promise((resolve) => { pending.set(s, resolve) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    return {
      count: () => seq,
      async settle(s, data, opts = {}) {
        const res = pending.get(s)
        if (!res) throw new Error('poll ke-' + s + ' tidak ditemukan')
        pending.delete(s)
        await act(async () => {
          res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => data })
        })
      },
    }
  }

  it('respons poll LAMA tiba belakangan → tidak menimpa data poll BARU (out-of-order)', async () => {
    // Interval 10 dtk: fake timers hybrid agar waitFor tetap jalan.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stubDeferredOverview()
    render(<ShConsole show onClose={() => {}} />)
    await waitFor(() => expect(t.count()).toBe(1)) // poll mount tertahan
    // Poll #2 disulut oleh interval 10 dtk pada instansi YANG SAMA (skenario
    // nyata: drawer terbuka, gateway lambat) — bukan unmount/remount (setState
    // instansi yang sudah gugur jadi no-op & tak membedakan apa pun).
    await act(async () => { vi.advanceTimersByTime(10000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, marker(9))   // poll BARU duluan → tampil 9
    expect(screen.getByText('9')).toBeTruthy()
    await t.settle(1, marker(2))   // poll LAMA menyusul → wajib diabaikan guard
    expect(screen.getByText('9')).toBeTruthy()
    expect(screen.queryByText('2')).toBeNull()
  })

  it('poll LAMA GAGAL tiba setelah poll BARU sukses → banner err basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stubDeferredOverview()
    render(<ShConsole show onClose={() => {}} />)
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(10000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, marker(9))          // poll baru sukses
    expect(screen.getByText('9')).toBeTruthy()
    await t.settle(1, {}, { fail: true }) // poll lama gagal menyusul
    expect(screen.queryByText(/HTTP 503/)).toBeNull()
    expect(screen.getByText('9')).toBeTruthy()
  })

  it('cleanup saat poll in-flight (drawer ditutup) → respons telat tak memunculkan banner saat drawer dibuka lagi', async () => {
    // ShConsole TIDAK pernah unmount (show=false hanya merender null, state
    // persist) — setState stale tetap hidup dan tampil saat drawer dibuka lagi.
    let hang = true
    let resolveHang = null
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('sh/overview')) {
        if (hang) { hang = false; return new Promise((res) => { resolveHang = res }) }
        return new Promise(() => {}) // poll drawer-dibuka-lagi sengaja menggantung (agar tak membersihkan err)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ShConsole show onClose={() => {}} />)
    await waitFor(() => expect(resolveHang).toBeTruthy())
    rerender(<ShConsole show={false} onClose={() => {}} />) // cleanup → ovRid++
    await act(async () => { resolveHang({ ok: false, status: 503, json: async () => ({}) }) })
    rerender(<ShConsole show onClose={() => {}} />)         // drawer dibuka lagi
    expect(screen.queryByText(/HTTP 503/)).toBeNull()       // kode lama: banner basi muncul
    errSpy.mockRestore()
  })

  it('pesan EventSource setelah drawer ditutup → live log "hantu" tak muncul saat dibuka lagi', async () => {
    const made = []
    class FakeES {
      constructor() { this._onmessage = null; this.closed = false; made.push(this) }
      set onmessage(fn) { this._onmessage = fn }
      get onmessage() { return this._onmessage }
      close() { this.closed = true }
    }
    vi.stubGlobal('EventSource', FakeES)
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({ ok: true, json: async () => (String(url).includes('sh/overview') ? marker(21) : {}) })))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(<ShConsole show onClose={() => {}} />)
    await screen.findByText('21')
    const esMsg = made[0].onmessage
    expect(typeof esMsg).toBe('function')
    rerender(<ShConsole show={false} onClose={() => {}} />)
    expect(made[0].closed).toBe(true) // ES ditutup di cleanup
    await act(async () => { esMsg({ data: JSON.stringify({ type: 'log', data: { level: 'INFO', message: 'ghost-log-entry', source: 'x' } }) }) })
    rerender(<ShConsole show onClose={() => {}} />)
    expect(screen.queryByText(/ghost-log-entry/)).toBeNull() // kode lama: log hantu tampil
    errSpy.mockRestore()
  })
})

describe('ShConsole — guard loader Workspace (files/file/logs/git): out-of-order, err basi, ganti project', () => {
  function stubDeferredWs(projects = [{ id: '1', name: 'Demo', description: 'demo', status: 'running' }, { id: '2', name: 'Lain', description: 'lain', status: 'idle' }]) {
    // deferred per prefix URL ws; /projects (pilihan select) & sisanya instan —
    // select TERKONTROL butuh <option> nyata agar value bisa diset jsdom.
    const resolvers = new Map() // prefix → [resolve, ...]
    const seq = new Map() // prefix → hitung fetch
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u === '/wfs-api/projects') return Promise.resolve({ ok: true, json: async () => ({ projects }) })
      for (const p of ['/files', '/file?path=', '/logs', '/git']) {
        if (u.includes('/wfs-api/projects/') && u.includes(p)) {
          const n = (seq.get(p) || 0) + 1
          seq.set(p, n)
          return new Promise((resolve) => {
            if (!resolvers.has(p)) resolvers.set(p, [])
            resolvers.get(p).push(resolve)
          })
        }
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    return {
      count: (p) => seq.get(p) || 0,
      async settle(p, i, data, opts = {}) {
        const arr = resolvers.get(p)
        const res = arr && arr[i]
        if (!res) throw new Error(p + ' #' + (i + 1) + ' tidak ditemukan / sudah dipakai')
        arr[i] = null
        await act(async () => {
          res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => data })
        })
      },
    }
  }

  async function openWs(t, { first = true } = {}) {
    let view
    if (first) {
      view = render(<ShConsole show onClose={() => {}} />)
      clickTab('Workspace')
      await screen.findByRole('option', { name: 'Demo' })
      fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    }
    // 3 fetch paralel: files, logs, git
    await waitFor(() => {
      expect(t.count('/files')).toBeGreaterThanOrEqual(1)
      expect(t.count('/logs')).toBeGreaterThanOrEqual(1)
      expect(t.count('/git')).toBeGreaterThanOrEqual(1)
    })
    return first ? { files: 0, logs: 0, git: 0, rerender: view.rerender } : null
  }

  it('files: navigasi folder — respons folder LAMA tiba belakangan tak menimpa daftar folder BARU', async () => {
    const t = stubDeferredWs()
    const idx = await openWs(t)
    await t.settle('/files', idx.files, { path: '', entries: [{ name: 'src', type: 'dir' }] })
    expect(await screen.findByRole('button', { name: 'Folder: src' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Folder: src' })) // masuk src → fetch #2 (menggantung)
    await waitFor(() => expect(t.count('/files')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) // refresh path src → fetch #3 (menggantung)
    await waitFor(() => expect(t.count('/files')).toBe(3))
    await t.settle('/files', 2, { path: 'src', entries: [{ name: 'main.jsx', type: 'file', size: 9 }] }) // BARU duluan
    expect(await screen.findByRole('button', { name: 'File: main.jsx' })).toBeTruthy()
    await t.settle('/files', 1, { path: 'src', entries: [{ name: 'App.jsx', type: 'file', size: 5 }] }) // LAMA menyusul
    expect(screen.queryByRole('button', { name: 'File: App.jsx' })).toBeNull() // kode lama: daftar mundur ke respons basi
    expect(screen.getByRole('button', { name: 'File: main.jsx' })).toBeTruthy()
    expect(screen.getByText(/^📁 File · src$/)).toBeTruthy() // heading wsPath="src" — teks JSX terpisah, anchor agar tak match div luar
    expect(screen.queryByText(/^📁 File · \/$/)).toBeNull() // kode lama: heading mundur ke root basi
  })

  it('files: refresh LAMA GAGAL setelah refresh BARU sukses → banner HTTP 503 basi tidak muncul', async () => {
    const t = stubDeferredWs()
    const idx = await openWs(t)
    await t.settle('/files', idx.files, { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] })
    expect(await screen.findByRole('button', { name: 'File: Dockerfile' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) // fetch #2 (menggantung — gateway lambat)
    await waitFor(() => expect(t.count('/files')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) // fetch #3 (menggantung)
    await waitFor(() => expect(t.count('/files')).toBe(3))
    await t.settle('/files', 2, { path: '', entries: [{ name: 'app.py', type: 'file' }] }) // refresh BARU sukses
    expect(await screen.findByRole('button', { name: 'File: app.py' })).toBeTruthy()
    await t.settle('/files', 1, {}, { fail: true }) // refresh LAMA gagal tiba belakangan
    expect(screen.queryByText(/HTTP 503/)).toBeNull() // kode lama: banner basi muncul
    expect(screen.getByRole('button', { name: 'File: app.py' })).toBeTruthy()
  })

  it('ganti project: respons file/log/git project LAMA tiba belakangan tak menulis panel project BARU', async () => {
    const t = stubDeferredWs()
    await openWs(t)
    await t.settle('/files', 0, { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] })
    await t.settle('/logs', 0, { logs: ['log-proyek-1'] })
    await t.settle('/git', 0, { repo: false })
    expect(await screen.findByRole('button', { name: 'File: Dockerfile' })).toBeTruthy()
    // Re-entering Workspace starts fresh project 1 requests. Leave these
    // pending: a settled promise cannot deliver a second response.
    clickTab('Overview')
    clickTab('Workspace')
    await waitFor(() => {
      for (const p of ['/files', '/logs', '/git']) expect(t.count(p)).toBe(2)
    })
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '2' } }) // ganti project
    await waitFor(() => {
      for (const p of ['/files', '/logs', '/git']) expect(t.count(p)).toBe(3)
    }) // fetch project 2 menggantung
    // project BARU tampil duluan
    await t.settle('/files', 2, { path: 'api', entries: [{ name: 'server.py', type: 'file' }] })
    await t.settle('/logs', 2, { logs: ['log-proyek-2'] })
    await t.settle('/git', 2, { repo: true, branch: 'main', status: 'bersih', log: 'xyz789 fitur' })
    expect(await screen.findByRole('button', { name: 'File: server.py' })).toBeTruthy()
    expect(screen.getByText('log-proyek-2')).toBeTruthy()
    // respons project LAMA (in-flight sejak sebelum ganti) tiba belakangan
    await t.settle('/files', 1, { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] })
    await t.settle('/logs', 1, { logs: ['log-proyek-1'] })
    await t.settle('/git', 1, { repo: false })
    expect(screen.queryByRole('button', { name: 'File: Dockerfile' })).toBeNull() // kode lama: daftar file mundur
    expect(screen.queryByText('log-proyek-1')).toBeNull()     // kode lama: log mundur
    expect(screen.getByRole('button', { name: 'File: server.py' })).toBeTruthy()
    expect(screen.getByText('log-proyek-2')).toBeTruthy()
    // git tetap milik project BARU (repo:true, branch main) — bukan repo:false
    expect(screen.getByText('branch: main')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Status git' }).textContent).toBe('bersih')
  })

  it('file: buka file A menggantung, file B tampil — isi file A telat tak menimpa file B (label region ikut benar)', async () => {
    const t = stubDeferredWs()
    const idx = await openWs(t)
    await t.settle('/files', idx.files, { path: '', entries: [{ name: 'a.py', type: 'file' }, { name: 'b.py', type: 'file' }] })
    expect(await screen.findByRole('button', { name: 'File: a.py' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'File: a.py' })) // fetch file #1 (gantung — gateway lambat)
    await waitFor(() => expect(t.count('/file?path=')).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'File: b.py' })) // fetch file #2 — sukses duluan
    await waitFor(() => expect(t.count('/file?path=')).toBe(2))
    await t.settle('/file?path=', 1, { path: 'b.py', content: 'ISI-B' })
    const regB = await screen.findByRole('region', { name: 'Isi file b.py' })
    expect(regB.textContent).toContain('ISI-B')
    await t.settle('/file?path=', 0, { path: 'a.py', content: 'ISI-A' }) // #1 (LAMA) tiba belakangan
    expect(screen.queryByRole('region', { name: 'Isi file a.py' })).toBeNull() // kode lama: isi a menimpa b
    expect(screen.getByRole('region', { name: 'Isi file b.py' }).textContent).toContain('ISI-B')
  })

  it('cleanup (tutup drawer) saat fetch git menggantung → respons telat tak menulis setelah dibuka lagi', async () => {
    const t = stubDeferredWs()
    const idx = await openWs(t)
    await t.settle('/files', idx.files, { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] })
    await t.settle('/logs', idx.logs, { logs: [] })
    // git TIDAK disettle — menggantung
    await screen.findByRole('button', { name: 'File: Dockerfile' })
    // Visibility belongs to the parent; clicking a no-op onClose does not
    // close the controlled drawer or run its effect cleanup.
    idx.rerender(<ShConsole show={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await t.settle('/git', idx.git, { repo: true, branch: 'hacked-branch', status: 'x', log: 'z' }) // telat
    idx.rerender(<ShConsole show onClose={() => {}} />)
    // Assert before the fresh response can hide an incorrectly accepted stale one.
    expect(screen.queryByText(/hacked-branch/)).toBeNull()
    // drawer dibuka lagi → project masih terpilih (state persist) → 3 fetch baru
    await waitFor(() => expect(t.count('/git')).toBe(2))
    await t.settle('/git', 1, { repo: true, branch: 'main', status: 'bersih', log: 'abc fitur' })
    const st = await screen.findByRole('region', { name: 'Status git' })
    expect(screen.getByText('branch: main')).toBeTruthy()
    expect(st.textContent).toBe('bersih')
    expect(screen.queryByText(/hacked-branch/)).toBeNull()
    expect(st.textContent).not.toContain('hacked-branch')
  })

  it('entries/logs non-array (gateway balas rusak) → render tetap aman, tidak crash', async () => {
    const t = stubDeferredWs()
    const idx = await openWs(t)
    await t.settle('/files', idx.files, {})              // tanpa entries, path undefined
    await t.settle('/logs', idx.logs, { logs: 'bukan-array' })
    await t.settle('/git', idx.git, null)
    expect(await screen.findByText('(folder kosong)')).toBeTruthy()
    expect(screen.getByText(/File · \//)).toBeTruthy()   // wsPath fallback ''
    expect(screen.getByText('(log kosong)')).toBeTruthy() // logs dinormalisasi []
    expect(screen.queryByRole('alert')).toBeNull()        // tak ada err
  })
})

describe('ShConsole — guard loader tab lain (projects/tasks/approvals): out-of-order & err basi', () => {
  function stubDeferred(paths) {
    // paths: array substring URL yang harus ditahan manual (deferred).
    // settle MEMAKAI resolver (consume-once): settle ulang slot yang sama =
    // error — mencegah test palsu yang me-resolve promise sudah-settle (no-op).
    const resolvers = new Map() // substring → [resolve, ...]
    const seq = new Map() // substring → hitung fetch
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      for (const p of paths) {
        if (u.includes(p)) {
          const n = (seq.get(p) || 0) + 1
          seq.set(p, n)
          return new Promise((resolve) => {
            if (!resolvers.has(p)) resolvers.set(p, [])
            resolvers.get(p).push(resolve)
          })
        }
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    return {
      count: (p) => seq.get(p) || 0,
      async settle(p, i, data, opts = {}) {
        const arr = resolvers.get(p)
        const res = arr && arr[i]
        if (!res) throw new Error(p + ' #' + (i + 1) + ' tidak ditemukan / sudah dipakai')
        arr[i] = null
        await act(async () => {
          res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, json: async () => data })
        })
      },
    }
  }

  it('projects: refresh LAMA menggantung, refresh BARU tampil → respons LAMA tiba belakangan tak menimpa daftar (out-of-order)', async () => {
    const t = stubDeferred(['/wfs-api/projects'])
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Projects')
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(1))
    await t.settle('/wfs-api/projects', 0, { projects: [{ id: '1', name: 'Pertama', description: 'a', status: 'running' }] })
    // settle #1 → daftar terisi → deps projects.length berubah → effect
    // memicu refetch otomatis (#2) — BIARKAN MENGANTUNG (gateway lambat).
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) // fetch #3 (manual)
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(3))
    await t.settle('/wfs-api/projects', 2, { projects: [{ id: '2', name: 'Kedua', description: 'b', status: 'running' }] })
    expect(screen.getByText('Kedua')).toBeTruthy()
    await t.settle('/wfs-api/projects', 1, { projects: [{ id: '0', name: 'Bas', description: 'x', status: 'idle' }] }) // #2 (LAMA) tiba belakangan
    expect(screen.queryByText('Bas')).toBeNull()   // kode lama: daftar mundur ke 'Bas'
    expect(screen.getByText('Kedua')).toBeTruthy()
  })

  it('projects: refresh LAMA GAGAL tiba setelah refresh BARU sukses → banner HTTP 503 basi tidak muncul', async () => {
    const t = stubDeferred(['/wfs-api/projects'])
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Projects')
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(1))
    await t.settle('/wfs-api/projects', 0, { projects: [{ id: '1', name: 'Pertama', description: 'a', status: 'running' }] })
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(2)) // refetch otomatis (#2) — menggantung
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })) // fetch #3 (manual)
    await waitFor(() => expect(t.count('/wfs-api/projects')).toBe(3))
    await t.settle('/wfs-api/projects', 2, { projects: [{ id: '2', name: 'Kedua', description: 'b', status: 'running' }] })
    expect(screen.getByText('Kedua')).toBeTruthy()
    await t.settle('/wfs-api/projects', 1, {}, { fail: true }) // #2 (LAMA) gagal tiba belakangan
    expect(screen.queryByText(/HTTP 503/)).toBeNull() // kode lama: banner basi muncul
    expect(screen.getByText('Kedua')).toBeTruthy()
  })

  it('tasks: ganti filter project — respons filter LAMA tak menimpa daftar filter BARU (out-of-order)', async () => {
    // Stub gabungan: tasks & projects deferred, sisanya instan.
    const resolvers = [] // tasks: index = seq
    const resProjects = []
    let tasksSeq = 0
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.includes('/wfs-api/tasks')) {
        const s = ++tasksSeq
        return new Promise((resolve) => { resolvers[s] = resolve })
      }
      if (u.includes('/wfs-api/projects')) return new Promise((resolve) => { resProjects.push(resolve) })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Tasks') // memuat tasks #1 (tanpa filter) + projects #1 paralel
    await waitFor(() => expect(tasksSeq).toBe(1))
    expect(resProjects.length).toBe(1)
    await act(async () => { resProjects[0]({ ok: true, json: async () => ({ projects: [{ id: '1', name: 'Demo', description: 'd', status: 'running' }] }) }) })
    // daftar project terisi → deps projects.length berubah → effect memicu
    // tasks #2 otomatis (masih tanpa filter) — BIARKAN MENGANTUNG.
    await waitFor(() => expect(tasksSeq).toBe(2))
    fireEvent.change(screen.getByLabelText('Filter project'), { target: { value: '1' } })
    await waitFor(() => expect(tasksSeq).toBe(3)) // fetch dengan ?project=1
    await act(async () => { resolvers[3]({ ok: true, json: async () => ({ tasks: [{ id: 2, title: 't-filter', role: 'qa', status: 'pending', agent_id: null }] }) }) })
    expect(await screen.findByText(/t-filter/)).toBeTruthy()
    await act(async () => { resolvers[1]({ ok: true, json: async () => ({ tasks: [{ id: 1, title: 't-semua', role: 'qa', status: 'pending', agent_id: null }] }) }) }) // #1 (LAMA) tiba belakangan
    expect(screen.queryByText(/t-semua/)).toBeNull() // kode lama: daftar mundur ke 'Semua project'
    expect(screen.getByText(/t-filter/)).toBeTruthy()
  })

  it('approvals: refresh hasil keputusan tak ditimpa GET LAMA yang menggantung lalu tiba belakangan', async () => {
    const BEFORE = { approvals: [{ id: 'a1', action_type: 'project_launch', project_id: '2', description: 'POS LAMA', status: 'pending' }] }
    const AFTER = { approvals: [{ id: 'a2', action_type: 'deploy', project_id: '3', description: 'List C', status: 'pending' }] }
    const resA = []
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (u.includes('/approvals') && u.includes('decide')) return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
      if (u.includes('/approvals')) return new Promise((resolve) => { resA.push(resolve) })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }))
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Approvals')
    await waitFor(() => expect(resA.length).toBe(1)) // GET #1
    await act(async () => { resA[0]({ ok: true, json: async () => BEFORE }) })
    fireEvent.click(await screen.findByText('Setujui')) // decide + refresh GET #2 (menggantung)
    await waitFor(() => expect(resA.length).toBe(2))
    // user pindah tab lalu kembali → GET #3 (paling baru)
    fireEvent.click(screen.getByRole('button', { name: 'Tab Agents' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tab Approvals' }))
    await waitFor(() => expect(resA.length).toBe(3))
    await act(async () => { resA[2]({ ok: true, json: async () => AFTER }) })
    expect(await screen.findByText('List C')).toBeTruthy()
    await act(async () => { resA[1]({ ok: true, json: async () => BEFORE }) }) // GET #2 (LAMA, pra-putuskan) tiba belakangan
    expect(screen.queryByText('POS LAMA')).toBeNull() // kode lama: list mundur ke pra-putuskan
    expect(screen.getByText('List C')).toBeTruthy()
  })
})

describe('ShConsole — guard aksi POST/exec (terminal, commit, sandbox, approval): out-of-order & basi', () => {
  function stubDeferred(deferred, instant = {}) {
    // deferred: {substring: null} — fetch URL yang match substring DITAHAN
    // manual (resolver consume-once). instant: {exactUrl: data} — balas instan
    // (EXACT-match: substring "/projects" ikut mencocokkan "/projects/1/files"
    // dan mengacaukan panel ws). Sisanya instan {}.
    const resolvers = []
    let seqD = 0
    const seq = new Map()
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url)
      if (Object.keys(deferred).some((p) => u.includes(p))) {
        const s = ++seqD
        return new Promise((resolve) => { resolvers[s] = resolve })
      }
      if (Object.prototype.hasOwnProperty.call(instant, u)) {
        const n = (seq.get(u) || 0) + 1
        seq.set(u, n)
        return Promise.resolve({ ok: true, status: 200, json: async () => instant[u] })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }))
    return {
      countD: () => seqD,
      count: (u) => seq.get(u) || 0,
      async settle(i, data, opts = {}) {
        const res = resolvers[i]
        if (!res) throw new Error('deferred #' + i + ' tidak ditemukan / sudah dipakai')
        resolvers[i] = null
        await act(async () => {
          res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => data })
        })
      },
    }
  }

  const WS_INSTANT = {
    '/wfs-api/projects': { projects: [{ id: '1', name: 'Demo', description: 'd', status: 'running' }] },
    '/wfs-api/projects/1/files': { path: '', entries: [{ name: 'Dockerfile', type: 'file' }] },
    '/wfs-api/projects/1/logs?lines=100': { logs: [] },
    '/wfs-api/projects/1/git': { repo: false },
  }

  async function openWs() {
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    await screen.findByRole('option', { name: 'Demo' })
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    await screen.findByRole('button', { name: 'File: Dockerfile' })
  }

  it('terminal: exec A menggantung, exec B tampil → output A telat tak menimpa output B', async () => {
    const t = stubDeferred({ '/exec': null }, WS_INSTANT)
    await openWs()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'sleep 5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' })) // exec #1 (menggantung)
    await waitFor(() => expect(t.countD()).toBe(1))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'ls /' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' })) // exec #2
    await waitFor(() => expect(t.countD()).toBe(2))
    await t.settle(2, { exit: 0, stdout: 'OUT-LS', stderr: '' }) // exec BARU selesai duluan
    expect(await screen.findByText(/OUT-LS/)).toBeTruthy()
    await t.settle(1, { exit: 0, stdout: 'OUT-SLEEP-LAMA', stderr: '' }) // exec LAMA telat
    expect(screen.queryByText(/OUT-SLEEP-LAMA/)).toBeNull() // kode lama: output mundur
    expect(screen.getByText(/OUT-LS/)).toBeTruthy()
  })

  it('terminal: exec LAMA GAGAL tiba setelah exec BARU sukses → ERROR basi tidak menimpa output valid', async () => {
    const t = stubDeferred({ '/exec': null }, WS_INSTANT)
    await openWs()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'lama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' }))
    await waitFor(() => expect(t.countD()).toBe(1))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'baru' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' }))
    await waitFor(() => expect(t.countD()).toBe(2))
    await t.settle(2, { exit: 0, stdout: 'OK-BARU', stderr: '' })
    expect(await screen.findByText(/OK-BARU/)).toBeTruthy()
    await t.settle(1, {}, { fail: true }) // exec LAMA gagal (503) tiba belakangan
    expect(screen.queryByText(/ERROR: HTTP 503/)).toBeNull() // kode lama: ERROR basi menimpa
    expect(screen.getByText(/OK-BARU/)).toBeTruthy()
  })

  it('terminal: preset Test Python menggantung, exec manual BARU tampil → hasil preset telat tak menimpa (termOut satu permukaan)', async () => {
    const t = stubDeferred({ '/exec': null }, WS_INSTANT)
    await openWs()
    fireEvent.click(screen.getByRole('button', { name: '▶ Test Python' })) // exec #1 (preset, menggantung)
    await waitFor(() => expect(t.countD()).toBe(1))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'echo hai' } })
    fireEvent.click(screen.getByRole('button', { name: 'Jalankan' })) // exec #2 (manual)
    await waitFor(() => expect(t.countD()).toBe(2))
    await t.settle(2, { exit: 0, stdout: 'hai', stderr: '' })
    expect(await screen.findByText(/Exit status: 0/)).toBeTruthy()
    await t.settle(1, { exit: 1, stdout: 'PYTEST-LAMA', stderr: 'err lama' }) // preset telat
    expect(screen.queryByText(/PYTEST-LAMA/)).toBeNull() // kode lama: hasil preset menimpa
    expect(screen.getByText(/Exit status: 0/)).toBeTruthy()
  })

  it('git commit LAMA GAGAL telat setelah commit BARU sukses → banner basi tidak muncul, gitMsg tetap kosong', async () => {
    const t = stubDeferred(
      { '/git/commit': null },
      { ...WS_INSTANT, '/wfs-api/projects/1/git': { repo: true, branch: 'main', status: 'bersih', log: 'abc fitur' } },
    )
    await openWs()
    expect(screen.getByText('branch: main')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Pesan commit'), { target: { value: 'lama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit' })) // #1 menggantung
    await waitFor(() => expect(t.countD()).toBe(1))
    fireEvent.change(screen.getByLabelText('Pesan commit'), { target: { value: 'baru' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit' })) // #2
    await waitFor(() => expect(t.countD()).toBe(2))
    await t.settle(2, { ok: true, committed: true }) // commit BARU sukses duluan
    await waitFor(() => expect(screen.getByLabelText('Pesan commit').value).toBe('')) // gitMsg di-reset
    await t.settle(1, {}, { fail: true }) // commit LAMA gagal tiba belakangan
    expect(screen.queryByText(/HTTP 503/)).toBeNull() // kode lama: banner basi
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Pesan commit').value).toBe('')
  })

  it('sandbox: tutup drawer saat aksi menggantung → kegagalan telat tak memunculkan banner saat dibuka lagi', async () => {
    const t = stubDeferred({ '/sandbox/stop': null }, WS_INSTANT)
    const view = render(<ShConsole show onClose={() => {}} />)
    clickTab('Workspace')
    await screen.findByRole('option', { name: 'Demo' })
    fireEvent.change(screen.getByLabelText('Pilih project'), { target: { value: '1' } })
    await screen.findByRole('button', { name: /Stop/ })
    fireEvent.click(screen.getByRole('button', { name: /Stop/ })) // POST menggantung
    await waitFor(() => expect(t.countD()).toBe(1))
    view.rerender(<ShConsole show={false} onClose={() => {}} />) // tutup drawer → cleanup konteks → rid naik
    await t.settle(1, {}, { fail: true }) // gagal telat
    view.rerender(<ShConsole show onClose={() => {}} />)
    await screen.findByRole('option', { name: 'Demo' })
    expect(screen.queryByText(/HTTP 503/)).toBeNull() // kode lama: banner basi saat dibuka lagi
  })

  it('approval: keputusan menggantung lalu pengguna ganti tab & kembali → kegagalan keputusan telat tak menaikkan banner', async () => {
    const t = stubDeferred(
      { '/decide': null },
      { '/wfs-api/approvals': { approvals: [{ id: 'a1', action_type: 'deploy', project_id: '3', description: 'POS', status: 'pending' }] } },
    )
    render(<ShConsole show onClose={() => {}} />)
    clickTab('Approvals')
    fireEvent.click(await screen.findByText('Setujui')) // POST menggantung
    await waitFor(() => expect(t.countD()).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Tab Agents' })) // konteks ganti → rid naik
    fireEvent.click(screen.getByRole('button', { name: 'Tab Approvals' }))
    await t.settle(1, {}, { fail: true }) // keputusan LAMA gagal telat
    expect(screen.queryByText(/HTTP 503/)).toBeNull() // kode lama: banner basi
  })
})
