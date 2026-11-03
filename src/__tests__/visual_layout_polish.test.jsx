// @vitest-environment jsdom
// Siklus 238: Uji regresi perbaikan visual & tata letak (visual layout polish):
// 1. IconFront: elevasi depan kubus 3D (bukan lagi ikon kalender dari set Feather)
// 2. Header: disembunyikan pada viewport 761px - 1540px agar tidak bertabrakan dengan chip HUD & SysMeter
// 3. Ticker: posisi desktop diturunkan dari 76px ke 96px agar tidak bertabrakan dengan .floor-nav
// 4. Meeting-badge: posisi diturunkan dari 104px ke 134px agar berada tepat di bawah .ticker
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IconFront, IconIso, IconTop } from '../components/Icons.jsx'

const here = dirname(fileURLToPath(import.meta.url))
const readCss = () => readFileSync(join(here, '../index.css'), 'utf8')

afterEach(() => cleanup())

describe('Siklus 238: IconFront 3D Elevation Icon', () => {
  it('IconFront me-render sebagai SVG 3D dengan atribut a11y yang benar', () => {
    const { container } = render(<IconFront size={20} className="test-front" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.classList.contains('test-front')).toBe(true)
  })

  it('IconFront BUKAN ikon kalender (tidak memuat binder ring kalender)', () => {
    const { container } = render(<IconFront />)
    const lines = Array.from(container.querySelectorAll('line'))
    // Ikon kalender lama memiliki binder rings: x1="8" y1="2" dan x1="16" y1="2"
    const hasCalendarRings = lines.some(l => l.getAttribute('y1') === '2')
    expect(hasCalendarRings).toBe(false)
  })

  it('IconFront memuat elemen proyeksi kubus depan (rect elevasi depan + garis kedalaman perspektif)', () => {
    const { container } = render(<IconFront />)
    const rect = container.querySelector('rect')
    expect(rect).toBeTruthy()
    expect(rect.getAttribute('x')).toBe('4')
    expect(rect.getAttribute('y')).toBe('7')
    expect(rect.getAttribute('width')).toBe('12')
    expect(rect.getAttribute('height')).toBe('12')
    // Memuat garis kedalaman perspektif
    const lines = container.querySelectorAll('line')
    expect(lines.length).toBeGreaterThanOrEqual(3)
  })

  it('Trio kamera (Iso, Front, Top) konsisten diekspor dan memiliki ukuran default 18', () => {
    for (const Comp of [IconIso, IconFront, IconTop]) {
      const { container } = render(<Comp />)
      const svg = container.querySelector('svg')
      expect(svg.getAttribute('width')).toBe('18')
      expect(svg.getAttribute('height')).toBe('18')
      cleanup()
    }
  })
})

describe('Siklus 238: Kontrak tata letak index.css', () => {
  const css = readCss()

  it('.hdr disembunyikan di breakpoint 761px - 1540px untuk mencegah tabrakan dengan HUD & SysMeter', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*1540px\)\s*\{\s*\.hdr\s*\{\s*display:\s*none;\s*\}\s*\}/)
  })

  it('.ticker diatur ke top: 96px di desktop agar bebas dari .floor-nav (top: 58px, tinggi 32px)', () => {
    const tickerBlock = css.slice(css.indexOf('.ticker {'), css.indexOf('}', css.indexOf('.ticker {')))
    expect(tickerBlock).toContain('top: 96px')
    expect(tickerBlock).not.toContain('top: 76px')
  })

  it('.meeting-badge diatur ke top: 134px agar berada di bawah .ticker', () => {
    const badgeMatch = css.match(/\.meeting-badge\s*\{[^}]*top:\s*(\d+)px/)
    expect(badgeMatch).toBeTruthy()
    expect(badgeMatch[1]).toBe('134')
  })
})

