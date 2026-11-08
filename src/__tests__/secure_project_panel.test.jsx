import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SecureProjectPanel from '../components/SecureProjectPanel'

describe('Phase 5 secure project panel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
  })
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

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
    expect(screen.getByText('300 µUSD')).toBeTruthy()
    for (const [,options] of fetchMock.mock.calls) {
      expect(options.credentials).toBe('omit')
      expect(options.headers.Authorization).toBe('Bearer ' + 'x'.repeat(43))
    }
  })
})
