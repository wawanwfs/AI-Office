// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
const state = vi.hoisted(() => ({ tree: null, appImports: 0 }))
vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: tree => { state.tree = tree } }) } }))
vi.mock('../App', () => { state.appImports++; return { default: () => <div>Application loaded</div> } })
vi.mock('../landing/OrbitalSculpture.jsx', () => ({ default: () => null }))
afterEach(() => { cleanup(); vi.resetModules(); history.replaceState(null, '', '/') })
it('root shows landing without evaluating App; /app/ preserves its query and opens App', async () => {
  history.replaceState(null, '', '/')
  await import('../main.jsx')
  render(state.tree)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('work')
  expect(state.appImports).toBe(0)
  cleanup(); vi.resetModules()
  history.replaceState(null, '', '/app/?mode=dashboard')
  await import('../main.jsx')
  render(state.tree)
  await waitFor(() => expect(screen.getByText('Application loaded')).toBeTruthy())
  expect(location.search).toBe('?mode=dashboard')
})
it('landing anchor deep-links remain on the landing', async () => {
  history.replaceState(null, '', '/#choose')
  await import('../main.jsx')
  render(state.tree)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('work')
})
it('legacy root #dashboard links still load the application', async () => {
  history.replaceState(null, '', '/#dashboard')
  await import('../main.jsx')
  render(state.tree)
  await waitFor(() => expect(screen.getByText('Application loaded')).toBeTruthy())
})
