// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import Dashboard from '../components/Dashboard'
import FloorNavigator from '../components/FloorNavigator'
import HUD from '../components/HUD'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('unknown KPI sources stay unknown rather than implying zero jobs or agents', async () => {
  api.mockImplementation(path => path === 'dashboard/stats' ? Promise.resolve({ tasks_total: 3 }) : Promise.reject(new Error('offline')))
  render(<Dashboard />)
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
  await screen.findByRole('alert')
  expect(within(screen.getByRole('group', {name:'Proyek'})).getByText('—')).toBeTruthy()
  expect(within(screen.getByRole('group', {name:'Task jalan'})).getByText('—')).toBeTruthy()
  expect(within(screen.getByRole('group', {name:'Agen task engine'})).getByText('—')).toBeTruthy()
})
it('floor names announce floor number and simulation provenance', () => {
  render(<FloorNavigator />)
  expect(screen.getByRole('button', {name:/Lantai 3.*simulasi/})).toBeTruthy()
})
it('HUD distinguishes simulation time from backend task state', () => {
  render(<HUD time="12:00" timeValue={720} status="0 jalan" onTimeChange={() => {}} />)
  expect(screen.getByText('Simulasi')).toBeTruthy()
  expect(screen.getByText('0 jalan').getAttribute('title')).toContain('task engine')
})
