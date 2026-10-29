// @vitest-environment jsdom
// Unit test siklus 150: kehadiran LIVE anggota tim di kartu TeamStats.
// Dulu kartu "Progres Divisi & Pod 3D" hanya bawa progres task — founder klik
// "Fokus 3D" bisa mendarat di pod KOSONG (semua anggota rapat L1 / makan siang
// kafe L3 / pulang) tanpa indikasi. Kini kartu membawa kehadiran live dari
// window.__agentData via teamPresenceSummary (paritas Ticker siklus 149).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import TeamStats from '../components/TeamStats'
import { teamPresenceSummary } from '../scene/parts/team_spec.js'
import { agentLiveTone, agentLiveStatus } from '../scene/parts/agent_status.js'

beforeEach(() => { delete window.__agentData })
afterEach(() => { cleanup(); document.body.innerHTML = ''; delete window.__agentData; vi.unstubAllGlobals() })
// duduk di meja pada z (L1 < -0.8, L2 ≤ 4.5, L3 > 4.5)
const seated = (name, z) => ({
  agent: { name },
  state: 'sitting',
  walker: { visible: false, position: { z } },
  sittingChar: { visible: true, position: { z } },
  home: { z },
})
const meeting = (name) => ({
  agent: { name }, state: 'meeting',
  walker: { visible: false, position: { z: -3 } },
  sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 },
})
const lunch = (name) => ({
  agent: { name }, state: 'walking_out', lunch: true,
  walker: { visible: true, position: { z: 5.6 } },
  sittingChar: { visible: false, position: { z: -3 } }, home: { z: -3 },
})

// ── agentLiveTone (ekstraksi murni tone) ───────────────────────────────────
describe('agentLiveTone (murni)', () => {
  it('tone per state: sitting→work, meeting→meet, lunch→lunch, leaving→dim', () => {
    expect(agentLiveTone(seated('BUDI', 2))).toBe('work')
    expect(agentLiveTone(meeting('DEWI'))).toBe('meet')
    expect(agentLiveTone(lunch('YOGA'))).toBe('lunch')
    expect(agentLiveTone({ agent: { name: 'SARI' }, state: 'leaving' })).toBe('dim')
    expect(agentLiveTone({ agent: { name: 'YUDA' }, state: 'offsite' })).toBe('dim')
  })

  it('paritas dgn agentLiveStatus: tone(status) ≡ tone agentLiveStatus semua state', () => {
    const states = ['sitting', 'meeting', 'walking_out', 'walking_back', 'leaving', 'offsite', 42, undefined]
    for (const st of states) {
      const ad = { agent: { name: 'X' }, state: st, lunch: st === 'walking_out' }
      expect(agentLiveTone(ad)).toBe(agentLiveStatus(ad).tone)
    }
  })
})

// ── teamPresenceSummary (murni) ────────────────────────────────────────────
describe('teamPresenceSummary (murni)', () => {
  it('BUG UTAMA: semua anggota core-be rapat → atDesk 0, awayLabel "4 di rapat"', () => {
    const data = [meeting('GILANG'), meeting('BUDI'), meeting('RIZKY'), meeting('FERRY')]
    const be = teamPresenceSummary(data).find(t => t.key === 'core-be')
    expect(be).toMatchObject({ key: 'core-be', total: 4, atDesk: 0, away: 4, awayLabel: '4 di rapat' })
  })

  it('campuran: fe-design 1 di pod + 2 rapat + 1 makan siang', () => {
    const data = [
      seated('MAYA', -5), // L1 = pod fe-design (podCenter.z=-5)
      meeting('DEWI'), meeting('ANDI'),
      lunch('YOGA'),
    ]
    const fe = teamPresenceSummary(data).find(t => t.key === 'fe-design')
    expect(fe).toMatchObject({ key: 'fe-design', total: 4, atDesk: 1, away: 3, awayLabel: '2 di rapat · 1 makan siang' })
  })

  it('duduk kerja di lantai pod timnya dihitung atDesk (tiap lantai pod)', () => {
    const data = [
      seated('GILANG', 2),     // core-be pod L2 (podCenter.z=2)
      seated('DEWI', -5),      // fe-design pod L1 (podCenter.z=-5)
      seated('RINA', 6),       // qa-gov pod L3 (podCenter.z=6)
      seated('BANTUIN AI', -3), // ai-cs pod L1 (podCenter.z=-3)
    ]
    const s = teamPresenceSummary(data)
    expect(s.find(t => t.key === 'core-be')).toMatchObject({ total: 1, atDesk: 1, away: 0 })
    expect(s.find(t => t.key === 'fe-design')).toMatchObject({ total: 1, atDesk: 1, away: 0 })
    expect(s.find(t => t.key === 'qa-gov')).toMatchObject({ total: 1, atDesk: 1, away: 0 })
    expect(s.find(t => t.key === 'ai-cs')).toMatchObject({ total: 1, atDesk: 1, away: 0 })
  })

  it('duduk kerja TAPI di lantai lain (visiting) → away TANPA label palsu', () => {
    const data = [seated('MAYA', 6)] // MAYA (fe-design, pod L1) duduk di L3
    const fe = teamPresenceSummary(data).find(t => t.key === 'fe-design')
    expect(fe).toMatchObject({ total: 1, atDesk: 0, away: 1, awayLabel: '' })
  })

  it('walker lunch masuk lunch, walking_back tanpa lunch masuk walk', () => {
    const wb = {
      agent: { name: 'TONI' }, state: 'walking_back',
      walker: { visible: true, position: { z: 2 } },
      sittingChar: { visible: false, position: { z: 2 } }, home: { z: 2 },
    }
    const s = teamPresenceSummary([lunch('YOGA'), wb])
    expect(s.find(t => t.key === 'fe-design').awayLabel).toBe('1 makan siang')
    expect(s.find(t => t.key === 'ops-sec').awayLabel).toBe('1 berjalan')
  })

  it('leaving/offsite masuk dim "pulang/offsite"', () => {
    const s = teamPresenceSummary([
      { agent: { name: 'GILANG' }, state: 'leaving', walker: { visible: true, position: { z: 2 } }, sittingChar: { visible: false, position: { z: 2 } }, home: { z: 2 } },
      seated('BUDI', 2),
    ])
    const be = s.find(t => t.key === 'core-be')
    expect(be).toMatchObject({ total: 2, atDesk: 1, away: 1, awayLabel: '1 pulang/offsite' })
  })

  it('guard anti-poisoning: bukan array → null; entri korup & Founder dilewati', () => {
    expect(teamPresenceSummary(null)).toBeNull()
    expect(teamPresenceSummary('korup')).toBeNull()
    expect(teamPresenceSummary(undefined)).toBeNull()
    // Founder bukan anggota TEAMS → diabaikan (bukan crash, bukan tim palsu)
    const s = teamPresenceSummary([{ agent: { name: 'Wahyu FS' }, state: 'sitting' }, seated('BUDI', 2)])
    expect(s.find(t => t.key === 'core-be')).toMatchObject({ total: 1, atDesk: 1 })
  })

  it('array kosong → array 6 tim semua nol (tanpa anggota terwakili)', () => {
    const s = teamPresenceSummary([])
    expect(s).toHaveLength(6)
    s.forEach(t => { expect(t.total).toBe(0); expect(t.atDesk).toBe(0); expect(t.away).toBe(0); expect(t.awayLabel).toBe('') })
  })
})

