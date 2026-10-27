// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import WfsPanel from '../components/WfsPanel'

const AGENTS_RESP = [
  { id: 'a1', name: 'Budi', role: 'backend' },
  { id: 'a2', name: 'Sari', role: 'design' },
]
const CFG_RESP = { base: 'https://api.example.com/v1', model: 'gpt-4o-mini', prompt: 'Jawab singkat', key_hint: 'sk-…abc' }
const STATUS_RESP = { agents: { a1: { done: 5, running: 2, pending: 1, review: 0, failed: 0 } } }

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

beforeEach(() => { cleanup(); vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

async function openPanel() {
  render(<WfsPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Chat AI Team' }))
  await screen.findByLabelText('Pilih agent') // agents termuat → select tampil
}

describe('WfsPanel — gateway chat AI + konfigurasi agent', () => {
  it('memuat daftar agent, default pilih agent pertama, dan menampilkan info status', async () => {
    stubFetch({
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/agents/status': STATUS_RESP,
      '/wfs-api/config/a1': CFG_RESP,
    })
    await openPanel()
    const sel = screen.getByLabelText('Pilih agent')
    expect(sel.value).toBe('a1')
    expect(screen.getByText(/Budi — backend/)).toBeTruthy()
    // info agent dari status API: task selesai & jalan
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('kirim pesan → POST /wfs-api/chat, reply tampil di log, input kosong', async () => {
    const bodies = []
    stubFetch({
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/config/a1': CFG_RESP,
      '/wfs-api/agents/status': STATUS_RESP,
      '/wfs-api/chat': (url, opts) => {
        bodies.push(JSON.parse(opts.body))
        return { ok: true, reply: 'Halo! Ada yang bisa dibantu?' }
      },
    })
    await openPanel()
    fireEvent.change(screen.getByLabelText('Pesan'), { target: { value: 'buatkan rencana sprint' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }))
    expect(await screen.findByText(/Halo! Ada yang bisa dibantu?/)).toBeTruthy()
    expect(bodies.length).toBe(1)
    expect(bodies[0].agent_id).toBe('a1')
    expect(bodies[0].message).toBe('buatkan rencana sprint')
    expect(screen.getByLabelText('Pesan').value).toBe('')
  })

  it('a11y: dialog berlabel, tablist roving, Esc menutup panel', async () => {
    stubFetch({
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/config/a1': CFG_RESP,
    })
    await openPanel()
    const dialog = screen.getByRole('dialog', { name: 'Chat dan konfigurasi agent' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const tablist = screen.getByRole('tablist')
    expect(tablist).toBeTruthy()
    const chatTab = screen.getByRole('tab', { name: /Chat/ })
    const cfgTab = screen.getByRole('tab', { name: /Model API/ })
    expect(chatTab.getAttribute('aria-selected')).toBe('true')
    // ArrowRight memindahkan fokus ke tab berikutnya (roving tabindex)
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    await waitFor(() => expect(document.activeElement).toBe(cfgTab))
    // Esc menutup panel: tombol toggle kembali ke state tidak terbuka
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chat AI Team' }).getAttribute('aria-expanded')).toBe('false'))
  })

  it('tab Model API: memuat cfg agent, Simpan → POST config dan pesan sukses', async () => {
    const saves = []
    stubFetch({
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/agents/status': STATUS_RESP,
      '/wfs-api/config/a1': (url, opts) => {
        if (opts?.method === 'POST') { saves.push(JSON.parse(opts.body)); return { ok: true } }
        return CFG_RESP
      },
    })
    await openPanel()
    fireEvent.click(screen.getByRole('tab', { name: /Model API/ }))
    // nilai dari API terisi ke form
    expect(screen.getByLabelText('Base URL').value).toBe('https://api.example.com/v1')
    expect(screen.getByLabelText('Model').value).toBe('gpt-4o-mini')
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gpt-4o' } })
    fireEvent.click(screen.getByRole('button', { name: /Simpan/ }))
    await waitFor(() => expect(saves.length).toBe(1))
    expect(saves[0].model).toBe('gpt-4o')
    expect(await screen.findByText(/✅ Tersimpan/)).toBeTruthy()
  })

  it('Test koneksi → POST /wfs-api/test dan informasi model tersedia', async () => {
    const tests = []
    stubFetch({
      '/wfs-api/agents': AGENTS_RESP,
      '/wfs-api/config/a1': CFG_RESP,
      '/wfs-api/test': (url, opts) => {
        tests.push(JSON.parse(opts.body))
        return { ok: true, models: 3 }
      },
    })
    await openPanel()
    fireEvent.click(screen.getByRole('tab', { name: /Model API/ }))
    fireEvent.click(screen.getByRole('button', { name: /Test/ }))
    expect(await screen.findByText(/✅ OK — 3 model tersedia/)).toBeTruthy()
    expect(tests.length).toBe(1)
    expect(tests[0].model).toBe('gpt-4o-mini')
  })

  it('a11y: error memuat agent muncul dengan role=alert + tombol muat ulang', async () => {
    stubFetch({
      '/wfs-api/agents': () => { throw new Error('gateway down') },
    })
    render(<WfsPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat AI Team' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/Gagal memuat daftar agent/)
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeTruthy()
  })
})
