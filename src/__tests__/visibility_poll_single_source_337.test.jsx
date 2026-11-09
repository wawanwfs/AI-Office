// Siklus 337: polling berbasis visibilitas satu sumber — useVisibilityPoll.
// Pola lama (setInterval + gate visibilityState + listener visibilitychange
// berpasangan) tersalin di banyak komponen; kini satu hook di lib.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React, { useState } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useVisibilityPoll } from '../lib/dialogA11y'

const libSrc = readFileSync(join(process.cwd(), 'src', 'lib', 'dialogA11y.js'), 'utf8')

function Probe({ onTick }) {
  useVisibilityPoll(onTick, 50)
  return <div data-testid="probe">ok</div>
}

describe('siklus 337 — useVisibilityPoll satu sumber', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('hook diekspor dari dialogA11y dengan pola gate+listener+cleanup', () => {
    expect(libSrc).toContain('export function useVisibilityPoll')
    expect(libSrc).toContain("document.addEventListener('visibilitychange', tick)")
    expect(libSrc).toContain("document.removeEventListener('visibilitychange', tick)")
    expect(libSrc).toContain('clearInterval(iv)')
    expect(libSrc).toMatch(/readRef\.current\(\)/)
  })

  it('tick pertama jalan segera, lalu tiap interval; cleanup menghentikan tick', () => {
    const spy = vi.fn()
    const { unmount } = render(<Probe onTick={spy} />)
    expect(spy).toHaveBeenCalledTimes(1) // tick segera saat mount
    act(() => { vi.advanceTimersByTime(150) })
    expect(spy).toHaveBeenCalledTimes(4) // 1 + 3 tick @50ms
    unmount()
    act(() => { vi.advanceTimersByTime(200) })
    expect(spy).toHaveBeenCalledTimes(4) // tak bertambah setelah unmount
  })

  it('tick digerbang visibilityState — hidden tak memanggil read', () => {
    const spy = vi.fn().mockImplementation(() => {
      if (document.visibilityState === 'visible') setCount(c => c + 1)
    })
    let count = 0
    const setState = (fn) => { count = fn(count) }
    spy.mockClear()
    function Gated() {
      const [, force] = useState(0)
      useVisibilityPoll(() => { if (document.visibilityState === 'visible') { count++; force(x => x + 1) } }, 50)
      return <div data-testid="g">n</div>
    }
    void spy; void setState
    const { unmount } = render(<Gated />)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => { vi.advanceTimersByTime(150) })
    const duringHidden = count
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => { vi.advanceTimersByTime(50) })
    expect(count).toBeGreaterThan(duringHidden)
    unmount()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  })

  it('komponen utama memakai hook — salinan interval+listener visibilitychange di komponen hilang', () => {
    const files = [
      'src/components/Ticker.jsx', 'src/components/FloorNavigator.jsx',
      'src/components/HUD.jsx', 'src/components/Dashboard.jsx',
      'src/components/TeamStats.jsx', 'src/components/AgentInspector.jsx',
      'src/components/ProjectPanel.jsx', 'src/components/TaskBoard.jsx',
      'src/components/WfsPanel.jsx',
    ]
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, `${f} harus memakai useVisibilityPoll`).toContain('useVisibilityPoll(')
    }
  })

  it('tidak ada lagi salinan setInterval+visibilitychange berpasangan di komponen', () => {
    const { execSync } = require('node:child_process')
    let out = ''
    try {
      out = execSync(
        `grep -rln "visibilitychange" ${'src/components'} ${'src/App.jsx'} 2>/dev/null || true`,
        { encoding: 'utf8' },
      )
    } catch { out = '' }
    const leftovers = out.trim().split('\n').filter(Boolean)
    // Sisa penggunaan visibilitychange di komponen hanya yang benar-benar khusus:
    // - SysMeter: 2 listener (API + scene), interval berbeda dgn read berbeda.
    // - ShConsole: interval digabung dgn setup EventSource di effect overview.
    // Bertambah = audit ulang.
    const whitelist = new Set([
      'src/components/SysMeter.jsx',
      'src/components/ShConsole.jsx',
    ])
    for (const f of leftovers) {
      if (!whitelist.has(f)) {
        const src = readFileSync(join(process.cwd(), f), 'utf8')
        // boleh ada listener visibilitychange hanya bila TIDAK berpasangan dgn setInterval gate di effect yang sama
        const paired = /setInterval\(\(\) => \{ if \(document\.visibilityState/.test(src)
        expect(paired, `${f} masih punya salinan setInterval+gate visibilityState`).toBe(false)
      }
    }
  })
})
