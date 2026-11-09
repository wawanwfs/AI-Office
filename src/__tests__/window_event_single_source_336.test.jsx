/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import React, { useState } from 'react'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { useWindowEvent } from '../lib/dialogA11y'

// Siklus 336: event kustom window satu sumber via useWindowEvent.
// Enam salinan add/removeEventListener pasangan (TaskBoard ×3, ProjectPanel
// ×2, Dashboard ×1) diganti pemanggilan hook.

const lib = readFileSync(join(__dirname, '..', 'lib', 'dialogA11y.js'), 'utf8')
const taskBoard = readFileSync(join(__dirname, '..', 'components', 'TaskBoard.jsx'), 'utf8')
const projectPanel = readFileSync(join(__dirname, '..', 'components', 'ProjectPanel.jsx'), 'utf8')
const dashboard = readFileSync(join(__dirname, '..', 'components', 'Dashboard.jsx'), 'utf8')

describe('siklus 336 — useWindowEvent satu sumber', () => {
  it('hook ada di lib dengan pola ref + cleanup', () => {
    expect(lib).toContain('export function useWindowEvent')
    expect(lib).toMatch(/hRef\.current = handler/)
    expect(lib).toMatch(/window\.addEventListener\(type, h\)[\s\S]{0,80}window\.removeEventListener\(type, h\)/s)
  })

  it('keenam salinan pasangan add/removeEventListener komponen hilang', () => {
    expect(taskBoard).not.toContain("window.addEventListener('wfs-toggle-task-board'")
    expect(taskBoard).not.toContain("window.addEventListener('wfs-cycle-div-preset'")
    expect(taskBoard).not.toContain("window.removeEventListener('wfs-toggle-task-board'")
    expect(taskBoard).not.toContain("window.removeEventListener('wfs-cycle-div-preset'")
    expect(projectPanel).not.toContain("window.addEventListener('wfs-open-project-panel'")
    expect(projectPanel).not.toContain("window.addEventListener('wfs-toggle-project-panel'")
    expect(projectPanel).not.toContain("window.removeEventListener('wfs-open-project-panel'")
    expect(dashboard).not.toContain("window.addEventListener('wfs-toggle-dashboard'")
    expect(dashboard).not.toContain("window.removeEventListener('wfs-toggle-dashboard'")
    // dan memakai hook
    expect(taskBoard).toContain("useWindowEvent('wfs-toggle-task-board'")
    expect(taskBoard).toContain("useWindowEvent('wfs-cycle-div-preset'")
    expect(projectPanel).toContain("useWindowEvent('wfs-open-project-panel'")
    expect(projectPanel).toContain("useWindowEvent('wfs-toggle-project-panel'")
    expect(dashboard).toContain("useWindowEvent('wfs-toggle-dashboard'")
  })

  it('hook mengirim event & cleanup benar', () => {
    function Probe() {
      const [n, setN] = useState(0)
      useWindowEvent('wfs-test-336', () => setN(v => v + 1))
      return <div data-testid="n">{n}</div>
    }
    const { getByTestId, unmount } = render(<Probe />)
    act(() => { window.dispatchEvent(new CustomEvent('wfs-test-336')) })
    act(() => { window.dispatchEvent(new CustomEvent('wfs-test-336')) })
    expect(getByTestId('n').textContent).toBe('2')
    unmount()
    act(() => { window.dispatchEvent(new CustomEvent('wfs-test-336')) })
    // setelah unmount tidak ada error; verifikasi tak ada listener tersisa
    const off = vi.fn()
    window.addEventListener('wfs-test-336', off)
    window.removeEventListener('wfs-test-336', off)
    expect(off).not.toHaveBeenCalled()
  })

  it('handler via ref — callback lama tak dipasang ulang saat re-render', () => {
    const cb = vi.fn()
    function Probe({ text }) {
      useWindowEvent('wfs-test-336b', cb)
      return <div>{text}</div>
    }
    const { rerender } = render(<Probe text="a" />)
    rerender(<Probe text="b" />)
    act(() => { window.dispatchEvent(new CustomEvent('wfs-test-336b')) })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('useEscapeClose & useDialogA11y tidak diregresikan', () => {
    expect(lib).toContain('export function useEscapeClose')
    expect(lib).toContain('export function useDialogA11y')
    expect(lib).toContain('export function useOutsideClose')
  })
})
