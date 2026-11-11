// Siklus 414: public/landing.html wajib punya Open Graph + Twitter Card lengkap
// agar preview link WhatsApp/Telegram/Slack tidak tampil polos (sebelumnya 0 tag og:/twitter:).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from 'vitest'

const here = fileURLToPath(new URL('.', import.meta.url))
const html = readFileSync(resolve(here, '../../public/landing.html'), 'utf8')

const REQUIRED = [
  '<meta property="og:type"',
  '<meta property="og:title"',
  '<meta property="og:description"',
  '<meta property="og:image" content="/og-image.png">',
  '<meta property="og:url"',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:image" content="/og-image.png">',
  '<meta name="theme-color"',
]

describe('landing.html social preview meta (414)', () => {
  test('semua tag og:/twitter:/theme-color ada', () => {
    for (const tag of REQUIRED) expect(html).toContain(tag)
  })

  test('og:title & twitter:title konsisten dengan <title>', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1]
    expect(title).toBeTruthy()
    expect(html).toContain(`<meta property="og:title" content="${title}">`)
    expect(html).toContain(`<meta name="twitter:title" content="${title}">`)
  })

  test('og:image merujuk aset yang benar-benar ada di public/', () => {
    const m = html.match(/<meta property="og:image" content="([^"]+)"/)
    expect(() => readFileSync(resolve(here, '../../public', m[1].replace(/^\//, '')))).not.toThrow()
  })
})
