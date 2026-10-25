// @vitest-environment jsdom
// Unit test komponen sederhana: ConfirmModal, OverlayHelp, ActivityLog, HUD,
// Ticker (fetch mock), ActionMenu (navigasi menu + aksi), QuickToolbar (render),
// ErrorBoundary, TeamStats, Header. Melengkapi cakupan komponen src/components.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'

import ConfirmModal from '../components/ConfirmModal'
import OverlayHelp from '../components/OverlayHelp'
import ActivityLog from '../components/ActivityLog'
import HUD from '../components/HUD'
import Header from '../components/Header'
import TeamStats from '../components/TeamStats'
import ErrorBoundary from '../components/ErrorBoundary'
import ActionMenu from '../components/ActionMenu'
import QuickToolbar from '../components/QuickToolbar'
import ProjectPanel from '../components/ProjectPanel'

let apiMock
vi.mock('../lib/api', () => ({ api: (...a) => apiMock(...a) }))
vi.mock('../lib/clip.js', () => ({ clip: (s, n) => String(s).slice(0, n) }))

import Ticker from '../components/Ticker'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
beforeEach(() => {
  apiMock = vi.fn(async (path) => {
    if (path === 'tasks') return { tasks: [
      { id: 1, title: 'Fix UI', status: 'done', agent_id: 'be1' },
      { id: 2, title: 'Deploy', status: 'running', agent_id: 'fe1' },
    ] }
    if (path === 'agents') return { agents: [{ id: 'be1', name: 'Budi' }, { id: 'fe1', name: 'Feri' }] }
    if (path === 'status') return { mem_total_mb: 8000, mem_available_mb: 3000, disk_used_gb: 20, disk_total_gb: 50 }
    throw new Error('unexpected ' + path)
  })
})

