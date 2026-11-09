// Siklus 335 — klik-di-luar SATU sumber: useOutsideClose(open, ref, onClose) di
// dialogA11y. QuickToolbar & ActionMenu dulu punya salinan handler pointerdown
// `if (ref.current && !ref.current.contains(e.target)) setOpen(false)` masing-
// masing (rawan drift, pelajaran siklus 333 untuk Escape).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const QT = readFileSync(join(root, 'components', 'QuickToolbar.jsx'), 'utf8')
const AM = readFileSync(join(root, 'components', 'ActionMenu.jsx'), 'utf8')
const LIB = readFileSync(join(root, 'lib', 'dialogA11y.js'), 'utf8')

describe('siklus 335 — useOutsideClose satu sumber klik-di-luar', () => {
  it('kedua komponen popover memakai useOutsideClose', () => {
    expect(QT).toMatch(/useOutsideClose\(open,\s*ref,\s*\(\) => setOpen\(false\)\)/)
    expect(AM).toMatch(/useOutsideClose\(open,\s*wrap,\s*\(\) => setOpen\(false\)\)/)
    expect(QT).toMatch(/useOutsideClose/)
    expect(AM).toMatch(/useOutsideClose/)
  })

  it('tidak ada lagi salinan handler pointerdown click-outside inline', () => {
    for (const s of [QT, AM]) {
      expect(s.includes("!ref.current.contains(e.target)")).toBe(false)
      expect(s.includes("addEventListener('pointerdown'")).toBe(false)
    }
    // satu-satunya listener pointerdown komponen kini ada di dalam hook
    expect(LIB.split("addEventListener('pointerdown'").length - 1).toBe(1)
  })

  it('hook ada di dialogA11y dengan pola onCloseRef + cleanup listener', () => {
    expect(LIB).toMatch(/export function useOutsideClose\(open, ref, onClose\)/)
    expect(LIB).toMatch(/onCloseRef\.current = onClose/)
    expect(LIB).toMatch(/contains\(e\.target\)/)
    expect(LIB).toMatch(/removeEventListener\('pointerdown', c\)/)
  })

  it('useEscapeClose & useDialogA11y tidak diregresikan', () => {
    expect(LIB).toMatch(/export function useEscapeClose\(open, onClose/)
    expect(LIB).toMatch(/export function useDialogA11y/)
    expect(LIB).toMatch(/stopPropagation = false/)
  })
})
