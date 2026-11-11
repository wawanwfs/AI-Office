// Siklus 432 — landing.html harus no-store (paritas shell index.html).
// Lighthouse (best-practices, 11/11/2026, http://127.0.0.1:9503/): landing.html
// dilayani `public, max-age=86400` — pasca deploy, pengunjung bisa mendapat
// landing lama sampai 24 jam dari cache browser. Shell HTML layak no-store
// seperti index.html & sw.js; aset ber-hash /assets/* tetap immutable 1 tahun.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pySrc = readFileSync(resolve(here, '../../backend/static_serve.py'), 'utf8')
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')

describe('siklus 432: landing.html no-store (cache policy shell)', () => {
  test('cache_control_for memuat landing.html dalam daftar no-store', () => {
    expect(pySrc).toMatch(/if p in \("\/", "\/index\.html", "\/landing\.html"\)/)
    expect(pySrc).toContain('return "no-store"')
  })

  test('paritas dokumen: komentar policy menyebut landing.html no-store', () => {
    expect(pySrc).toContain('landing.html ikut no-store')
  })

  test('landing.html dist ada & shell tetap menyaji canonical + manifest', () => {
    const dist = read('dist/landing.html')
    expect(dist).toContain('rel="canonical"')
    expect(dist).toContain('rel="manifest"')
  })

  test('tes python backend (test_static_serve) mengunci kasus landing no-store', () => {
    const pyTest = read('backend/test_static_serve.py')
    expect(pyTest).toContain('"/landing.html"')
  })
})
