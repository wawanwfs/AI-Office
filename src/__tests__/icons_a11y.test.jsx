// @vitest-environment jsdom
// Ikon SVG dekoratif: semua icon harus dirender sebagai <svg> dengan
// aria-hidden="true" (murni dekoratif, tidak dibacakan screen reader — label
// sudah diberikan lewat aria-label/title pada tombol pemakainya), viewBox
// konsisten 0 0 24 24, dan ukuran default 18.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import * as Icons from '../components/Icons.jsx'

afterEach(() => cleanup())

const icons = Object.entries(Icons).filter(([name, fn]) => name.startsWith('Icon') && typeof fn === 'function')

describe('Icons: semua icon dekoratif ter-render sebagai <svg>', () => {
  it('terdapat koleksi icon yang bisa dirender', () => {
    expect(icons.length).toBeGreaterThanOrEqual(20)
  })

  for (const [name, Icon] of icons) {
    it(`Icon ${name} → <svg> dengan aria-hidden, viewBox & ukuran default yang benar`, () => {
      const { container } = render(React.createElement(Icon))
      const svg = container.querySelector('svg')
      expect(svg, `${name} harus render <svg>`).toBeTruthy()
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('width')).toBe('18')
      expect(svg.getAttribute('height')).toBe('18')
      expect(svg.querySelector('title')).toBeNull()
    })

    it(`Icon ${name} menghormati prop className & size`, () => {
      const { container } = render(React.createElement(Icon, { className: 'ic-test', size: 22 }))
      const svg = container.querySelector('svg')
      expect(svg.classList.contains('ic-test')).toBe(true)
      expect(svg.getAttribute('width')).toBe('22')
      expect(svg.getAttribute('height')).toBe('22')
    })
  }
})
