// @vitest-environment jsdom
// Unit test siklus 140: status live AgentInspector dari state machine scene.
// Diskriminasi bug: dulu label "Aktif Bekerja" HARDCODED untuk semua agen —
// agen rapat/makan siang/berjalan/offsite tetap dilabeli bekerja.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import AgentInspector from '../components/AgentInspector'
import { agentLiveStatus, findAgentLiveEntry, STATUS_HEX } from '../scene/parts/agent_status.js'

afterEach(() => { cleanup(); document.body.innerHTML = ''; delete window.__agentData })

describe('agentLiveStatus (murni) — peta state scene → label', () => {
  it('sitting → Aktif Bekerja (tone work)', () => {
    expect(agentLiveStatus({ state: 'sitting' })).toEqual({ label: 'Aktif Bekerja', tone: 'work', hex: STATUS_HEX.work })
  })
  it('meeting → Dalam Rapat (tone meet)', () => {
    expect(agentLiveStatus({ state: 'meeting' })).toEqual({ label: 'Dalam Rapat', tone: 'meet', hex: STATUS_HEX.meet })
  })
  it('walking_out + flag lunch → Makan Siang (tanpa lunch → Berjalan)', () => {
    expect(agentLiveStatus({ state: 'walking_out', lunch: true })).toEqual({ label: 'Makan Siang', tone: 'lunch', hex: STATUS_HEX.lunch })
    expect(agentLiveStatus({ state: 'walking_out' })).toEqual({ label: 'Berjalan', tone: 'walk', hex: STATUS_HEX.walk })
  })
  it('walking_back → Kembali ke Meja', () => {
    expect(agentLiveStatus({ state: 'walking_back' })).toEqual({ label: 'Kembali ke Meja', tone: 'walk', hex: STATUS_HEX.walk })
  })
  it('leaving → Pulang; offsite → Di Luar Kantor', () => {
    expect(agentLiveStatus({ state: 'leaving' }).label).toBe('Pulang')
    expect(agentLiveStatus({ state: 'offsite' })).toEqual({ label: 'Di Luar Kantor', tone: 'dim', hex: STATUS_HEX.dim })
  })
  it('state korup/absen → Standby (bukan crash, bukan klaim palsu)', () => {
    expect(agentLiveStatus({ state: 123 }).label).toBe('Standby')
    expect(agentLiveStatus({}).label).toBe('Standby')
    expect(agentLiveStatus(null).label).toBe('Standby')
  })
})

describe('findAgentLiveEntry (murni) — pencarian nama case-insensitive', () => {
  const data = [
    { agent: { name: 'BUDI' }, state: 'sitting' },
    { agent: { name: 'DEWI' }, state: 'meeting' },
  ]
  it('menemukan entri meski case beda', () => {
    expect(findAgentLiveEntry(data, 'budi')).toBe(data[0])
    expect(findAgentLiveEntry(data, 'DEWI')).toBe(data[1])
  })
  it('bukan anggota agentData (reception CEO) → null; input korup aman', () => {
    expect(findAgentLiveEntry(data, 'WAHYU FS')).toBeNull()
    expect(findAgentLiveEntry(data, '')).toBeNull()
    expect(findAgentLiveEntry(null, 'BUDI')).toBeNull()
    expect(findAgentLiveEntry([{ agent: null }], 'BUDI')).toBeNull()
  })
})

describe('AgentInspector — integrasi status live', () => {
  const agent = { name: 'BUDI', role: 'Backend Dev', floor: 1 }

  it('agen duduk di scene → kartu menampilkan Aktif Bekerja', () => {
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'sitting' }]
    render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Aktif Bekerja')).toBeTruthy()
  })

  it('agen peserta rapat → Dalam Rapat (dulu HARDCODED Aktif Bekerja — bug)', () => {
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'meeting' }]
    render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Dalam Rapat')).toBeTruthy()
    expect(screen.queryByText('Aktif Bekerja')).toBeNull()
  })

  it('agen lunch → Makan Siang', () => {
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'walking_out', lunch: true }]
    render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Makan Siang')).toBeTruthy()
  })

  it('agen offsite → Di Luar Kantor', () => {
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'offsite' }]
    render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Di Luar Kantor')).toBeTruthy()
  })

  it('scene belum siap (window.__agentData kosong) → Standby, bukan klaim palsu', () => {
    render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(screen.getByText('Standby')).toBeTruthy()
  })

  it('live update: agen berangkat rapat saat kartu terbuka → label ikut pindah (polling 1 dtk)', () => {
    vi.useFakeTimers()
    try {
      window.__agentData = [{ agent: { name: 'BUDI' }, state: 'sitting' }]
      render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
      expect(screen.getByText('Aktif Bekerja')).toBeTruthy()
      window.__agentData[0].state = 'meeting'
      act(() => { vi.advanceTimersByTime(1100) })
      expect(screen.getByText('Dalam Rapat')).toBeTruthy()
      expect(screen.queryByText('Aktif Bekerja')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('interval dibersihkan saat kartu ditutup (tidak ada leak timer)', () => {
    const spy = vi.spyOn(window, 'setInterval')
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = render(<AgentInspector agent={agent} onClose={vi.fn()} onChatWith={vi.fn()} />)
    expect(spy).toHaveBeenCalled()
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    spy.mockRestore(); clearSpy.mockRestore()
  })

  it('alur lama tak berubah: Escape tetap menutup kartu (regresi)', () => {
    window.__agentData = [{ agent: { name: 'BUDI' }, state: 'sitting' }]
    const onClose = vi.fn()
    render(<AgentInspector agent={agent} onClose={onClose} onChatWith={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
