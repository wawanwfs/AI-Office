// @vitest-environment jsdom
// Unit test komponen UI kecil (header, HUD, modal, log, ticker, task modal, help,
// flag modal terpusat) — melengkapi TaskBoard.test.jsx (satu-satunya komponen tercakup).
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Header from '../components/Header'
import HUD from '../components/HUD'
import ConfirmModal from '../components/ConfirmModal'
import ActivityLog from '../components/ActivityLog'
import Ticker from '../components/Ticker'
import TaskModal from '../components/TaskModal'
import OverlayHelp from '../components/OverlayHelp'
import { useModalFlag, anyModalOpen } from '../lib/modal'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function ModalProbe({ open }) {
  useModalFlag(open)
  return null
}

describe('Header', () => {
  it('menampilkan judul & subjudul markas', () => {
    render(<Header />)
    expect(screen.getByText('WFS')).toBeTruthy()
    expect(screen.getByText('Project HQ')).toBeTruthy()
    expect(screen.getByText(/dibantuin\.com/)).toBeTruthy()
  })
})

describe('HUD', () => {
  it('jam tampil berformat HH:MM dari menit', () => {
    render(<HUD time="10:30" timeValue={630} status="ok" statusKind="" onTimeChange={() => {}} />)
    expect(screen.getByText('10:30')).toBeTruthy()
    expect(screen.getByText('ok')).toBeTruthy()
  })
  it('slider memanggil onTimeChange dengan angka (bukan string)', () => {
    const onTime = vi.fn()
    render(<HUD time="10:30" timeValue={630} status="ok" statusKind="" onTimeChange={onTime} />)
    fireEvent.change(screen.getByLabelText('Waktu simulasi'), { target: { value: '720' } })
    expect(onTime).toHaveBeenCalledWith(720)
  })
  it('slider rentang 0..1440 langkah 1 menit', () => {
    render(<HUD time="00:00" timeValue={0} status="s" statusKind="" onTimeChange={() => {}} />)
    const s = screen.getByLabelText('Waktu simulasi')
    expect(s.getAttribute('min')).toBe('0')
    expect(s.getAttribute('max')).toBe('1440')
    expect(s.getAttribute('step')).toBe('1')
  })
})

