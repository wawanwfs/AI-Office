// @vitest-environment jsdom
// Siklus 180 — pembersihan flag modal basi (pelajaran siklus 179):
// __wfsModalOpen dulu HANYA ditulis saat render App → jalur tanpa render
// (onSelectAgent null via scene.resetFocus; panel internal yang menaikkan count
// di EFFECT setelah render) menyisakan flag basi → guard keyboard scene
// (OfficeScene onKey / __onOrbitKey) salah memblokir. Solusi: refresh flag SAAT
// KONSUMSI — satu rumus (base App-state + anyModalOpen live) ditulis saat render
// DAN di listener capture-phase App (keydown/pointerdown/mousedown/pointerup).
// Kontrak: (1) refresh menulis flag = base || count; (2) flag basi true
// tersembuhkan saat konsumsi; (3) flag basi false saat panel internal terbuka
// tersembuhkan; (4) __escModalAtDispatch TIDAK disentuh refresh (anti sticky);
// (5) listener App membersihkan __escModalAtDispatch di event non-Escape
// (perbaikan lama: true tertinggal setelah Escape memblokir orbit berikutnya);
// (6) wiring statis: listener capture terpasang utk 4 event, refresh dipanggil,
// base ditulis saat render.
import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  anyModalOpen,
  wfsRefreshModalFlag,
  wfsSetAppModalBase,
  useModalFlag,
} from '../lib/modal'

function Flag() { useModalFlag(true); return null }

afterEach(() => {
  // rapikan global antar-test
  delete window.__wfsAppModalBase
  delete window.__wfsModalOpen
  delete window.__escModalAtDispatch
  document.body.innerHTML = ''
  cleanup()
})

describe('wfsSetAppModalBase / wfsRefreshModalFlag — flag modal tak basi', () => {
  it('refresh = base || count; default false saat keduanya kosong', () => {
    expect(wfsRefreshModalFlag()).toBe(false)
    expect(window.__wfsModalOpen).toBe(false)
  })

  it('base App-state saja → true', () => {
    wfsSetAppModalBase(true)
    expect(wfsRefreshModalFlag()).toBe(true)
  })

  it('count panel internal saja (tanpa base) → true — dibaca LIVE', () => {
    // simulasikan panel internal: naikkan count lewat render Flag nyata
    const { unmount } = render(React.createElement(Flag))
    wfsSetAppModalBase(false)
    expect(anyModalOpen()).toBe(true)
    expect(wfsRefreshModalFlag()).toBe(true)
    unmount()
    expect(wfsRefreshModalFlag()).toBe(false)
  })

  it('refresh TIDAK menyentuh __escModalAtDispatch (anti sticky true)', () => {
    window.__escModalAtDispatch = true
    wfsSetAppModalBase(false)
    wfsRefreshModalFlag()
    expect(window.__escModalAtDispatch).toBe(true) // utuh — milik listener App
    window.__escModalAtDispatch = false
    wfsRefreshModalFlag()
    expect(window.__escModalAtDispatch).toBe(false)
  })

  it('normalisasi base: truthy → true, falsy → false (koersi Boolean)', () => {
    wfsSetAppModalBase('yes')
    expect(wfsRefreshModalFlag()).toBe(true)
    wfsSetAppModalBase(1)
    expect(wfsRefreshModalFlag()).toBe(true)
    wfsSetAppModalBase('')
    expect(wfsRefreshModalFlag()).toBe(false)
    wfsSetAppModalBase(0)
    expect(wfsRefreshModalFlag()).toBe(false)
    wfsSetAppModalBase(null)
    expect(wfsRefreshModalFlag()).toBe(false)
    wfsSetAppModalBase(undefined)
    expect(wfsRefreshModalFlag()).toBe(false)
  })
})

describe('wiring App — listener refresh saat konsumsi (statis)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const app = readFileSync(join(here, '../App.jsx'), 'utf8')
  const modalJs = readFileSync(join(here, '../lib/modal.js'), 'utf8')

  it('listener capture terpasang utk 4 event & dibersihkan', () => {
    expect(app).toContain("['keydown', 'pointerdown', 'mousedown', 'pointerup']")
    expect(app).toContain("window.addEventListener(ev, snap, { capture: true })")
    expect(app).toContain("window.removeEventListener(ev, snap, { capture: true })")
  })

  it('refresh dipanggil di listener & base ditulis saat render', () => {
    expect(app).toContain('return wfsRefreshModalFlag()')
    expect(app).toContain('wfsSetAppModalBase(')
    expect(app).toContain('wfsRefreshModalFlag()')
  })

  it('escModal dibersihkan di event non-Escape (perbaikan sticky)', () => {
    expect(app).toContain("else window.__escModalAtDispatch = false")
  })

  it('refresh lib TIDAK menyentuh __escModalAtDispatch (tanggung jawab terpisah)', () => {
    const body = modalJs.slice(modalJs.indexOf('wfsRefreshModalFlag'))
    expect(body).not.toContain('__escModalAtDispatch')
  })

  it('guard scene tetap membaca flag yang sama (kontrak tidak berubah)', () => {
    const scene = readFileSync(join(here, '../scene/OfficeScene.js'), 'utf8')
    expect(scene).toContain('window.__wfsModalOpen||window.__escModalAtDispatch')
  })
})
