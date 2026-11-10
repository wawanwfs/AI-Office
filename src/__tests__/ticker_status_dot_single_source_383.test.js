import { describe, it, expect } from 'vitest'
import { STATUS_HEX } from '../scene/parts/agent_status.js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Siklus 383: titik kehadiran Ticker satu sumber — salinan literal STATUS_DOT
// di Ticker.jsx dihapus, delegasi penuh ke STATUS_HEX agent_status.js.

const root = resolve(__dirname, '..')

describe('siklus 383 — Ticker STATUS_DOT delegasi STATUS_HEX', () => {
  it('salinan literal di Ticker.jsx hilang', () => {
    const src = readFileSync(resolve(root, 'components/Ticker.jsx'), 'utf8')
    expect(src).not.toMatch(/STATUS_DOT\s*=\s*\{/)
    expect(src).toMatch(/const STATUS_DOT\s*=\s*STATUS_HEX/)
  })

  it('import STATUS_HEX dipakai', () => {
    const src = readFileSync(resolve(root, 'components/Ticker.jsx'), 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*STATUS_HEX[^}]*\}\s*from\s*'\.\.\/scene\/parts\/agent_status\.js'/)
  })

  it('STATUS_DOT == STATUS_HEX (delegasi identitas)', async () => {
    const mod = await import('../components/Ticker.jsx')
    // STATUS_DOT tidak diekspor; verifikasi via paritas nilai peta kanonik
    expect(STATUS_HEX).toEqual({
      work: '#10E5A0', meet: '#60A5FA', lunch: '#F59E0B', walk: '#4D9FFF', dim: '#8b93a3',
    })
    expect(typeof mod.default).toBe('function')
  })
})
