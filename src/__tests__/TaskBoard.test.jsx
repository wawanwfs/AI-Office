// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import TaskBoard from '../components/TaskBoard'

const tasks = [
  { id: 1, title: 'Buat login', agent_id: 'be1', status: 'done', role: 'be', files: "['auth.js']", review: 'Pass review' },
  { id: 2, title: 'Halaman admin', agent_id: 'fe1', status: 'pending', role: 'fe' },
]

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('TaskBoard', () => {
  it('menampilkan & memfilter task', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))
    expect(screen.getByText(/Halaman admin/)).toBeTruthy()
    fireEvent.click(screen.getByText(/^Selesai 1/))
    expect(screen.queryByText(/Halaman admin/)).toBeNull()
  })

  it('tombol jalankan meminta konfirmasi (tidak langsung run)', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) }))
    vi.stubGlobal('fetch', f)
    const onAsk = vi.fn()
    render(<TaskBoard onFlash={() => {}} onAsk={onAsk} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Jalankan task/))
    expect(onAsk).toHaveBeenCalled()
    expect(f.mock.calls.every(c => !String(c[0]).includes('/run'))).toBe(true)
  })

  it('modernisasi SVG: tombol tutup memiliki IconClose & title, tombol aksi detail memiliki IconPlay / IconRotate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    const closeBtn = await screen.findByRole('button', { name: 'Tutup papan task' })
    expect(closeBtn.getAttribute('title')).toBe('Tutup papan task (Esc)')
    expect(closeBtn.querySelector('svg')).toBeTruthy()

    // Buka task pending (#2) → tombol Jalankan task memiliki IconPlay
    await waitFor(() => screen.getByText(/Halaman admin/))
    fireEvent.click(screen.getByText(/Halaman admin/))
    const runBtn = screen.getByText(/Jalankan task/).closest('button')
    expect(runBtn.querySelector('svg')).toBeTruthy()

    // Kembali lalu buka task done (#1) → tombol Jalankan ulang memiliki IconRotate
    fireEvent.click(screen.getByRole('button', { name: /Kembali/ }))
    await waitFor(() => screen.getByText(/Buat login/))
    fireEvent.click(screen.getByText(/Buat login/))
    const rerunBtn = screen.getByText(/Jalankan ulang/).closest('button')
    expect(rerunBtn.querySelector('svg')).toBeTruthy()
  })

  it('mendukung beralih ke tampilan Kanban dengan 4 kolom status & metrik sprint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))

    // Subtitle metrik sprint
    expect(screen.getByText(/2 task · 1\/2 \(50%\) selesai/)).toBeTruthy()

    // Klik tombol switch ke mode Kanban
    const kanbanBtn = screen.getByRole('button', { name: 'Tampilan Papan Kolom' })
    expect(kanbanBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(kanbanBtn)
    expect(kanbanBtn.getAttribute('aria-pressed')).toBe('true')

    // Region papan kanban & 4 kolom
    const boardRegion = screen.getByRole('region', { name: 'Papan kanban sprint' })
    expect(boardRegion).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Antri' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Sedang Jalan' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Review / Isu' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Kolom Selesai' })).toBeTruthy()

    // Progress bar sprint visual & bar distribusi kolom
    expect(screen.getByRole('progressbar', { name: /Progres sprint kampus: 50% selesai/i })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: /Distribusi kolom Selesai: 50%/i })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: /Distribusi kolom Antri: 50%/i })).toBeTruthy()

    // Kolom Sedang Jalan kosong menampilkan empty state cerdas
    expect(screen.getByText('Tidak ada eksekusi aktif')).toBeTruthy()

    // Kartu dengan file & review memiliki badge khusus
    expect(screen.getByTitle('1 file dihasilkan')).toBeTruthy()
    expect(screen.getByTitle('Ada ulasan QA')).toBeTruthy()

    // Tombol agen pada kartu memicu fokus 3D agen
    const focusAgentMock = vi.fn()
    window.__focusAgent = focusAgentMock
    const agentFocusBtn = screen.getByRole('button', { name: 'Fokus kamera 3D ke agen fe1' })
    expect(agentFocusBtn).toBeTruthy()
    fireEvent.click(agentFocusBtn)
    expect(focusAgentMock).toHaveBeenCalledWith('fe1')
    delete window.__focusAgent

    // Klik kartu di kanban membuka detail task
    const card = screen.getByRole('button', { name: /Task #2: Halaman admin/ })
    fireEvent.click(card)
    expect(screen.getByText(/Agent: fe1 · Role: fe/)).toBeTruthy()

    // Tombol fokus agen di dalam modal detail
    const modalAgentFocusBtn = screen.getByRole('button', { name: /Fokus Agen \(fe1\)/i })
    expect(modalAgentFocusBtn).toBeTruthy()
  })

  it('terbuka secara otomatis saat menerima event kustom wfs-open-task-board', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)

    // Sebelum event: board tertutup
    expect(screen.queryByRole('dialog', { name: 'Papan task' })).toBeNull()

    // Dispatch event dari 3D scene / whiteboard
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy()
      expect(screen.getByRole('region', { name: 'Papan kanban sprint' })).toBeTruthy()
    })
  })

  it('mendukung penyaringan per divisi kampus dan tombol fokus 3D pod', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    const focusTeamMock = vi.fn()
    window.__focusTeam = focusTeamMock

    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))

    // Switch ke Kanban
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Papan Kolom' }))

    // Periksa strip filter divisi
    expect(screen.getByRole('group', { name: 'Filter berdasarkan divisi kerja' })).toBeTruthy()
    const backendChip = screen.getByRole('button', { name: /Filter.*Backend & Data/i })
    expect(backendChip).toBeTruthy()

    // Klik filter divisi Backend
    fireEvent.click(backendChip)
    expect(backendChip.getAttribute('aria-pressed')).toBe('true')

    // Subtitle terbarui dengan metrik divisi Backend
    expect(screen.getByText(/1\/2 task \(Backend\)/i)).toBeTruthy()

    // Tombol Fokus Pod 3D tampil dan dapat diklik
    const focusBtn = screen.getByRole('button', { name: /Fokus kamera 3D ke pod/i })
    expect(focusBtn).toBeTruthy()
    fireEvent.click(focusBtn)
    expect(focusTeamMock).toHaveBeenCalledWith('core-be')

    delete window.__focusTeam
  })

  it('menerima event wfs-open-task-board dengan parameter division dan membuka filter langsung', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)

    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban', division: 'fe-design' } }))
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy()
      const feChip = screen.getByRole('button', { name: /Filter.*Frontend & Design/i })
      expect(feChip.getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('menyediakan pengurutan interaktif (sort select) dan menampilkan badge prioritas', async () => {
    const customTasks = [
      { id: 1, title: 'Zebra Service', agent_id: 'fe1', status: 'pending', role: 'fe', priority: 'low' },
      { id: 2, title: 'Alpha Cache', agent_id: 'be1', status: 'done', role: 'be', priority: 'urgent' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: customTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Zebra Service/))

    // Periksa kontrol pengurutan task
    const sortSelect = screen.getByRole('combobox', { name: 'Urutkan task' })
    expect(sortSelect).toBeTruthy()
    expect(sortSelect.value).toBe('newest')

    // Tampilkan badge prioritas urgent di list view
    expect(screen.getByTitle('Prioritas: Urgent')).toBeTruthy()

    // Beralih ke pengurutan Judul (A-Z)
    fireEvent.change(sortSelect, { target: { value: 'title' } })
    expect(sortSelect.value).toBe('title')

    // Buka detail task untuk melihat informasi prioritas
    fireEvent.click(screen.getByText(/Alpha Cache/))
    expect(screen.getByText(/Prioritas:/)).toBeTruthy()
    expect(screen.getByText(/Urgent/)).toBeTruthy()
  })

  it('menampilkan quick button urgent saat ada task prioritas kritis dan toggle ke sort priority', async () => {
    const urgentTasks = [
      { id: 10, title: 'Fix Auth Exploit', agent_id: 'be1', status: 'running', role: 'be', priority: 'urgent' },
      { id: 11, title: 'Update Docs', agent_id: 'pm1', status: 'pending', role: 'pm', priority: 'normal' },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: urgentTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Fix Auth Exploit/))

    const urgentBtn = screen.getByRole('button', { name: /Filter prioritas urgent/i })
    expect(urgentBtn).toBeTruthy()
    expect(urgentBtn.textContent).toContain('🔥 1')

    // Klik tombol cepat urgent -> beralih ke sorting priority
    fireEvent.click(urgentBtn)
    const sortSelect = screen.getByRole('combobox', { name: 'Urutkan task' })
    expect(sortSelect.value).toBe('priority')

    // Klik lagi -> kembali ke newest
    fireEvent.click(urgentBtn)
    expect(sortSelect.value).toBe('newest')
  })

  it('drag & drop kartu kanban antar kolom memindahkan status task, flash & feedback audio', async () => {
    const onFlash = vi.fn()
    const soundMock = {
      playTaskDone: vi.fn(),
      playTaskUrgent: vi.fn(),
      playSelect: vi.fn(),
    }
    window.__officeSound = soundMock

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Buat login/))

    // Beralih ke tampilan Kanban
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Papan Kolom' }))

    // Dapatkan kartu task #2 (pending: Halaman admin)
    const card = screen.getByRole('button', { name: /Task #2: Halaman admin/ })
    expect(card.getAttribute('draggable')).toBe('true')

    // Dapatkan target kolom Selesai
    const doneCol = screen.getByRole('region', { name: 'Kolom Selesai' })

    // Simulasikan dragstart pada kartu
    const dataTransfer = {
      data: {},
      setData(k, v) { this.data[k] = String(v) },
      getData(k) { return this.data[k] },
      effectAllowed: 'none',
      dropEffect: 'none',
    }
    fireEvent.dragStart(card, { dataTransfer })
    expect(dataTransfer.getData('text/plain')).toBe('2')

    // Simulasikan dragover pada kolom Selesai
    fireEvent.dragOver(doneCol, { dataTransfer })
    expect(doneCol.className).toContain('drag-over')

    // Drop kartu di kolom Selesai
    fireEvent.drop(doneCol, { dataTransfer })

    // Flash dipanggil dengan nama kolom tujuan
    expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Task #2 dipindahkan ke kolom Selesai'))
    // Audio task done dipanggil karena berpindah ke done
    expect(soundMock.playTaskDone).toHaveBeenCalled()

    delete window.__officeSound
  })

  it('tombol quick move di dalam modal detail memindahkan kolom task secara instan', async () => {
    const onFlash = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })))
    render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Halaman admin/))

    // Buka task #2 (pending)
    fireEvent.click(screen.getByText(/Halaman admin/))

    // Periksa strip Pindah Kolom
    expect(screen.getByRole('group', { name: 'Pindahkan kolom task' })).toBeTruthy()

    // Kolom saat ini (Antri) dalam keadaan disabled
    const currentBtn = screen.getByRole('button', { name: 'Pindahkan task #2 ke kolom Antri' })
    expect(currentBtn.disabled).toBe(true)

    // Klik pindahkan ke Sedang Jalan
    const moveRunningBtn = screen.getByRole('button', { name: 'Pindahkan task #2 ke kolom Sedang Jalan' })
    expect(moveRunningBtn.disabled).toBe(false)
    fireEvent.click(moveRunningBtn)

    expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Task #2 dipindahkan ke kolom Sedang Jalan'))
  })

  it('mengklik tombol urgent quick filter memicu audio playTaskUrgent', async () => {
    const urgentTasks = [
      { id: 77, title: 'Server Memory Leak', agent_id: 'ops1', status: 'running', role: 'ops', priority: 'urgent' },
    ]
    const soundMock = {
      playTaskDone: vi.fn(),
      playTaskUrgent: vi.fn(),
      playSelect: vi.fn(),
    }
    window.__officeSound = soundMock

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: urgentTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Server Memory Leak/))

    const urgentBtn = screen.getByRole('button', { name: /Filter prioritas urgent/i })
    fireEvent.click(urgentBtn)

    expect(soundMock.playTaskUrgent).toHaveBeenCalled()

    delete window.__officeSound
  })
})