describe('ConfirmModal', () => {
  it('show=false → null; show → alertdialog dengan tombol kustom & danger', () => {
    const { rerender } = render(<ConfirmModal show={false} title="t" text="x" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    const onConfirm = vi.fn(), onCancel = vi.fn()
    rerender(<ConfirmModal show title="Hapus?" text="Yakin" confirmLabel="Hapus" danger onConfirm={onConfirm} onCancel={onCancel} />)
    const container = document
    const dlg = screen.getByRole('alertdialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hapus' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    // klik scrim membatalkan, klik dalam modal tidak (stopPropagation)
    fireEvent.click(container.querySelector('.modal-scrim'))
    expect(onCancel).toHaveBeenCalledTimes(2)
    fireEvent.click(dlg)
    expect(onCancel).toHaveBeenCalledTimes(2)
    // tombol tutup silang (IconClose) memicu onCancel
    const xBtn = screen.getByRole('button', { name: /Tutup dialog konfirmasi/i })
    expect(xBtn.getAttribute('title')).toBe('Batal (Esc)')
    fireEvent.click(xBtn)
    expect(onCancel).toHaveBeenCalledTimes(3)
  })
  it('busy → label Memproses… dan tombol disabled', () => {
    render(<ConfirmModal show title="t" text="x" busy onConfirm={() => {}} onCancel={() => {}} />)
    const b = screen.getByRole('button', { name: 'Memproses…' })
    expect(b.disabled).toBe(true)
  })
})

describe('OverlayHelp', () => {
  it('show=false → null; navigasi langkah, disabled di awal, Selesai di akhir', () => {
    const onClose = vi.fn()
    const { rerender } = render(<OverlayHelp show={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<OverlayHelp show onClose={onClose} />)
    expect(screen.getByText(/1\/6/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Sebelumnya/ }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Berikutnya/ }))
    expect(screen.getByText(/2\/6/)).toBeTruthy()
    // bantulah Esc: tutup via dialog a11y → onClose
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  it('tombol Selesai pada langkah terakhir memanggil onClose', () => {
    const onClose = vi.fn()
    render(<OverlayHelp show onClose={onClose} />)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: /Berikutnya|Selesai/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Selesai' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('tombol tutup pojok kanan atas memanggil onClose', () => {
    const onClose = vi.fn()
    render(<OverlayHelp show onClose={onClose} />)
    const btn = screen.getByRole('button', { name: 'Tutup panduan' })
    expect(btn.getAttribute('title')).toBe('Tutup panduan (Esc)')
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('konten langkah dibungkus region aria-live (pengumuman SR saat navigasi)', () => {
    render(<OverlayHelp show onClose={() => {}} />)
    const liveBox = screen.getByText(/1\/6/).closest('[aria-live="polite"]')
    expect(liveBox).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Berikutnya/ }))
    expect(within(liveBox).getByText(/2\/6/)).toBeTruthy()
  })
})

describe('ActivityLog', () => {
  it('render item dengan warna status; kosong → pesan; Bersihkan & Tutup', () => {
    const onClose = vi.fn(), onClear = vi.fn()
    const items = [{ t: '03:00', status: 'done', label: 'selesai', id: 1, title: 'Fix UI' }]
    const { rerender } = render(<ActivityLog show items={items} onClose={onClose} onClear={onClear} />)
    expect(screen.getByText('Log Aktivitas')).toBeTruthy()
    expect(screen.getByText(/Fix UI/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bersihkan' })).toBeTruthy()
    const xBtn = screen.getByRole('button', { name: 'Tutup log aktivitas' })
    expect(xBtn.getAttribute('title')).toBe('Tutup log aktivitas (Esc)')
    fireEvent.click(screen.getByRole('button', { name: 'Bersihkan' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    rerender(<ActivityLog show items={[]} onClose={onClose} onClear={onClear} />)
    expect(screen.getByText(/Belum ada perubahan/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Bersihkan' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tutup log aktivitas' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('HUD & Header', () => {
  it('HUD menampilkan jam, status, dan meneruskan perubahan slider', () => {
    const onTimeChange = vi.fn()
    render(<HUD time="09:30" timeValue={570} status="1 jalan" statusKind="run" onTimeChange={onTimeChange} />)
    expect(screen.getByText('09:30')).toBeTruthy()
    expect(screen.getByText('1 jalan')).toBeTruthy()
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '600' } })
    expect(onTimeChange).toHaveBeenCalledWith(600)
    expect(slider.getAttribute('aria-valuetext')).toBe('09:30')
  })
  it('Header menampilkan judul & sub', () => {
    render(<Header />)
    expect(screen.getByText(/WFS/)).toBeTruthy()
    expect(screen.getByText(/PROJECT/)).toBeTruthy()
    expect(screen.getByText(/Autonomous AI Software House/)).toBeTruthy()
  })
})

describe('Ticker', () => {
  it('memuat data gateway: ringkasan task, daftar task terbaru, resource host', async () => {
    const { container } = render(<Ticker />)
    const sum = await screen.findAllByText(/2 task · 1 done · 1 running/)
 expect(sum.length).toBeGreaterThanOrEqual(1)
 expect(screen.getAllByText(/Budi — Fix UI \[done\]/).length).toBeGreaterThanOrEqual(1)
 expect(screen.getAllByText(/Feri — Deploy \[running\]/).length).toBeGreaterThanOrEqual(1)
 expect(screen.getAllByText(/Host RAM tersedia 3000\/8000 MB/).length).toBeGreaterThanOrEqual(1)
 // live region screen reader berisi teks gabungan
 const live = container.querySelector('#ticker-live')
    expect(live.textContent).toContain('2 task')
    // track marquee aria-hidden
    expect(container.querySelector('.track')).toBeTruthy()
  })
  it('gateway gagal → pesan offline', async () => {
    apiMock.mockRejectedValue(new Error('down'))
    render(<Ticker />)
    await waitFor(() => expect(screen.getByText('Gateway offline — mencoba lagi…')).toBeTruthy())
  })
})

describe('TeamStats', () => {
  it('buka panel → ringkasan status, total file, task terbaru, tombol tutup', async () => {
    apiMock.mockImplementation(async (path) => {
      if (path === 'tasks') return { tasks: [
        { id: 1, title: 'Fix UI', status: 'done', files: ['a.js', 'b.js'] },
        { id: 2, title: 'Deploy', status: 'running', files: [] },
      ] }
      if (path === 'system/resources') return { load: 0.5, ram_mb: 1234, containers: [] }
      throw new Error('unexpected ' + path)
    })
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    await screen.findByRole('dialog', { name: 'Statistik tim' })
    await waitFor(() => expect(screen.getByText(/Total file dihasilkan/)).toBeTruthy())
    expect(screen.getByText('2')).toBeTruthy() // 2 task selesai
    expect(screen.getByText('#1 Fix UI')).toBeTruthy()
    expect(screen.getByText(/load 0.5 · RAM 1234 MB/)).toBeTruthy()
    const closeBtn = screen.getByRole('button', { name: 'Tutup statistik' })
    expect(closeBtn.getAttribute('title')).toBe('Tutup statistik (Esc)')
    expect(closeBtn.querySelector('svg')).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: 'Statistik tim' })).toBeNull()
  })
  it('gateway offline → role=alert + tombol Coba lagi memicu fetch ulang', async () => {
    apiMock.mockRejectedValue(new Error('down'))
    render(<TeamStats />)
    fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Gateway offline/)
    apiMock.mockImplementation(async (p) => p === 'tasks' ? { tasks: [] } : {})
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
    await waitFor(() => expect(screen.getByText(/Belum ada task/)).toBeTruthy())
  })
})

describe('ProjectPanel', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('fetch /wfs-project → progres task, SaaS online, sandbox agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      tasks: { total: 23, done: 20, running: 1, pending: 2, failed: 0, review: 0,
        recent: [{ id: 23, title: 'Fix UI', status: 'done' }] },
      saas: { online: true, stats: { tenants: 3, conversations: 12, messages: 40 }, tenants: [{ name: 'TokoA' }] },
      agents: [{ name: 'be1', status: 'Up' }, { name: 'qa1', status: 'Down' }],
    }) })))
    render(<ProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Proyek/ }))
    await screen.findByRole('dialog', { name: 'Proyek dibantuin.com' })
    await waitFor(() => expect(screen.getByText(/20\/23 task selesai \(87%\)/)).toBeTruthy())
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('87')
    expect(screen.getByText(/Backend online/)).toBeTruthy()
    expect(screen.getByText(/3 tenant · 12 percakapan · 40 pesan/)).toBeTruthy()
    expect(screen.getByText(/TokoA/)).toBeTruthy()
    expect(screen.getByText(/be1/)).toBeTruthy()
    expect(screen.getByText(/qa1/)).toBeTruthy()
    const closeBtn = screen.getByRole('button', { name: 'Tutup panel proyek' })
    expect(closeBtn.getAttribute('title')).toBe('Tutup panel proyek (Esc)')
    expect(closeBtn.querySelector('svg')).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('dialog', { name: 'Proyek dibantuin.com' })).toBeNull()
  })
  it('fetch gagal → pesan error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    render(<ProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Proyek/ }))
    await screen.findByRole('dialog', { name: 'Proyek dibantuin.com' })
    await waitFor(() => expect(screen.getByText(/Gagal memuat data proyek/)).toBeTruthy())
  })
})

