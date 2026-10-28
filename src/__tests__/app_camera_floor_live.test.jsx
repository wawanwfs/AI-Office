// @vitest-environment jsdom
// Siklus 145: kamera pindah lantai TANPA agen terpilih → FloorNavigator ikut.
//
// Bug (kebalikan siklus 144): jalur kamera lintas lantai yang melewati
// onSelectAgent tidak pernah melaporkan lantai barunya ke App —
//   - scene.focusTeam (kartu "Fokus 3D" TeamStats + 4 titik TaskBoard →
//     window.__focusTeam): kamera melompat ke pod tim L1/L2/L3 sesuai
//     team_spec (podCenter z), tapi tombol nav tetap di lantai lama;
//   - scene.focusMeetingRoom: kamera ke ruang rapat (selalu L1, ROOM_CZ=-3).
// Founder melihat pod L3 di layar sementara tombol "L1 · Ops & AI" tetap
// aktif — label nav menunjuk lantai yang TIDAK dilihat.
//
// Fix: callback scene baru `onCameraFloor(level)` — dipanggil focusTeam
// (lantai dari koordinat pod via levelOf — SATU sumber kebenaran dgn
// agentLiveLevel siklus 142/143/144) dan focusMeetingRoom (levelOf(MRZ)).
// App menyetel currentFloor hanya bila level 1–3 (guard anti-poisoning:
// null/korup diabaikan, bukan mengarang lantai). Jalur lama utuh:
// onSelectAgent tetap menyetel lantai (dan dipanggil SEBELUM onCameraFloor
// pada fokus tim, karena focusTeam melepas pilihan agen → onSelectAgent(null)
// TIDAK mengubah nav — perilaku siklus 144 yang sudah diuji).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { levelOf } from '../scene/parts/agent_status.js'
import { TEAMS, teamPodFocusTarget, findTeamByKey } from '../scene/parts/team_spec.js'

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

describe('lantai pod tim via levelOf (murni — identitas yang dipakai scene)', () => {
  it('podCenter tiap tim memetakan ke lantai yang SAMA dgn field floor tim (konsistensi data)', () => {
    TEAMS.forEach((team) => {
      const ft = teamPodFocusTarget(team.key)
      expect(levelOf(ft.z)).toBe(team.floor)
    })
  })

  it('team tak dikenal → fallback target default z=1.5 → L2 (scene memanggil levelOf dgn ini)', () => {
    const ft = teamPodFocusTarget('tim-hantu')
    expect(ft.z).toBe(1.5)
    expect(levelOf(ft.z)).toBe(2)
  })

  it('levelOf guard: z non-finite → null (scene tidak melaporkan lantai korup)', () => {
    expect(levelOf(NaN)).toBeNull()
    expect(levelOf(undefined)).toBeNull()
  })
})

describe('App→FloorNavigator: onCameraFloor menyinkronkan nav saat kamera pindah tanpa agen (integrasi)', () => {
  it('BUG UTAMA: focusTeam pod tim L3 (QA & Gov, z=8) → tombol L3 aktif (dulu tetap L1)', async () => {
    const cbs = await renderAppWithScene()
    expect(isActive(1)).toBe(true) // awal: L1 default
    // Simulasi jalur scene nyata: focusTeam melepas pilihan (onSelectAgent(null))
    // lalu melaporkan lantai pod — urutan persis scene.focusTeam.
    await act(async () => {
      cbs.onSelectAgent(null)
      cbs.onCameraFloor(levelOf(teamPodFocusTarget('qa-gov').z))
    })
    expect(isActive(3)).toBe(true)  // pod QA di L3 — konsisten kamera
    expect(isActive(1)).toBe(false) // dulu: L1 tetap aktif → label salah
  })

  it('BUG UTAMA: focusTeam pod tim L1 (Frontend, z=-5) dari nav L2 → tombol kembali L1', async () => {
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onCameraFloor(2) }) // posisi mulai: L2
    expect(isActive(2)).toBe(true)
    await act(async () => {
      cbs.onSelectAgent(null)
      cbs.onCameraFloor(levelOf(teamPodFocusTarget('fe-design').z))
    })
    expect(isActive(1)).toBe(true)
    expect(isActive(2)).toBe(false)
  })

  it('focusMeetingRoom → L1 (ruang rapat selalu L1), bahkan dari L3', async () => {
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onCameraFloor(3) })
    expect(isActive(3)).toBe(true)
    await act(async () => {
      cbs.onSelectAgent(null)
      cbs.onCameraFloor(levelOf(-3)) // MRZ
    })
    expect(isActive(1)).toBe(true)
  })

  it('fokus tim L2 (Backend, z=2) → tombol L2 aktif; nav DIPANGGIHI dgn level eksak per tim', async () => {
    const cbs = await renderAppWithScene()
    // Semua tim: lantai yang dilaporkan scene == field floor tim
    TEAMS.forEach((team) => {
      expect(levelOf(teamPodFocusTarget(team.key).z)).toBe(team.floor)
      expect(findTeamByKey(team.key).floor).toBe(team.floor)
    })
    await act(async () => {
      cbs.onSelectAgent(null)
      cbs.onCameraFloor(levelOf(teamPodFocusTarget('core-be').z))
    })
    expect(isActive(2)).toBe(true)
  })

  it('guard anti-poisoning: level di luar 1–3 (null/0/4) diabaikan — nav tak berubah, bukan lantai karangan', async () => {
    const cbs = await renderAppWithScene()
    expect(isActive(1)).toBe(true)
    await act(async () => { cbs.onCameraFloor(null) })
    expect(isActive(1)).toBe(true)
    await act(async () => { cbs.onCameraFloor(0) })
    expect(isActive(1)).toBe(true)
    await act(async () => { cbs.onCameraFloor(4) })
    expect(isActive(1)).toBe(true)
    expect(() => navBtn(2)).not.toThrow()
  })

  it('interaksi dgn siklus 144: lantai live agen tetap bekerja — klik agen duduk meja L2 → nav L2, lalu fokus tim L3 → nav L3', async () => {
    window.__agentData = [
      { agent: { name: 'RIZKY', floor: 2 }, state: 'sitting', home: { z: 1.9 } },
    ]
    const cbs = await renderAppWithScene()
    await act(async () => { cbs.onSelectAgent({ name: 'Rizky', floor: 2 }) })
    expect(isActive(2)).toBe(true) // alur siklus 144 utuh
    await act(async () => {
      cbs.onSelectAgent(null) // focusTeam melepas pilihan
      cbs.onCameraFloor(levelOf(teamPodFocusTarget('qa-gov').z))
    })
    expect(isActive(3)).toBe(true)
  })

  it('onCameraFloor tidak dipanggil scene → nav tetap (App tanpa callback tak crash)', async () => {
    const cbs = await renderAppWithScene()
    expect(typeof cbs.onCameraFloor).toBe('function')
    expect(isActive(1)).toBe(true)
  })
})
