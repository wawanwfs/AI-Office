// @vitest-environment jsdom
// Unit test siklus 149: badge kehadiran agen LIVE di Ticker.
// Dulu pita info teratas hanya membawa task/host — keadaan agen KANTOR (duduk
// kerja, rapat, makan siang, berjalan, pulang) tidak tampak di mana pun
// kecuali kartu inspektur per-agen. Kini dirakit dari agentLiveStatus
// (SATU sumber kebenaran agent_status.js — sama dgn badge kartu siklus 140 &
// okupansi lantai 143) jadi pill mini berwarna di tepi kiri pita.
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import Ticker from '../components/Ticker'
import { tickerPresenceSummary, agentLiveStatus } from '../scene/parts/agent_status.js'

vi.mock('../lib/api', () => ({ api: vi.fn(() => new Promise(() => {})) })) // poll gateway menggantung — fokus di presence

beforeEach(() => { delete window.__agentData })
afterEach(() => { cleanup(); document.body.innerHTML = ''; delete window.__agentData })

// Entri agentData bentukan scene: duduk di meja z (L1<−0.8, L2≤4.5, L3>4.5)
const seated = (name, z) => ({
  agent: { name },
  state: 'sitting',
  walker: { visible: false, position: { z } },
  sittingChar: { visible: true, position: { z } },
  home: { z },
})

const pill = () => document.querySelector('.ticker-presence')
const pillText = () => { const p = pill(); return p ? p.textContent : '' }

describe('tickerPresenceSummary (murni) — hitungan per status dari agentLiveStatus', () => {
  it('menghitung per status: duduk=work, meeting=meet, lunch walker=lunch', () => {
    const data = [
      seated('BUDI', -3),
      { agent: { name: 'DEWI' }, state: 'meeting', walker: { visible: false, position: { z: 6 } }, sittingChar: { visible: false, position: { z: 6 } }, home: { z: 6 } },
      { agent: { name: 'RINA' }, state: 'walking_out', lunch: true, walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } },
    ]
    const s = tickerPresenceSummary(data)
    expect(s.map(x => `${x.count} ${x.label}`)).toEqual(['1 di meja', '1 rapat', '1 makan siang'])
    // urutan label konsisten dgn TICKER_PRESENCE_ORDER (work → meet → lunch → walk → dim)
    expect(s.map(x => x.key)).toEqual(['work', 'meet', 'lunch'])
  })

  it('berjalan keliling (tanpa lunch) masuk kelompok walk, pulang masuk dim', () => {
    const data = [
      { agent: { name: 'TONI' }, state: 'walking_back', walker: { visible: true, position: { z: 1.5 } }, sittingChar: { visible: false, position: { z: 1.5 } }, home: { z: 1.5 } },
      { agent: { name: 'SARI' }, state: 'leaving', walker: { visible: false, position: { z: -3 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } },
      { agent: { name: 'YUDA' }, state: 'offsite', walker: { visible: false, position: { z: 6 } }, sittingChar: { visible: false, position: { z: 6 } }, home: { z: 6 } },
    ]
    expect(tickerPresenceSummary(data)).toEqual([
      { key: 'walk', label: 'berjalan', count: 1, first: true },
      { key: 'dim', label: 'pulang/offsite', count: 2, first: false },
    ])
  })

  it('status tak dikenal/korup (state non-string) dihitung dim (Standby), bukan crash', () => {
    const data = [
      seated('BUDI', -3),
      { agent: { name: 'KORUP' }, state: 42 },
      null,
      { state: 'sitting' }, // tanpa agent → dilewati
    ]
    expect(tickerPresenceSummary(data)).toEqual([
      { key: 'work', label: 'di meja', count: 1, first: true },
      { key: 'dim', label: 'pulang/offsite', count: 1, first: false },
    ])
  })

  it('guard anti-poisoning: bukan array → null; array kosong → null (baris disembunyikan)', () => {
    expect(tickerPresenceSummary(undefined)).toBeNull()
    expect(tickerPresenceSummary('korup')).toBeNull()
    expect(tickerPresenceSummary([])).toBeNull()
  })

  it('konsistensi lintas fungsi: tone agentLiveStatus selalu anggota TICKER_PRESENCE_ORDER', () => {
    const sample = [
      { agent: { name: 'A' }, state: 'sitting' },
      { agent: { name: 'B' }, state: 'meeting' },
      { agent: { name: 'C' }, state: 'walking_out', lunch: true },
      { agent: { name: 'D' }, state: 'walking_out' },
      { agent: { name: 'E' }, state: 'walking_back' },
      { agent: { name: 'F' }, state: 'leaving' },
      { agent: { name: 'G' }, state: 'offsite' },
      { agent: { name: 'H' } }, // tanpa state → Standby
    ]
    sample.forEach(ad => {
      expect(['work', 'meet', 'lunch', 'walk', 'dim']).toContain(agentLiveStatus(ad).tone)
    })
  })
})

describe('Ticker — pill kehadiran LIVE (integrasi komponen)', () => {
  it('merender pill dgn titik berwarna & jumlah saat scene lapor', () => {
    window.__agentData = [seated('BUDI', -3), seated('DEWI', 6)]
    render(<Ticker />)
    expect(pill()).toBeTruthy()
    expect(pillText()).toContain('2 di meja')
  })

  it('LIVE: pill ikut berubah saat agen pindah status tanpa remount (polling 1 dtk)', () => {
    vi.useFakeTimers()
    window.__agentData = [seated('BUDI', -3)]
    render(<Ticker />)
    expect(pillText()).toContain('1 di meja')
    // Daycycle mengirim BUDI lunch: walker jalan ke kafe L3
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'walking_out', lunch: true, walker: { visible: true, position: { z: 5.6 } }, sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 } }]
    act(() => { vi.advanceTimersByTime(2100) })
    expect(pillText()).toContain('1 makan siang')
    expect(pillText()).not.toContain('di meja')
    vi.useRealTimers()
  })

  it('scene belum siap (__agentData absen) → pill TIDAK dirender (bukan 0 palsu)', () => {
    render(<Ticker />)
    expect(pill()).toBeNull()
  })

  it('isi kehadiran diumumkan di region aria-live (#ticker-live)', () => {
    window.__agentData = [seated('BUDI', -3)]
    render(<Ticker />)
    expect(document.querySelector('#ticker-live').textContent).toContain('1 di meja')
  })

  it('interval polling dibersihkan saat unmount (tanpa leak timer)', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = render(<Ticker />)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    vi.useRealTimers()
  })

  it('alur lama utuh: tanpa scene, marquee gateway tetap berjalan (fallback tampil)', async () => {
    vi.useFakeTimers()
    render(<Ticker />)
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByText('Gateway belum terhubung — menunggu data…')).toBeTruthy()
    expect(pill()).toBeNull()
    vi.useRealTimers()
  })
})
