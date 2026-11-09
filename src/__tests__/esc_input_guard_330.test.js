import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Siklus 330: Escape scene reset-focus kini GUARD INPUT — mengetik di field
// teks (search task board, form TaskModal, dsb) lalu tekan Escape TIDAK BOLEH
// me-reset fokus kamera ke home / membatalkan seleksi agen. Pola guard sudah
// ada di __onOrbitKey (siklus 177); handler Escape (onKey) tertinggal tanpa
// guard → kebiasaan "Escape utk keluar/kosongkan input" menggiring kamera.
const here = dirname(fileURLToPath(import.meta.url))
const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8')

describe('siklus 330 — Escape scene reset-focus guard input', () => {
  it('isTypingTarget didefinisikan & dipakai guard onKey Escape', () => {
    expect(scene).toContain("const isTypingTarget=(t)=>t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable)")
    expect(scene).toMatch(/const onKey=\(e\)=>\{ if\(e\.key==='Escape'[^}]*&&focusGoal&&!isTypingTarget\(e\.target\)\)/)
  })

  it('guard modal snapshot (__escModalAtDispatch) tetap dipertahankan di onKey', () => {
    expect(scene).toMatch(/const onKey=\(e\)=>\{ if\(e\.key==='Escape'&&window\.__escModalAtDispatch===false/)
  })

  it('pola guard input konsisten dengan __onOrbitKey (satu sumber kebenaran)', () => {
    // __onOrbitKey memakai pola guard yang sama — refactor ke helper bersama
    expect(scene).toContain('!isTypingTarget(e.target)') // dipakai minimal 2x (onKey + onOrbit via helper)
    const uses = scene.split('isTypingTarget(').length - 1
    expect(uses).toBeGreaterThanOrEqual(2) // definisi + 2 pemakaian guard (onKey & __onOrbitKey) — split menghitung 3 kata 'isTypingTarget' minus definisi → 2
  })
})
