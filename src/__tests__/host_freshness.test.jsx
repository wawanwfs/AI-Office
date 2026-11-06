// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import SysMeter from '../components/SysMeter'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: vi.fn() }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); delete window.__agentData })
it('distinguishes scene avatars from backend agents and marks cached host data stale after refresh failure', async () => {
  vi.useFakeTimers()
  window.__agentData = Array(26).fill({})
  api.mockResolvedValue({ agents:15, load:1, ram_mb:1024 })
  render(<SysMeter />)
  await act(async () => {})
  expect(screen.getByText('26 avatar simulasi')).toBeTruthy()
  expect(screen.getByText('15 agen task engine')).toBeTruthy()
  api.mockRejectedValue(new Error('offline'))
  await act(async () => { vi.advanceTimersByTime(12000) })
  expect(screen.getByText(/Data host usang/)).toBeTruthy()
  api.mockResolvedValue({agents:15,load:2,ram_mb:1024})
  await act(async () => { vi.advanceTimersByTime(12000) })
  expect(screen.queryByText(/Data host usang/)).toBeNull()
})
