import { describe, expect, it } from 'vitest'
import {
  DRAWER_TEXT, DRAWER_GRADIENT, TITLE_TEXT, TAB_IDLE_BG, CARD_BG, ROW_DASH,
  GHOST_BG, GHOST_TEXT, TAG_TEXT, ERROR_TEXT, PRE_BG, REJECT_BG, STALE_TEXT,
} from '../lib/ui_palette'
import * as fs from 'fs'
import * as path from 'path'

// Siklus 407 — ShConsole bebas literal warna (satu sumber ui_palette).
const CANON = {
  DRAWER_TEXT: '#d7e0f0',
  DRAWER_GRADIENT: 'linear-gradient(180deg,#0c1220 0%,#0a0e18 100%)',
  TITLE_TEXT: '#f2f6ff',
  TAB_IDLE_BG: '#141c30',
  CARD_BG: '#111827',
  ROW_DASH: '#1b2944',
  GHOST_BG: '#1a2340',
  GHOST_TEXT: '#c5d2ec',
  TAG_TEXT: '#aebfe0',
  ERROR_TEXT: '#ff8080',
  PRE_BG: '#0a101c',
  REJECT_BG: '#4a2030',
  STALE_TEXT: '#c2884e',
}

describe('palette siklus 407', () => {
  it('nilai kanonik', () => {
    for (const [k, v] of Object.entries(CANON)) {
      expect({ DRAWER_TEXT, DRAWER_GRADIENT, TITLE_TEXT, TAB_IDLE_BG, CARD_BG, ROW_DASH, GHOST_BG, GHOST_TEXT, TAG_TEXT, ERROR_TEXT, PRE_BG, REJECT_BG, STALE_TEXT }[k]).toBe(v)
    }
  })

  it('ShConsole bebas literal warna hex', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/ShConsole.jsx'), 'utf8')
    expect(src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).toEqual([])
  })

  it('semua konstanta diimpor di ShConsole', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/ShConsole.jsx'), 'utf8')
    for (const name of Object.keys(CANON)) expect(src).toContain(name)
  })
})