// Siklus 241: potongan keras teks marquee ticker di tepi window — vision_analyze
// (screenshot e2e_err_probe) membacanya sbg "Terputus menimpa teks", probe DOM
// membuktikan TIDAK ada overlap kotak (chip .right 501.8 < window .left 509.8);
// akar = overflow:hidden tanpa fade → kata terpotong ("0 running" → "ining…")
// persis di samping chip. Perbaikan = mask fade 20px dua tepi .ticker-window.
describe('Siklus 241: fade tepi ticker-window (anti hard-clip marquee)', () => {
  const css = readCss()

  it('.ticker-window memakai mask-image fade 20px di KEDUA tepi', () => {
    const winBlock = css.slice(css.indexOf('.ticker-window'), css.indexOf('}', css.indexOf('.ticker-window')))
    expect(winBlock).toContain('mask-image')
    expect(winBlock).toMatch(/linear-gradient\(90deg,\s*transparent 0,\s*#000 20px/)
    expect(winBlock).toMatch(/#000 calc\(100% - 20px\),\s*transparent 100%\)/)
  })

  it('overflow:hidden tetap (mask adalah pelunak, bukan pengganti klip)', () => {
    const winBlock = css.slice(css.indexOf('.ticker-window'), css.indexOf('}', css.indexOf('.ticker-window')))
    expect(winBlock).toContain('overflow: hidden')
  })
})

// Siklus 243: tombol toggle ber-accent (Dashboard .ibtn.accent) kehilangan
// umpan balik keadaan — .ibtn.accent (ditulis kemudian, specificity sama) menimpa
// .ibtn[aria-expanded=true] (biru) → background oranye IDENTIK saat panel terbuka
// (bukti probe DOM live: computed backgroundImage sama persis saat expanded
// true vs false). Perbaikan = rule keadaan terbuka khusus accent yang MENANG.
describe('Siklus 243: keadaan terbuka tombol accent menang atas accent (umpan balik toggle)', () => {
  const css = readCss()

  it('.ibtn.accent[aria-expanded=true] / .ibtn.accent.on punya rule keadaan terbuka sendiri', () => {
    expect(css).toMatch(/\.ibtn\.accent\[aria-expanded=true\],\s*\.ibtn\.accent\.on\s*\{/)
  })

  it('rule keadaan terbuka accent ditulis SETELAH .ibtn.accent (cascade menang) & berisi background biru', () => {
    const posAccent = css.indexOf('.ibtn.accent {')
    const posOpen = css.search(/\.ibtn\.accent\[aria-expanded=true\],\s*\.ibtn\.accent\.on\s*\{/)
    expect(posAccent).toBeGreaterThan(-1)
    expect(posOpen).toBeGreaterThan(posAccent)
    const openBlock = css.slice(posOpen, css.indexOf('}', posOpen))
    expect(openBlock).toContain('linear-gradient(180deg, rgba(77, 159, 255')
    expect(openBlock).toContain('var(--teal)')
  })

  it('basis .ibtn[aria-expanded=true] tetap ada (toggle non-accent tidak kehilangan keadaan)', () => {
    expect(css).toContain('.ibtn[aria-expanded=true], .ibtn.on {')
  })
})

// Siklus 244: kompaksi dock laptop — akar ilusi "T terbalik" (klaim vision 243)
// dibuktikan probe DOM live: konten dock penuh ~1498px > viewport 1280-1519px,
// flex-wrap:center menjatuhkan 3 tombol terakhir (Konsol/Atur/Bantuan) ke baris
// kedua TENGAH dgn ruang kosong kiri-kanan = siluet T. Kompaksi media query
// 1024-1520px membuat dock 1 baris dari 1280px (terukur CDP: dockW 1222 @1366).
describe('Siklus 244: kompaksi dock laptop (anti ilusi T terbalik)', () => {
  const css = readCss()

  it('media query kompaksi 1024-1520px ada dgn 3 deklarasi kunci', () => {
    const m = css.search(/@media \(min-width: 1024px\) and \(max-width: 1520px\)/)
    expect(m).toBeGreaterThan(-1)
    const block = css.slice(m, css.indexOf('@media', m + 10))
    expect(block).toContain('.dock { gap: 4px; }')
    expect(block).toContain('.dock .sep { margin: 0 2px; }')
    expect(block).toContain('.dock .ibtn { min-width: 44px; padding: 5px 6px; font-size: 10.5px; }')
  })

  it('label .ibtn .lb TIDAK disembunyikan di blok kompaksi (bukan penyunatan label)', () => {
    const m = css.indexOf('@media (min-width: 1024px) and (max-width: 1520px)')
    const block = css.slice(m, css.indexOf('@media', m + 10))
    expect(block).not.toContain('.lb')
    expect(block).not.toContain('display: none')
  })

  it('basis .dock global tetap wrap + center (viewport sempit tetap berperilaku 185)', () => {
    const base = css.slice(css.indexOf('.dock {'), css.indexOf('}', css.indexOf('.dock {')))
    expect(base).toContain('flex-wrap: wrap')
    expect(base).toContain('justify-content: center')
  })
})
