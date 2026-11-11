import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('siklus 426 — preload font kritis index.html (app)', () => {
  const html = read('index.html')
  const dist = read('dist/index.html')

  it('index.html preload DM Mono latin (font HUD/mono dipakai app)', () => {
    expect(html).toContain('<link rel="preload" href="/fonts/aFTR7PB1QTsUX8KYvrGyEYOtbQ.woff2" as="font"')
  })

  it('index.html preload DM Sans latin (font body)', () => {
    expect(html).toContain('<link rel="preload" href="/fonts/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2" as="font"')
  })

  it('index.html preload Orbitron latin (font heading)', () => {
    expect(html).toContain('<link rel="preload" href="/fonts/yMJRMIlzdpvBhQQL_Qq7dy0.woff2" as="font"')
  })

  it('semua preload crossorigin + stylesheet fonts.css tetap ada', () => {
    const preloads = html.match(/<link rel="preload" href="\/fonts\/[^"]+\.woff2"/g) || []
    expect(preloads.length).toBe(3)
    for (const p of preloads) {
      const tag = html.slice(html.indexOf(p), html.indexOf('/>', html.indexOf(p)) + 2)
      expect(tag).toContain('crossorigin')
    }
    expect(html).toContain('rel="stylesheet" href="/fonts/fonts.css"')
  })

  it('dist ter-deploy memuat 3 preload woff2', () => {
    expect((dist.match(/rel="preload" href="\/fonts\/[^"]+\.woff2"/g) || []).length).toBe(3)
  })

  it('URL preload cocok dengan @font-face di fonts.css', () => {
    const css = read('public/fonts/fonts.css')
    for (const f of ['aFTR7PB1QTsUX8KYvrGyEYOtbQ.woff2', 'rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.woff2', 'yMJRMIlzdpvBhQQL_Qq7dy0.woff2']) {
      expect(css).toContain(f)
    }
  })
})
