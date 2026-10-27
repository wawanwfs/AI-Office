// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import Header from '../components/Header'

afterEach(() => cleanup())

describe('components/Header', () => {
  it('me-render banner dengan judul & subjudul autentik WFS PROJECT', () => {
    render(<Header />)
    const banner = screen.getByRole('banner')
    expect(banner).toBeTruthy()
    const h1 = within(banner).getByRole('heading', { level: 1 })
    expect(h1.textContent.replace(/\s+/g, ' ').trim()).toBe('WFS PROJECT')
    expect(within(banner).getByText('Autonomous AI Software House')).toBeTruthy()
  })

  it('banner memuat subjudul dalam elemen terpisah (keterbacaan CSS)', () => {
    const { container } = render(<Header />)
    const banner = container.querySelector('header.hdr')
    expect(banner).toBeTruthy()
    expect(banner.querySelector('.sub')).toBeTruthy()
  })
})
