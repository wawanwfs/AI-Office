// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
const scene = vi.hoisted(() => ({ destroy: vi.fn(), isCyberpunk: () => false }))
const create = vi.hoisted(() => vi.fn(() => scene))
vi.mock('../scene/OfficeScene', () => ({ createOfficeScene: create }))
import App from '../App'
beforeEach(() => {
  localStorage.clear(); create.mockClear(); scene.destroy.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes('tasks/paused') ? { paused: false } : String(url).includes('tasks') ? { tasks: [{ id: 1, title: 'Real task', status: 'running' }] } : {} })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('opens a live lightweight workspace without initializing 3D; explicit choice persists and can be reversed', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getAllByText('1 jalan · 0 antri').length).toBeGreaterThan(0))
  expect(create).not.toHaveBeenCalled()
  expect(screen.getByRole('main', { name: 'Ruang kerja ringan' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Aktifkan kantor 3D' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(localStorage.getItem('wfs_view_mode')).toBe('3d')
  fireEvent.click(screen.getByRole('button', { name: 'Gunakan mode ringan 2D' }))
  await waitFor(() => expect(scene.destroy).toHaveBeenCalledTimes(1))
  expect(localStorage.getItem('wfs_view_mode')).toBe('2d')
})
it('honors a returning user’s explicit 3D choice', async () => {
  localStorage.setItem('wfs_view_mode', '3d')
  render(<App />)
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
})
