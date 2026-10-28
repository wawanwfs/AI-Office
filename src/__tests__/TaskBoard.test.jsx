// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react'
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
      playCardPickup: vi.fn(),
      playCardDrop: vi.fn(),
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
    expect(JSON.parse(dataTransfer.getData('application/json'))).toMatchObject({ id: 2, title: 'Halaman admin' })
    expect(card.getAttribute('data-dragging')).toBe('true')
    expect(soundMock.playCardPickup).toHaveBeenCalled()

    // Coba drop di kolom asalnya (Kolom Antri) -> diabaikan karena kartu sudah di sana
    const todoCol = screen.getByRole('region', { name: 'Kolom Antri' })
    fireEvent.drop(todoCol, { dataTransfer })
    expect(onFlash).not.toHaveBeenCalled()

    // Buka drag lagi untuk memindahkan ke Selesai
    fireEvent.dragStart(card, { dataTransfer })

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

  it('tombol quick move di dalam modal detail memindahkan kolom task secara instan & audio playCardDrop', async () => {
    const onFlash = vi.fn()
    const soundMock = {
      playTaskDone: vi.fn(),
      playCardDrop: vi.fn(),
      playSelect: vi.fn(),
    }
    window.__officeSound = soundMock
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
    expect(soundMock.playCardDrop).toHaveBeenCalled()
    delete window.__officeSound
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

  it('menampilkan strip tag filter dan menyaring task saat tag diklik', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service #api', agent_id: 'be1', status: 'done', role: 'be', tags: ['auth', 'api'] },
      { id: 20, title: 'Dashboard Widget #react', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react', 'ui'] },
      { id: 30, title: 'Database Migration', agent_id: 'be1', status: 'done', role: 'be', files: ['prisma/schema.prisma'] },
    ]
    const soundMock = {
      playSelect: vi.fn(),
    }
    window.__officeSound = soundMock

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Auth Service/))

    // Periksa strip filter tag
    expect(screen.getByRole('group', { name: 'Filter berdasarkan tag task' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Filter tag API/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Filter tag React/i })).toBeTruthy()

    // Klik tag API
    fireEvent.click(screen.getByRole('button', { name: /Filter tag API/i }))
    expect(soundMock.playSelect).toHaveBeenCalled()

    // Task dengan tag API tampil, task React tersembunyi
    expect(screen.getByText(/Auth Service/)).toBeTruthy()
    expect(screen.queryByText(/Dashboard Widget/)).toBeNull()

    // Reset filter tag
    const resetBtn = screen.getByRole('button', { name: 'Reset filter tag' })
    fireEvent.click(resetBtn)
    expect(screen.getByText(/Dashboard Widget/)).toBeTruthy()

    delete window.__officeSound
  })

  it('mengklik badge tag pada kartu kanban langsung menyaring papan ke tag tersebut', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['auth'] },
      { id: 20, title: 'Dashboard UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Auth Service/))

    // Switch ke kanban
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Papan Kolom' }))
    await waitFor(() => screen.getByRole('region', { name: 'Papan kanban sprint' }))

    // Klik badge tag #React pada kartu
    const reactBadge = screen.getByTitle('Filter berdasarkan tag #React')
    expect(reactBadge).toBeTruthy()
    fireEvent.click(reactBadge)

    // Kartu non-react kini tersaring
    expect(screen.queryByText(/Auth Service/)).toBeNull()
    expect(screen.getByText(/Dashboard UI/)).toBeTruthy()
  })

  it('badge tag di kartu bisa diaktifkan lewat keyboard (Enter/Space) — a11y', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['auth'] },
      { id: 20, title: 'Dashboard UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Auth Service/))

    // Switch ke kanban
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan Papan Kolom' }))
    await waitFor(() => screen.getByRole('region', { name: 'Papan kanban sprint' }))

    const reactBadge = screen.getByTitle('Filter berdasarkan tag #React')
    expect(reactBadge.getAttribute('role')).toBe('button')
    expect(reactBadge.getAttribute('tabindex')).toBe('0')

    // Aktifkan via keyboard (Enter) — kartu non-react tersaring
    fireEvent.keyDown(reactBadge, { key: 'Enter' })
    expect(screen.queryByText(/Auth Service/)).toBeNull()
    expect(screen.getByText(/Dashboard UI/)).toBeTruthy()
  })

  it('di dalam modal detail, klik chip tag menutup modal dan menyaring papan ke tag tersebut', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['security'] },
      { id: 20, title: 'Dashboard UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Auth Service/))

    // Buka detail task #10
    fireEvent.click(screen.getByText(/Auth Service/))
    await waitFor(() => screen.getByRole('button', { name: 'Filter tag #Security' }))

    // Klik tag #Security di modal
    fireEvent.click(screen.getByRole('button', { name: 'Filter tag #Security' }))

    // Modal tertutup, papan tersaring hanya menampilkan task Security
    expect(screen.getByText(/Auth Service/)).toBeTruthy()
    expect(screen.queryByText(/Dashboard UI/)).toBeNull()
  })

  it('badge tag di baris daftar (list view) bisa diaktifkan lewat keyboard (Enter/Space) — a11y', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['auth'] },
      { id: 20, title: 'Dashboard UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })))
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => screen.getByText(/Auth Service/))

    // List view adalah default — badge tag punya semantik tombol keyboard-accessible
    const reactBadge = screen.getByTitle('Filter berdasarkan tag #React')
    expect(reactBadge.getAttribute('role')).toBe('button')
    expect(reactBadge.getAttribute('tabindex')).toBe('0')
    expect(reactBadge.getAttribute('aria-pressed')).toBe('false')

    // Aktifkan via keyboard (Enter) — task non-react tersaring
    fireEvent.keyDown(reactBadge, { key: 'Enter' })
    expect(screen.queryByText(/Auth Service/)).toBeNull()
    expect(screen.getByText(/Dashboard UI/)).toBeTruthy()

    // Badge kini aktif; Spasi membalik filter kembali
    const reactBadgeActive = screen.getByTitle('Filter berdasarkan tag #React')
    expect(reactBadgeActive.getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(reactBadgeActive, { key: ' ' })
    expect(screen.getByText(/Auth Service/)).toBeTruthy()
    expect(screen.getByText(/Dashboard UI/)).toBeTruthy()
  })

  it('tombol preset tag menyaring papan ke kombinasi tag preset dan bisa di-toggle off', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth API Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['api'] },
      { id: 20, title: 'React Frontend UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
      { id: 30, title: 'Docker Container Pipeline', agent_id: 'ops1', status: 'running', role: 'devops', tags: ['docker'] },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    fireEvent.click(screen.getByText('Papan'));
    await waitFor(() => screen.getByText(/Auth API Service/));

    // Preset DevOps mencakup tag ['docker', 'ci/cd']
    const devopsPresetBtn = screen.getByRole('button', { name: /Preset DevOps & Infra/i });
    expect(devopsPresetBtn).toBeTruthy();
    expect(devopsPresetBtn.getAttribute('aria-pressed')).toBe('false');

    // Klik preset DevOps
    fireEvent.click(devopsPresetBtn);
    expect(devopsPresetBtn.getAttribute('aria-pressed')).toBe('true');

    // Hanya task 30 (Docker) yang tampil
    expect(screen.getByText(/Docker Container Pipeline/)).toBeTruthy();
    expect(screen.queryByText(/Auth API Service/)).toBeNull();
    expect(screen.queryByText(/React Frontend UI/)).toBeNull();

    // Klik lagi preset yang sama -> toggle off ke 'all'
    fireEvent.click(devopsPresetBtn);
    expect(devopsPresetBtn.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/Auth API Service/)).toBeTruthy();
    expect(screen.getByText(/React Frontend UI/)).toBeTruthy();
  });

  it('mendukung seleksi multi-tag dengan Shift+Klik dan peralihan mode ATAU / DAN', async () => {
    const taggedTasks = [
      { id: 10, title: 'API Only Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['api'] },
      { id: 20, title: 'React Only UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
      { id: 30, title: 'Fullstack App #react #api', status: 'running', role: 'fe', tags: ['react', 'api'] },
      { id: 40, title: 'Database Migration', agent_id: 'be2', status: 'done', role: 'be', tags: ['sql'] },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    fireEvent.click(screen.getByText('Papan'));
    await waitFor(() => screen.getByText(/API Only Service/));

    const apiChip = screen.getByRole('button', { name: /Filter tag API/i });
    const reactChip = screen.getByRole('button', { name: /Filter tag React/i });

    // 1. Klik tag API biasa
    fireEvent.click(apiChip);
    expect(screen.getByText(/API Only Service/)).toBeTruthy();
    expect(screen.getByText(/Fullstack App/)).toBeTruthy();
    expect(screen.queryByText(/React Only UI/)).toBeNull();

    // 2. Shift+Klik tag React untuk multi-seleksi
    fireEvent.click(reactChip, { shiftKey: true });

    // Sekarang 2 tag terpilih dalam mode default 'any' (ATAU): task 10, 20, 30 tampil
    expect(screen.getByText(/API Only Service/)).toBeTruthy();
    expect(screen.getByText(/React Only UI/)).toBeTruthy();
    expect(screen.getByText(/Fullstack App/)).toBeTruthy();
    expect(screen.queryByText(/Database Migration/)).toBeNull();

    // Tombol mode DAN / ATAU dan tombol Reset multi-tag tampil
    const modeBtn = screen.getByRole('button', { name: /Ganti mode filter tag/i });
    expect(modeBtn).toBeTruthy();
    expect(modeBtn.textContent).toContain('Mode: ATAU');

    // 3. Klik tombol mode untuk beralih ke mode DAN (all)
    fireEvent.click(modeBtn);
    expect(modeBtn.textContent).toContain('Mode: DAN');

    // Mode DAN: HANYA task 30 yang memiliki kedua tag (api & react)
    expect(screen.queryByText(/API Only Service/)).toBeNull();
    expect(screen.queryByText(/React Only UI/)).toBeNull();
    expect(screen.getByText(/Fullstack App/)).toBeTruthy();

    // 4. Klik Reset multi-tag
    const resetBtn = screen.getByRole('button', { name: 'Reset filter tag' });
    expect(resetBtn.textContent).toContain('Reset (2)');
    fireEvent.click(resetBtn);

    // Semua task kembali tampil
    expect(screen.getByText(/API Only Service/)).toBeTruthy();
    expect(screen.getByText(/React Only UI/)).toBeTruthy();
    expect(screen.getByText(/Database Migration/)).toBeTruthy();
  });

  it('event kustom wfs-open-task-board dengan parameter preset membuka papan langsung dengan preset tersebut', async () => {
    const taggedTasks = [
      { id: 10, title: 'Auth Service', agent_id: 'be1', status: 'done', role: 'be', tags: ['api'] },
      { id: 20, title: 'Frontend UI', agent_id: 'fe1', status: 'pending', role: 'fe', tags: ['react'] },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: taggedTasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);

    // Dispatch event pembukaan dengan preset frontend
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { preset: 'frontend' } }));
    });

    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    await waitFor(() => screen.getByText(/Frontend UI/));
    expect(screen.getByText(/Frontend UI/)).toBeTruthy();
    expect(screen.queryByText(/Auth Service/)).toBeNull();
  });

  it('event kustom wfs-toggle-task-board melakukan toggle buka dan tutup papan task', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);

    expect(screen.queryByRole('dialog', { name: 'Papan task' })).toBeNull();

    // Toggle buka
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy();

    // Toggle tutup
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Papan task' })).toBeNull());
  });

  it('merender footer bar petunjuk shortcut (Esc, T Toggle, Shift+Klik Multi-Tag)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    const footer = screen.getByRole('note', { name: /Petunjuk pintasan keyboard/i });
    expect(footer).toBeTruthy();
    expect(within(footer).getByText('Esc')).toBeTruthy();
    expect(within(footer).getByText('T')).toBeTruthy();
    expect(within(footer).getByText('/')).toBeTruthy();
    expect(within(footer).getByText(/Shift\+Klik/)).toBeTruthy();
  });

  it('pencarian real-time pada Kanban menyaring kartu, menampilkan badge hitungan dan tombol reset', async () => {
    const tasks = [
      { id: 101, title: 'Build OAuth2 Provider #auth', role: 'be', agent_id: 'be-1', status: 'pending', priority: 'normal', tags: ['auth'] },
      { id: 102, title: 'Design Landing Page UI', role: 'fe', agent_id: 'fe-1', status: 'running', priority: 'urgent', tags: ['ui/ux'] },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));

    const searchInput = screen.getByRole('textbox', { name: 'Cari task' });
    expect(searchInput).toBeTruthy();

    // Ketik query pencarian 'OAuth2'
    fireEvent.change(searchInput, { target: { value: 'OAuth2' } });

    // Badge hitungan pencarian muncul
    const badge = screen.getByTitle(/Ditemukan 1 task dari total 2 task/i);
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('1/2');

    // Kartu OAuth2 muncul dengan teks tersorot (<mark>)
    const mark = screen.getByText('OAuth2');
    expect(mark.tagName.toLowerCase()).toBe('mark');
    expect(mark.className).toContain('kanban-search-highlight');
    expect(screen.getByText((content, element) => element?.className === 'kanban-card-title' && element.textContent.includes('Build OAuth2 Provider'))).toBeTruthy();

    // Kartu landing page tidak muncul
    expect(screen.queryByText(/Design Landing Page UI/i)).toBeNull();

    // Tombol hapus pencarian ✕ berfungsi mereset query
    const clearBtn = screen.getByRole('button', { name: 'Hapus kata kunci pencarian' });
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);

    await waitFor(() => expect(searchInput.value).toBe(''));
    expect(screen.queryByTitle(/Ditemukan 1 task dari total 2 task/i)).toBeNull();
    expect(screen.getByText(/Design Landing Page UI/i)).toBeTruthy();
  });

  it('menampilkan banner kosong di Kanban saat kata kunci tidak menghasilkan kecocokan dan tombol bersihkan berfungsi', async () => {
    const tasks = [
      { id: 201, title: 'Database Optimization', role: 'be', agent_id: 'be-1', status: 'done', priority: 'normal' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));

    const searchInput = screen.getByRole('textbox', { name: 'Cari task' });
    fireEvent.change(searchInput, { target: { value: 'kata-kunci-tidak-ada-999' } });

    // Banner kosong Kanban muncul
    await waitFor(() => {
      expect(screen.getByText(/Tidak ada task yang cocok dengan “kata-kunci-tidak-ada-999”/i)).toBeTruthy();
    });

    const resetBtn = screen.getByRole('button', { name: /Bersihkan Pencarian/i });
    expect(resetBtn).toBeTruthy();
    fireEvent.click(resetBtn);

    await waitFor(() => expect(searchInput.value).toBe(''));
    expect(screen.getByText(/Database Optimization/i)).toBeTruthy();
  });

  it('menekan tombol Escape di input pencarian membersihkan query sebelum menutup dialog', async () => {
    const tasks = [
      { id: 301, title: 'Task Test Escape', role: 'be', agent_id: 'be-1', status: 'pending', priority: 'normal' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'kanban' } }));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));

    const searchInput = screen.getByRole('textbox', { name: 'Cari task' });
    fireEvent.change(searchInput, { target: { value: 'Test' } });
    expect(searchInput.value).toBe('Test');

    // Tekan Escape saat input aktif
    searchInput.focus();
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    await waitFor(() => expect(searchInput.value).toBe(''));
    // Dialog tetap terbuka
    expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy();
  });

  it('pintasan keyboard "/" memfokuskan input pencarian saat task board terbuka', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));

    const searchInput = screen.getByRole('textbox', { name: 'Cari task' });
    const focusSpy = vi.spyOn(searchInput, 'focus');

    // Trigger keydown '/' pada window
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it('menampilkan tombol ekspor CSV & JSON di header dan footer hint CSV/JSON Ekspor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    await waitFor(() => screen.getByText(/Buat login/));

    const csvBtn = screen.getByRole('button', { name: /Ekspor 2 task ke CSV/i });
    const jsonBtn = screen.getByRole('button', { name: /Ekspor 2 task ke JSON/i });
    expect(csvBtn).toBeTruthy();
    expect(jsonBtn).toBeTruthy();
    expect(csvBtn.querySelector('svg')).toBeTruthy();
    expect(jsonBtn.querySelector('svg')).toBeTruthy();

    expect(screen.getByText(/CSV\/JSON/i)).toBeTruthy();
    expect(screen.getByText(/Ekspor/i)).toBeTruthy();
  });

  it('klik tombol ekspor CSV memicu download dan memanggil onFlash dengan ringkasan', async () => {
    const onFlash = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    await waitFor(() => screen.getByText(/Buat login/));

    const csvBtn = screen.getByRole('button', { name: /Ekspor 2 task ke CSV/i });
    fireEvent.click(csvBtn);

    expect(onFlash).toHaveBeenCalledWith(expect.stringMatching(/2 task diekspor ke CSV/i));
  });

  it('klik tombol ekspor JSON memicu download dan memanggil onFlash dengan ringkasan', async () => {
    const onFlash = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    await waitFor(() => screen.getByText(/Buat login/));

    const jsonBtn = screen.getByRole('button', { name: /Ekspor 2 task ke JSON/i });
    fireEvent.click(jsonBtn);

    expect(onFlash).toHaveBeenCalledWith(expect.stringMatching(/2 task diekspor ke JSON/i));
  });

  it('ekspor menghormati filter status aktif pada mode daftar', async () => {
    const onFlash = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks }) })));
    render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);
    act(() => {
      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { view: 'list' } }));
    });
    await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
    await waitFor(() => screen.getByText(/Buat login/));

    // Filter ke Selesai
    fireEvent.click(screen.getByText(/^Selesai 1/));

    const csvBtn = screen.getByRole('button', { name: /Ekspor 1 task ke CSV/i });
    expect(csvBtn).toBeTruthy();
    fireEvent.click(csvBtn);

    expect(onFlash).toHaveBeenCalledWith(expect.stringMatching(/1 task diekspor ke CSV/i));
  });

  describe('Filter Preset Rentang Tanggal', () => {
    const now = Date.now();
    const datedTasks = [
      { id: 101, title: 'Task Baru Hari Ini', agent_id: 'be1', status: 'pending', role: 'be', created_at: now },
      { id: 102, title: 'Task Lama Bulan Lalu', agent_id: 'fe1', status: 'done', role: 'fe', created_at: now - 40 * 86400000 },
    ];

    it('menampilkan dropdown filter rentang tanggal dengan ikon kalender dan pilihan preset', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: datedTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      await waitFor(() => screen.getByText(/Task Baru Hari Ini/));

      const dateSelect = screen.getByLabelText('Rentang waktu task');
      expect(dateSelect).toBeTruthy();
      expect(dateSelect.querySelectorAll('option').length).toBe(6);
      expect(screen.getByText(/Task Lama Bulan Lalu/)).toBeTruthy();
    });

    it('memilih preset rentang tanggal menyaring task dan tombol reset memulihkan', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: datedTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      await waitFor(() => screen.getByText(/Task Baru Hari Ini/));

      const dateSelect = screen.getByLabelText('Rentang waktu task');
      fireEvent.change(dateSelect, { target: { value: 'today' } });

      // Hanya task hari ini yang tampil
      expect(screen.getByText(/Task Baru Hari Ini/)).toBeTruthy();
      expect(screen.queryByText(/Task Lama Bulan Lalu/)).toBeNull();

      // Tombol reset tanggal muncul dan dapat diklik
      const clearBtn = screen.getByRole('button', { name: 'Reset rentang waktu ke semua' });
      expect(clearBtn).toBeTruthy();
      fireEvent.click(clearBtn);

      // Kedua task tampil kembali
      expect(screen.getByText(/Task Baru Hari Ini/)).toBeTruthy();
      expect(screen.getByText(/Task Lama Bulan Lalu/)).toBeTruthy();
    });

    it('memilih preset kustom menampilkan panel tanggal kustom, input tanggal menyaring task & deteksi tanggal terbalik', async () => {
      const customTasks = [
        { id: 201, title: 'Task Tanggal 20 Okt', agent_id: 'be1', status: 'pending', role: 'be', created_at: new Date(2026, 9, 20, 10, 0).getTime() },
        { id: 202, title: 'Task Tanggal 25 Okt', agent_id: 'fe1', status: 'done', role: 'fe', created_at: new Date(2026, 9, 25, 15, 0).getTime() },
        { id: 203, title: 'Task Tanggal 28 Okt', agent_id: 'qa1', status: 'running', role: 'qa', created_at: new Date(2026, 9, 28, 9, 0).getTime() },
      ];
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: customTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      await waitFor(() => screen.getByText(/Task Tanggal 20 Okt/));

      const dateSelect = screen.getByLabelText('Rentang waktu task');
      fireEvent.change(dateSelect, { target: { value: 'custom' } });

      // Region panel kustom muncul
      const customRegion = screen.getByRole('region', { name: 'Pengaturan rentang tanggal kustom' });
      expect(customRegion).toBeTruthy();

      const startInput = screen.getByLabelText('Tanggal awal kustom');
      const endInput = screen.getByLabelText('Tanggal akhir kustom');

      // Set tanggal mulai 2026-10-22 dan tanggal akhir 2026-10-26
      fireEvent.change(startInput, { target: { value: '2026-10-22' } });
      fireEvent.change(endInput, { target: { value: '2026-10-26' } });

      // Hanya task 25 Okt yang tampil
      expect(screen.queryByText(/Task Tanggal 20 Okt/)).toBeNull();
      expect(screen.getByText(/Task Tanggal 25 Okt/)).toBeTruthy();
      expect(screen.queryByText(/Task Tanggal 28 Okt/)).toBeNull();

      // Ringkasan rentang kustom
      expect(screen.getByText(/22 – 26 Okt 2026 · 1 task cocok/)).toBeTruthy();

      // Uji tanggal terbalik (start > end)
      fireEvent.change(startInput, { target: { value: '2026-10-29' } });
      expect(screen.getByText(/Tanggal awal tidak boleh melebihi tanggal akhir/)).toBeTruthy();

      // Tombol kosongkan tanggal kustom
      const clearCustomBtn = screen.getByRole('button', { name: 'Kosongkan tanggal kustom' });
      fireEvent.click(clearCustomBtn);
      expect(startInput.value).toBe('');
      expect(endInput.value).toBe('');
      // Semua task tampil kembali
      expect(screen.getByText(/Task Tanggal 20 Okt/)).toBeTruthy();
      expect(screen.getByText(/Task Tanggal 25 Okt/)).toBeTruthy();
      expect(screen.getByText(/Task Tanggal 28 Okt/)).toBeTruthy();
    });

    it('detail task menampilkan stempel waktu bila tersedia', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: datedTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-open-task-board'));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      await waitFor(() => screen.getByText(/Task Baru Hari Ini/));

      fireEvent.click(screen.getByText(/Task Baru Hari Ini/));
      expect(screen.getByText(/Waktu:/)).toBeTruthy();
      expect(screen.getByText(/Hari ini/)).toBeTruthy();
    });
  });

  describe('TaskBoard — Preset Kombinasi Multi-Tag Kustom', () => {
    const multiTagTasks = [
      { id: 101, title: 'App API & DB #api #sql', status: 'done', role: 'be' },
      { id: 102, title: 'Cloud Deploy #docker #ci/cd', status: 'running', role: 'devops' },
      { id: 103, title: 'Mobile UI #react #ui/ux', status: 'pending', role: 'fe' },
    ];

    it('menampilkan tombol + Preset Baru di strip preset dan membuka form creator saat diklik', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiTagTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      fireEvent.click(screen.getByText('Papan'));
      await waitFor(() => screen.getByText(/App API & DB/));

      const addBtn = screen.getByRole('button', { name: 'Buat preset tag baru' });
      expect(addBtn).toBeTruthy();
      expect(addBtn.textContent).toContain('+ Preset Baru');

      fireEvent.click(addBtn);
      expect(screen.getByRole('form', { name: 'Form pembuatan preset tag kustom' })).toBeTruthy();
      expect(screen.getByPlaceholderText(/Nama preset/)).toBeTruthy();

      // Escape menutup form creator tanpa menutup TaskBoard
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('form', { name: 'Form pembuatan preset tag kustom' })).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Papan task' })).toBeTruthy();
    });

    it('dapat membuat, menyimpan, mengaktifkan, dan menghapus preset kustom', async () => {
      const onFlash = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiTagTasks }) })));
      render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);
      fireEvent.click(screen.getByText('Papan'));
      await waitFor(() => screen.getByText(/App API & DB/));

      // Buka creator preset
      const addBtn = screen.getByRole('button', { name: 'Buat preset tag baru' });
      fireEvent.click(addBtn);

      const nameInput = screen.getByPlaceholderText(/Nama preset/);
      fireEvent.change(nameInput, { target: { value: 'Dev Infra' } });

      // Pilih tag #docker dan #ci/cd di selector
      const dockerToggle = screen.getByRole('button', { name: 'Tag #Docker' });
      const cicdToggle = screen.getByRole('button', { name: 'Tag #CI/CD' });
      fireEvent.click(dockerToggle);
      fireEvent.click(cicdToggle);

      // Submit simpan preset
      const saveBtn = screen.getByRole('button', { name: 'Simpan Preset' });
      expect(saveBtn.disabled).toBe(false);
      fireEvent.click(saveBtn);

      // Form tertutup, toast muncul
      expect(screen.queryByRole('form', { name: 'Form pembuatan preset tag kustom' })).toBeNull();
      expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Preset kustom "Dev Infra" berhasil disimpan'));

      // Chip preset kustom muncul di strip preset
      const customChip = await screen.findByRole('button', { name: /Preset Dev Infra:/ });
      expect(customChip).toBeTruthy();
      expect(customChip.textContent).toContain('Dev Infra');

      // Task terfilter ke task yang memiliki tag #docker atau #ci/cd
      expect(screen.getByText(/Cloud Deploy/)).toBeTruthy();

      // Hapus preset kustom via tombol ✕
      const delBtn = screen.getByRole('button', { name: 'Hapus preset kustom Dev Infra' });
      fireEvent.click(delBtn);

      expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Preset "Dev Infra" dihapus'));
      expect(screen.queryByRole('button', { name: /Preset Dev Infra:/ })).toBeNull();
    });
  });

  describe('Preset Kombinasi Multi-Divisi Kustom & Filter Divisi', () => {
    const multiDivTasks = [
      { id: 201, title: 'Backend REST API', status: 'running', role: 'backend' },
      { id: 202, title: 'Frontend React UI', status: 'done', role: 'fe' },
      { id: 203, title: 'Infra Helm K8s', status: 'pending', role: 'devops' },
      { id: 204, title: 'QA Automated Testing', status: 'review', role: 'qa' },
    ];

    it('menampilkan strip preset divisi dengan preset bawaan dan tombol pembuat preset', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiDivTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      fireEvent.click(screen.getByText('Papan'));
      await waitFor(() => screen.getByText(/Backend REST API/));

      // Preset strip divisi terlihat
      const divPresetStrip = screen.getByRole('group', { name: 'Preset kombinasi divisi' });
      expect(divPresetStrip).toBeTruthy();

      // Preset Fullstack Dev dan Engineering Core hadir
      expect(screen.getByRole('button', { name: /Preset Fullstack Dev:/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Preset Engineering Core:/ })).toBeTruthy();

      // Tombol tambah preset hadir
      const addDivPresetBtn = screen.getByRole('button', { name: 'Buat preset divisi baru' });
      expect(addDivPresetBtn).toBeTruthy();
    });

    it('mengklik preset divisi menyaring task kanban ke divisi terkait dan dapat di-toggle off', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiDivTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      fireEvent.click(screen.getByText('Papan'));
      await waitFor(() => screen.getByText(/Backend REST API/));

      // Klik preset Fullstack (core-be + fe-design)
      const fsBtn = screen.getByRole('button', { name: /Preset Fullstack Dev:/ });
      fireEvent.click(fsBtn);

      // Backend & Frontend tampil, DevOps & QA terfilter keluar
      expect(screen.getByText(/Backend REST API/)).toBeTruthy();
      expect(screen.getByText(/Frontend React UI/)).toBeTruthy();
      expect(screen.queryByText(/Infra Helm K8s/)).toBeNull();
      expect(screen.queryByText(/QA Automated Testing/)).toBeNull();

      // Klik lagi untuk toggle off kembali ke Semua
      fireEvent.click(fsBtn);
      expect(screen.getByText(/Infra Helm K8s/)).toBeTruthy();
      expect(screen.getByText(/QA Automated Testing/)).toBeTruthy();
    });

    it('dapat membuat, menyimpan, dan menghapus preset divisi kustom', async () => {
      const onFlash = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiDivTasks }) })));
      render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);
      fireEvent.click(screen.getByText('Papan'));
      await waitFor(() => screen.getByText(/Backend REST API/));

      // Buka creator preset divisi
      const addBtn = screen.getByRole('button', { name: 'Buat preset divisi baru' });
      fireEvent.click(addBtn);

      expect(screen.getByRole('form', { name: 'Form pembuatan preset divisi kustom' })).toBeTruthy();

      // Input nama preset divisi punya aksesibilitas nama (aria-label), tidak hanya placeholder
      const divNameInput = screen.getByPlaceholderText(/Nama preset/);
      expect(divNameInput.getAttribute('aria-label')).toBe('Nama preset divisi kustom');

      // Isi nama preset
      const nameInput = screen.getByPlaceholderText(/Nama preset/);
      fireEvent.change(nameInput, { target: { value: 'Dev & Ops Squad' } });

      // Pilih divisi Backend dan DevOps di selektor
      const beToggle = screen.getByRole('button', { name: 'Divisi Backend' });
      const devopsToggle = screen.getByRole('button', { name: 'Divisi DevOps' });
      fireEvent.click(beToggle);
      fireEvent.click(devopsToggle);

      // Simpan
      const saveBtn = screen.getByRole('button', { name: 'Simpan Preset' });
      expect(saveBtn.disabled).toBe(false);
      fireEvent.click(saveBtn);

      // Form tertutup, toast muncul
      expect(screen.queryByRole('form', { name: 'Form pembuatan preset divisi kustom' })).toBeNull();
      expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Preset divisi kustom "Dev & Ops Squad" berhasil disimpan'));

      // Chip preset kustom hadir
      const customChip = await screen.findByRole('button', { name: /Preset Dev & Ops Squad:/ });
      expect(customChip).toBeTruthy();

      // Hapus preset kustom
      const delBtn = screen.getByRole('button', { name: 'Hapus preset kustom Dev & Ops Squad' });
      fireEvent.click(delBtn);

      expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Preset divisi "Dev & Ops Squad" dihapus'));
      expect(screen.queryByRole('button', { name: /Preset Dev & Ops Squad:/ })).toBeNull();
    });

    it('event wfs-open-task-board dengan parameter divPreset membuka papan langsung dengan preset divisi tersebut', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiDivTasks }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);

      window.dispatchEvent(new CustomEvent('wfs-open-task-board', { detail: { divPreset: 'fullstack' } }));

      await waitFor(() => screen.getByText(/Backend REST API/));
      expect(screen.getByText(/Backend REST API/)).toBeTruthy();
      expect(screen.getByText(/Frontend React UI/)).toBeTruthy();
      expect(screen.queryByText(/Infra Helm K8s/)).toBeNull();
    });

    it('shortcut event wfs-cycle-div-preset menyiklus preset divisi maju lalu wrap ke semua divisi', async () => {
      const onFlash = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: multiDivTasks }) })));
      render(<TaskBoard onFlash={onFlash} onAsk={() => {}} />);

      // D pertama: 'all' → preset pertama (engineering)
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-cycle-div-preset', { detail: { backward: false } }));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      await waitFor(() => expect(screen.getByText(/Backend REST API/)).toBeTruthy());

      // Engineering Core = BE + FE + Ops + QA → semua task tampil, strip preset aktif
      const engBtn = screen.getByRole('button', { name: /Preset Engineering Core:/ });
      expect(engBtn.getAttribute('aria-pressed')).toBe('true');
      expect(onFlash).toHaveBeenCalledWith(expect.stringContaining('Engineering Core'));

      // D kedua: engineering → fullstack (BE + FE), DevOps & QA tersembunyi
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-cycle-div-preset', { detail: { backward: false } }));
      });
      await waitFor(() => expect(screen.queryByText(/Infra Helm K8s/)).toBeNull());
      expect(screen.getByText(/Backend REST API/)).toBeTruthy();
      expect(screen.getByText(/Frontend React UI/)).toBeTruthy();

      // Shift+D (backward): kembali ke engineering
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-cycle-div-preset', { detail: { backward: true } }));
      });
      await waitFor(() => expect(screen.getByText(/Infra Helm K8s/)).toBeTruthy());
    });

    it('footer hint memuat pintasan D Siklus Preset Divisi', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tasks: [] }) })));
      render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />);
      act(() => {
        window.dispatchEvent(new CustomEvent('wfs-toggle-task-board'));
      });
      await waitFor(() => screen.getByRole('dialog', { name: 'Papan task' }));
      const footer = screen.getByRole('note', { name: /Petunjuk pintasan keyboard/i });
      expect(within(footer).getByText('D')).toBeTruthy();
      expect(within(footer).getByText('Siklus Preset Divisi')).toBeTruthy();
    });
  });
});

