// @vitest-environment jsdom
// Siklus 144: klik agen 3D → sinkron lantai FloorNavigator kini dari posisi
// LIVE scene (agentLiveLevel — satu sumber kebenaran dgn badge AgentInspector
// siklus 142 & okupansi siklus 143). Dulu `ag.floor` — lantai MEJA statis yang
// di-set SEKALI saat scene build (OfficeScene.js:1052): agen meja L3 yang
// diklik saat rapat (figur di L1) / makan siang kafe (L3) / berjalan kampus
// tetap menyetel tombol lantai meja aktif, padahal kamera fokus ke posisi live
// (agentFollowGoal / anchor kursi rapat) → label nav menunjuk lantai kosong.
// JSdom: scene dimock penuh; onSelectAgent dipanggil manual dgn objek agen UI
// (pemanggilan identik jalur scene: onClick kanvas, dblclick, figur rapat).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { findAgentLiveEntry, agentLiveLevel } from '../scene/parts/agent_status.js'

const mockSceneInstance = {
  isAudioMuted: vi.fn(() => false),
  isCyberpunk: () => false,
  setTime: vi.fn(),
  destroy: vi.fn(),
}
vi.mock('../scene/OfficeScene', () => ({
  createOfficeScene: vi.fn(() => mockSceneInstance),
}))
import App from '../App'

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url)
    if (u.includes('tasks/paused')) return { ok: true, json: async () => ({ paused: false }) }
    if (u.includes('/tasks') || u.endsWith('/tasks')) return { ok: true, json: async () => ({ tasks: [] }) }
    return { ok: true, json: async () => ({}) }
  }))
}

afterEach(() => {
  cleanup()
  delete window.__agentData
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ROLE = {
  1: 'Datacenter, AI Lab & Architecture Atrium',
  2: 'Core Engineering & Cloud Database Pod',
  3: 'Executive Penthouse, Security & Delivery Suite',
}
const navBtn = (n) => screen.getByRole('button', { name: `Fokus ke ${ROLE[n]}` })
const isActive = (n) => navBtn(n).className.includes('active')

async function renderAppWithScene() {
  let cbs = null
  const sceneMod = await import('../scene/OfficeScene')
  sceneMod.createOfficeScene.mockImplementationOnce((_canvas, callbacks) => {
    cbs = callbacks
    return { ...mockSceneInstance, destroy: vi.fn() }
  })
  stubFetch()
  render(<App />)
  await waitFor(() => expect(cbs).toBeTruthy())
  return cbs
}

describe('lantai live entri scene (identitas yang dipakai App — murni)', () => {
  it('peserta rapat meja L3 → lantai LIVE ruang rapat L1 (ROOM_CZ), BUKAN lantai meja', () => {
    const agentData = [
      { agent: { name: 'MAYA', floor: 3 }, state: 'meeting', home: { z: 6.0 } },
    ]
    const entry = findAgentLiveEntry(agentData, 'Maya') // UI bawa nama asli, scene uppercase
    expect(agentLiveLevel(entry)).toBe(1)
    expect(entry.agent.floor).toBe(3) // meja tetap L3 — inilah sumber bug lama
  })

  it('lunch walker meja L1 → lantai LIVE kafe L3 (z 5.6), BUKAN lantai meja', () => {
    const agentData = [
      { agent: { name: 'BUDI', floor: 1 }, state: 'walking_out', lunch: true,
        walker: { visible: true, position: { z: 5.6 } }, home: { z: -2.5 } },
    ]
    expect(agentLiveLevel(findAgentLiveEntry(agentData, 'budi'))).toBe(3)
  })

  it('anti-poisoning: founder (bukan entri scene) & entri tanpa agent → null (fallback lama, bukan lantai karangan)', () => {
    expect(agentLiveLevel(findAgentLiveEntry([{ agent: null }], 'MAYA'))).toBeNull()
    expect(agentLiveLevel(findAgentLiveEntry(null, 'MAYA'))).toBeNull()
    expect(agentLiveLevel(null)).toBeNull() // jalur founder idx -2
  })
})

describe('App→FloorNavigator: klik agen menyinkronkan lantai LIVE (integrasi)', () => {
  it('BUG UTAMA: agen meja L3 diklik saat rapat → tombol L1 aktif (dulu L3 — lantai kosong)', async () => {
    window.__agentData = [
      { agent: { name: 'MAYA', floor: 3 }, state: 'meeting', home: { z: 6.0 } },
    ]
    const cbs = await renderAppWithScene()
    expect(isActive(1)).toBe(true) // awal: L1 default
    await act(async () => { cbs.onSelectAgent({ name: 'Maya', floor: 3 }) })
    expect(isActive(1)).toBe(true)   // lantai LIVE (figur rapat L1)
    expect(isActive(3)).toBe(false)  // lantai meja TIDAK aktif
  })

  it('BUG UTAMA: agen meja L1 diklik saat makan siang kafe → tombol L3 aktif (dulu L1)', async () => {
    window.__agentData = [
      { agent: { name: 'BUDI', floor: 1 }, state: 'walking_out', lunch: true,
        walker: { visible: true, position: { z: 5.6 } }, home: { z: -2.5 } },
    ]
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onSelectAgent({ name: 'Budi', floor: 1 }) })
    expect(isActive(3)).toBe(true)  // kafe Executive L3 — konsisten kamera
    expect(isActive(1)).toBe(false)
  })

  it('agen duduk normal di mejanya → lantai meja aktif (alur lama tak berubah)', async () => {
    window.__agentData = [
      { agent: { name: 'RINA', floor: 1 }, state: 'sitting', home: { z: -2.5 } },
    ]
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onSelectAgent({ name: 'Rina', floor: 1 }) })
    expect(isActive(1)).toBe(true)
    expect(isActive(2)).toBe(false)
  })

  it('fallback: entri scene tidak ada (founder nexus / scene gagal init) → ag.floor, dan onSelectAgent(null) TIDAK mengubah nav', async () => {
    delete window.__agentData
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onSelectAgent({ name: 'Wahyu FS', floor: 3 }) })
    expect(isActive(3)).toBe(true) // fallback lama utuh
    await act(async () => { cbs.onSelectAgent(null) })
    expect(isActive(3)).toBe(true) // deselect tak menggeser nav (perilaku lama)
    expect(() => navBtn(1)).not.toThrow()
  })
})