describe('ErrorBoundary', () => {
  function Boom() { throw new Error('meledak') }
  it('menangkap error render dan menampilkan fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(container.textContent).toMatch(/error|gagal|Oops|terjadi/i)
    spy.mockRestore()
  })
  it('tanpa error → children dirender', () => {
    const { container } = render(<ErrorBoundary><p>aman</p></ErrorBoundary>)
    expect(container.textContent).toBe('aman')
  })
})

describe('ActionMenu', () => {
  const mkScene = () => ({
    isNamesVisible: () => true,
    isAutoRotate: () => false,
    teamAction: vi.fn(),
  })
  // ActionMenu punya state internal — menu dibuka dengan klik tombol ⚡ Aksi
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: '⚡Aksi' }))
  it('expose amApi via actionMenuRef; teamAction dipanggil lalu menu tertutup', () => {
    const scene = mkScene()
    const ref = { current: null }
    const onFlash = vi.fn()
    render(<ActionMenu sceneRef={{ current: scene }} onFlash={onFlash} actionMenuRef={ref} />)
    openMenu()
    expect(ref.current).toBeTruthy()
    expect(typeof ref.current.toggleNames).toBe('function')
    expect(typeof ref.current.toggleRotate).toBe('function')
    // klik aksi meeting
    fireEvent.click(screen.getByRole('menuitem', { name: /Meeting sekarang/ }))
    expect(scene.teamAction).toHaveBeenCalledWith('meeting')
    expect(onFlash).toHaveBeenCalled()
  })
  it('scene tidak aktif → onFlash error, tidak crash', () => {
    const onFlash = vi.fn()
    render(<ActionMenu sceneRef={{ current: null }} onFlash={onFlash} actionMenuRef={{ current: null }} />)
    openMenu()
    const items = screen.getAllByRole('menuitem')
    fireEvent.click(items[0])
    expect(onFlash).toHaveBeenCalledWith(expect.stringMatching(/tidak aktif/i), true)
  })
  it('navigasi panah memindahkan fokus antar item menu (menuitem + checkbox)', () => {
    const scene = mkScene()
    render(<ActionMenu sceneRef={{ current: scene }} onFlash={vi.fn()} actionMenuRef={{ current: null }} />)
    openMenu()
    const els = [...document.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')]
    fireEvent.keyDown(els[0], { key: 'End' })
    expect(document.activeElement).toBe(els[els.length - 1])
    fireEvent.keyDown(els[els.length - 1], { key: 'Home' })
    expect(document.activeElement).toBe(els[0])
    fireEvent.keyDown(els[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(els[els.length - 1])
    fireEvent.keyDown(els[els.length - 1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(els[0])
  })
})

describe('QuickToolbar', () => {
  it('render semua tombol; paused=false → Jeda; paused=true → Lanjut', () => {
    const props = {
      onAddTask: vi.fn(), onPauseAll: vi.fn(), onResumeAll: vi.fn(),
      onToggleTheme: vi.fn(), theme: 'dark', onZoomIn: vi.fn(), onZoomOut: vi.fn(),
      onSetView: vi.fn(), paused: false,
    }
    const { rerender } = render(<QuickToolbar {...props} />)
    expect(screen.getByRole('button', { name: 'Tambah task baru' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jeda semua task' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lampu neon' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Perbesar' }))
    expect(props.onZoomIn).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Kamera iso' }))
    expect(props.onSetView).toHaveBeenCalledWith('iso')
    fireEvent.click(screen.getByRole('button', { name: 'Lampu neon' }))
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1)
    rerender(<QuickToolbar {...props} paused={true} />)
    expect(screen.getByRole('button', { name: 'Lanjutkan semua task' })).toBeTruthy()
  })
})
