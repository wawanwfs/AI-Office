// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'


vi.mock('../landing/OrbitalSculpture.jsx', () => ({ default: () => <div data-testid="sculpture" /> }))
afterEach(cleanup)

describe('landing entrance', () => {
  it('offers explicit dashboard and full-office destinations without invented metrics', async () => {
    const { default: Landing } = await import('../landing/Landing.jsx')
    render(<Landing />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('work')
    expect(screen.getByRole('link', { name: /Open dashboard/i }).getAttribute('href')).toBe('/app/?mode=dashboard')
    expect(screen.getByRole('link', { name: /Enter full AI office/i }).getAttribute('href')).toBe('/app/?mode=office')
    expect(screen.queryByText(/tasks completed|agents online/i)).toBeNull()
  })
})
