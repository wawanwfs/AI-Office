// Siklus 418: a11y landing page — skip link, landmark main/nav, focus-visible
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const pub = readFileSync(new URL('../../public/landing.html', import.meta.url), 'utf8')
const dist = readFileSync(new URL('../../dist/landing.html', import.meta.url), 'utf8')

describe('Siklus 418: a11y landing page', () => {
  it('landing punya skip link yang menuju #main', () => {
    expect(pub).toMatch(/class="skip-link" href="#main"/)
    expect(pub).toContain('Lewati ke konten utama')
  })

  it('landing punya landmark <main id="main"> dan <nav> berlabel', () => {
    expect(pub).toContain('<main id="main">')
    expect(pub).toContain('</main>')
    expect(pub).toMatch(/<nav aria-label="[^"]+"/)
  })

  it('landing punya gaya fokus keyboard :focus-visible', () => {
    expect(pub).toMatch(/a:focus-visible[^}]*outline/)
  })

  it('dist ter-deploy juga memuat ketiganya', () => {
    expect(dist).toContain('<main id="main">')
    expect(dist).toContain('skip-link')
    expect(dist).toMatch(/a:focus-visible[^}]*outline/)
  })
})
