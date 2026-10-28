// @vitest-environment jsdom
// Test fase kantor live di HUD (siklus 141):
// 1) modul murni office_phase.js — pemeta label→tone/ikon + anti-poisoning;
// 2) integrasi App→HUD — label dari onStatusUpdate scene muncul & ikut berubah
//    live, tanpa label di scene → chip disembunyikan (bukan klaim palsu).
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { phaseStyleFor } from '../scene/parts/office_phase.js'
import { statusAt, SCHEDULE } from '../scene/parts/daycycle.js'

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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('office_phase — pemeta label fase → tone+ikon (murni)', () => {
  it('11 label SCHEDULE dipetakan ke tone yang benar', () => {
    expect(phaseStyleFor('Fokus pagi')).toEqual({ label: 'Fokus pagi', tone: 'work', icon: '●' })
    expect(phaseStyleFor('Deep work · semua online').tone).toBe('work')
    expect(phaseStyleFor('Fokus siang').tone).toBe('work')
    expect(phaseStyleFor('Fokus sore').tone).toBe('work')
    expect(phaseStyleFor('Stand-up pagi').tone).toBe('meet')
    expect(phaseStyleFor('Sprint review').tone).toBe('meet')
    expect(phaseStyleFor('Istirahat makan siang').tone).toBe('break')
    expect(phaseStyleFor('Persiapan pagi').tone).toBe('dawn')
    expect(phaseStyleFor('Tim mulai berdatangan').tone).toBe('dawn')
    expect(phaseStyleFor('Tim bersiap pulang').tone).toBe('dusk')
    expect(phaseStyleFor('Shift malam · WFS online')).toEqual({ label: 'Shift malam · WFS online', tone: 'night', icon: '☾' })
  })

  it('TANPA fallback tersembunyi: tidak ada satu pun menit-simulasi yang jatuh ke tone dim generik', () => {
    // Pemetaan HARUS mencakup semua label SCHEDULE — kalau ada label yang meleset
    // (mis. kunci peta beda 1 karakter dgn label asli), test ini gagal.
    for (const [, label] of SCHEDULE) {
      const r = phaseStyleFor(label)
      expect(r.tone).not.toBe('dim')
      expect(r.tone).not.toBeNull()
    }
  })

  it('seluruh 12 fase SCHEDULE daycycle tercakup — tidak ada label yang terlewat pemetaan', () => {
    // Kumpulkan semua label dari tabel SCHEDULE dan pastikan semua menghasilkan
    // objek valid dgn tone tak kosong (fase terakhir 1140 = Shift malam, sama
    // dgn indeks 0 — 12 entri jadwal, 11 label unik).
    for (let m = 0; m < 1440; m++) {
      const r = phaseStyleFor(statusAt(m))
      expect(r).toBeTruthy()
      expect(typeof r.label).toBe('string')
      expect(r.label.length).toBeGreaterThan(0)
      expect(['work', 'meet', 'break', 'dawn', 'dusk', 'night', 'dim']).toContain(r.tone)
    }
  })

  it('anti-poisoning: non-string / kosong / whitespace → null (chip disembunyikan, bukan fallback palsu)', () => {
    expect(phaseStyleFor(null)).toBeNull()
    expect(phaseStyleFor(undefined)).toBeNull()
    expect(phaseStyleFor('')).toBeNull()
    expect(phaseStyleFor('   ')).toBeNull()
    expect(phaseStyleFor(720)).toBeNull()
    expect(phaseStyleFor({ label: 'x' })).toBeNull()
  })

  it('label tak dikenal tetap tampil dgn tone generik (scene tetap sumber kebenaran)', () => {
    const r = phaseStyleFor('Fase baru dari update scene mendatang')
    expect(r).toEqual({ label: 'Fase baru dari update scene mendatang', tone: 'dim', icon: '●' })
  })
})

describe('App→HUD fase kantor live (integrasi)', () => {
  it('onStatusUpdate dari scene menampilkan chip fase di HUD; perubahan label → chip ikut berubah live', async () => {
    let capturedCallbacks = null
    const sceneMod = await import('../scene/OfficeScene')
    sceneMod.createOfficeScene.mockImplementationOnce((_canvas, cbs) => {
      capturedCallbacks = cbs
      return { ...mockSceneInstance, destroy: vi.fn() }
    })
    stubFetch()
    render(<App />)
    await waitFor(() => expect(capturedCallbacks).toBeTruthy())
    await act(async () => { capturedCallbacks.onStatusUpdate('Deep work · semua online') })
    // nama aksesibel chip = seluruh teks (ikon + label) → query via teks label
    const chip = screen.getByText('Deep work · semua online').closest('.phase-chip')
    expect(chip.className).toContain('phase-chip')
    expect(chip.className).toContain('work')

    // Transisi live: scene masuk jendela makan siang → label chip berubah
    await act(async () => { capturedCallbacks.onStatusUpdate('Istirahat makan siang') })
    const chip2 = screen.getByText('Istirahat makan siang').closest('.phase-chip')
    expect(chip2.className).toContain('break')
    expect(screen.queryByText('Deep work · semua online')).toBeNull()
  })

  it('scene belum lapor (callback tidak dipanggil) → chip fase TIDAK dirender (bukan klaim palsu)', async () => {
    stubFetch()
    render(<App />)
    await new Promise(r => setTimeout(r, 0))
    expect(screen.queryByRole('status', { name: /Fase kantor|Shift|Fokus|Stand-up|Sprint|Istirahat|Tim |Persiapan|Deep work/ })).toBeNull()
    expect(document.querySelector('.hud .phase-chip')).toBeNull()
  })
})
