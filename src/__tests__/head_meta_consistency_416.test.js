// Siklus 416: konsistensi meta antar halaman HTML (index.html & public/landing.html).
// Defek riil: og/twitter:description di index.html masih menyebut "15 agent AI"
// padahal scene kampus punya 26 agen (AGENTS 14 + EXTENDED_SPECIALISTS 12) dan
// landing.html sejak siklus 414 sudah menyebut 26. Preview WhatsApp/Telegram
// menampilkan angka berbeda tergantung halaman yang dibagikan.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from 'vitest'

const here = fileURLToPath(new URL('.', import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')
const indexHtml = read('index.html')
const landingHtml = read('public/landing.html')

describe('meta konsistensi antar halaman (416)', () => {
  test('tidak ada angka agen usang "15 agent/15 agen" di meta HTML', () => {
    for (const [name, html] of [['index.html', indexHtml], ['landing.html', landingHtml]]) {
      expect(html.match(/15\s?(agent|agen)/gi), `${name} masih menyebut 15 agen`).toBeNull()
    }
  })

  test('index.html & landing.html sama-sama menyebut 26 agen di og:description', () => {
    expect(indexHtml).toMatch(/og:description" content="[^"]*26 agen/)
    expect(landingHtml).toMatch(/og:description" content="[^"]*26 agen/)
  })

  test('kedua halaman punya apple-touch-icon & og:image (aset ada di public/)', () => {
    for (const [name, html] of [['index.html', indexHtml], ['landing.html', landingHtml]]) {
      expect(html.includes('apple-touch-icon.png'), `${name} tanpa apple-touch-icon`).toBe(true)
      expect(html.includes('/og-image.png'), `${name} tanpa og:image`).toBe(true)
    }
    expect(() => read('public/apple-touch-icon.png')).not.toThrow()
    expect(() => read('public/og-image.png')).not.toThrow()
  })
})
