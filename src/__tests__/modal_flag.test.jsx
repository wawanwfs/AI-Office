// @vitest-environment jsdom
// Unit test lib/modal (useModalFlag / anyModalOpen) — flag modal terpusat yang
// dipakai TaskBoard/ProjectPanel/WfsPanel/TeamStats/CsWidget/TaskModal supaya
// scene TIDAK me-reset kamera saat Escape menutup overlay. window.__wfsModalOpen
// di App hanya mencakup modal yang state-nya di App; panel internal memakai hook
// ini. Test langsung modul: modal_refresh.test.js (siklus 180).
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useModalFlag, anyModalOpen } from '../lib/modal'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function Flag({ open }) {
  useModalFlag(open)
  return null
}

describe('lib/modal — useModalFlag / anyModalOpen', () => {
  it('false saat tidak ada modal terbuka', () => {
    cleanup() // pastikan baseline bersih dari test lain di file ini
    expect(anyModalOpen()).toBe(false)
  })

  it('true selama ada modal terbuka, false lagi setelah ditutup', () => {
    const { rerender } = render(<Flag open />)
    expect(anyModalOpen()).toBe(true)

    rerender(<Flag open={false} />)
    expect(anyModalOpen()).toBe(false)
  })

  it('dua modal terbuka menumpuk; menutup satu masih tersisa satu', () => {
    const a = render(<Flag open />)
    const b = render(<Flag open />)
    expect(anyModalOpen()).toBe(true)

    a.unmount()
    expect(anyModalOpen()).toBe(true)

    b.unmount()
    expect(anyModalOpen()).toBe(false)
  })
})
