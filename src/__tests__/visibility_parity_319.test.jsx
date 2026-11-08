// @vitest-environment jsdom
// Siklus 319 — paritas gerbang visibilityState untuk dua poller __agentData
// terakhir (Ticker presence 1 dtk, SysMeter hitungan agen scene 4 dtk) dan
// chip perf App (__perf 2 dtk). Pola sama dgn visibility_parity_318 (siklus 318).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import React from 'react'
import Ticker from '../components/Ticker'
import SysMeter from '../components/SysMeter'

vi.mock('../lib/api', () => ({
  api: vi.fn(async (p) => {
    if (p === 'status') return { agents: 0, load: '0.10', ram_mb: 512, disk_used_gb: 10, disk_total_gb: 50, uptime_s: 60 }
    if (p === 'system/resources') return { load: '0.10', ram_mb: 512 }
    return {}
  }),
}))

beforeEach(() => { delete window.__agentData })
afterEach(() => { cleanup(); document.body.innerHTML = ''; delete window.__agentData })

const pillText = () => { const p = document.querySelector('.ticker-presence'); return p ? p.textContent : '' }

const seated = (name) => ({ agent: { name }, state: 'sitting', walker: { visible: false, position: { z: -3 } }, sittingChar: { visible: true, position: { z: -3 } }, home: { z: -3 } })
const lunch = (name) => ({ agent: { name }, state: 'walking_out', lunch: true, walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } })

describe('Ticker presence — gerbang visibilityState', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('hidden: interval tidak menimpa presence dengan snapshot basi', () => {
    window.__agentData = [seated('BUDI')]
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<Ticker />)
    expect(pillText()).toContain('1 di meja')
    window.__agentData = [lunch('BUDI')]
    act(() => { vi.advanceTimersByTime(3500) })
    expect(pillText()).toContain('1 di meja') // beku di snapshot lama
  })

  it('visible kembali: baca ulang segera tanpa menunggu interval', () => {
    window.__agentData = [seated('BUDI')]
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<Ticker />)
    window.__agentData = [lunch('BUDI')]
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(pillText()).toContain('1 makan siang')
  })

  it('cleanup: listener visibilitychange dilepas saat unmount', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const rm = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Ticker />)
    unmount()
    expect(rm).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

describe('SysMeter hitungan agen scene — gerbang visibilityState', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('hidden: hitungan tidak berubah walau __agentData berubah', async () => {
    const data = [{ id: 'a1' }, { id: 'a2' }]
    window.__agentData = data
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<SysMeter />)
    await act(async () => {})
    expect(document.body.textContent).toContain('2 avatar')
    window.__agentData = data.concat([{ id: 'a3' }])
    act(() => { vi.advanceTimersByTime(9000) })
    expect(document.body.textContent).toContain('2 avatar')
  })

  it('visible kembali: hitungan segar segera', async () => {
    window.__agentData = [{ id: 'a1' }, { id: 'a2' }]
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<SysMeter />)
    await act(async () => {})
    expect(document.body.textContent).toContain('2 avatar')
    window.__agentData = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(document.body.textContent).toContain('3 avatar')
  })
})
