// @vitest-environment jsdom
// Unit test ProjectWorkspaceModal (workspace proyek: preview, file explorer,
// terminal, QA report) — komponen UI tanpa test langsung sebelumnya. Kode
// komponen TIDAK diubah; fetch di-stub penuh lewat vi.stubGlobal.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ProjectWorkspaceModal from '../components/ProjectWorkspaceModal'

const PROJECT = {
  id: 'p1',
  name: 'Demo Proyek',
  status: 'running',
  preview_port: 3100,
  workspace_path: '/data/sandbox/demo',
  preview_url: 'https://preview.example/demo/',
}

const okJson = (data) => ({ ok: true, status: 200, json: async () => data })

const mockFetch = (routes) => {
  const f = vi.fn(async (url, opts) => {
    const u = String(url)
    for (const [key, val] of Object.entries(routes)) {
      if (u === key) return typeof val === 'function' ? val(u, opts) : val
    }
    throw new Error('unexpected fetch ' + u)
  })
  vi.stubGlobal('fetch', f)
  return f
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ProjectWorkspaceModal', () => {
  it('open=false atau project undefined → null, tidak ada fetch', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { rerender } = render(<ProjectWorkspaceModal project={PROJECT} open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<ProjectWorkspaceModal project={undefined} open onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('open → dialog dengan nama proyek, status, & iframe preview', async () => {
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Demo Proyek')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
    const frame = screen.getByTitle('WFS Project Sandbox Live Preview')
    expect(frame.getAttribute('src')).toBe(PROJECT.preview_url)
  })

  it('tombol tutup memanggil onClose', async () => {
    const onClose = vi.fn()
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup Workspace' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape menutup dialog (a11y, paritas dgn modal lain)', async () => {
    const onClose = vi.fn()
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={onClose} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Restart → POST container/restart & onRefreshProject dipanggil', async () => {
    const onRefreshProject = vi.fn()
    const f = mockFetch({
      '/api/projects/p1/files': okJson({ files: [] }),
      '/api/projects/p1/container/restart': okJson({ ok: true }),
    })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} onRefreshProject={onRefreshProject} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(onRefreshProject).toHaveBeenCalledTimes(1))
    expect(f.mock.calls.some(([u]) => u === '/api/projects/p1/container/restart')).toBe(true)
  })

  it('tab File Explorer memuat daftar file; pilih file → isi muncul; Simpan → POST', async () => {
    let saveBody
    mockFetch({
      '/api/projects/p1/files': okJson({ files: ['index.html', 'app.py'] }),
      '/api/projects/p1/file?path=index.html': okJson({ content: '<html>hello</html>' }),
      '/api/projects/p1/file?path=app.py': okJson({ content: 'print("hi")' }),
      '/api/projects/p1/file': (u, opts) => { saveBody = JSON.parse(opts.body); return okJson({ ok: true }) },
    })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'File Explorer' }))
    await waitFor(() => expect(screen.getByText('📄 index.html')).toBeTruthy())
    expect(screen.getByText('📄 app.py')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Isi file index.html').value).toBe('<html>hello</html>'))
    fireEvent.click(screen.getByText('📄 app.py'))
    await waitFor(() => expect(screen.getByLabelText('Isi file app.py').value).toBe('print("hi")'))
    fireEvent.change(screen.getByLabelText('Isi file app.py'), { target: { value: 'print("bye")' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }))
    await waitFor(() => expect(saveBody).toEqual({ path: 'app.py', content: 'print("bye")' }))
  })

  it('tab Terminal menjalankan perintah & menampilkan output + exit code', async () => {
    const f = mockFetch({
      '/api/projects/p1/files': okJson({ files: [] }),
      '/api/projects/p1/terminal': okJson({ stdout: 'OK: 2 tests passed', stderr: '', exit_code: 0 }),
    })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Terminal' }))
    const input = screen.getByLabelText('Perintah terminal')
    expect(input.value).toBe('python3 -m unittest test_app.py')
    fireEvent.change(input, { target: { value: 'pytest' } })
    fireEvent.submit(input.closest('form'))
    await waitFor(() => expect(screen.getByText(/Exit Code: 0/)).toBeTruthy())
    expect(screen.getByText(/OK: 2 tests passed/)).toBeTruthy()
    const termCall = f.mock.calls.find(([u]) => u === '/api/projects/p1/terminal')
    expect(termCall).toBeTruthy()
    expect(JSON.parse(termCall[1].body).command).toBe('pytest')
  })

  it('tab Quality & QA menampilkan laporan lolos', async () => {
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Quality & QA' }))
    expect(screen.getByText('ALL CRITERIA PASSED')).toBeTruthy()
    expect(screen.getByText(/DOCKER CONTAINER ISOLATION/)).toBeTruthy()
    expect(screen.getByText(/Automated QA & Security Gate/)).toBeTruthy()
  })
})

describe('ProjectWorkspaceModal tabs — pola WAI-ARIA tabs', () => {
  it('tablist: role + aria-label; tab punya aria-selected & aria-controls; panel terhubung', async () => {
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    expect(screen.getByRole('tablist', { name: 'Tab workspace' })).toBeTruthy()
    const preview = screen.getByRole('tab', { name: 'Live Preview' })
    expect(preview.getAttribute('aria-selected')).toBe('true')
    expect(preview.getAttribute('aria-controls')).toBe('pw-panel-preview')
    expect(screen.getByRole('tab', { name: 'File Explorer' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('pw-tab-preview')
  })

  it('panah kanan memindahkan tab & fokus (roving tabindex); Home kembali ke tab pertama', async () => {
    mockFetch({ '/api/projects/p1/files': okJson({ files: [] }) })
    render(<ProjectWorkspaceModal project={PROJECT} open onClose={() => {}} />)
    // tunggu auto-fokus awal useDialogA11y (30ms) selesai agar tidak menimpa navigasi
    await new Promise(r => setTimeout(r, 40))
    const preview = screen.getByRole('tab', { name: 'Live Preview' })
    preview.focus()
    fireEvent.keyDown(preview, { key: 'ArrowRight' })
    await waitFor(() => expect(document.activeElement.id).toBe('pw-tab-files'))
    expect(screen.getByRole('tab', { name: 'File Explorer' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    await waitFor(() => expect(document.activeElement.id).toBe('pw-tab-preview'))
  })
})