describe('ConfirmModal', () => {
  it('tidak dirender saat show=false', () => {
    const { container } = render(<ConfirmModal show={false} title="t" text="b" onConfirm={() => {}} onCancel={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
  it('menampilkan judul & teks, tombol konfirmasi memicu onConfirm', () => {
    const onOk = vi.fn(), onNo = vi.fn()
    render(<ConfirmModal show title="Jeda semua task?" text="semua dihentikan" confirmLabel="Ya, jeda" onConfirm={onOk} onCancel={onNo} />)
    expect(screen.getByText('Jeda semua task?')).toBeTruthy()
    fireEvent.click(screen.getByText('Ya, jeda'))
    expect(onOk).toHaveBeenCalledTimes(1)
    expect(onNo).not.toHaveBeenCalled()
  })
  it('tombol Batal memicu onCancel', () => {
    const onOk = vi.fn(), onNo = vi.fn()
    render(<ConfirmModal show title="t" text="b" onConfirm={onOk} onCancel={onNo} />)
    fireEvent.click(screen.getByText('Batal'))
    expect(onNo).toHaveBeenCalledTimes(1)
    expect(onOk).not.toHaveBeenCalled()
  })
  it('busy: tombol konfirmasi disabled & label Memproses…', () => {
    const onOk = vi.fn()
    render(<ConfirmModal show title="t" text="b" busy onConfirm={onOk} onCancel={() => {}} />)
    const b = screen.getByText('Memproses…')
    expect(b.disabled).toBe(true)
    fireEvent.click(b)
    expect(onOk).not.toHaveBeenCalled()
  })
})

describe('ActivityLog', () => {
  it('kosong: pesan belum ada aktivitas & tombol Bersihkan tidak tampil', () => {
    render(<ActivityLog show items={[]} onClose={() => {}} onClear={() => {}} />)
    expect(screen.getByText(/Belum ada perubahan status/)).toBeTruthy()
    expect(screen.queryByText('Bersihkan')).toBeNull()
  })
  it('menampilkan item log dengan warna status', () => {
    const items = [{ t: '10:00', id: 7, status: 'failed', label: 'gagal', title: 'Endpoint chat' }]
    render(<ActivityLog show items={items} onClose={() => {}} onClear={() => {}} />)
    expect(screen.getByText('gagal')).toBeTruthy()
    expect(screen.getByText(/#7 Endpoint chat/)).toBeTruthy()
    expect(screen.getByText('10:00')).toBeTruthy()
  })
  it('tombol Tutup & Bersihkan memicu callback', () => {
    const onClose = vi.fn(), onClear = vi.fn()
    render(<ActivityLog show items={[{ t: 'x', id: 1, status: 'done', label: 'selesai', title: 't' }]} onClose={onClose} onClear={onClear} />)
    fireEvent.click(screen.getByText('Tutup'))
    fireEvent.click(screen.getByText('Bersihkan'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })
  it('show=false → tidak dirender', () => {
    const { container } = render(<ActivityLog show={false} items={[]} onClose={() => {}} onClear={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
})

describe('Ticker', () => {
  it('sebelum data: fallback "Gateway belum terhubung"', () => {
    render(<Ticker />)
    // pesan muncul 2× (live region + track marquee) — ambil yang pertama
    expect(screen.getAllByText(/Gateway belum terhubung/).length).toBeGreaterThanOrEqual(1)
  })
  it('memuat data gateway: ringkasan task + RAM host', async () => {
    const tasks = [
      { id: 1, title: 'Buat API invoice', agent_id: 'be1', status: 'done' },
      { id: 2, title: 'Fix UI', agent_id: 'fe1', status: 'running' },
    ]
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('tasks')) return { ok: true, json: async () => ({ tasks }) }
      if (String(url).includes('agents')) return { ok: true, json: async () => ({ agents: [{ id: 'be1', name: 'Budi' }] }) }
      return { ok: true, json: async () => ({ mem_total_mb: 7400, mem_available_mb: 3200, disk_used_gb: 21, disk_total_gb: 50 }) }
    }))
    render(<Ticker />)
    await waitFor(() => expect(screen.getAllByText(/2 task · 1 done · 1 running/).length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText(/Budi — Buat API invoice \[done\]/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Host RAM tersedia 3200\/7400 MB/).length).toBeGreaterThanOrEqual(1)
  })
  it('gateway error → pesan offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    render(<Ticker />)
    await waitFor(() => expect(screen.getAllByText(/Gateway offline/).length).toBeGreaterThanOrEqual(1))
  })
})

describe('TaskModal', () => {
  it('tidak dirender saat show=false', () => {
    const { container } = render(<TaskModal show={false} onClose={() => {}} onDone={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
  it('judul kosong → error validasi tanpa POST', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<TaskModal show onClose={() => {}} onDone={() => {}} />)
    fireEvent.click(screen.getByText('Simpan'))
    expect(screen.getByText('Judul task wajib diisi')).toBeTruthy()
    expect(f).not.toHaveBeenCalled()
  })
  it('submit valid → POST /wfs-api/tasks (tanpa run)', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ task_id: 42 }) }))
    vi.stubGlobal('fetch', f)
    const onDone = vi.fn(), onClose = vi.fn()
    render(<TaskModal show onClose={onClose} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Buat endpoint /api/invoice' } })
    fireEvent.click(screen.getByText('Simpan'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Task #42 dibuat (pending)'))
    const [url, opts] = f.mock.calls[0]
    expect(url).toBe('/wfs-api/tasks')
    expect(JSON.parse(opts.body).title).toBe('Buat endpoint /api/invoice')
    expect(f.mock.calls.every(c => !String(c[0]).includes('/run'))).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })
  it('Simpan & Jalankan → POST tasks lalu POST tasks/{id}/run, onDone "dijalankan"', async () => {
    const f = vi.fn(async (url) => {
      if (String(url) === '/wfs-api/tasks') return { ok: true, status: 200, json: async () => ({ task_id: 88 }) }
      if (String(url) === '/wfs-api/tasks/88/run') return { ok: true, status: 200, json: async () => ({}) }
      throw new Error('unexpected ' + url)
    })
    vi.stubGlobal('fetch', f)
    const onDone = vi.fn()
    render(<TaskModal show onClose={() => {}} onDone={onDone} />)
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Deploy bot' } })
    fireEvent.click(screen.getByText('Simpan & Jalankan'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Task #88 dibuat & dijalankan'))
    expect(f.mock.calls.length).toBe(2)
    expect(f.mock.calls[1][0]).toBe('/wfs-api/tasks/88/run')
    expect(f.mock.calls[1][1].method).toBe('POST')
  })
  it('error API saat submit → pesan tampil di elemen alert, modal tetap terbuka', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Server error' }) })))
    const onClose = vi.fn()
    render(<TaskModal show onClose={onClose} onDone={() => {}} />)
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Simpan'))
    await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toBe('Server error')
    expect(onClose).not.toHaveBeenCalled()
    // form kembali siap: tombol tidak stuck disabled
    await waitFor(() => expect(screen.getByText('Simpan').disabled).toBe(false))
  })
  it('busy: kedua tombol submit disabled selama fetch berjalan', async () => {
    let resolveApi
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolveApi = r })))
    render(<TaskModal show onClose={() => {}} onDone={() => {}} />)
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'X' } })
    fireEvent.click(screen.getByText('Simpan'))
    expect(screen.getByText('Simpan').disabled).toBe(true)
    expect(screen.getByText('Simpan & Jalankan').disabled).toBe(true)
    resolveApi({ ok: true, status: 200, json: async () => ({ task_id: 1 }) })
    await waitFor(() => expect(screen.getByText('Simpan').disabled).toBe(false))
  })
  it('tombol tutup pojok kanan atas memanggil onClose', () => {
    const onClose = vi.fn()
    render(<TaskModal show onClose={onClose} onDone={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Tutup form task' })
    expect(btn.getAttribute('title')).toBe('Tutup form task (Esc)')
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('OverlayHelp', () => {
  it('langkah pertama dari 6, tombol Sebelumnya disabled', () => {
    render(<OverlayHelp show onClose={() => {}} />)
    expect(screen.getByText(/Navigasi 3D/)).toBeTruthy()
    expect(screen.getByText('(1/6)')).toBeTruthy()
    expect(screen.getByText('← Sebelumnya').disabled).toBe(true)
  })
  it('navigasi maju sampai langkah terakhir → tombol Selesai', () => {
    render(<OverlayHelp show onClose={() => {}} />)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Berikutnya →'))
    expect(screen.getByText('(6/6)')).toBeTruthy()
    expect(screen.queryByText('Berikutnya →')).toBeNull()
    expect(screen.getByText('Selesai')).toBeTruthy()
  })
  it('Selesai memicu onClose', () => {
    const onClose = vi.fn()
    render(<OverlayHelp show onClose={onClose} />)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Berikutnya →'))
    fireEvent.click(screen.getByText('Selesai'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('show=false → tidak dirender', () => {
    const { container } = render(<OverlayHelp show={false} onClose={() => {}} />)
    expect(container.querySelector('.modal')).toBeNull()
  })
})

describe('lib/modal — flag modal terpusat', () => {
  beforeEach(() => {
    // count modul-level: pastikan mulai bersih dengan unmount semua modal aktif
    cleanup()
  })
  it('tidak ada modal → anyModalOpen false', () => {
    render(<ModalProbe open={false} />)
    expect(anyModalOpen()).toBe(false)
  })
  it('modal terbuka → anyModalOpen true; setelah unmount kembali false', () => {
    const { unmount } = render(<ModalProbe open />)
    expect(anyModalOpen()).toBe(true)
    unmount()
    expect(anyModalOpen()).toBe(false)
  })
  it('dua modal bertumpuk: menutup satu masih ada yang terbuka', () => {
    const a = render(<ModalProbe open />)
    render(<ModalProbe open />)
    expect(anyModalOpen()).toBe(true)
    a.unmount()
    expect(anyModalOpen()).toBe(true)
    cleanup()
    expect(anyModalOpen()).toBe(false)
  })
})
