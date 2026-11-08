// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SecureProjectPanel from '../components/SecureProjectPanel'

describe('Phase 5 secure project panel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

  it('requires scoped credentials and never persists token', async () => {
    render(<SecureProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Buka kontrol proyek/i }))
    fireEvent.click(screen.getByRole('button', { name: /Muat data nyata/i }))
    expect(screen.getByRole('alert').textContent).toContain('bearer token')
    fireEvent.change(screen.getByLabelText('Project ID terautentikasi'), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByLabelText('Bearer token operator'), { target: { value: 'x'.repeat(43) } })
    expect(localStorage.length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: /Tutup & hapus token/i }))
    fireEvent.click(screen.getByRole('button', { name: /Buka kontrol proyek/i }))
    expect(screen.getByLabelText('Bearer token operator').value).toBe('')
    expect(localStorage.length).toBe(0)
  })

  it('shows only authenticated backend data, not simulated task counts', async () => {
    const fetchMock = vi.fn((url) => {
      const body = url.endsWith('/jobs') ? { jobs: [{id: 'job-a', role: 'design', status: 'queued'}] }
        : url.endsWith('/budget') ? { approved: true, cap_microusd: 1000, remaining_microusd: 300 }
        : { events: [{id: 1}] }
      return Promise.resolve({ ok: true, json: async () => body })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SecureProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Buka kontrol proyek/i }))
    fireEvent.change(screen.getByLabelText('Project ID terautentikasi'), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByLabelText('Bearer token operator'), { target: { value: 'x'.repeat(43) } })
    fireEvent.click(screen.getByRole('button', { name: /Muat data nyata/i }))
    await waitFor(() => expect(screen.getByText('job-a')).toBeTruthy())
    expect(screen.getByText(/Sisa: 300 µUSD/)).toBeTruthy()
    for (const [,options] of fetchMock.mock.calls) {
      expect(options.credentials).toBe('omit')
      expect(options.headers.Authorization).toBe('Bearer ' + 'x'.repeat(43))
    }
  })
})


describe('Phase 6 real brief intake', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('submits a scoped non-executing Python brief without leaking bearer into legacy routes', async () => {
    const request = vi.fn(async (url, options) => {
      const data = url.endsWith('/briefs')
        ? { task_id: 42, job_id: 'job-proof', status: 'queued', execution_started: false }
        : url.endsWith('/jobs') ? { jobs: [{ id: 'job-proof', role: 'backend', status: 'queued' }] }
        : url.endsWith('/budget') ? { approved: true, cap_microusd: 100, remaining_microusd: 70 }
        : { events: [] }
      return { ok: true, json: async () => data }
    })
    vi.stubGlobal('fetch', request)
    render(<SecureProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Buka kontrol proyek/i }))
    fireEvent.change(screen.getByLabelText('Project ID terautentikasi'), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByLabelText('Bearer token operator'), { target: { value: 'X'.repeat(43) } })
    fireEvent.change(screen.getByLabelText('Judul brief coding'), { target: { value: 'API Inventori' } })
    fireEvent.change(screen.getByLabelText('Instruksi brief coding'), { target: {
      value: 'Bangun REST API inventori yang memiliki endpoint daftar barang dan unit tests.'
    } })
    fireEvent.click(screen.getByRole('button', { name: /Buat task & antrekan/i }))
    await waitFor(() => expect(screen.getAllByText(/job-proof/).length).toBeGreaterThan(0))
    const create = request.mock.calls.find(([url]) => url.endsWith('/briefs'))
    expect(create[0]).toBe('/api/v4/projects/alpha/briefs')
    expect(create[1].method).toBe('POST')
    expect(create[1].credentials).toBe('omit')
    expect(create[1].headers.Authorization).toBe('Bearer ' + 'X'.repeat(43))
    expect(JSON.parse(create[1].body).role).toBe('backend')
    expect(screen.getByLabelText('Task ID numerik').value).toBe('42')
    expect(request.mock.calls.every(([url]) => url.startsWith('/api/v4/projects/alpha/'))).toBe(true)
  })

  it('does not hit the API on too-short brief', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    render(<SecureProjectPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Buka kontrol proyek/i }))
    fireEvent.change(screen.getByLabelText('Project ID terautentikasi'), { target: { value: 'alpha' } })
    fireEvent.change(screen.getByLabelText('Bearer token operator'), { target: { value: 'X'.repeat(43) } })
    fireEvent.click(screen.getByRole('button', { name: /Buat task & antrekan/i }))
    expect(screen.getByRole('alert').textContent).toContain('minimal 30')
    expect(request).not.toHaveBeenCalled()
  })
})
