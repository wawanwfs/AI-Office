import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')
const landing = readFileSync(fileURLToPath(new URL('../landing/landing.css', import.meta.url)), 'utf8')

describe('WFS HQ workspace brand and accessibility contracts', () => {
  it('shares the same navy and muted-gold palette as the landing', () => {
    expect(css).toContain('--bg: #080c20')
    expect(css).toContain('--wfs-gold: #d8bb84')
    expect(landing).toContain('#d8bb84')
    expect(css).toContain('--wfs-violet: #ac95ee')
  })
  it('preserves the real user-visible operational panels and keyboard focus', () => {
    for (const selector of ['.dock {', '.panel {', '.dash-card {',
      '.tabs button[aria-selected=true]', '.panel button:focus-visible']) {
      expect(css).toContain(selector)
    }
  })
  it('provides reduced-motion and high-contrast paths', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (prefers-contrast: more)')
  })
})
