// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../landing/OrbitalSculpture.jsx', () => ({ default: () => <div data-testid="orbital-art" /> }))
afterEach(cleanup)

describe('WFS HQ landing navigation and accessibility', () => {
  it('offers an accessible skip link, logical sections, and real app routes', async () => {
    const { default: Landing } = await import('../landing/Landing.jsx')
    render(<Landing />)
    expect(screen.getByRole('link', { name: /Lewati ke pilihan workspace/i }).getAttribute('href')).toBe('#choose')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('work')
    expect(screen.getByRole('region', { name: /A clearer way to/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open dashboard/i }).getAttribute('href')).toBe('/app/?mode=dashboard')
    expect(screen.getByRole('link', { name: /Enter full AI office/i }).getAttribute('href')).toBe('/app/?mode=office')
    expect(screen.getByRole('link', { name: /Jelajahi kantor 3D/i }).getAttribute('href')).toBe('/app/?mode=office')
    expect(screen.getByRole('link', { name: /Back to top/i }).getAttribute('href')).toBe('#main-content')
  })
  it('does not invent live activity metrics or force the heavy OfficeScene into the entrance', async () => {
    const { default: Landing } = await import('../landing/Landing.jsx')
    const { container } = render(<Landing />)
    expect(container.querySelector('.landing-step-grid').children).toHaveLength(3)
    expect(screen.queryByText(/agents online|tasks completed|99\.9%/i)).toBeNull()
    expect(screen.getByTestId('orbital-art')).toBeTruthy()
  })
})