// ── integrasi komponen TeamStats ───────────────────────────────────────────
const TASKS = [
  { id: 1, title: 'task A', status: 'done', files: [] },
  { id: 2, title: 'task B', status: 'running', files: [] },
]
function mockFetchOk() {
  const stub = vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ tasks: TASKS }),
  }))
  stub._isVitestStub = true
  vi.stubGlobal('fetch', stub)
}
const openPanel = async () => {
  mockFetchOk()
  render(<TeamStats />)
  fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Progres per divisi kerja' })).toBeTruthy())
}
const card = (name) => screen.getByText(name).closest('.team-card')

describe('TeamStats — chip kehadiran LIVE (integrasi)', () => {
  it('BUG UTAMA: agen rapat semua → kartu Backend menampilkan "0/4 di pod · 4 di rapat"', async () => {
    window.__agentData = [meeting('GILANG'), meeting('BUDI'), meeting('RIZKY'), meeting('FERRY')]
    await openPanel()
    const be = card('Backend & Data')
    expect(be.querySelector('.team-presence').textContent).toContain('0/4 di pod')
    expect(be.querySelector('.team-presence-away').textContent).toBe('4 di rapat')
    // aria: konten live dibacakan screen reader
    expect(be.querySelector('.sr-only').textContent).toContain('0 dari 4 anggota di pod')
  })

  it('semua di meja → "4/4 di pod", tanpa label away', async () => {
    window.__agentData = [seated('GILANG', 2), seated('BUDI', 2), seated('RIZKY', 2), seated('FERRY', 2)]
    await openPanel()
    const be = card('Backend & Data')
    expect(be.querySelector('.team-presence-desk').textContent).toBe('4/4 di pod')
    expect(be.querySelector('.team-presence-away')).toBeNull()
  })

  it('polling LIVE: scene berubah rapat → pulang, chip ikut tanpa remount panel', async () => {
    // Fake HANYA interval (polling scene 4 dtk) — setTimeout/waitFor tetap nyata
    // (vi.useFakeTimers() penuh membekukan waitFor → test hang, pola ticker 149).
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      window.__agentData = [meeting('GILANG'), meeting('BUDI'), meeting('RIZKY'), meeting('FERRY')]
      mockFetchOk()
      render(<TeamStats />)
      fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
      await waitFor(() => expect(screen.getByRole('region', { name: 'Progres per divisi kerja' })).toBeTruthy())
      expect(card('Backend & Data').querySelector('.team-presence').textContent).toContain('0/4 di pod')
      // scene berubah: semua pulang (leaving) — interval 4 dtk membaca ulang
      window.__agentData = [
        { agent: { name: 'GILANG' }, state: 'leaving' },
        { agent: { name: 'BUDI' }, state: 'leaving' },
        { agent: { name: 'RIZKY' }, state: 'leaving' },
        { agent: { name: 'FERRY' }, state: 'leaving' },
      ]
      act(() => { vi.advanceTimersByTime(4500) })
      expect(card('Backend & Data').querySelector('.team-presence-away').textContent).toBe('4 pulang/offsite')
    } finally {
      vi.useRealTimers()
    }
  })

  it('scene absen (window.__agentData undefined) → chip TIDAK dirender, alur lama utuh', async () => {
    await openPanel()
    expect(document.querySelector('.team-presence')).toBeNull()
    // kartu tetap lengkap: progres, tombol fokus & kanban
    expect(card('Backend & Data')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fokus kamera ke pod Backend & Data' })).toBeTruthy()
  })

  it('cleanup: unmount panel menghentikan interval scene (clearInterval dipanggil)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const clearSpy = vi.spyOn(window, 'clearInterval')
      window.__agentData = [seated('GILANG', 2)]
      mockFetchOk()
      const { unmount } = render(<TeamStats />)
      fireEvent.click(screen.getByRole('button', { name: 'Statistik tim' }))
      await waitFor(() => expect(screen.getByRole('region', { name: 'Progres per divisi kerja' })).toBeTruthy())
      unmount()
      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })
})
