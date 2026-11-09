// @vitest-environment jsdom
// Siklus 327: AgentInspector wajib mendaftar di flag modal TERPUSAT (useModalFlag).
// Defek: kartu inspektur agen (overlay z-30, role region) TIDAK memanggil
// useModalFlag — satu-satunya overlay yang tersisa pasca siklus 326. Kartu
// terbuka → anyModalOpen() tetap false → shortcut global (T/E/P/L/M/N/panah)
// tetap jalan di balik kartu & orbit scene merespons keyboard milik kartu.
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import AgentInspector from '../components/AgentInspector'
import { anyModalOpen } from '../lib/modal'

afterEach(() => { cleanup(); document.body.innerHTML = '' })

const AGENT = { name: 'Aris', role: 'Solution Architect', hex: '#4D9FFF', floor: 1 }

describe('AgentInspector — flag modal terpusat (siklus 327)', () => {
  it('kartu terbuka (agent ada) menaikkan anyModalOpen()', () => {
    expect(anyModalOpen()).toBe(false)
    render(<AgentInspector agent={AGENT} onClose={() => {}} />)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(true)
    })
  })

  it('agent null (kartu tertutup) TIDAK menaikkan flag modal', () => {
    render(<AgentInspector agent={null} onClose={() => {}} />)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(false)
    })
  })

  it('unmount melepas flag — count kembali 0 (tak sticky)', () => {
    const u = render(<AgentInspector agent={AGENT} onClose={() => {}} />)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(true)
      u.unmount()
      expect(anyModalOpen()).toBe(false)
    })
  })

  it('rerender agent → null (kartu ditutup): flag turun simetris', () => {
    const u = render(<AgentInspector agent={AGENT} onClose={() => {}} />)
    return Promise.resolve().then(() => {
      expect(anyModalOpen()).toBe(true)
      u.rerender(<AgentInspector agent={null} onClose={() => {}} />)
      return Promise.resolve().then(() => {
        expect(anyModalOpen()).toBe(false)
      })
    })
  })
})
