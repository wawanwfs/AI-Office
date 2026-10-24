// @vitest-environment jsdom
// Unit test komponen WfsPanel (chat + konfigurasi), CsWidget, dan SkipLink —
// melengkapi cakupan komponen (sebelumnya belum punya test langsung).
// Mock ../lib/api agar fetch tidak perlu di-stub global per kasus.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

let apiMock
vi.mock('../lib/api', () => ({ api: (...a) => apiMock(...a) }))

import WfsPanel from '../components/WfsPanel'
import CsWidget from '../components/CsWidget'
import SkipLink from '../components/SkipLink'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const agents = [
  { id: 'be1', name: 'be1', role: 'Backend' },
  { id: 'fe1', name: 'fe1', role: 'Frontend' },
]

beforeEach(() => {
  apiMock = vi.fn(async (path, opt = {}) => {
    if (path === 'agents') return { agents }
    if (path === 'agents/status') return { agents: { be1: { done: 2, running: 1, pending: 0, review: 0, failed: 0 } } }
    if (String(path).startsWith('config/')) return { base: '', model: 'gpt-4o-mini', prompt: '', key_hint: 'sk-…ab' }
    throw new Error('unexpected ' + path)
  })
})

describe('WfsPanel — buka/tutup & tab', () => {
  it('tutup → hanya tombol Chat yang tampil; buka → dialog + daftar agent', async () => {
    const { container } = render(<WfsPanel />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Buka|Chat/ }))
    const dlg = await screen.findByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(screen.getByLabelText('Pilih agent').value).toBe('be1'))
    // tutup via tombol ✕
    fireEvent.click(screen.getByRole('button', { name: 'Tutup panel chat' }))
    expect(container.querySelector('#wfs-panel')).toBeNull()
  })

  it('roving tabindex: tab aktif tabIndex 0, lain -1; klik pindah tab', async () => {
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    const chatTab = await screen.findByRole('tab', { name: /Chat/ })
    const cfgTab = screen.getByRole('tab', { name: /Model API/ })
    expect(chatTab.tabIndex).toBe(0)
    expect(cfgTab.tabIndex).toBe(-1)
    fireEvent.click(cfgTab)
    await waitFor(() => expect(screen.getByLabelText('API Key').placeholder).toContain('sk-…ab'))  // config termuat asinkron
    expect(screen.getByLabelText('Base URL')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Model API/ }).tabIndex).toBe(0)
  })

  it('kirim chat: input kosong → tombol disabled; pesan terkirim muncul di log', async () => {
    apiMock = vi.fn(async (path, opt = {}) => {
      if (path === 'agents') return { agents }
      if (path === 'agents/status') return { agents: {} }
      if (path === 'chat') return { reply: 'Halo dari AI' }
      if (String(path).startsWith('config/')) return { base: '', model: '', prompt: '', key_hint: '' }
      throw new Error('unexpected ' + path)
    })
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    const inp = await screen.findByLabelText('Pesan')
    const send = screen.getByRole('button', { name: 'Kirim' })
    expect(send.disabled).toBe(true)
    fireEvent.change(inp, { target: { value: 'Hai' } })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(await screen.findByText('Halo dari AI')).toBeTruthy()
    expect(apiMock.mock.calls.some(c => c[0] === 'chat' && c[1].body.agent_id === 'be1')).toBe(true)
  })

  it('error chat → pesan alert dengan tombol kirim ulang', async () => {
    apiMock = vi.fn(async (path, opt = {}) => {
      if (path === 'agents') return { agents }
      if (path === 'agents/status') return { agents: {} }
      if (path === 'chat') throw new Error('gateway mati')
      if (String(path).startsWith('config/')) return { base: '', model: '', prompt: '', key_hint: '' }
      throw new Error('unexpected ' + path)
    })
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    const inp = await screen.findByLabelText('Pesan')
    fireEvent.change(inp, { target: { value: 'Hai' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/gateway mati/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kirim ulang' })).toBeTruthy()
  })

  it('simpan konfigurasi → POST config & pesan sukses', async () => {
    apiMock = vi.fn(async (path, opt = {}) => {
      if (path === 'agents') return { agents }
      if (path === 'agents/status') return { agents: {} }
      if (path === 'config/be1' && (opt?.method || 'GET') === 'POST') return { ok: true }
      if (path === 'config/be1') return { base: 'https://x/v1', model: 'm1', prompt: '', key_hint: '' }
      throw new Error('unexpected ' + path)
    })
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    fireEvent.click(await screen.findByRole('tab', { name: /Model API/ }))
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: 'https://x/v1' } })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'm1' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan/ }))
    expect(await screen.findByText('✅ Tersimpan')).toBeTruthy()
    expect(apiMock.mock.calls.some(c => c[0] === 'config/be1' && c[1]?.method === 'POST' && c[1]?.body?.model === 'm1')).toBe(true)
  })
})

describe('CsWidget', () => {
  it('buka → dialog aria-modal + iframe dengan src VITE_CS_WIDGET_URL; tutup via ✕ & Escape', async () => {
    vi.stubEnv('VITE_CS_WIDGET_URL', 'https://cs.example.com/w')
    render(<CsWidget />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Buka widget AI CS' }))
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    const frame = dlg.querySelector('iframe')
    expect(frame.getAttribute('src')).toBe('https://cs.example.com/w')
    fireEvent.click(screen.getByRole('button', { name: 'Tutup widget CS' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    // Escape membuka lalu menutup (useDialogA11y)
    fireEvent.click(screen.getByRole('button', { name: 'Buka widget AI CS' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('SkipLink', () => {
  it('awal tersembunyi; klik membuka panel WFS & memindahkan fokus ke input', () => {
    const trg = document.createElement('button')
    trg.setAttribute('aria-controls', 'wfs-panel')
    document.body.appendChild(trg)
    const panel = document.createElement('div')
    panel.id = 'wfs-panel'
    const inp = document.createElement('textarea')
    panel.appendChild(inp)
    document.body.appendChild(panel)
    const { container } = render(<SkipLink />)
    const link = container.querySelector('a')
    expect(link.className).not.toContain('vis')
    fireEvent.focus(link)
    expect(link.className).toContain('vis')
    const clickSpy = vi.spyOn(trg, 'click')
    fireEvent.click(link)
    expect(clickSpy).not.toHaveBeenCalled()       // panel sudah ada → tidak perlu klik pemicu
    expect(document.activeElement).toBe(inp)
    expect(link.getAttribute('href')).toBe('#wfs-panel')
    trg.remove(); panel.remove()
  })

  it('panel belum ada → klik pemicu (tombol dgn aria-controls) untuk membukanya', () => {
    const trg = document.createElement('button')
    trg.setAttribute('aria-controls', 'wfs-panel')
    document.body.appendChild(trg)
    const clickSpy = vi.spyOn(trg, 'click')
    const { container } = render(<SkipLink />)
    fireEvent.click(container.querySelector('a'))
    expect(clickSpy).toHaveBeenCalled()
    trg.remove()
  })
})
