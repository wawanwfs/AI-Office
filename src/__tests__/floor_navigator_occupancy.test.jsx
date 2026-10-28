// @vitest-environment jsdom
// Unit test siklus 143: badge okupansi lantai LIVE di FloorNavigator.
// Dulu tombol lantai hanya daftar statis (pod + nama agen meja) — founder tak
// bisa lihat berapa agen yang SAAT INI ada di tiap lantai (rapat L1, kafe L3,
// jalan kampus memindahkan agen lintas lantai terus-menerus). Kini jumlah
// dihitung dari posisi karakter scene (__agentData + agentLiveLevel siklus 142).
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import FloorNavigator from '../components/FloorNavigator'
import { floorOccupancy } from '../scene/parts/agent_status.js'

beforeEach(() => { delete window.__agentData })
afterEach(() => { cleanup(); delete window.__agentData })

// Entri agentData seperti bentukan scene: meja L1 (z=-3), L2 (z=1.5), L3 (z=6)
const seated = (name, z) => ({
  agent: { name },
  state: 'sitting',
  walker: { visible: false, position: { z } },
  sittingChar: { visible: true, position: { z } },
  home: { z },
})

describe('floorOccupancy (murni) — jumlah agen per lantai dari posisi scene', () => {
  it('menghitung agen per lantai live, BUKAN dari meja (walker L3 ≠ meja L1)', () => {
    const data = [
      seated('BUDI', -3),          // di meja L1
      seated('DEWI', 6),           // di meja L3
      { agent: { name: 'RINA' }, state: 'walking_out', walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } },
    ]
    expect(floorOccupancy(data)).toEqual({ 1: 1, 2: 0, 3: 2 })
  })

  it('peserta rapat dihitung di L1 (ruang meeting), bukan lantai mejanya', () => {
    // SATU entri per agen (bentukan scene): DEWI meja L3, figur rapat di L1 —
    // scene menyembunyikan sittingChar & memindahkan state ke 'meeting'.
    const data = [
      { agent: { name: 'DEWI' }, state: 'meeting', walker: { visible: false, position: { z: 6 } }, sittingChar: { visible: false, position: { z: 6 } }, home: { z: 6 } },
    ]
    expect(floorOccupancy(data)).toEqual({ 1: 1, 2: 0, 3: 0 })
  })

  it('agen offsite (pulang) tidak dihitung di lantai mana pun', () => {
    const data = [
      seated('BUDI', -3),
      { agent: { name: 'TONI' }, state: 'offsite', walker: { visible: false, position: { z: 6 } }, sittingChar: { visible: false, position: { z: 6 } }, home: { z: 6 } },
    ]
    expect(floorOccupancy(data)).toEqual({ 1: 1, 2: 0, 3: 0 })
  })

  it('koordinat korup (NaN) dilewati, bukan menjatuhkan hitungan ke lantai salah', () => {
    const data = [
      seated('BUDI', -3),
      { agent: { name: 'KORUP' }, state: 'sitting', walker: { visible: false, position: { z: NaN } }, sittingChar: { visible: false, position: { z: NaN } }, home: { z: NaN } },
    ]
    expect(floorOccupancy(data)).toEqual({ 1: 1, 2: 0, 3: 0 })
  })

  it('guard anti-poisoning: bukan array/korup → null (badge disembunyikan, bukan nol palsu)', () => {
    expect(floorOccupancy(null)).toBeNull()
    expect(floorOccupancy(undefined)).toBeNull()
    expect(floorOccupancy('korup')).toBeNull()
    expect(floorOccupancy(123)).toBeNull()
  })

  it('array kosong (scene siap, belum ada agen) → {1:0, 2:0, 3:0} — bukan null', () => {
    expect(floorOccupancy([])).toEqual({ 1: 0, 2: 0, 3: 0 })
  })

  it('entri tanpa agent / korup dilewati tanpa crash', () => {
    expect(floorOccupancy([{ agent: null, home: { z: -3 } }, null, 'korup', seated('BUDI', 1.5)])).toEqual({ 1: 0, 2: 1, 3: 0 })
  })
})

describe('FloorNavigator — integrasi badge okupansi live', () => {
  it('scene ada → tiap tombol lantai menampilkan badge jumlah agen saat ini', () => {
    window.__agentData = [seated('BUDI', -3), seated('DEWI', -5), seated('MAYA', 1.5), seated('SARI', 6)]
    render(<FloorNavigator currentFloor={1} />)
    const btnL1 = screen.getByText('L1 · Ops & AI').closest('button')
    const btnL2 = screen.getByText('L2 · Engineering').closest('button')
    const btnL3 = screen.getByText('L3 · Executive').closest('button')
    expect(btnL1.textContent).toContain('2')
    expect(btnL2.textContent).toContain('1')
    expect(btnL3.textContent).toContain('1')
  })

  it('badge ikut berubah LIVE saat agen pindah lantai (tanpa remount — polling 1 dtk)', () => {
    vi.useFakeTimers()
    window.__agentData = [seated('BUDI', -3)]
    render(<FloorNavigator currentFloor={1} />)
    const btnL1 = screen.getByText('L1 · Ops & AI').closest('button')
    const btnL3 = screen.getByText('L3 · Executive').closest('button')
    expect(btnL1.textContent).toContain('1')
    expect(btnL3.textContent).toContain('0')
    // Daycycle mengirim BUDI lunch ke kafe L3: walker berjalan (z=5.6)
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'walking_out', lunch: true, walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } }]
    act(() => { vi.advanceTimersByTime(2100) })
    const btnL1b = screen.getByText('L1 · Ops & AI').closest('button')
    const btnL3b = screen.getByText('L3 · Executive').closest('button')
    expect(btnL1b.textContent).toContain('0')
    expect(btnL3b.textContent).toContain('1')
    vi.useRealTimers()
  })

  it('interval polling dibersihkan saat unmount (tanpa leak timer)', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = render(<FloorNavigator currentFloor={1} />)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    vi.useRealTimers()
  })

  it('scene belum siap (__agentData absen) → badge TIDAK dirender (bukan 0 palsu)', () => {
    render(<FloorNavigator currentFloor={1} />)
    const btnL1 = screen.getByText('L1 · Ops & AI').closest('button')
    expect(btnL1.querySelector('.floor-nav-occ')).toBeNull()
  })

  it('alur lama utuh: klik lantai tetap onSelectFloor, badge tak mengganggu interaksi', () => {
    window.__agentData = [seated('BUDI', -3)]
    const onSelect = vi.fn()
    render(<FloorNavigator currentFloor={1} onSelectFloor={onSelect} />)
    fireEvent.click(screen.getByText('L3 · Executive'))
    expect(onSelect).toHaveBeenCalledWith(3, 'l3')
  })

  it('keyboard nav (ArrowRight) tetap bekerja dengan badge ada', () => {
    window.__agentData = [seated('BUDI', -3)]
    const onSelect = vi.fn()
    const { container } = render(<FloorNavigator currentFloor={1} onSelectFloor={onSelect} />)
    fireEvent.keyDown(container.querySelector('[role="navigation"]'), { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith(2, 'l2')
  })
})
