// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Dashboard from '../components/Dashboard'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('reports partial failures without inventing empty projects or idle agents and keeps navigation available', async () => {
  api.mockImplementation(path => path === 'dashboard/stats' ? Promise.resolve({ tasks_total: 3 }) : Promise.reject(new Error('HTTP 503')))
  const onOpenBoard = vi.fn()
  render(<Dashboard onOpenBoard={onOpenBoard} />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Data belum lengkap'))
  expect(screen.queryByText('Belum ada proyek.')).toBeNull()
  expect(screen.queryByText('semua idle')).toBeNull()
  expect(screen.queryByText('Tidak ada container.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Buka papan task' }))
  expect(onOpenBoard).toHaveBeenCalledOnce()
})
it('ends loading when statistics fail, offers retry and recovers', async () => {
  api.mockRejectedValue(new Error('HTTP 503'))
  render(<Dashboard />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  await screen.findByRole('alert')
  expect(screen.queryByText('Memuat dashboard…')).toBeNull()
  api.mockResolvedValue({ projects: [], tasks: [], containers: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(screen.getByText('Belum ada proyek.')).toBeTruthy()
})
