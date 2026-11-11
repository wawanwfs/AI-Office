import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

describe('siklus 427 — preload font app cocok dengan font yang benar-benar direferensikan', () => {
  const indexHtml = read('index.html')
  const distHtml = read('dist/index.html')
  const distCss = read('dist/assets/index-fVxvKtNY.css')

  const preloads = distHtml.match(/rel="preload" href="(\/fonts\/[^"]+\.woff2)"/g) || []
  const preloadUrls = preloads.map((p) => p.match(/href="([^"]+)"/)[1])

  // URL font yang benar-benar dipakai bundle produksi + @font-face src/index.css
  // (Orbitron diload terpisah dari index.css, bukan bundle landing)
  const appCss = read('src/index.css')
  const usedUrls = [
    ...distCss.matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g),
    ...appCss.matchAll(/url\('(\/fonts\/[^)]+\.woff2)'\)/g),
  ].map((m) => m[1])

  it('setiap preload woff2 di dist direferensikan oleh @font-face produksi (tidak ada preload basi)', () => {
    expect(preloadUrls.length).toBeGreaterThan(0)
    for (const url of preloadUrls) {
      expect(usedUrls).toContain(url)
    }
  })

  it('Orbitron di-index.html preload dari URL @font-face src/index.css (bukan fonts.css)', () => {
    const css = read('src/index.css')
    expect(css).toContain("url('/fonts/orbitron-latin.woff2')")
    expect(indexHtml).toContain('<link rel="preload" href="/fonts/orbitron-latin.woff2" as="font" type="font/woff2" crossorigin>')
  })

  it('preload yMJRMIl (DM Serif/latin lain di fonts.css) tidak lagi di index.html — basi', () => {
    expect(indexHtml).not.toContain('yMJRMIlzdpvBhQQL_Qq7dy0.woff2')
  })

  it('semua preload tetap crossorigin + font fisik ada di public & dist', () => {
    for (const url of preloadUrls) {
      const tag = distHtml.slice(distHtml.indexOf(url), distHtml.indexOf('/>', distHtml.indexOf(url)) + 2)
      expect(tag).toContain('crossorigin')
      const file = resolve(root, 'dist', url.slice(1))
      expect(existsSync(file)).toBe(true)
      expect(statSync(file).size).toBeGreaterThan(1000)
    }
  })

  it('stylesheet fonts.css tetap ada (subset latin-ext tetap dilayani normal)', () => {
    expect(distHtml).toContain('rel="stylesheet" href="/fonts/fonts.css"')
  })
})
