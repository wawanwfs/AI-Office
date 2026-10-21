// @vitest-environment jsdom
// Unit test ProjectPanel (panel 🚀 Proyek dibantuin.com) — komponen UI tanpa test
// langsung sebelumnya (hanya disinggung komentar di dialog_a11y). Kode komponen
// TIDAK diubah; fetch di-stub penuh lewat vi.stubGlobal.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import ProjectPanel from '../components/ProjectPanel'

const DATA = {
  tasks: { total: 30, done: 23, running: 1, review: 2, failed: 1, pending: 3, recent: [{ id: 23, title: 'perbaiki label', status: 'done' }] },
  saas: { online: true, stats: { tenants: 2, messages: 140 }, tenants: [{ name: 'Toko A' }, { name: 'Toko B' }] },
  agents: [{ name: 'be1', status: 'Up' }, { name: 'qa1', status: 'Down' }],
}

const mockOk = () => { const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => DATA })); vi.stubGlobal('fetch', f); return f }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /proyek/i }))

describe('ProjectPanel', () => {
  it('tertutup default → tidak ada fetch, tidak ada dialog', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    render(<ProjectPanel />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('tombol punya aria-expanded=false → true saat dibuka', async () => {
    mockOk()
    render(<ProjectPanel />)
    const btn = screen.getByRole('button', { name: /proyek/i })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
  })

  it('membuka → fetch /wfs-project & progress bar aria-valuenow = 77 (23/30)', async () => {
    const f = mockOk()
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy())
    expect(vi.mocked(f).mock.calls.length).toBeGreaterThan(0)
    expect(f.mock.calls[0][0]).toBe('/wfs-project')
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('77')
    const progBlock = bar.parentElement
    expect(progBlock.textContent.replace(/\s+/g, ' ')).toContain('23/30 task selesai (77%)')
  })

  it('chip status hanya tampil untuk count > 0 (Review: 2, Gagal: 1, Antri: 3, Selesai: 23, Jalan: 1)', async () => {
    mockOk()
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy())
    const chips = screen.getAllByText(/:/).filter(c => /^(Selesai|Jalan|Review|Gagal|Antri):/.test(c.textContent.replace(/\s+/g, ' ')))
    const txt = chips.map(c => c.textContent.replace(/\s+/g, ' ')).sort().join(' | ')
    expect(txt).toContain('Review: 2')
    expect(txt).toContain('Gagal: 1')
    expect(txt).toContain('Antri: 3')
    expect(txt).toContain('Selesai: 23')
    expect(txt).toContain('Jalan: 1')
  })

  it('SaaS online → badge hijau + stats tenant; agent chip hijau/merah sesuai status', async () => {
    mockOk()
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByText(/● Backend online/)).toBeTruthy())
    // stats dipecah beberapa elemen: cari wadah SaaS lalu cek gabungan teksnya
    const badge = screen.getByText(/Backend online/)
    const box = badge.parentElement
    expect(box.textContent).toContain('2 tenant')
    expect(box.textContent).toContain('140 pesan')
    expect(box.textContent).toContain('Toko A, Toko B')
    const up = screen.getByText(/be1/)
    expect(up.textContent).toContain('●')
    const down = screen.getByText(/qa1/)
    expect(down.textContent).toContain('○')
  })

  it('SaaS offline → pesan "Backend SaaS tidak merespons"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...DATA, saas: { online: false } }) })))
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByText('Backend SaaS tidak merespons')).toBeTruthy())
  })

  it('fetch gagal → pesan error + tombol Coba lagi memulihkan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => null })))
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByText(/Gagal memuat data proyek/)).toBeTruthy())
    mockOk()
    fireEvent.click(screen.getByText('Coba lagi'))
    await waitFor(() => expect(screen.queryByText(/Gagal memuat data proyek/)).toBeNull())
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy())
  })

  it('Escape menutup panel (useDialogA11y → onClose)', async () => {
    mockOk()
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: /proyek/i }).getAttribute('aria-expanded')).toBe('false')
  })

  it('task terbaru ditampilkan dengan status ✓', async () => {
    mockOk()
    render(<ProjectPanel />)
    openPanel()
    await waitFor(() => expect(screen.getByText(/#23 perbaiki label/)).toBeTruthy())
  })
})
