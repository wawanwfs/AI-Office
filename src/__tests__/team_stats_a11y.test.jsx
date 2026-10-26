// @vitest-environment jsdom
// Unit test: useDialogA11y (fokus trap, Escape, aria-modal, restore fokus)
// dan TeamStats (polling tasks/resources, status grid, pesan error, ringkas nama kontainer).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useDialogA11y } from '../lib/dialogA11y'
import TeamStats from '../components/TeamStats'

// ── useDialogA11y ──────────────────────────────────────────────────────────
function Harness({ open, onClose }) {
  const ref = useRef(null)
  useDialogA11y({ open, onClose, ref })
  return (
    <>
      <button id="trigger">pemicu</button>
      {open && (
        <div ref={ref} role="dialog" aria-label="dlg">
          <button onClick={onClose}>tutup</button>
          <button>dua</button>
        </div>
      )}
    </>
  )
}

describe('useDialogA11y', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('membuka: aria-modal ditambahkan & fokus ke elemen fokusabel pertama', async () => {
    render(<Harness open onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement.textContent).toBe('tutup'))
  })

  it('Escape memanggil onClose', () => {
    const onClose = vi.fn()
    render(<Harness open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab terjebak dalam dialog: terakhir → pertama, shift → kembali terakhir', () => {
    render(<Harness open onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    const [btn1, btn2] = dlg.querySelectorAll('button')
    // jsdom tanpa layout engine: offsetParent selalu null — definisikan manual
    Object.defineProperty(btn1, 'offsetParent', { get: () => dlg })
    Object.defineProperty(btn2, 'offsetParent', { get: () => dlg })
    btn2.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(btn1)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(btn2)
    // fokus tidak pernah keluar dialog walau ada tombol pemicu di luar
    expect(document.activeElement.closest('[role="dialog"]')).toBe(dlg)
  })

  it('tutup: dialog hilang & fokus kembali ke pemicu', async () => {
    function App() {
      const [open, setOpen] = useState(true)
      const ref = useRef(null)
      useDialogA11y({ open, onClose: () => setOpen(false), ref })
      return (
        <>
          <button id="t">pemicu</button>
          {open && (
            <div ref={ref} role="dialog">
              <button onClick={() => setOpen(false)}>tutup</button>
            </div>
          )}
        </>
      )
    }
    render(<App />)
    document.getElementById('t').focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    await waitFor(() => expect(document.activeElement.id).toBe('t'))
  })

  it('open=false → hook pasif (tidak crash, tanpa dialog)', () => {
    render(<Harness open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow()
  })
})

// ── TeamStats ──────────────────────────────────────────────────────────────
// file: A="['a.py','b.py']"=2, B=[]=0, C=null=0, D='c.py, d.py'=2, E=['e.py']=1 → total 5
const TASKS = [
  { id: 1, title: 'task A', status: 'done', files: "['a.py','b.py']" },
  { id: 2, title: 'task B', status: 'running', files: [] },
  { id: 3, title: 'task C', status: 'failed', files: null },
  { id: 4, title: 'task D', status: 'pending', files: 'c.py, d.py' },
  { id: 5, title: 'task E', status: 'review', files: ['e.py'] },
]
const RES = {
  load: '0.42', ram_mb: 2048,
  containers: [
    { name: 'wfs-sandbox-backend', cpu: '1%', mem: '80MB' },
    { name: 'wfs-agent-be1', cpu: '2%', mem: '120MB' },
  ],
}

function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes('resources') ? RES : { tasks: TASKS }),
  })))
}

describe('TeamStats', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('tertutup default; buka → fetch tasks+resources, hitung file, ringkas kontainer', async () => {
    mockFetchOk()
    render(<TeamStats />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/Total file dihasilkan/)).toBeTruthy())
    expect(screen.getByText('5', { selector: 'b' })).toBeTruthy()
    // kontainer diringkas: prefix dibuang
    expect(screen.getByText('backend')).toBeTruthy()
    expect(screen.getByText('sbx-be1')).toBeTruthy()
    expect(screen.getByText(/load 0.42 · RAM 2048 MB/)).toBeTruthy()
  })

  it('fetch gagal → "Gateway offline" + tombol Coba lagi memulihkan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => null })))
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/Gateway offline/)).toBeTruthy()
    mockFetchOk()
    fireEvent.click(screen.getByText('Coba lagi'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await waitFor(() => expect(screen.getByText(/Total file dihasilkan/)).toBeTruthy())
  })

  it('data kosong → pesan "Belum ada task"', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('resources') ? RES : { tasks: [] }),
    })))
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByText(/Belum ada task/)).toBeTruthy())
  })

  it('stat-grid punya aria-label jumlah per status (semua 1)', async () => {
    mockFetchOk()
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByRole('img', { name: '1 task selesai' })).toBeTruthy())
    expect(screen.getByRole('img', { name: '1 task jalan' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 task gagal' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 task review' })).toBeTruthy()
    expect(screen.getByRole('img', { name: '1 task antri' })).toBeTruthy()
  })

  it('menampilkan kartu progres per divisi dan tombol Fokus 3D memicu window.__focusTeam', async () => {
    const focusMock = vi.fn()
    window.__focusTeam = focusMock
    mockFetchOk()
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Progres per divisi kerja' })).toBeTruthy())
    expect(screen.getByText('Backend & Data')).toBeTruthy()
    expect(screen.getByText('Frontend & Design')).toBeTruthy()
    expect(screen.getByText('DevOps & Security')).toBeTruthy()

    const focusBtn = screen.getByRole('button', { name: 'Fokus kamera ke pod Backend & Data' })
    expect(focusBtn).toBeTruthy()
    fireEvent.click(focusBtn)
    expect(focusMock).toHaveBeenCalledWith('core-be')
    delete window.__focusTeam
  })

  it('tombol Kanban divisi dan item task terkini memicu event wfs-open-task-board', async () => {
    mockFetchOk()
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Progres per divisi kerja' })).toBeTruthy())

    // Klik tombol Kanban pada kartu Backend
    const kanbanBtn = screen.getByRole('button', { name: 'Buka kanban divisi Backend & Data' })
    expect(kanbanBtn).toBeTruthy()
    fireEvent.click(kanbanBtn)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wfs-open-task-board',
        detail: { division: 'core-be', view: 'kanban' },
      })
    )

    // Klik salah satu task terkini
    await waitFor(() => expect(screen.getByText(/Task Terkini/)).toBeTruthy())
    const recentTasks = screen.getAllByRole('button', { name: /Task #/i })
    expect(recentTasks.length).toBeGreaterThan(0)
    fireEvent.click(recentTasks[0])

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wfs-open-task-board',
        detail: expect.objectContaining({ view: 'kanban' }),
      })
    )

    dispatchSpy.mockRestore()
  })
})