describe('TaskBoard — guard poll out-of-order (rid): respons LAMA tak menimpa poll BARU', () => {
  afterEach(() => { vi.useRealTimers() })

  function stubDeferred() {
    // consume-once resolver: settle ulang slot yang sama = error (mencegah test
    // palsu yang me-resolve promise sudah-settle / no-op).
    const pending = new Map() // seq → resolve
    let seq = 0
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/wfs-api/tasks')) {
        const s = ++seq
        return new Promise((resolve) => { pending.set(s, resolve) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }))
    return {
      count: () => seq,
      async settle(s, tasks, opts = {}) {
        const res = pending.get(s)
        if (!res) throw new Error('fetch ke-' + s + ' tidak ditemukan / sudah dipakai')
        pending.delete(s)
        await act(async () => {
          res(opts.fail ? { ok: false, status: 503, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ tasks }) })
        })
      },
    }
  }

  it('poll #1 tertahan (gateway lambat), interval menyulut poll #2 → respons LAMA tiba belakangan tak menimpa daftar BARU (out-of-order)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true }) // interval 8 dtk pada instansi sama
    const t = stubDeferred()
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => expect(t.count()).toBe(1)) // poll mount tertahan
    await act(async () => { vi.advanceTimersByTime(8000) }) // poll #2 via interval
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, [{ id: 2, title: 'Task BARU', agent_id: 'fe1', status: 'pending', role: 'fe' }])
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
    await t.settle(1, [{ id: 1, title: 'Task LAMA', agent_id: 'be1', status: 'pending', role: 'be' }]) // #1 (LAMA) tiba belakangan
    expect(screen.queryByText(/Task LAMA/)).toBeNull() // kode lama: daftar mundur
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
  })

  it('poll LAMA GAGAL tiba setelah poll BARU sukses → banner "Gagal memuat task" basi tidak muncul', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const t = stubDeferred()
    render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => expect(t.count()).toBe(1))
    await act(async () => { vi.advanceTimersByTime(8000) })
    await waitFor(() => expect(t.count()).toBe(2))
    await t.settle(2, [{ id: 2, title: 'Task BARU', agent_id: 'fe1', status: 'pending', role: 'fe' }])
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
    await t.settle(1, [], { fail: true }) // poll #1 (LAMA) gagal tiba belakangan
    expect(screen.queryByText(/Gagal memuat task/)).toBeNull() // kode lama: banner basi muncul
    expect(screen.getByText(/Task BARU/)).toBeTruthy()
  })

  it('refresh pasca-run menang atas poll pra-run menggantung (run → load rid lebih tinggi); status task tak mundur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true }) // untuk interval 8 dtk
    // Stub hanya mendefer URL '/wfs-api/tasks' EXACT (poll); POST /tasks/1/run
    // & jalur lain instan — agar poll #2 benar-benar in-flight terpisah.
    const pending = new Map()
    let seq = 0
    let lastTasksBody = null
    vi.stubGlobal('fetch', vi.fn((url, opts = {}) => {
      const u = String(url)
      if (u === '/wfs-api/tasks') {
        const s = ++seq
        return new Promise((resolve) => { pending.set(s, resolve) })
      }
      if (u === '/wfs-api/tasks/1/run') {
        lastTasksBody = 'run'
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
    }))
    const ask = { onOk: null }
    render(<TaskBoard onFlash={() => {}} onAsk={(a) => { ask.onOk = a.onOk }} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => expect(seq).toBe(1))
    const settle = async (s, tasks) => {
      const res = pending.get(s)
      if (!res) throw new Error('fetch ke-' + s + ' sudah dipakai')
      pending.delete(s)
      await act(async () => {
        res({ ok: true, status: 200, json: async () => ({ tasks }) })
      })
    }
    await settle(1, [{ id: 1, title: 'Porting modul', agent_id: 'be1', status: 'pending', role: 'be' }])
    fireEvent.click(screen.getByText(/Porting modul/))
    fireEvent.click(screen.getByText(/Jalankan task/)) // memicu onAsk (bukan run langsung)
    expect(ask.onOk).toBeTruthy()
    await act(async () => { ask.onOk() }) // run: POST /run lalu load() (fetch #2, rid tertinggi)
    expect(lastTasksBody).toBe('run')
    await waitFor(() => expect(seq).toBe(2))
    // poll interval pra-run juga menyusul menggantung (#3, rid LEBIH RENDAH
    // dari refresh pasca-run) — tiba belakangan.
    await act(async () => { vi.advanceTimersByTime(8000) })
    await waitFor(() => expect(seq).toBe(3))
    await settle(2, [{ id: 1, title: 'Porting modul', agent_id: 'be1', status: 'running', role: 'be' }])
    expect(screen.getByText(/Jalan 1/)).toBeTruthy()
    await settle(3, [{ id: 1, title: 'Porting modul', agent_id: 'be1', status: 'pending', role: 'be' }])
    expect(screen.queryByText(/Antri 1/)).toBeNull() // kode lama: status mundur ke pra-run
    expect(screen.getByText(/Jalan 1/)).toBeTruthy()
  })

  it('unmount saat poll menggantung → respons telat tidak menulis state komponen gugur (0 act-error)', async () => {
    const t = stubDeferred()
    const { unmount } = render(<TaskBoard onFlash={() => {}} onAsk={() => {}} />)
    fireEvent.click(screen.getByText('Papan'))
    await waitFor(() => expect(t.count()).toBe(1))
    unmount() // poll masih menggantung
    await t.settle(1, [{ id: 1, title: 'Hantu', agent_id: 'be1', status: 'pending', role: 'be' }]) // tak boleh throw act-error
  })
})
