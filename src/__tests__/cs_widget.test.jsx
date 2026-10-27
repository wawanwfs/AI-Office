// @vitest-environment jsdom
// Unit test komponen CsWidget (widget AI CS iframe). Menutup gap coverage:
// CsWidget satu-satunya komponen dialog yang belum punya test. Kontrak yang
// diuji: toggle aria-expanded/aria-controls, role=dialog + aria-modal (dipasang
// useDialogA11y), aria-label dialog, judul iframe, tutup via tombol × dan Escape.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CsWidget from '../components/CsWidget'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('CsWidget component', () => {
  it('awal tertutup: tombol toggle ada, aria-expanded=false, dialog belum di DOM', () => {
    render(<CsWidget />)
    const toggle = screen.getByRole('button', { name: 'Buka widget AI CS' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('cs-widget')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('klik toggle membuka dialog: role=dialog, aria-label, aria-modal, iframe berjudul, aria-expanded=true', () => {
    render(<CsWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Buka widget AI CS' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-label')).toBe('AI CS dibantuin')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByTitle('AI CS dibantuin')).toBeTruthy() // iframe widget
    expect(
      screen.getByRole('button', { name: 'Buka widget AI CS' }).getAttribute('aria-expanded')
    ).toBe('true')
  })

  it('tombol tutup menutup dialog dan mengembalikan aria-expanded=false', () => {
    render(<CsWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Buka widget AI CS' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tutup widget CS' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Buka widget AI CS' }).getAttribute('aria-expanded')
    ).toBe('false')
  })

  it('Escape menutup dialog (via useDialogA11y)', () => {
    render(<CsWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Buka widget AI CS' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
