// @vitest-environment jsdom
// Siklus 238: Uji regresi perbaikan visual & tata letak (visual layout polish):
// 1. IconFront: elevasi depan kubus 3D (bukan lagi ikon kalender dari set Feather)
// 2. Header: disembunyikan pada viewport 761px - 1540px agar tidak bertabrakan dengan chip HUD & SysMeter
// 3. Ticker: posisi desktop diturunkan dari 76px ke 96px agar tidak bertabrakan dengan .floor-nav
// 4. Meeting-badge: posisi diturunkan dari 104px ke 134px agar berada tepat di bawah .ticker
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IconFront, IconIso, IconTop } from '../components/Icons.jsx'

const here = dirname(fileURLToPath(import.meta.url))
const readCss = () => readFileSync(join(here, '../index.css'), 'utf8')

afterEach(() => cleanup())

describe('Siklus 238: IconFront 3D Elevation Icon', () => {
  it('IconFront me-render sebagai SVG 3D dengan atribut a11y yang benar', () => {
    const { container } = render(<IconFront size={20} className="test-front" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.classList.contains('test-front')).toBe(true)
  })

  it('IconFront BUKAN ikon kalender (tidak memuat binder ring kalender)', () => {
    const { container } = render(<IconFront />)
    const lines = Array.from(container.querySelectorAll('line'))
    // Ikon kalender lama memiliki binder rings: x1="8" y1="2" dan x1="16" y1="2"
    const hasCalendarRings = lines.some(l => l.getAttribute('y1') === '2')
    expect(hasCalendarRings).toBe(false)
  })

  it('IconFront memuat elemen proyeksi kubus depan (rect elevasi depan + garis kedalaman perspektif)', () => {
    const { container } = render(<IconFront />)
    const rect = container.querySelector('rect')
    expect(rect).toBeTruthy()
    expect(rect.getAttribute('x')).toBe('4')
    expect(rect.getAttribute('y')).toBe('7')
    expect(rect.getAttribute('width')).toBe('12')
    expect(rect.getAttribute('height')).toBe('12')
    // Memuat garis kedalaman perspektif
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('Trio kamera (Iso, Front, Top) konsisten diekspor dan memiliki ukuran default 18', () => {
    for (const Comp of [IconIso, IconFront, IconTop]) {
      const { container } = render(<Comp />)
      const svg = container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('18')
      expect(svg.getAttribute('height')).toBe('18')
      cleanup()
    }
  })
})

describe('Siklus 238: Kontrak tata letak index.css', () => {
  const css = readCss()

  it('.hdr disembunyikan di breakpoint 761px - 1540px untuk mencegah tabrakan dengan HUD & SysMeter', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*1540px\)\s*\{\s*\.hdr\s*\{\s*display:\s*none;\s*\}\s*\}/)
  })

  it('.ticker diatur ke top: 96px di desktop agar bebas dari .floor-nav (top: 58px, tinggi 32px)', () => {
    const tickerBlock = css.slice(css.indexOf('.ticker {'), css.indexOf('}', css.indexOf('.ticker {')))
    expect(tickerBlock).toContain('top: 96px')
    expect(tickerBlock).not.toContain('top: 76px')
  })

  it('.meeting-badge diatur ke top: 134px agar berada di bawah .ticker', () => {
    const badgeMatch = css.match(/\.meeting-badge\s*\{[^}]*top:\s*(\d+)px/)
    expect(badgeMatch).toBeTruthy()
    expect(badgeMatch[1]).toBe('134')
  })
})
