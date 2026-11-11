import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const dist = 'dist'

describe('sourcemap hidden 433', () => {
  it('semua chunk JS di dist punya pasangan .map (runtime kecil dikecualikan)', () => {
    const assets = join(dist, 'assets')
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(3)
    for (const f of js) {
      if (f.startsWith('rolldown-runtime-')) continue // inline kecil, bukan chunk vendor
      expect(existsSync(join(assets, f + '.map')), f).toBe(true)
    }
  })
  it('tidak ada // # sourceMappingURL di bundle (hidden)', () => {
    const assets = join(dist, 'assets')
    for (const f of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
      expect(readFileSync(join(assets, f), 'utf8')).not.toMatch(/sourceMappingURL/)
    }
  })
  it('sw.js & workbox punya .map — devtools tetap bisa debug service worker', () => {
    expect(existsSync(join(dist, 'sw.js.map'))).toBe(true)
    expect(existsSync(join(dist, 'workbox-2178cfdb.js.map'))).toBe(true)
  })
  it('vite.config.js mengunci sourcemap hidden', () => {
    expect(readFileSync('vite.config.js', 'utf8')).toMatch(/sourcemap:\s*'hidden'/)
  })
  it('shell index tetap no-store & manifest ter-injeksi (regresi)', () => {
    const idx = readFileSync(join(dist, 'index.html'), 'utf8')
    expect(idx).toMatch(/manifest\.webmanifest/)
    expect(idx).toMatch(/og:image:alt/)
  })
})
