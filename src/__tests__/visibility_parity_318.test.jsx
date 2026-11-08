// @vitest-environment jsdom
// Siklus 318: paritas gerbang visibilityState (siklus 315-317) ke dua panel
// sisa yang membaca window.__agentData tiap 1 dtk: FloorNavigator (badge
// okupansi lantai) & AgentInspector (status live & lantai agen saat kartu
// dibuka). Snapshot basi saat tab hidden tidak boleh menimpa tampilan.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import FloorNavigator from '../components/FloorNavigator'
import AgentInspector from '../components/AgentInspector'

beforeEach(() => {
  delete window.__agentData
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  delete window.__agentData
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
const seated = (name, z) => ({
  agent: { name },
  state: 'sitting',
  walker: { visible: false, position: { z } },
  sittingChar: { visible: true, position: { z } },
  home: { z },
})
const lunch = (name) => ({
  agent: { name }, state: 'walking_out', lunch: true,
  walker: { visible: true, position: { z: 5.6 } },
  sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 },
})
// floorOccupancy: duduk di meja → lantai dari z (L1 < -0.8, L2 ≤ 4.5, L3 > 4.5)
const allSeated = () => [seated('A', -5), seated('B', 2), seated('C', 6)]
const allLunch = () => [lunch('A'), lunch('B'), lunch('C')]

describe('FloorNavigator — badge okupansi digerbang visibility (siklus 318)', () => {
  it('tab hidden → interval 1 dtk tidak menimpa badge dgn snapshot basi', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    window.__agentData = allSeated()
    render(<FloorNavigator />)
    const badge = document.querySelector('.floor-nav-occ')
    expect(badge).toBeTruthy()
    const fresh = badge.textContent
    expect(fresh).toBe('1') // 1 agen per lantai (L1/L2/L3)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.__agentData = allLunch()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(document.querySelector('.floor-nav-occ').textContent).toBe(fresh)
  })

  it('tab visible kembali → badge langsung segar tanpa nunggu interval', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    window.__agentData = allSeated()
    render(<FloorNavigator />)
    const fresh = document.querySelector('.floor-nav-occ').textContent
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.__agentData = allLunch()
    act(() => { vi.advanceTimersByTime(1100) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(document.querySelector('.floor-nav-occ').textContent).not.toBe(fresh)
    expect(document.querySelector('.floor-nav-occ').textContent).toBe('0')
  })

  it('cleanup unmount: clearInterval dipanggil', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const clearSpy = vi.spyOn(window, 'clearInterval')
    window.__agentData = allSeated()
    const { unmount } = render(<FloorNavigator />)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('AgentInspector — status live digerbang visibility (siklus 318)', () => {
  const open = () => {
    render(<AgentInspector agent={{ name: 'GILANG', floor: 2 }} onClose={() => {}} />)
  }
  it('tab hidden → status kartu tidak ditimpa snapshot basi', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    window.__agentData = [seated('GILANG', 2)]
    open()
    expect(document.body.textContent).toContain('GILANG')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.__agentData = [lunch('GILANG')]
    act(() => { vi.advanceTimersByTime(1100) })
    expect(document.body.textContent).not.toContain('Makan Siang')
  })

  it('tab visible kembali → status langsung segar (makan siang terbaca segera)', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    window.__agentData = [seated('GILANG', 2)]
    open()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    window.__agentData = [lunch('GILANG')]
    act(() => { vi.advanceTimersByTime(1100) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(document.body.textContent).toContain('Makan Siang')
  })
})
