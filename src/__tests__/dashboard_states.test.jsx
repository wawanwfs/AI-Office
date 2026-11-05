// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Dashboard from '../components/Dashboard'
import { fmtTime } from '../lib/format_time.js'
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

it('siklus 270 — fmtTime anti-poisoning: menolak null/undefined/NaN/invalid string dan mendukung ISO/detik/ms', () => {
  expect(typeof fmtTime).toBe('function')
  // Input racun → string kosong murni (bukan 'Invalid Date', bukan '08.00' dari epoch 0)
  expect(fmtTime(null)).toBe('')
  expect(fmtTime(undefined)).toBe('')
  expect(fmtTime(0)).toBe('')
  expect(fmtTime(-100)).toBe('')
  expect(fmtTime(NaN)).toBe('')
  expect(fmtTime(Infinity)).toBe('')
  expect(fmtTime(-Infinity)).toBe('')
  expect(fmtTime('invalid')).toBe('')
  expect(fmtTime(new Date(NaN))).toBe('')
  expect(fmtTime({})).toBe('')

  // Valid: ISO string, detik-UNIX, milidetik, Date instance
  const iso = '2026-11-06T00:45:00Z'
  const expIso = new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  expect(fmtTime(iso)).toBe(expIso)

  const sec = 1762387200
  const expSec = new Date(sec * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  expect(fmtTime(sec)).toBe(expSec)
  expect(fmtTime(sec * 1000)).toBe(expSec)
  expect(fmtTime(new Date(sec * 1000))).toBe(expSec)
})

it('siklus 270 — Dashboard log activity anti-poisoning: log dengan timestamp racun tidak melukis Invalid Date', async () => {
  api.mockImplementation(path => {
    if (path === 'dashboard/stats') {
      return Promise.resolve({
        tasks_total: 1,
        logs: [
          { id: 1, timestamp: 'invalid-date', message: 'Task #1 status pending' },
          { id: 2, timestamp: null, message: 'Task #2 status done' },
          { id: 3, timestamp: NaN, message: 'Task #3 status running' },
          { id: 4, timestamp: '2026-11-06T01:15:00Z', message: 'Task #4 status ok' },
        ],
      })
    }
    return Promise.resolve({ tasks: [], projects: [], containers: [] })
  })

  render(<Dashboard />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  await screen.findByText('Task #1 status pending')

  const containerText = document.body.textContent
  expect(containerText).not.toContain('Invalid Date')
  expect(containerText).not.toContain('Invalid')
})

it('siklus 270 — drift-gate: Dashboard.jsx memakai fmtTime dari lib/format_time (bukan ts×1000 telanjang) dan lib memakai parseTimestampMs', async () => {
  const fs = await import('fs')
  const dash = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8')
  expect(dash).toMatch(/import\s*\{\s*fmtTime\s*\}\s*from\s*['"][^'"]*format_time\.js['"]/)
  expect(dash).not.toMatch(/new\s+Date\(\s*ts\s*\*\s*1000\s*\)/)
  expect(dash).not.toMatch(/const fmtTime/)
  const lib = fs.readFileSync('src/lib/format_time.js', 'utf-8')
  expect(lib).toMatch(/import\s*\{\s*parseTimestampMs\s*\}\s*from\s*['"][^'"]*kanban_date\.js['"]/)
  expect(lib).toMatch(/ms\s*<=\s*0/)
})
