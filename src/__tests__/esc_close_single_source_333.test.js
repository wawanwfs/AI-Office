// Siklus 333 — Escape-tutup overlay SATU sumber: useEscapeClose di dialogA11y.
// 5 komponen (ProjectPanel, TeamStats, WfsPanel, QuickToolbar, ActionMenu) dulu
// punya salinan handler `if (e.key === 'Escape') setOpen(false)` masing-masing.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SRC = ['ProjectPanel', 'TeamStats', 'WfsPanel', 'QuickToolbar', 'ActionMenu']
  .map(n => readFileSync(join(root, 'components', n + '.jsx'), 'utf8'))

describe('siklus 333 — useEscapeClose satu sumber', () => {
  it('semua 5 komponen memakai useEscapeClose', () => {
    for (const s of SRC) {
      expect(s).toMatch(/useEscapeClose\(open,/)
      expect(s).toMatch(/useEscapeClose\s*\}\s*from\s*'\.\.\/lib\/dialogA11y'/)
    }
  })

  it('tidak ada lagi salinan handler Escape-close inline di 5 komponen', () => {
    for (const s of SRC) {
      expect(s.includes("if (e.key === 'Escape') setOpen(false)")).toBe(false)
    }
  })

  it('hook ada di dialogA11y dengan pola ref + cleanup listener', () => {
    const lib = readFileSync(join(root, 'lib', 'dialogA11y.js'), 'utf8')
    expect(lib).toMatch(/export function useEscapeClose\(open, onClose/)
    expect(lib).toMatch(/onCloseRef\.current = onClose/)
    expect(lib).toMatch(/document\.addEventListener\('keydown', k\)/)
    expect(lib).toMatch(/removeEventListener\('keydown', k\)/)
  })

  it('useDialogA11y tetap utuh (Escape capture) — tidak diregresikan refactor', () => {
    const lib = readFileSync(join(root, 'lib', 'dialogA11y.js'), 'utf8')
    expect(lib).toMatch(/export function useDialogA11y/)
    expect(lib).toMatch(/e\.key === 'Escape'.*\n.*stopPropagation/s)
  })
})
