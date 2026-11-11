import { describe, it, expect } from 'vitest'
import {
  PEARL_LIGHT, PEARL_MID, PEARL_DEEP, PEARL_EDGE,
  BRASS_LIGHT, BRASS_DEEP, BRASS_MID, RING_SHADOW, RING_DEEP,
} from '../lib/ui_palette.js'

// Siklus 410 — fallback SVG OrbitalSculpture tanpa hex literal.

describe('palet fallback OrbitalSculpture (siklus 410)', () => {
  it('konstanta kanonik bernilai benar', () => {
    expect(PEARL_LIGHT).toBe('#f7fbff')
    expect(PEARL_MID).toBe('#a7bdce')
    expect(PEARL_DEEP).toBe('#56718b')
    expect(PEARL_EDGE).toBe('#e0e9ef')
    expect(BRASS_LIGHT).toBe('#f5dfb6')
    expect(BRASS_DEEP).toBe('#ad7d40')
    expect(BRASS_MID).toBe('#eac99a')
    expect(RING_SHADOW).toBe('#728a9e')
    expect(RING_DEEP).toBe('#426788')
  })

  it('OrbitalSculpture bebas hex literal', async () => {
    const src = await import('fs/promises').then(fs =>
      fs.readFile(new URL('../landing/OrbitalSculpture.jsx', import.meta.url), 'utf8'))
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('tidak ada duplikasi nilai di ui_palette', async () => {
    const src = await import('fs/promises').then(fs =>
      fs.readFile(new URL('../lib/ui_palette.js', import.meta.url), 'utf8'))
    const values = [...src.matchAll(/'#[0-9a-fA-F]{3,8}'/g)].map(m => m[0])
    expect(new Set(values).size).toBe(values.length)
  })
})
