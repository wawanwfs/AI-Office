// @vitest-environment jsdom
import React from 'react'
import { it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('keeps an architectural fallback when WebGL is unavailable', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  const { default: OrbitalSculpture } = await import('../landing/OrbitalSculpture.jsx')
  const { container } = render(<OrbitalSculpture />)
  expect(screen.getByRole('img', { name: /orbital/i })).toBeTruthy()
  expect(container.querySelector('svg')).toBeTruthy()
  expect(container.querySelector('canvas')).toBeNull()
})
it('uses the static artwork for reduced motion even when WebGL is available', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('WebGLRenderingContext', class {})
  const { default: OrbitalSculpture } = await import('../landing/OrbitalSculpture.jsx')
  const { container } = render(<OrbitalSculpture />)
  expect(container.querySelector('svg')).toBeTruthy()
  expect(container.querySelector('canvas')).toBeNull()
})
