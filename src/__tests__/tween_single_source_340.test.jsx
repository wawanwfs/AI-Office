// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useTween } from '../lib/dialogA11y'

/* Siklus 340: animasi angka satu sumber — salinan hook lokal TeamStats
 * dipindah ke lib/dialogA11y.js sebagai useTween; pola raf+easing kini satu sumber. */

function Probe({ target }) {
  const v = useTween(target, 50)
  return <div data-testid="t">{v}</div>
}

describe('useTween satu sumber (siklus 340)', () => {
  it('hook ada di lib, salinan lokal TeamStats hilang', async () => {
    const lib = await import('../lib/dialogA11y')
    expect(typeof lib.useTween).toBe('function')
    const fs = await import('node:fs')
    const src = fs.readFileSync('src/components/TeamStats.jsx', 'utf8')
    expect(src).toMatch(/useTween.*from '\.\.\/lib\/dialogA11y'/s)
    expect(src).not.toMatch(/function useTween/)
    expect(src).not.toMatch(/requestAnimationFrame/)
  })

  it('tick awal target=0 tetap 0 tanpa raf', () => {
    const { getByTestId, unmount } = render(<Probe target={0} />)
    expect(getByTestId('t').textContent).toBe('0')
    unmount()
  })

  it('tween ke target bergerak & mendarat tepat', async () => {
    const { getByTestId, unmount } = render(<Probe target={100} />)
    await vi.waitFor(() => expect(getByTestId('t').textContent).toBe('100'), { timeout: 500 })
    unmount()
  })
})
